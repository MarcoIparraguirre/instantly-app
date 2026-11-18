import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Public endpoints that must remain accessible for email engagement
const PUBLIC_API_PREFIXES = [
  '/api/track/'
];

function safeSecretEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. Allow public tracking routes
  if (PUBLIC_API_PREFIXES.some(prefix => pathname.startsWith(prefix))) {
    const res = NextResponse.next();
    res.headers.set('X-MiSender-Route-Type', 'public-telemetry');
    return res;
  }

  // 2. Multi-tenant context propagation
  const reqHeaders = new Headers(req.headers);
  const existingWorkspace = reqHeaders.get('x-workspace-id');
  if (!existingWorkspace) {
    reqHeaders.set('x-workspace-id', 'ws-primary');
  }

  // 2b. Allow authorized /api/cron/ requests when CRON_SECRET matches (even if MISENDER_API_KEY is configured)
  const cronSecret = process.env.CRON_SECRET;
  if (pathname.startsWith('/api/cron/') && cronSecret) {
    const authHeader = req.headers.get('authorization') || '';
    const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    const xCronSecret = req.headers.get('x-cron-secret');

    if (
      (bearerMatch && safeSecretEqual(bearerMatch[1].trim(), cronSecret)) ||
      (xCronSecret && safeSecretEqual(xCronSecret.trim(), cronSecret))
    ) {
      return NextResponse.next({
        request: {
          headers: reqHeaders
        }
      });
    }
  }

  // 3. API Authentication Enforcement
  // If an API key or auth secret is defined in the environment, enforce it for /api routes
  const requiredApiKey = process.env.MISENDER_API_KEY || process.env.APP_API_KEY;
  
  if (requiredApiKey) {
    const providedKey = 
      req.headers.get('x-api-key') || 
      req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');

    const cookieToken = req.cookies.get('misender_auth_token')?.value;

    if (!providedKey && !cookieToken) {
      return NextResponse.json(
        { error: 'Unauthorized: Authentication required (provide x-api-key or Authorization Bearer header)' },
        { status: 401 }
      );
    }

    if (providedKey && providedKey !== requiredApiKey) {
      return NextResponse.json(
        { error: 'Forbidden: Invalid API key credentials' },
        { status: 403 }
      );
    }
  }

  return NextResponse.next({
    request: {
      headers: reqHeaders
    }
  });
}

export const config = {
  matcher: ['/api/:path*']
};
