import { NextRequest, NextResponse } from 'next/server';
import { getDistributedRateLimitBackend } from '@/core/security/rateLimiter';

const DEFAULT_ENCRYPTION_KEY = 'misender-secret-key-must-be-changed-in-production-32b';
const DEFAULT_TRACKING_SECRET = 'misender-tracking-secret-2026';
const DEFAULT_SESSION_SECRETS = new Set([
  'misender-session-secret-change-me',
  'misender-dev-session-secret',
]);

const BILLING_KEY_NAMES = [
  'MERCADOPAGO_ACCESS_TOKEN',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'LEMONSQUEEZY_API_KEY',
] as const;

export async function GET(req?: NextRequest) {
  // Touch request URL when available so Next.js 16 Cache Components treats this endpoint as dynamic
  const _reqUrl = req?.url;
  void _reqUrl;

  const supabaseConfigured = Boolean(
    (process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim()) &&
      (process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim())
  );

  const encKey = process.env.ENCRYPTION_KEY?.trim();
  const encryptionKeyConfigured = Boolean(encKey && encKey !== DEFAULT_ENCRYPTION_KEY);

  const trackingSecret = process.env.TRACKING_SECRET?.trim();
  const trackingSecretConfigured = Boolean(
    trackingSecret && trackingSecret !== DEFAULT_TRACKING_SECRET
  );

  const cronSecretConfigured = Boolean(process.env.CRON_SECRET?.trim());

  const sessionSecret = process.env.SESSION_SECRET?.trim();
  const sessionSecretConfigured = Boolean(
    sessionSecret && !DEFAULT_SESSION_SECRETS.has(sessionSecret)
  );

  const serviceRoleKeyConfigured = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());

  const aiProviderConfigured = Boolean(
    process.env.OPENAI_API_KEY?.trim() || process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim()
  );

  const distributedRateLimitBackend = getDistributedRateLimitBackend();

  const pendingBillingKeys = BILLING_KEY_NAMES.filter(
    keyName => !process.env[keyName]?.trim()
  );

  const coreReady =
    supabaseConfigured &&
    encryptionKeyConfigured &&
    trackingSecretConfigured &&
    cronSecretConfigured &&
    sessionSecretConfigured &&
    serviceRoleKeyConfigured;

  const status: 'ok' | 'degraded' = coreReady ? 'ok' : 'degraded';

  return NextResponse.json(
    {
      status,
      timestamp: new Date().toISOString(),
      checks: {
        supabaseConfigured,
        encryptionKeyConfigured,
        trackingSecretConfigured,
        cronSecretConfigured,
        sessionSecretConfigured,
        serviceRoleKeyConfigured,
        aiProviderConfigured,
        distributedRateLimitBackend,
      },
      pendingBillingKeys,
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    }
  );
}
