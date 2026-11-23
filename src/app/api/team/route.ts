import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '@/core/supabase/client';
import { hashAccessCode, isHashedAccessCode } from '@/core/security/session';
import { TeamMember, UserRole, ROLE_PERMISSIONS, normalizeRole } from '@/types';

export interface SanitizedTeamMember extends Omit<TeamMember, 'accessCode'> {
  hasAccessCode: boolean;
}

export function sanitizeTeamMember(member: TeamMember): SanitizedTeamMember {
  const { accessCode, ...rest } = member;
  return {
    ...rest,
    hasAccessCode: Boolean(accessCode && accessCode.trim()),
  };
}

interface QueryResult<T = Record<string, unknown>[]> {
  data?: T | null;
  error?: { message?: string } | null;
}

interface UserProfilesTableLike {
  select: (cols: string) => {
    order?: (col: string, opts: { ascending: boolean }) => Promise<QueryResult>;
  } & Promise<QueryResult>;
  upsert: (row: Record<string, unknown>, opts?: { onConflict?: string }) => Promise<QueryResult<unknown>>;
  delete: () => {
    eq: (col: string, val: string) => Promise<QueryResult<unknown>>;
  };
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

export function normalizeAllowedWorkspaceIds(raw: unknown, primaryWorkspaceId: string): string[] {
  const primary =
    typeof primaryWorkspaceId === 'string' && primaryWorkspaceId.trim()
      ? primaryWorkspaceId.trim()
      : 'ws-founder';
  const seen = new Set<string>([primary]);

  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === 'string') {
        const trimmed = item.trim();
        if (trimmed) seen.add(trimmed);
      }
    }
  } else if (typeof raw === 'string') {
    for (const item of raw.split(',')) {
      const trimmed = item.trim();
      if (trimmed) seen.add(trimmed);
    }
  }

  return Array.from(seen);
}

