import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { container } from '@/core/container';

function safeSecretEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function authorizeCronRequest(req: NextRequest): { authorized: boolean; error?: string } {
  const cronSecret = process.env.CRON_SECRET;
  const apiKey = process.env.MISENDER_API_KEY || process.env.APP_API_KEY;
  const apiKeyEnforced = Boolean(apiKey);

  const authHeader = req.headers.get('authorization');
  const xCronSecret = req.headers.get('x-cron-secret');
  const isManualTrigger = req.headers.get('x-manual-trigger') === 'true';

  // Always enforce strict validation when Authorization header is provided
  if (authHeader !== null) {
    const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    const token = bearerMatch?.[1]?.trim();

    if (!token) {
      return { authorized: false, error: 'Unauthorized: Malformed Authorization header' };
    }
    if (cronSecret && safeSecretEqual(token, cronSecret)) {
      return { authorized: true };
    }
    if (!cronSecret && apiKey && safeSecretEqual(token, apiKey)) {
      return { authorized: true };
    }
    return { authorized: false, error: 'Unauthorized: Invalid Authorization credentials' };
  }

  if (xCronSecret !== null) {
    if (!cronSecret || !safeSecretEqual(xCronSecret.trim(), cronSecret)) {
      return { authorized: false, error: 'Unauthorized: Invalid x-cron-secret header' };
    }
    return { authorized: true };
  }

  if (cronSecret) {
    if (isManualTrigger && !apiKeyEnforced) {
      return { authorized: true };
    }
    return { authorized: false, error: 'Unauthorized: CRON_SECRET credentials required' };
  }

  return { authorized: true };
}

const LOCK_TTL_MS = 60_000;

interface CronDispatchLockState {
  isRunning: boolean;
  startedAt: number;
}

function getDispatchLock(): CronDispatchLockState {
  const g = globalThis as unknown as { __misenderCronDispatchLock?: CronDispatchLockState };
  if (!g.__misenderCronDispatchLock) {
    g.__misenderCronDispatchLock = { isRunning: false, startedAt: 0 };
  }
  return g.__misenderCronDispatchLock;
}

async function handleCronDispatch(req: NextRequest) {
  const auth = authorizeCronRequest(req);
  if (!auth.authorized) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 });
  }

  const lock = getDispatchLock();
  const now = Date.now();
  if (lock.isRunning && now - lock.startedAt < LOCK_TTL_MS) {
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: 'already_running',
      startedAt: new Date(lock.startedAt).toISOString()
    });
  }

  lock.isRunning = true;
  lock.startedAt = now;

  try {
    const campaigns = await container.campaignRepo.getCampaigns();
    const activeCampaigns = campaigns.filter((c) => c.status === 'active');

    let totalSent = 0;
    const details: Array<{
      campaignId: string;
      name: string;
      sentCount: number;
      processed: number;
      outsideScheduleWindow?: boolean;
      remainingPending?: number;
      error?: string;
    }> = [];

    for (const campaign of activeCampaigns) {
      try {
        const result = await container.dispatcher.dispatchStep(campaign.id, {
          batchSize: 15,
          respectSchedule: true
        });
        totalSent += result.sentCount || 0;
        details.push({
          campaignId: campaign.id,
          name: campaign.name,
          sentCount: result.sentCount,
          processed: result.processed,
          outsideScheduleWindow: result.outsideScheduleWindow,
          remainingPending: result.remainingPending
        });
      } catch (err: unknown) {
        details.push({
          campaignId: campaign.id,
          name: campaign.name,
          sentCount: 0,
          processed: 0,
          error: err instanceof Error ? err.message : 'Campaign dispatch failed'
        });
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      campaignsProcessed: activeCampaigns.length,
      totalSent,
      details
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Cron dispatch failed' },
      { status: 500 }
    );
  } finally {
    lock.isRunning = false;
    lock.startedAt = 0;
  }
}

export async function GET(req: NextRequest) {
  return handleCronDispatch(req);
}

export async function POST(req: NextRequest) {
  return handleCronDispatch(req);
}
