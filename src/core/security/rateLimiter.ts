import { supabase } from '@/core/supabase/client';

export type RateLimitBackend = 'upstash' | 'supabase' | 'memory';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export interface DistributedRateLimitResult extends RateLimitResult {
  backend: RateLimitBackend;
}

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const rateLimitStores = new Map<string, Map<string, RateLimitRecord>>();

function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !key) return false;
  if (url === 'https://placeholder.supabase.co' || key === 'placeholder-key') return false;
  return true;
}

/**
 * Reports which rate-limit backend is active based on current environment configuration.
 */
export function getDistributedRateLimitBackend(): RateLimitBackend {
  if (
    process.env.UPSTASH_REDIS_REST_URL?.trim() &&
    process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
  ) {
    return 'upstash';
  }
  if (isSupabaseConfigured()) {
    return 'supabase';
  }
  return 'memory';
}

/**
 * In-memory sliding window rate limiter
 * @param bucket Category/namespace (e.g., 'test-email', 'track-click')
 * @param key Identifier (e.g., IP address or user ID)
 * @param limit Max allowed requests within the window
 * @param windowMs Time window in milliseconds
 */
export function checkRateLimit(
  bucket: string,
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  let bucketMap = rateLimitStores.get(bucket);
  if (!bucketMap) {
    bucketMap = new Map();
    rateLimitStores.set(bucket, bucketMap);
  }

  const now = Date.now();
  const record = bucketMap.get(key);

  // Periodically clean expired keys if bucket gets too large
  if (bucketMap.size > 5000) {
    for (const [k, v] of bucketMap.entries()) {
      if (now > v.resetAt) bucketMap.delete(k);
    }
  }

  if (!record || now > record.resetAt) {
    const resetAt = now + windowMs;
    bucketMap.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: Math.max(0, limit - 1), resetAt };
  }

  if (record.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: record.resetAt };
  }

  record.count += 1;
  return { allowed: true, remaining: Math.max(0, limit - record.count), resetAt: record.resetAt };
}

/**
 * Distributed rate limiter supporting Upstash Redis REST pipeline, Supabase `rate_limits` table,
 * and automatic graceful fallback to in-memory `checkRateLimit`.
 */
export async function checkDistributedRateLimit(
  bucket: string,
  key: string,
  limit: number,
  windowMs: number
): Promise<DistributedRateLimitResult> {
  const safeWindowMs = Math.max(1, windowMs);
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  // 1. Upstash Redis REST pipeline (INCR + EXPIRE)
  if (upstashUrl && upstashToken) {
    const windowBucket = Math.floor(Date.now() / safeWindowMs);
    const redisKey = `misender:rl:${bucket}:${key}:${windowBucket}`;
    const ttlSeconds = Math.max(1, Math.ceil(safeWindowMs / 1000));
    const resetAt = (windowBucket + 1) * safeWindowMs;

    try {
      const signal =
        typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
          ? AbortSignal.timeout(2500)
          : undefined;

      const res = await fetch(`${upstashUrl.replace(/\/$/, '')}/pipeline`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${upstashToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([
          ['INCR', redisKey],
          ['EXPIRE', redisKey, ttlSeconds],
        ]),
        signal,
      });

      if (res.ok) {
        const pipeline = (await res.json()) as Array<{ result?: unknown; error?: string }>;
        if (
          Array.isArray(pipeline) &&
          !pipeline[0]?.error &&
          pipeline[0]?.result !== undefined
        ) {
          const count = Number(pipeline[0].result);
          if (Number.isFinite(count)) {
            return {
              allowed: count <= limit,
              remaining: Math.max(0, limit - count),
              resetAt,
              backend: 'upstash',
            };
          }
        }
      }
    } catch {
      // Fall back to in-memory limiter if Upstash is unreachable or errors
    }

    const fallback = checkRateLimit(bucket, key, limit, safeWindowMs);
    return { ...fallback, backend: 'memory' };
  }

  // 2. Supabase `rate_limits` table (outside VITEST)
  if (!process.env.VITEST && isSupabaseConfigured()) {
    const compositeKey = `${bucket}:${key}`;
    const now = Date.now();
    const nowIso = new Date(now).toISOString();

    try {
      const { data: existing, error: selectError } = await supabase
        .from('rate_limits')
        .select('key, count, reset_at')
        .eq('key', compositeKey)
        .maybeSingle();

      if (selectError) {
        throw selectError;
      }

      const existingResetMs = existing?.reset_at ? new Date(existing.reset_at).getTime() : 0;

      if (!existing || !Number.isFinite(existingResetMs) || existingResetMs <= now) {
        const nextResetAtMs = now + safeWindowMs;
        const { error: upsertError } = await supabase
          .from('rate_limits')
          .upsert(
            {
              key: compositeKey,
              bucket,
              count: 1,
              reset_at: new Date(nextResetAtMs).toISOString(),
              updated_at: nowIso,
            },
            { onConflict: 'key' }
          );

        if (upsertError) {
          throw upsertError;
        }

        return {
          allowed: limit >= 1,
          remaining: Math.max(0, limit - 1),
          resetAt: nextResetAtMs,
          backend: 'supabase',
        };
      }

      const currentCount = Number(existing.count) || 0;
      if (currentCount >= limit) {
        return {
          allowed: false,
          remaining: 0,
          resetAt: existingResetMs,
          backend: 'supabase',
        };
      }

      const nextCount = currentCount + 1;
      const { error: updateError } = await supabase
        .from('rate_limits')
        .update({ count: nextCount, updated_at: nowIso })
        .eq('key', compositeKey);

      if (updateError) {
        throw updateError;
      }

      return {
        allowed: true,
        remaining: Math.max(0, limit - nextCount),
        resetAt: existingResetMs,
        backend: 'supabase',
      };
    } catch {
      // Graceful fallback to in-memory limiter on any DB error
    }
  }

  // 3. In-memory fallback
  const memoryResult = checkRateLimit(bucket, key, limit, safeWindowMs);
  return { ...memoryResult, backend: 'memory' };
}