export function createDefaultTeamMembers(): TeamMember[] {
  const nowIso = new Date().toISOString();
  const founderCode = process.env.FOUNDER_ACCESS_CODE || 'Vectra2026!';
  return [
    {
      id: 'admin-default',
      workspaceId: 'ws-founder',
      allowedWorkspaceIds: ['ws-founder'],
      agencyId: 'ag-founder',
      accessCode: hashAccessCode(founderCode),
      fullName: 'Marco Iparraguirre',
      email: 'marcos@vectrasystems.com.ar',
      company: 'Vectra Systems',
      roleId: 'super_admin',
      roleName: ROLE_PERMISSIONS.super_admin.labelEs,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
  ];
}

function getFallbackStore(): TeamMember[] {
  const g = globalThis as unknown as { __misenderTeamStore?: TeamMember[] };
  if (!g.__misenderTeamStore || g.__misenderTeamStore.length === 0) {
    g.__misenderTeamStore = createDefaultTeamMembers();
  }
  return g.__misenderTeamStore;
}

function setFallbackStore(next: TeamMember[]): void {
  const g = globalThis as unknown as { __misenderTeamStore?: TeamMember[] };
  g.__misenderTeamStore = next;
}

function shouldUseSupabase(): boolean {
  const hasEnv = Boolean(
    (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL) &&
      (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  );
  if (hasEnv) return true;

  const clientUrl = (supabase as unknown as { supabaseUrl?: string })?.supabaseUrl;
  const hasFrom = typeof (supabase as unknown as { from?: unknown })?.from === 'function';
  if (!hasFrom || clientUrl === 'https://placeholder.supabase.co') {
    return false;
  }

  try {
    const table = supabase.from('user_profiles') as unknown as Partial<UserProfilesTableLike>;
    return typeof table?.select === 'function';
  } catch {
    return false;
  }
}

function mapDbRowToMember(row: Record<string, unknown>): TeamMember {
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
    email: String(row.email ?? '').toLowerCase(),
    company: typeof row.company === 'string' ? row.company : '',
    roleId,
    roleName: ROLE_PERMISSIONS[roleId].labelEs,
    createdAt: typeof (row.created_at ?? row.createdAt) === 'string' ? String(row.created_at ?? row.createdAt) : undefined,
    updatedAt: typeof (row.updated_at ?? row.updatedAt) === 'string' ? String(row.updated_at ?? row.updatedAt) : undefined,
  };
}

function mapMemberToDbRow(member: TeamMember): Record<string, unknown> {
  const workspaceId = member.workspaceId || 'ws-founder';
  const row: Record<string, unknown> = {
    id: member.id,
    workspace_id: workspaceId,
    allowed_workspace_ids: normalizeAllowedWorkspaceIds(member.allowedWorkspaceIds, workspaceId),
    full_name: member.fullName,
    email: member.email.toLowerCase(),
    company: member.company || '',
    role_id: member.roleId,
    updated_at: member.updatedAt || new Date().toISOString(),
  };
  if (member.agencyId !== undefined) {
    row.agency_id = member.agencyId || null;
  }
  if (member.accessCode !== undefined) {
    row.access_code = member.accessCode || null;
  }
  return row;
}

function isOptionalColumnError(error: { message?: string } | null | undefined): boolean {
  const msg = (error?.message || '').toLowerCase();
  return (
    (msg.includes('allowed_workspace_ids') ||
      msg.includes('agency_id') ||
      msg.includes('access_code')) &&
    (msg.includes('column') ||
      msg.includes('schema') ||
      msg.includes('cache') ||
      msg.includes('does not exist') ||
      msg.includes('could not find'))
  );
}

async function upsertMemberToSupabase(
  table: UserProfilesTableLike,
  member: TeamMember
): Promise<{ error?: { message?: string } | null }> {
  const dbRow = mapMemberToDbRow(member);
  const { error } = await table.upsert(dbRow, { onConflict: 'id' });
  if (error && isOptionalColumnError(error)) {
    const legacyRow = { ...dbRow };
    delete legacyRow.allowed_workspace_ids;
    delete legacyRow.agency_id;
    delete legacyRow.access_code;
    return await table.upsert(legacyRow, { onConflict: 'id' });
  }
  return { error };
}

async function fetchTeamFromDb(): Promise<{ rows: TeamMember[]; error: { message?: string } | null }> {
  const table = supabase.from('user_profiles') as unknown as UserProfilesTableLike;
  if (!table || typeof table.select !== 'function') {
    return { rows: [], error: { message: 'user_profiles table interface unavailable' } };
  }

  const query = table.select('*');
  const res =
    typeof query?.order === 'function'
      ? await query.order('created_at', { ascending: true })
      : await query;

  if (res?.error) {
    return { rows: [], error: res.error };
  }

  const rows = Array.isArray(res?.data) ? res.data.map(mapDbRowToMember) : [];
  return { rows, error: null };
}

function filterMembers(
  members: TeamMember[],
  workspaceId: string | null,
  email: string | null,
  agencyId: string | null
): TeamMember[] {
  let result = members;
  if (agencyId) {
    result = result.filter((m) => m.agencyId === agencyId);
  }
  if (workspaceId) {
    result = result.filter(
      (m) => m.workspaceId === workspaceId || Boolean(m.allowedWorkspaceIds?.includes(workspaceId))
    );
  }
  if (email) {
    const cleanEmail = email.trim().toLowerCase();
    result = result.filter((m) => m.email.trim().toLowerCase() === cleanEmail);
  }
  return result;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get('workspaceId');
    const email = searchParams.get('email');
    const agencyId = searchParams.get('agencyId');

    if (!shouldUseSupabase()) {
      const store = getFallbackStore();
      return NextResponse.json(
        filterMembers(store, workspaceId, email, agencyId).map(sanitizeTeamMember)
      );
    }

    const { rows, error } = await fetchTeamFromDb();
    if (error) {
      console.warn('GET /api/team Supabase error, using fallback:', error.message || error);
      return NextResponse.json(
        filterMembers(getFallbackStore(), workspaceId, email, agencyId).map(sanitizeTeamMember)
      );
    }

    if (rows.length === 0) {
      const defaults = createDefaultTeamMembers();
      const table = supabase.from('user_profiles') as unknown as UserProfilesTableLike;
      if (typeof table.upsert === 'function') {
        for (const member of defaults) {
          await upsertMemberToSupabase(table, member);
        }
      }
      setFallbackStore(defaults);
      return NextResponse.json(
        filterMembers(defaults, workspaceId, email, agencyId).map(sanitizeTeamMember)
      );
    }

    return NextResponse.json(
      filterMembers(rows, workspaceId, email, agencyId).map(sanitizeTeamMember)
    );
  } catch (err: unknown) {
    console.warn('GET /api/team unexpected error, using fallback:', getErrorMessage(err));
    const { searchParams } = new URL(req.url);
    return NextResponse.json(
      filterMembers(
        getFallbackStore(),
        searchParams.get('workspaceId'),
        searchParams.get('email'),
        searchParams.get('agencyId')
      ).map(sanitizeTeamMember)
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<TeamMember>;
    const fullName = typeof body?.fullName === 'string' ? body.fullName.trim() : '';
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';

    if (!fullName) {
      return NextResponse.json({ error: 'Full name is required' }, { status: 400 });
    }
    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
    }

    const roleId = normalizeRole(body.roleId || 'campaign_manager');
    const nowIso = new Date().toISOString();
    const workspaceId =
      typeof body.workspaceId === 'string' && body.workspaceId.trim()
        ? body.workspaceId.trim()
        : 'ws-founder';
    const allowedWorkspaceIds = normalizeAllowedWorkspaceIds(body.allowedWorkspaceIds, workspaceId);
    const agencyId =
      typeof body.agencyId === 'string' && body.agencyId.trim() ? body.agencyId.trim() : undefined;
    const rawAccessCode =
      typeof body.accessCode === 'string' && body.accessCode.trim()
        ? body.accessCode.trim()
        : undefined;
    const hashedAccessCode = rawAccessCode
      ? isHashedAccessCode(rawAccessCode)
        ? rawAccessCode
        : hashAccessCode(rawAccessCode)
      : undefined;

    const newMember: TeamMember = {
      id: body.id || `usr-${uuidv4()}`,
      workspaceId,
      allowedWorkspaceIds,
      ...(agencyId !== undefined ? { agencyId } : {}),
      ...(hashedAccessCode !== undefined ? { accessCode: hashedAccessCode } : {}),
      fullName,
      email,
      company: typeof body.company === 'string' ? body.company.trim() : '',
      roleId,
      roleName: ROLE_PERMISSIONS[roleId].labelEs,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const store = getFallbackStore();
    const existingIdx = store.findIndex(
      (m) => m.id === newMember.id || (m.email.toLowerCase() === email && m.workspaceId === workspaceId)
    );
    let persistedMember: TeamMember = newMember;
    if (existingIdx >= 0) {
      const mergedAllowed =
        body.allowedWorkspaceIds !== undefined
          ? allowedWorkspaceIds
          : normalizeAllowedWorkspaceIds(store[existingIdx].allowedWorkspaceIds, workspaceId);
      const updatedExisting: TeamMember = {
        ...store[existingIdx],
        ...newMember,
        accessCode:
          hashedAccessCode !== undefined ? hashedAccessCode : store[existingIdx].accessCode,
        allowedWorkspaceIds: mergedAllowed,
        id: store[existingIdx].id,
      };
      const nextStore = store.map((m, idx) => (idx === existingIdx ? updatedExisting : m));
      setFallbackStore(nextStore);
      persistedMember = updatedExisting;
    } else {
      setFallbackStore([...store, newMember]);
    }

    if (shouldUseSupabase()) {
      const table = supabase.from('user_profiles') as unknown as UserProfilesTableLike;
      if (typeof table.upsert === 'function') {
        const { error } = await upsertMemberToSupabase(table, persistedMember);
        if (error) {
          console.warn('POST /api/team Supabase error, kept in fallback:', error.message);
        }
      }
    }

    // Return plaintext accessCode once on POST creation response when supplied,
    // while storing only the scrypt hash in DB and fallbackStore.
    return NextResponse.json(
      {
        ...sanitizeTeamMember(persistedMember),
        ...(rawAccessCode !== undefined ? { accessCode: rawAccessCode } : {}),
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(err) || 'Failed to create team member' },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<TeamMember>;
    const id = typeof body?.id === 'string' ? body.id.trim() : '';

    if (!id) {
      return NextResponse.json({ error: 'Member id is required' }, { status: 400 });
    }

    const store = getFallbackStore();
    let existing: TeamMember | undefined = store.find((m) => m.id === id);

    if (shouldUseSupabase()) {
      const { rows } = await fetchTeamFromDb();
      const dbMatch = rows.find((m) => m.id === id);
      if (dbMatch) existing = dbMatch;
    }

    if (!existing) {
      return NextResponse.json({ error: 'Team member not found' }, { status: 404 });
    }

    const nextRole = body.roleId !== undefined ? normalizeRole(body.roleId) : existing.roleId;
    const nextWorkspaceId =
      body.workspaceId !== undefined ? String(body.workspaceId).trim() || existing.workspaceId : existing.workspaceId;
    const nextAllowedWorkspaceIds =
      body.allowedWorkspaceIds !== undefined
        ? normalizeAllowedWorkspaceIds(body.allowedWorkspaceIds, nextWorkspaceId)
        : normalizeAllowedWorkspaceIds(existing.allowedWorkspaceIds, nextWorkspaceId);

    let nextAccessCode = existing.accessCode;
    if (body.accessCode !== undefined) {
      const trimmed = typeof body.accessCode === 'string' ? body.accessCode.trim() : '';
      nextAccessCode = trimmed
        ? isHashedAccessCode(trimmed)
          ? trimmed
          : hashAccessCode(trimmed)
        : undefined;
    }

    const updatedMember: TeamMember = {
      ...existing,
      fullName: body.fullName !== undefined ? String(body.fullName).trim() || existing.fullName : existing.fullName,
      email: body.email !== undefined ? String(body.email).trim().toLowerCase() || existing.email : existing.email,
      company: body.company !== undefined ? String(body.company).trim() : existing.company,
      workspaceId: nextWorkspaceId,
      allowedWorkspaceIds: nextAllowedWorkspaceIds,
      ...(body.agencyId !== undefined ? { agencyId: String(body.agencyId).trim() || undefined } : {}),
      accessCode: nextAccessCode,
      roleId: nextRole,
      roleName: ROLE_PERMISSIONS[nextRole].labelEs,
      updatedAt: new Date().toISOString(),
    };

    const nextStore = store.some((m) => m.id === id)
      ? store.map((m) => (m.id === id ? updatedMember : m))
      : [...store, updatedMember];
    setFallbackStore(nextStore);

    if (shouldUseSupabase()) {
      const table = supabase.from('user_profiles') as unknown as UserProfilesTableLike;
      if (typeof table.upsert === 'function') {
        const { error } = await upsertMemberToSupabase(table, updatedMember);
        if (error) {
          console.warn('PUT /api/team Supabase error:', error.message);
        }
      }
    }

    return NextResponse.json(sanitizeTeamMember(updatedMember));
  } catch (err: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(err) || 'Failed to update team member' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Member id is required' }, { status: 400 });
    }

    if (id === 'admin-default') {
      return NextResponse.json({ error: 'Cannot delete primary Super Admin account' }, { status: 400 });
    }

    const store = getFallbackStore();
    setFallbackStore(store.filter((m) => m.id !== id));

    if (shouldUseSupabase()) {
      const table = supabase.from('user_profiles') as unknown as UserProfilesTableLike;
      if (typeof table.delete === 'function') {
        const { error } = await table.delete().eq('id', id);
        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
      }
    }

    return NextResponse.json({ success: true, id });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(err) || 'Failed to delete team member' },
      { status: 500 }
    );
  }
}
