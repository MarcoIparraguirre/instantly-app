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

async function handleCronWarmup(req: NextRequest) {
  const auth = authorizeCronRequest(req);
  if (!auth.authorized) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const resetDaily = url.searchParams.get('resetDaily') === 'true';

    if (resetDaily) {
      const accounts = await container.accountRepo.getAccounts();
      if (accounts.length > 0) {
        const resetAccounts = accounts.map((acc) => ({
          ...acc,
          sentToday: 0,
          warmupToday: 0
        }));

        if (typeof container.accountRepo.saveAccounts === 'function') {
          await container.accountRepo.saveAccounts(resetAccounts);
        } else {
          for (const acc of resetAccounts) {
            await container.accountRepo.saveAccount(acc);
          }
        }
      }
    }

    const warmupResult = await container.warmupService.runWarmupRound();

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      resetDaily,
      warmupResult
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Cron warmup failed' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return handleCronWarmup(req);
}

export async function POST(req: NextRequest) {
  return handleCronWarmup(req);
}
