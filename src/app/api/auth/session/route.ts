import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/core/supabase/client';
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  SessionPayload,
  createSessionToken,
  verifyAccessCode,
  verifySessionToken,
} from '@/core/security/session';
import { recordAuditLog } from '@/core/security/auditLog';
import {
  TeamMember,
  UserRole,
  ROLE_PERMISSIONS,
  normalizeRole,
} from '@/types';
import {
  createDefaultTeamMembers,
  normalizeAllowedWorkspaceIds,
} from '@/app/api/team/route';

interface QueryResult<T = Record<string, unknown>[]> {
  data?: T | null;
  error?: { message?: string } | null;
}

interface UserProfilesTableLike {
  select?: (cols: string) => {
    order?: (col: string, opts: { ascending: boolean }) => Promise<QueryResult>;
  } & Promise<QueryResult>;
}

const DEFAULT_FOUNDER_EMAIL = 'marcos@vectrasystems.com.ar';

function shouldUseSupabase(): boolean {
  const hasEnv = Boolean(
    (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL) &&
      (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  );
  if (hasEnv) return true;

  const clientUrl = (supabase as unknown as { supabaseUrl?: string })?.supabaseUrl;
  const hasFrom = typeof (supabase as unknown as { from?: unknown })?.from === 'function';
  return hasFrom && clientUrl !== 'https://placeholder.supabase.co';
}

function getFallbackTeamStore(): TeamMember[] {
  const g = globalThis as unknown as { __misenderTeamStore?: TeamMember[] };
  if (!g.__misenderTeamStore || g.__misenderTeamStore.length === 0) {
    g.__misenderTeamStore = createDefaultTeamMembers();
  }
  return g.__misenderTeamStore;
}

function mapRowToTeamMember(row: Record<string, unknown>): TeamMember {
  const roleId: UserRole = normalizeRole(
    typeof (row.role_id ?? row.roleId) === 'string' ? String(row.role_id ?? row.roleId) : undefined
  );
  const workspaceId = String(row.workspace_id ?? row.workspaceId ?? 'ws-founder');
  const allowedWorkspaceIds = normalizeAllowedWorkspaceIds(
    row.allowed_workspace_ids ?? row.allowedWorkspaceIds,
    workspaceId
  );
  const rawAgencyId = row.agency_id ?? row.agencyId;
  const rawAccessCode = row.access_code ?? row.accessCode;

  return {
    id: String(row.id),
    workspaceId,
    allowedWorkspaceIds,
    agencyId: typeof rawAgencyId === 'string' && rawAgencyId.trim() ? rawAgencyId.trim() : undefined,
    accessCode: typeof rawAccessCode === 'string' && rawAccessCode.trim() ? rawAccessCode.trim() : undefined,
    fullName: String(row.full_name ?? row.fullName ?? 'Usuario'),
    email: String(row.email ?? '').trim().toLowerCase(),
    company: typeof row.company === 'string' ? row.company : '',
    roleId,
    roleName: ROLE_PERMISSIONS[roleId].labelEs,
    createdAt: typeof (row.created_at ?? row.createdAt) === 'string' ? String(row.created_at ?? row.createdAt) : undefined,
    updatedAt: typeof (row.updated_at ?? row.updatedAt) === 'string' ? String(row.updated_at ?? row.updatedAt) : undefined,
  };
}

async function findMembersByEmail(cleanEmail: string): Promise<TeamMember[]> {
  if (shouldUseSupabase()) {
    try {
      const table = supabase.from('user_profiles') as unknown as UserProfilesTableLike;
      if (typeof table?.select === 'function') {
        const query = table.select('*');
        const res =
          typeof query?.order === 'function'
            ? await query.order('created_at', { ascending: true })
            : await query;

        if (!res?.error && Array.isArray(res?.data) && res.data.length > 0) {
          const matches = res.data
            .map(mapRowToTeamMember)
            .filter((m) => m.email.trim().toLowerCase() === cleanEmail);
          if (matches.length > 0) {
            return matches;
          }
        }
      }
    } catch {
      // Fall back cleanly to in-memory team store
    }
  }

  const fallbackMatches = getFallbackTeamStore().filter(
    (m) => m.email.trim().toLowerCase() === cleanEmail
  );
  if (fallbackMatches.length > 0) {
    return fallbackMatches;
  }

  if (cleanEmail === DEFAULT_FOUNDER_EMAIL) {
    return createDefaultTeamMembers();
  }

  return [];
}

function readCookieFromRequest(req: NextRequest, name: string): string | undefined {
  const viaApi = req.cookies?.get?.(name)?.value;
  if (viaApi) return viaApi;

  const cookieHeader = req.headers?.get?.('cookie');
  if (!cookieHeader) return undefined;

  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    if (key === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return undefined;
}

function getClientIp(req: NextRequest): string | undefined {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get('x-real-ip')?.trim();
  return realIp || undefined;
}

export async function GET(req: NextRequest) {
  const token = readCookieFromRequest(req, SESSION_COOKIE_NAME);
  const session = verifySessionToken(token);
  return NextResponse.json({
    authenticated: Boolean(session),
    session,
  });
}

export async function POST(req: NextRequest) {
  try {
    let body: Record<string, unknown>;
    try {
      const parsed = await req.json();
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
      }
      body = parsed as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const secret =
      typeof body.password === 'string'
        ? body.password
        : typeof body.accessCode === 'string'
          ? body.accessCode
          : '';

    if (!email || !email.includes('@') || !secret) {
      return NextResponse.json(
        { error: 'Email and password/accessCode are required' },
        { status: 400 }
      );
    }

    const candidates = await findMembersByEmail(email);
    if (candidates.length === 0) {
      return NextResponse.json({ error: 'Invalid email or access code' }, { status: 401 });
    }

    let verifiedMember: TeamMember | undefined;
    for (const candidate of candidates) {
      const storedSecret =
        candidate.accessCode ||
        (candidate.id === 'admin-default'
          ? process.env.FOUNDER_ACCESS_CODE || 'Vectra2026!'
          : '');
      if (storedSecret && verifyAccessCode(secret, storedSecret)) {
        verifiedMember = candidate;
        break;
      }
    }

    if (!verifiedMember) {
      return NextResponse.json({ error: 'Invalid email or access code' }, { status: 401 });
    }

    const primaryWorkspaceId = verifiedMember.workspaceId || 'ws-founder';
    const mergedAllowed = new Set<string>(
      normalizeAllowedWorkspaceIds(verifiedMember.allowedWorkspaceIds, primaryWorkspaceId)
    );
    for (const candidate of candidates) {
      for (const wsId of normalizeAllowedWorkspaceIds(
        candidate.allowedWorkspaceIds,
        candidate.workspaceId || primaryWorkspaceId
      )) {
        mergedAllowed.add(wsId);
      }
    }

    const allowedWorkspaceIds = Array.from(mergedAllowed);
    const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS;

    const sessionPayload: SessionPayload = {
      userId: verifiedMember.id,
      email: verifiedMember.email,
      role: verifiedMember.roleId,
      ...(verifiedMember.agencyId ? { agencyId: verifiedMember.agencyId } : {}),
      workspaceId: primaryWorkspaceId,
      allowedWorkspaceIds,
      exp,
    };

    const token = createSessionToken(sessionPayload);

    await recordAuditLog({
      workspaceId: primaryWorkspaceId,
      actorId: verifiedMember.id,
      actorEmail: verifiedMember.email,
      action: 'auth.login',
      resourceType: 'session',
      resourceId: verifiedMember.id,
      metadata: {
        role: verifiedMember.roleId,
        workspaceCount: allowedWorkspaceIds.length,
      },
      ipAddress: getClientIp(req),
      userAgent: req.headers.get('user-agent') || undefined,
    });

    const sanitizedUser = {
      id: verifiedMember.id,
      workspaceId: primaryWorkspaceId,
      allowedWorkspaceIds,
      ...(verifiedMember.agencyId ? { agencyId: verifiedMember.agencyId } : {}),
      fullName: verifiedMember.fullName,
      email: verifiedMember.email,
      company: verifiedMember.company || '',
      roleId: verifiedMember.roleId,
      role: verifiedMember.roleId,
      roleName: verifiedMember.roleName || ROLE_PERMISSIONS[verifiedMember.roleId].labelEs,
      hasAccessCode: true,
    };

    const res = NextResponse.json({
      authenticated: true,
      user: sanitizedUser,
      session: sessionPayload,
    });

    res.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: SESSION_MAX_AGE_SECONDS,
    });

    return res;
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create session' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const token = readCookieFromRequest(req, SESSION_COOKIE_NAME);
  const existing = verifySessionToken(token);

  if (existing) {
    await recordAuditLog({
      workspaceId: existing.workspaceId,
      actorId: existing.userId,
      actorEmail: existing.email,
      action: 'auth.logout',
      resourceType: 'session',
      resourceId: existing.userId,
      ipAddress: getClientIp(req),
      userAgent: req.headers.get('user-agent') || undefined,
    }).catch(() => {});
  }

  const res = NextResponse.json({ authenticated: false, success: true });
  res.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  return res;
}
