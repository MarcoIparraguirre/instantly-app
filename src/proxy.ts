import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from '@/core/security/session';

// Public endpoints that must remain accessible without a session cookie
const PUBLIC_API_PREFIXES = [
  '/api/track/',
  '/api/auth/session',
  '/api/billing/webhook',
  '/api/health',
];

function isPublicApiRoute(pathname: string): boolean {
  return PUBLIC_API_PREFIXES.some((prefix) =>
    prefix.endsWith('/')
      ? pathname.startsWith(prefix)
      : pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function safeSecretEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. Allow public endpoints (tracking telemetry, auth session, billing webhooks, health)
  if (isPublicApiRoute(pathname)) {
    const res = NextResponse.next();
    res.headers.set(
      'X-MiSender-Route-Type',
      pathname.startsWith('/api/track/') ? 'public-telemetry' : 'public'
    );
    return res;
  }

  // 2. Multi-tenant & verified identity header preparation (strip client-spoofed identity headers)
  const reqHeaders = new Headers(req.headers);
  reqHeaders.delete('x-user-id');
  reqHeaders.delete('x-user-email');
  reqHeaders.delete('x-user-role');

  const headerWorkspace = req.headers.get('x-workspace-id')?.trim() || '';
  const queryWorkspace = req.nextUrl.searchParams.get('workspaceId')?.trim() || '';

  // 2b. Allow authorized /api/cron/ requests when CRON_SECRET matches
  const cronSecret = process.env.CRON_SECRET;
  if (pathname.startsWith('/api/cron/') && cronSecret) {
    const authHeader = req.headers.get('authorization') || '';
    const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    const xCronSecret = req.headers.get('x-cron-secret');

    if (
      (bearerMatch && safeSecretEqual(bearerMatch[1].trim(), cronSecret)) ||
      (xCronSecret && safeSecretEqual(xCronSecret.trim(), cronSecret))
    ) {
      if (!headerWorkspace) {
        reqHeaders.set('x-workspace-id', queryWorkspace || 'ws-primary');
      }
      return NextResponse.next({
        request: {
          headers: reqHeaders,
        },
      });
    }
  }

  // 3. Verify misender_session cookie whenever present (even in dev/unconfigured mode)
  const sessionCookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  let validSession: ReturnType<typeof verifySessionToken> = null;

  if (sessionCookie) {
    validSession = verifySessionToken(sessionCookie);
    if (!validSession) {
      return NextResponse.json(
        { error: 'Unauthorized: Invalid or expired session' },
        { status: 401 }
      );
    }

    if (validSession.role !== 'super_admin') {
      const allowed = new Set(validSession.allowedWorkspaceIds || []);
      if (validSession.workspaceId) {
        allowed.add(validSession.workspaceId);
      }

      if (
        (queryWorkspace && !allowed.has(queryWorkspace)) ||
        (headerWorkspace && !allowed.has(headerWorkspace))
      ) {
        return NextResponse.json(
          { error: 'Forbidden: Workspace access denied for this session' },
          { status: 403 }
        );
      }
    }

    reqHeaders.set('x-user-id', validSession.userId);
    reqHeaders.set('x-user-email', validSession.email);
    reqHeaders.set('x-user-role', validSession.role);
    reqHeaders.set(
      'x-workspace-id',
      queryWorkspace || headerWorkspace || validSession.workspaceId || 'ws-primary'
    );
  }

  // 4. API Authentication Enforcement (MISENDER_API_KEY / APP_API_KEY / ENFORCE_SESSION_AUTH)
  const requiredApiKey = process.env.MISENDER_API_KEY || process.env.APP_API_KEY;
  const providedKey =
    req.headers.get('x-api-key') ||
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const hasValidApiKey = Boolean(
    requiredApiKey &&
      providedKey &&
      safeSecretEqual(providedKey.trim(), requiredApiKey.trim())
  );
  const legacyCookieToken = req.cookies.get('misender_auth_token')?.value;

  if (requiredApiKey && providedKey && !hasValidApiKey) {
    return NextResponse.json(
      { error: 'Forbidden: Invalid API key credentials' },
      { status: 403 }
    );
  }

  if (process.env.ENFORCE_SESSION_AUTH === 'true' && !validSession && !hasValidApiKey) {
    return NextResponse.json(
      { error: 'Unauthorized: Valid session cookie or API key required' },
      { status: 401 }
    );
  }

  if (requiredApiKey && !validSession && !hasValidApiKey && !legacyCookieToken) {
    return NextResponse.json(
      {
        error:
          'Unauthorized: Authentication required (provide session cookie, x-api-key, or Authorization Bearer header)',
      },
      { status: 401 }
    );
  }

  if (!reqHeaders.get('x-workspace-id')) {
    reqHeaders.set('x-workspace-id', queryWorkspace || headerWorkspace || 'ws-primary');
  }

  return NextResponse.next({
    request: {
      headers: reqHeaders,
    },
  });
}

export const config = {
  matcher: ['/api/:path*'],
};
