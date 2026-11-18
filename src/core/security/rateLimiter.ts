interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const rateLimitStores = new Map<string, Map<string, RateLimitRecord>>();

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
): { allowed: boolean; remaining: number; resetAt: number } {
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
    return { allowed: true, remaining: limit - 1, resetAt };
  }

  if (record.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: record.resetAt };
  }

  record.count += 1;
  return { allowed: true, remaining: limit - record.count, resetAt: record.resetAt };
}
