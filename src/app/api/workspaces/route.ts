import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '@/core/supabase/client';
import { Workspace, SAAS_PLANS, normalizePlan, SubscriptionStatus } from '@/types';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

interface QueryResult<T = Record<string, unknown>[]> {
  data?: T | null;
  error?: { message?: string } | null;
}

interface WorkspaceTableLike {
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

function getDefaultTrialEndsAt(): string {
  return new Date(Date.now() + SEVEN_DAYS_MS).toISOString();
}

function getFallbackStore(): Workspace[] {
  const g = globalThis as unknown as { __misenderWorkspacesStore?: Workspace[] };
  if (!Array.isArray(g.__misenderWorkspacesStore)) {
    g.__misenderWorkspacesStore = [];
  }
  return g.__misenderWorkspacesStore;
}

function setFallbackStore(next: Workspace[]): void {
  const g = globalThis as unknown as { __misenderWorkspacesStore?: Workspace[] };
  g.__misenderWorkspacesStore = next;
}

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

function mapDbRowToWorkspace(row: Record<string, unknown>): Workspace {
  const plan = normalizePlan(typeof row.plan === 'string' ? row.plan : undefined);
  const planDefaults = SAAS_PLANS[plan];
  const subStatus = (row.subscription_status || row.subscriptionStatus || 'trialing') as SubscriptionStatus;
  const rawAgencyId = row.agency_id ?? row.agencyId;

  return {
    id: String(row.id),
    name: String(row.name || 'Workspace'),
    clientName: String(row.client_name ?? row.clientName ?? 'Internal'),
    credits: Number(row.credits ?? planDefaults.credits),
    agencyId: typeof rawAgencyId === 'string' && rawAgencyId.trim() ? rawAgencyId.trim() : undefined,
    ownerId: typeof (row.owner_id ?? row.ownerId) === 'string' ? String(row.owner_id ?? row.ownerId) : undefined,
    ownerEmail: typeof (row.owner_email ?? row.ownerEmail) === 'string' ? String(row.owner_email ?? row.ownerEmail) : undefined,
    plan,
    subscriptionStatus: subStatus,
    trialEndsAt: String(row.trial_ends_at || row.trialEndsAt || getDefaultTrialEndsAt()),
    maxAccounts: Number(row.max_accounts ?? row.maxAccounts ?? planDefaults.maxAccounts),
    maxLeads: Number(row.max_leads ?? row.maxLeads ?? planDefaults.maxLeads),
    billingProvider: String(row.billing_provider ?? row.billingProvider ?? 'sandbox'),
    billingSubscriptionId:
      typeof (row.billing_subscription_id ?? row.billingSubscriptionId) === 'string'
        ? String(row.billing_subscription_id ?? row.billingSubscriptionId)
        : undefined,
    createdAt: typeof (row.created_at ?? row.createdAt) === 'string' ? String(row.created_at ?? row.createdAt) : undefined,
    updatedAt: typeof (row.updated_at ?? row.updatedAt) === 'string' ? String(row.updated_at ?? row.updatedAt) : undefined,
  };
}

function mapWorkspaceToDbRow(ws: Workspace): Record<string, unknown> {
  const plan = normalizePlan(ws.plan);
  const planDefaults = SAAS_PLANS[plan];
  const row: Record<string, unknown> = {
    id: ws.id,
    name: ws.name,
    client_name: ws.clientName || 'Internal',
    credits: Number.isFinite(Number(ws.credits)) ? Number(ws.credits) : planDefaults.credits,
    owner_id: ws.ownerId || null,
    owner_email: ws.ownerEmail || null,
    plan,
    subscription_status: ws.subscriptionStatus || 'trialing',
    trial_ends_at: ws.trialEndsAt || getDefaultTrialEndsAt(),
    max_accounts: Number.isFinite(Number(ws.maxAccounts)) ? Number(ws.maxAccounts) : planDefaults.maxAccounts,
    max_leads: Number.isFinite(Number(ws.maxLeads)) ? Number(ws.maxLeads) : planDefaults.maxLeads,
    billing_provider: ws.billingProvider || 'sandbox',
    billing_subscription_id: ws.billingSubscriptionId || null,
    updated_at: new Date().toISOString(),
  };
  if (ws.agencyId !== undefined) {
    row.agency_id = ws.agencyId || null;
  }
  return row;
}

async function upsertWorkspaceToSupabase(ws: Workspace): Promise<{ error?: { message?: string } | null }> {
  const dbRow = mapWorkspaceToDbRow(ws);
  const { error } = await supabase.from('workspaces').upsert(dbRow, { onConflict: 'id' });
  if (error && (error.message || '').toLowerCase().includes('agency_id')) {
    const legacyRow = { ...dbRow };
    delete legacyRow.agency_id;
    return await supabase.from('workspaces').upsert(legacyRow, { onConflict: 'id' });
  }
  return { error };
}

async function fetchWorkspacesFromDb(): Promise<{ rows: Workspace[]; error: { message?: string } | null }> {
  const table = supabase.from('workspaces') as unknown as WorkspaceTableLike;
  const query = table.select('*');
  const res =
    typeof query?.order === 'function'
      ? await query.order('created_at', { ascending: true })
      : await query;

  if (res?.error) {
    return { rows: [], error: res.error };
  }

  const rows = Array.isArray(res?.data) ? res.data.map(mapDbRowToWorkspace) : [];
  return { rows, error: null };
}

function filterWorkspaces(list: Workspace[], ownerId: string | null, agencyId: string | null): Workspace[] {
  let result = list;
  if (agencyId) {
    result = result.filter((w) => w.agencyId === agencyId);
  }
  if (ownerId) {
    result = result.filter((w) => !w.ownerId || w.ownerId === ownerId);
  }
  return result;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const ownerId = searchParams.get('ownerId');
    const agencyId = searchParams.get('agencyId');

    if (!shouldUseSupabase()) {
      return NextResponse.json(filterWorkspaces(getFallbackStore(), ownerId, agencyId));
    }

    const { rows, error } = await fetchWorkspacesFromDb();
    if (error) {
      console.warn('GET /api/workspaces Supabase error, using fallback:', error.message || error);
      return NextResponse.json(filterWorkspaces(getFallbackStore(), ownerId, agencyId));
    }

    return NextResponse.json(filterWorkspaces(rows, ownerId, agencyId));
  } catch (err: unknown) {
    console.warn('GET /api/workspaces unexpected error, using fallback:', getErrorMessage(err));
    return NextResponse.json(getFallbackStore());
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<Workspace>;

    if (typeof body?.name === 'string' && body.name.trim() === '') {
      return NextResponse.json({ error: 'Workspace name cannot be empty' }, { status: 400 });
    }

    if (!body || (!body.name && !body.clientName)) {
      return NextResponse.json({ error: 'Workspace name is required' }, { status: 400 });
    }

    const plan = normalizePlan(body.plan);
    const planConfig = SAAS_PLANS[plan];
    const nowIso = new Date().toISOString();
    const agencyId =
      typeof body.agencyId === 'string' && body.agencyId.trim()
        ? body.agencyId.trim()
        : `ag-${uuidv4().slice(0, 8)}`;

    const newWorkspace: Workspace = {
      id: body.id || `ws-${uuidv4()}`,
      name: (body.name || body.clientName || 'Nuevo Workspace').trim(),
      clientName: (body.clientName || 'Internal').trim(),
      credits: Number.isFinite(Number(body.credits)) ? Number(body.credits) : planConfig.credits,
      agencyId,
      ownerId: body.ownerId || undefined,
      ownerEmail: body.ownerEmail || undefined,
      plan,
      subscriptionStatus: (body.subscriptionStatus || 'trialing') as SubscriptionStatus,
      trialEndsAt: body.trialEndsAt || getDefaultTrialEndsAt(),
      maxAccounts: Number.isFinite(Number(body.maxAccounts)) ? Number(body.maxAccounts) : planConfig.maxAccounts,
      maxLeads: Number.isFinite(Number(body.maxLeads)) ? Number(body.maxLeads) : planConfig.maxLeads,
      billingProvider: body.billingProvider || 'sandbox',
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const store = getFallbackStore();
    setFallbackStore([...store.filter((w) => w.id !== newWorkspace.id), newWorkspace]);

    if (!shouldUseSupabase()) {
      return NextResponse.json(newWorkspace, { status: 201 });
    }

    const { error } = await upsertWorkspaceToSupabase(newWorkspace);
    if (error) {
      console.warn('POST /api/workspaces Supabase error, stored in fallback:', error.message);
    }

    return NextResponse.json(newWorkspace, { status: 201 });
  } catch (err: unknown) {
    return NextResponse.json({ error: getErrorMessage(err) || 'Failed to create workspace' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<Workspace> & { workspaceId?: string };
    const id = body?.id || body?.workspaceId;

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'Workspace id is required' }, { status: 400 });
    }

    const store = getFallbackStore();
    let existing: Workspace | undefined;

    if (shouldUseSupabase()) {
      const { rows } = await fetchWorkspacesFromDb();
      existing = rows.find((w) => w.id === id);
    }

    if (!existing) {
      existing = store.find((w) => w.id === id);
    }

    const base: Workspace = existing || {
      id,
      name: body.name || 'Workspace',
      clientName: body.clientName || 'Internal',
      credits: SAAS_PLANS.growth.credits,
      plan: 'growth',
      subscriptionStatus: 'trialing',
      trialEndsAt: getDefaultTrialEndsAt(),
      maxAccounts: SAAS_PLANS.growth.maxAccounts,
      maxLeads: SAAS_PLANS.growth.maxLeads,
      billingProvider: 'sandbox',
    };

    const nextPlan = body.plan ? normalizePlan(body.plan) : normalizePlan(base.plan);
    const planChanged = Boolean(body.plan && body.plan !== base.plan);
    const planDefaults = SAAS_PLANS[nextPlan];

    const updatedWorkspace: Workspace = {
      ...base,
      name: body.name !== undefined ? String(body.name).trim() || base.name : base.name,
      clientName: body.clientName !== undefined ? String(body.clientName).trim() || base.clientName : base.clientName,
      agencyId: body.agencyId !== undefined ? body.agencyId : base.agencyId,
      plan: nextPlan,
      subscriptionStatus: (body.subscriptionStatus ?? base.subscriptionStatus ?? 'trialing') as SubscriptionStatus,
      trialEndsAt: body.trialEndsAt ?? base.trialEndsAt,
      maxAccounts:
        body.maxAccounts !== undefined
          ? Number(body.maxAccounts)
          : planChanged
            ? planDefaults.maxAccounts
            : (base.maxAccounts ?? planDefaults.maxAccounts),
      maxLeads:
        body.maxLeads !== undefined
          ? Number(body.maxLeads)
          : planChanged
            ? planDefaults.maxLeads
            : (base.maxLeads ?? planDefaults.maxLeads),
      credits:
        body.credits !== undefined
          ? Number(body.credits)
          : planChanged
            ? planDefaults.credits
            : base.credits,
      ownerId: body.ownerId !== undefined ? body.ownerId : base.ownerId,
      ownerEmail: body.ownerEmail !== undefined ? body.ownerEmail : base.ownerEmail,
      billingProvider: body.billingProvider !== undefined ? body.billingProvider : base.billingProvider,
      billingSubscriptionId:
        body.billingSubscriptionId !== undefined ? body.billingSubscriptionId : base.billingSubscriptionId,
      updatedAt: new Date().toISOString(),
    };

    const nextStore = store.some((w) => w.id === id)
      ? store.map((w) => (w.id === id ? updatedWorkspace : w))
      : [...store, updatedWorkspace];
    setFallbackStore(nextStore);

    if (shouldUseSupabase()) {
      const { error } = await upsertWorkspaceToSupabase(updatedWorkspace);
      if (error) {
        console.warn('PUT /api/workspaces Supabase error:', error.message);
      }
    }

    return NextResponse.json(updatedWorkspace);
  } catch (err: unknown) {
    return NextResponse.json({ error: getErrorMessage(err) || 'Failed to update workspace' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Workspace id is required' }, { status: 400 });
    }

    const store = getFallbackStore();
    setFallbackStore(store.filter((w) => w.id !== id));

    if (shouldUseSupabase()) {
      const { error } = await supabase.from('workspaces').delete().eq('id', id);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, id });
  } catch (err: unknown) {
    return NextResponse.json({ error: getErrorMessage(err) || 'Failed to delete workspace' }, { status: 500 });
  }
}
