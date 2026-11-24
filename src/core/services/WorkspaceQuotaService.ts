import { supabase } from '@/core/supabase/client';
import { container } from '@/core/container';
import {
  EffectiveWorkspaceLimits,
  SAAS_PLANS,
  SubscriptionStatus,
  TRIAL_QUOTA_CAPS,
  Workspace,
  getEffectiveWorkspaceLimits,
  normalizePlan,
} from '@/types';

export { TRIAL_QUOTA_CAPS, getEffectiveWorkspaceLimits };
export type { EffectiveWorkspaceLimits };

export type QuotaCheckResult =
  | { allowed: true; workspace?: Workspace; limits?: EffectiveWorkspaceLimits }
  | {
      allowed: false;
      status: 402 | 403;
      code: 'QUOTA_EXCEEDED' | 'TRIAL_EXPIRED' | 'SUBSCRIPTION_INACTIVE';
      resource?: 'accounts' | 'leads' | 'credits';
      current?: number;
      limit?: number;
      incoming?: number;
      subscriptionStatus?: SubscriptionStatus;
      error: string;
    };

function shouldUseSupabase(): boolean {
  const hasEnv = Boolean(
    (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL) &&
      (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  );
  if (hasEnv) return true;

  const clientUrl = (supabase as unknown as { supabaseUrl?: string })?.supabaseUrl;
  const hasFrom = typeof (supabase as unknown as { from?: unknown })?.from === 'function';
  return Boolean(hasFrom && clientUrl && clientUrl !== 'https://placeholder.supabase.co');
}

function getFallbackWorkspaces(): Workspace[] {
  const g = globalThis as unknown as { __misenderWorkspacesStore?: Workspace[] };
  return Array.isArray(g.__misenderWorkspacesStore) ? g.__misenderWorkspacesStore : [];
}

function setFallbackWorkspaces(next: Workspace[]): void {
  const g = globalThis as unknown as { __misenderWorkspacesStore?: Workspace[] };
  g.__misenderWorkspacesStore = next;
}

function mapRowToWorkspace(row: Record<string, unknown>): Workspace {
  const plan = normalizePlan(typeof row.plan === 'string' ? row.plan : undefined);
  const defaults = SAAS_PLANS[plan];
  return {
    id: String(row.id),
    name: String(row.name || 'Workspace'),
    clientName: String(row.client_name ?? row.clientName ?? 'Internal'),
    credits: Number(row.credits ?? defaults.credits),
    agencyId:
      typeof (row.agency_id ?? row.agencyId) === 'string'
        ? String(row.agency_id ?? row.agencyId)
        : undefined,
    ownerId:
      typeof (row.owner_id ?? row.ownerId) === 'string'
        ? String(row.owner_id ?? row.ownerId)
        : undefined,
    ownerEmail:
      typeof (row.owner_email ?? row.ownerEmail) === 'string'
        ? String(row.owner_email ?? row.ownerEmail)
        : undefined,
    plan,
    subscriptionStatus: (row.subscription_status ||
      row.subscriptionStatus ||
      'trialing') as SubscriptionStatus,
    trialEndsAt:
      typeof (row.trial_ends_at ?? row.trialEndsAt) === 'string'
        ? String(row.trial_ends_at ?? row.trialEndsAt)
        : undefined,
    maxAccounts: Number(row.max_accounts ?? row.maxAccounts ?? defaults.maxAccounts),
    maxLeads: Number(row.max_leads ?? row.maxLeads ?? defaults.maxLeads),
    billingProvider: String(row.billing_provider ?? row.billingProvider ?? 'sandbox'),
  };
}

export async function resolveWorkspaceById(workspaceId: string): Promise<Workspace | null> {
  if (!workspaceId) return null;

  if (shouldUseSupabase()) {
    try {
      const table = supabase.from('workspaces') as unknown as {
        select: (cols: string) => {
          eq?: (col: string, val: string) => {
            maybeSingle?: () => Promise<{ data?: Record<string, unknown> | null; error?: unknown }>;
          };
        } & Promise<{ data?: Record<string, unknown>[] | null; error?: unknown }>;
      };

      const selected = table.select('*');
      if (typeof selected?.eq === 'function') {
        const eqResult = selected.eq('id', workspaceId);
        if (typeof eqResult?.maybeSingle === 'function') {
          const { data, error } = await eqResult.maybeSingle();
          if (!error && data) {
            return mapRowToWorkspace(data);
          }
        }
      } else {
        const { data, error } = await selected;
        if (!error && Array.isArray(data)) {
          const match = data.find((r) => String(r.id) === workspaceId);
          if (match) return mapRowToWorkspace(match);
        }
      }
    } catch {
      // Fall back to in-memory store if Supabase lookup fails
    }
  }

  const fallback = getFallbackWorkspaces().find((w) => w.id === workspaceId);
  return fallback || null;
}

function checkWorkspaceWriteStatus(ws: Workspace): QuotaCheckResult | null {
  const status = ws.subscriptionStatus || 'trialing';
  if (status === 'canceled' || status === 'past_due') {
    return {
      allowed: false,
      status: 402,
      code: 'SUBSCRIPTION_INACTIVE',
      subscriptionStatus: status,
      error:
        status === 'past_due'
          ? 'Tu suscripción tiene un pago pendiente. Actualiza tu plan en Facturación para seguir agregando recursos.'
          : 'Tu suscripción está cancelada. Reactiva un plan en Facturación para continuar.',
    };
  }

  if (status === 'trialing' && ws.trialEndsAt) {
    const endsAtMs = Date.parse(ws.trialEndsAt);
    if (Number.isFinite(endsAtMs) && endsAtMs < Date.now()) {
      return {
        allowed: false,
        status: 402,
        code: 'TRIAL_EXPIRED',
        subscriptionStatus: status,
        error:
          'Tu prueba gratuita de 7 días finalizó. Activa un plan en Facturación para continuar agregando casillas o leads.',
      };
    }
  }

  return null;
}

export async function checkAccountQuota(
  workspaceId: string,
  incomingNewAccounts: number
): Promise<QuotaCheckResult> {
  if (!workspaceId || incomingNewAccounts <= 0) {
    return { allowed: true };
  }

  const ws = await resolveWorkspaceById(workspaceId);
  if (!ws) {
    return { allowed: true };
  }

  const statusBlock = checkWorkspaceWriteStatus(ws);
  if (statusBlock) return statusBlock;

  const limits = getEffectiveWorkspaceLimits(ws);
  if (limits.maxAccounts >= 999) {
    return { allowed: true, workspace: ws, limits };
  }

  const existing = await container.accountRepo.getAccounts(workspaceId);
  const current = existing.length;
  if (current + incomingNewAccounts > limits.maxAccounts) {
    const scopeLabel = limits.isTrial ? 'la prueba gratuita' : `tu plan ${SAAS_PLANS[normalizePlan(ws.plan)].name}`;
    return {
      allowed: false,
      status: 403,
      code: 'QUOTA_EXCEEDED',
      resource: 'accounts',
      current,
      limit: limits.maxAccounts,
      incoming: incomingNewAccounts,
      subscriptionStatus: ws.subscriptionStatus,
      error: `Límite de casillas alcanzado para ${scopeLabel} (${current}/${limits.maxAccounts}). Mejora tu plan en Facturación para conectar más buzones.`,
    };
  }

  return { allowed: true, workspace: ws, limits };
}

export async function checkLeadQuota(
  workspaceId: string,
  incomingNewLeads: number
): Promise<QuotaCheckResult> {
  if (!workspaceId || incomingNewLeads <= 0) {
    return { allowed: true };
  }

  const ws = await resolveWorkspaceById(workspaceId);
  if (!ws) {
    return { allowed: true };
  }

  const statusBlock = checkWorkspaceWriteStatus(ws);
  if (statusBlock) return statusBlock;

  const limits = getEffectiveWorkspaceLimits(ws);
  const existing = await container.leadRepo.getLeads(undefined, workspaceId);
  const current = existing.length;

  if (current + incomingNewLeads > limits.maxLeads) {
    const scopeLabel = limits.isTrial ? 'la prueba gratuita' : `tu plan ${SAAS_PLANS[normalizePlan(ws.plan)].name}`;
    return {
      allowed: false,
      status: 403,
      code: 'QUOTA_EXCEEDED',
      resource: 'leads',
      current,
      limit: limits.maxLeads,
      incoming: incomingNewLeads,
      subscriptionStatus: ws.subscriptionStatus,
      error: `Límite de leads alcanzado para ${scopeLabel} (${current}/${limits.maxLeads}). Activa o mejora tu plan en Facturación para cargar más contactos.`,
    };
  }

  return { allowed: true, workspace: ws, limits };
}

export async function checkAndConsumeVerificationCredits(
  workspaceId: string | undefined,
  creditsNeeded: number
): Promise<QuotaCheckResult> {
  if (!workspaceId || creditsNeeded <= 0) {
    return { allowed: true };
  }

  const ws = await resolveWorkspaceById(workspaceId);
  if (!ws) {
    return { allowed: true };
  }

  const statusBlock = checkWorkspaceWriteStatus(ws);
  if (statusBlock) return statusBlock;

  const limits = getEffectiveWorkspaceLimits(ws);
  if (limits.credits < creditsNeeded) {
    return {
      allowed: false,
      status: 403,
      code: 'QUOTA_EXCEEDED',
      resource: 'credits',
      current: limits.credits,
      limit: limits.credits,
      incoming: creditsNeeded,
      subscriptionStatus: ws.subscriptionStatus,
      error: `Créditos de verificación insuficientes (${limits.credits} disponibles, ${creditsNeeded} requeridos).`,
    };
  }

  const nextCredits = Math.max(0, limits.credits - creditsNeeded);
  const fallback = getFallbackWorkspaces();
  const idx = fallback.findIndex((w) => w.id === workspaceId);
  if (idx >= 0) {
    const updated = [...fallback];
    updated[idx] = { ...updated[idx], credits: nextCredits, updatedAt: new Date().toISOString() };
    setFallbackWorkspaces(updated);
  }

  if (shouldUseSupabase()) {
    try {
      const table = supabase.from('workspaces') as unknown as {
        update?: (row: Record<string, unknown>) => {
          eq: (col: string, val: string) => Promise<unknown>;
        };
      };
      if (typeof table.update === 'function') {
        await table
          .update({ credits: nextCredits, updated_at: new Date().toISOString() })
          .eq('id', workspaceId);
      }
    } catch {
      // Non-blocking credit sync fallback
    }
  }

  return {
    allowed: true,
    workspace: { ...ws, credits: nextCredits },
    limits: { ...limits, credits: nextCredits },
  };
}
