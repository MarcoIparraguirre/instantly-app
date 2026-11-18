import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/core/supabase/client';
import {
  normalizePlan,
  SAAS_PLANS,
  SubscriptionStatus,
  Workspace,
} from '@/types';

interface WebhookEventPayload {
  id?: string | number;
  type?: string;
  topic?: string;
  action?: string;
  workspaceId?: string;
  planId?: string;
  subscriptionId?: string;
  status?: string;
  provider?: string;
  external_reference?: string;
  metadata?: Record<string, string | undefined>;
  meta?: {
    event_name?: string;
    custom_data?: Record<string, string | undefined>;
  };
  data?: {
    id?: string | number;
    type?: string;
    external_reference?: string;
    status?: string;
    attributes?: {
      status?: string;
      variant_id?: string | number;
    };
    object?: {
      id?: string;
      status?: string;
      subscription?: string;
      client_reference_id?: string;
      external_reference?: string;
      metadata?: Record<string, string | undefined>;
    };
  };
}

interface WorkspaceRow {
  id: string;
  name?: string;
  client_name?: string;
  credits?: number;
  owner_id?: string | null;
  owner_email?: string | null;
  plan?: string | null;
  subscription_status?: string | null;
  trial_ends_at?: string | null;
  max_accounts?: number | null;
  max_leads?: number | null;
  billing_provider?: string | null;
}

interface WorkspaceTableLike {
  select?: (cols: string) => Promise<{ data?: WorkspaceRow[] | null; error?: { message?: string } | null }>;
  update?: (row: Record<string, unknown>) => {
    eq: (col: string, val: string) => Promise<{ error?: { message?: string } | null }>;
  };
  upsert?: (row: Record<string, unknown>, opts?: { onConflict?: string }) => Promise<{ error?: { message?: string } | null }>;
}

const LEMON_SQUEEZY_EVENTS = new Set([
  'order_created',
  'subscription_created',
  'subscription_updated',
  'subscription_cancelled',
]);

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
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

function getFallbackStore(): Workspace[] {
  const g = globalThis as unknown as { __misenderWorkspacesStore?: Workspace[] };
  if (!g.__misenderWorkspacesStore || g.__misenderWorkspacesStore.length === 0) {
    g.__misenderWorkspacesStore = [
      {
        id: 'ws-primary',
        name: 'Espacio Principal',
        clientName: 'Vectra Systems',
        credits: SAAS_PLANS.growth.credits,
        plan: 'growth',
        subscriptionStatus: 'trialing',
        trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        maxAccounts: SAAS_PLANS.growth.maxAccounts,
        maxLeads: SAAS_PLANS.growth.maxLeads,
        billingProvider: 'sandbox',
      },
    ];
  }
  return g.__misenderWorkspacesStore;
}

function setFallbackStore(next: Workspace[]): void {
  const g = globalThis as unknown as { __misenderWorkspacesStore?: Workspace[] };
  g.__misenderWorkspacesStore = next;
}

function safeTimingEqualHex(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  try {
    const bufA = Buffer.from(a, 'hex');
    const bufB = Buffer.from(b, 'hex');
    if (bufA.length === 0 || bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

function verifyWebhookHmac(rawBody: string, req: NextRequest, secret: string): boolean {
  const stripeSig = req.headers.get('stripe-signature');
  if (stripeSig) {
    const parts = Object.fromEntries(
      stripeSig.split(',').map((kv) => {
        const [k, v] = kv.trim().split('=');
        return [k, v];
      })
    );
    if (!parts.t || !parts.v1) return false;
    const expected = crypto
      .createHmac('sha256', secret)
      .update(`${parts.t}.${rawBody}`)
      .digest('hex');
    return safeTimingEqualHex(parts.v1, expected);
  }

  const genericSig =
    req.headers.get('x-billing-signature') ||
    req.headers.get('x-webhook-signature') ||
    req.headers.get('x-signature');

  if (!genericSig) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return safeTimingEqualHex(genericSig.replace(/^sha256=/i, '').trim(), expected);
}

function verifyLemonSqueezyHmac(rawBody: string, req: NextRequest, secret: string): boolean {
  const sig = req.headers.get('x-signature')?.replace(/^sha256=/i, '').trim();
  if (!sig) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return safeTimingEqualHex(sig, expected);
}

function mapStripeSubStatus(rawStatus?: string): SubscriptionStatus {
  switch (rawStatus) {
    case 'active':
      return 'active';
    case 'trialing':
      return 'trialing';
    case 'past_due':
    case 'unpaid':
    case 'incomplete':
      return 'past_due';
    case 'canceled':
    case 'incomplete_expired':
      return 'canceled';
    default:
      return 'active';
  }
}

function mapLemonSqueezyStatus(rawStatus?: string, eventName?: string): SubscriptionStatus {
  const normalized = (rawStatus || '').toLowerCase();
  if (normalized === 'cancelled' || normalized === 'canceled' || normalized === 'expired') {
    return 'canceled';
  }
  if (normalized === 'past_due') {
    return 'past_due';
  }
  if (eventName === 'subscription_cancelled' && !normalized) {
    return 'canceled';
  }
  return 'active';
}

function parseExternalReference(externalRef?: string): {
  workspaceId?: string;
  planId?: string;
  billingCycle?: string;
} {
  if (!externalRef || typeof externalRef !== 'string') return {};
  const [wsId, planId, billingCycle] = externalRef.split(':');
  return {
    workspaceId: wsId?.trim() || undefined,
    planId: planId?.trim() || undefined,
    billingCycle: billingCycle?.trim() || undefined,
  };
}

async function resolveWorkspaceContext(workspaceId: string): Promise<{
  store: Workspace[];
  existing: Workspace;
  foundInSupabase: boolean;
}> {
  const store = getFallbackStore();
  let existing: Workspace | undefined = store.find((w) => w.id === workspaceId);
  let foundInSupabase = false;

  if (shouldUseSupabase()) {
    try {
      const table = supabase.from('workspaces') as unknown as WorkspaceTableLike;
      if (typeof table.select === 'function') {
        const selectRes = await table.select('*');
        if (Array.isArray(selectRes?.data)) {
          const found = selectRes.data.find((r) => r.id === workspaceId);
          if (found) {
            foundInSupabase = true;
            existing = {
              id: found.id,
              name: found.name || 'Espacio Principal',
              clientName: found.client_name || 'Internal',
              credits: Number(found.credits ?? SAAS_PLANS.growth.credits),
              ownerId: found.owner_id ?? undefined,
              ownerEmail: found.owner_email ?? undefined,
              plan: normalizePlan(found.plan),
              subscriptionStatus: (found.subscription_status || 'trialing') as SubscriptionStatus,
              trialEndsAt: found.trial_ends_at ?? undefined,
              maxAccounts: found.max_accounts ?? SAAS_PLANS.growth.maxAccounts,
              maxLeads: found.max_leads ?? SAAS_PLANS.growth.maxLeads,
              billingProvider: found.billing_provider ?? undefined,
            };
          }
        }
      }
    } catch {
      // Ignore read error and fall back gracefully
    }
  }

  const base: Workspace = existing || {
    id: workspaceId,
    name: workspaceId === 'ws-primary' ? 'Espacio Principal' : 'Workspace',
    clientName: workspaceId === 'ws-primary' ? 'Vectra Systems' : 'Internal',
    credits: SAAS_PLANS.growth.credits,
    plan: 'growth',
    subscriptionStatus: 'trialing',
    maxAccounts: SAAS_PLANS.growth.maxAccounts,
    maxLeads: SAAS_PLANS.growth.maxLeads,
    billingProvider: 'sandbox',
  };

  return { store, existing: base, foundInSupabase };
}

async function applyWorkspaceUpdate(
  workspaceId: string,
  patch: Partial<Workspace>,
  nowIso: string
): Promise<Workspace> {
  const { store, existing, foundInSupabase } = await resolveWorkspaceContext(workspaceId);

  const updatedWorkspace: Workspace = {
    ...existing,
    id: workspaceId,
    ...patch,
  };

  const nextStore = store.some((w) => w.id === workspaceId)
    ? store.map((w) => (w.id === workspaceId ? updatedWorkspace : w))
    : [...store, updatedWorkspace];
  setFallbackStore(nextStore);

  if (shouldUseSupabase()) {
    try {
      const table = supabase.from('workspaces') as unknown as WorkspaceTableLike;
      const dbPatch: Record<string, unknown> = {
        subscription_status: updatedWorkspace.subscriptionStatus,
        updated_at: nowIso,
      };
      if (patch.plan) dbPatch.plan = patch.plan;
      if (patch.maxAccounts !== undefined) dbPatch.max_accounts = patch.maxAccounts;
      if (patch.maxLeads !== undefined) dbPatch.max_leads = patch.maxLeads;
      if (patch.credits !== undefined) dbPatch.credits = patch.credits;
      if (patch.billingProvider) dbPatch.billing_provider = patch.billingProvider;
      if (patch.billingSubscriptionId) dbPatch.billing_subscription_id = patch.billingSubscriptionId;

      if (foundInSupabase && typeof table.update === 'function') {
        await table.update(dbPatch).eq('id', workspaceId);
      } else if (typeof table.upsert === 'function') {
        await table.upsert(
          {
            id: updatedWorkspace.id,
            name: updatedWorkspace.name,
            client_name: updatedWorkspace.clientName,
            ...dbPatch,
          },
          { onConflict: 'id' }
        );
      } else if (typeof table.update === 'function') {
        await table.update(dbPatch).eq('id', workspaceId);
      }
    } catch (err: unknown) {
      console.warn('POST /api/billing/webhook Supabase update warning:', getErrorMessage(err));
    }
  }

  return updatedWorkspace;
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();

    let event: WebhookEventPayload;
    try {
      event = JSON.parse(rawBody) as WebhookEventPayload;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const searchParams = req.nextUrl?.searchParams;
    const queryProvider = searchParams?.get('provider');
    const queryTopic = searchParams?.get('topic');
    const queryType = searchParams?.get('type');
    const queryDataId = searchParams?.get('data.id') || searchParams?.get('id');

    const lsEventName = event?.meta?.event_name || '';
    const isLemonSqueezy =
      LEMON_SQUEEZY_EVENTS.has(lsEventName) ||
      event?.provider === 'lemonsqueezy' ||
      queryProvider === 'lemonsqueezy';

    const isMercadoPago =
      !isLemonSqueezy &&
      (event?.type === 'payment' ||
        event?.topic === 'payment' ||
        event?.type === 'subscription_preapproval' ||
        queryTopic === 'payment' ||
        queryType === 'payment' ||
        queryType === 'subscription_preapproval' ||
        queryProvider === 'mercadopago' ||
        event?.provider === 'mercadopago');

    // Verify provider-specific HMAC signatures
    if (isLemonSqueezy) {
      const lsSecret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
      if (lsSecret && !verifyLemonSqueezyHmac(rawBody, req, lsSecret)) {
        return NextResponse.json({ error: 'Invalid Lemon Squeezy webhook signature' }, { status: 401 });
      }
    } else if (!isMercadoPago) {
      const secret = process.env.STRIPE_WEBHOOK_SECRET || process.env.BILLING_WEBHOOK_SECRET;
      if (secret && !verifyWebhookHmac(rawBody, req, secret)) {
        return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
      }
    }

    const nowIso = new Date().toISOString();

    // 1. Lemon Squeezy webhook handling
    if (isLemonSqueezy) {
      if (!LEMON_SQUEEZY_EVENTS.has(lsEventName)) {
        return NextResponse.json({
          received: true,
          handled: false,
          eventType: lsEventName || event?.type || 'unknown',
          message: 'Unhandled Lemon Squeezy event ignored cleanly',
        });
      }

      const customData = event?.meta?.custom_data || {};
      const workspaceId =
        customData.workspace_id ||
        customData.workspaceId ||
        event?.workspaceId ||
        'ws-primary';
      const requestedPlan =
        customData.plan_id ||
        customData.planId ||
        event?.planId;
      const subscriptionId =
        event?.data?.id !== undefined ? String(event.data.id) : event?.subscriptionId;
      const nextStatus = mapLemonSqueezyStatus(
        event?.data?.attributes?.status || event?.status,
        lsEventName
      );

      let patch: Partial<Workspace>;
      if (nextStatus === 'canceled') {
        patch = {
          subscriptionStatus: 'canceled',
          billingProvider: 'lemonsqueezy',
          billingSubscriptionId: subscriptionId,
          updatedAt: nowIso,
        };
      } else {
        const { existing } = await resolveWorkspaceContext(workspaceId);
        const plan = normalizePlan(requestedPlan || existing.plan);
        const planConfig = SAAS_PLANS[plan];
        patch = {
          plan,
          subscriptionStatus: nextStatus,
          maxAccounts: planConfig.maxAccounts,
          maxLeads: planConfig.maxLeads,
          credits: planConfig.credits,
          billingProvider: 'lemonsqueezy',
          billingSubscriptionId: subscriptionId,
          updatedAt: nowIso,
        };
      }

      const updatedWorkspace = await applyWorkspaceUpdate(workspaceId, patch, nowIso);
      return NextResponse.json({
        received: true,
        handled: true,
        eventType: lsEventName,
        workspaceId,
        workspace: updatedWorkspace,
      });
    }

    // 2. MercadoPago webhook handling (Checkout Pro payment & Preapproval recurring)
    if (isMercadoPago) {
      const mpEventType = event?.type || event?.topic || queryType || queryTopic || 'payment';
      let externalReference =
        event?.external_reference ||
        event?.data?.external_reference ||
        event?.data?.object?.external_reference;
      let mpStatus =
        event?.status ||
        event?.data?.status ||
        event?.data?.object?.status;

      const dataId =
        event?.data?.id !== undefined
          ? String(event.data.id)
          : queryDataId || (event?.data?.object?.id ? String(event.data.object.id) : undefined);

      let mpResourceId = dataId || event?.subscriptionId;

      // Enrich from MercadoPago API when token is configured and notification carries only ID
      if (
        process.env.MERCADOPAGO_ACCESS_TOKEN &&
        dataId &&
        (!externalReference || !mpStatus)
      ) {
        try {
          const isPreapproval =
            mpEventType === 'subscription_preapproval' ||
            queryTopic === 'subscription_preapproval';
          const endpoint = isPreapproval
            ? `https://api.mercadopago.com/preapproval/${encodeURIComponent(dataId)}`
            : `https://api.mercadopago.com/v1/payments/${encodeURIComponent(dataId)}`;

          const signal =
            typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
              ? AbortSignal.timeout(3000)
              : undefined;

          const mpRes = await fetch(endpoint, {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}`,
              Accept: 'application/json',
            },
            signal,
          });

          if (mpRes && mpRes.ok) {
            const mpData = (await mpRes.json()) as {
              id?: string | number;
              external_reference?: string;
              status?: string;
            };
            externalReference = externalReference || mpData.external_reference;
            mpStatus = mpStatus || mpData.status;
            if (mpData.id !== undefined) {
              mpResourceId = String(mpData.id);
            }
          }
        } catch {
          // Ignore network failures cleanly and continue with available payload fields
        }
      }

      const parsedRef = parseExternalReference(externalReference);
      const workspaceId =
        parsedRef.workspaceId ||
        event?.workspaceId ||
        event?.metadata?.workspaceId ||
        'ws-primary';
      const requestedPlan =
        parsedRef.planId ||
        event?.planId ||
        event?.metadata?.planId;

      const normalizedStatus = (mpStatus || '').toLowerCase();
      const isApproved =
        normalizedStatus === 'approved' || normalizedStatus === 'authorized';
      const isCancelled =
        normalizedStatus === 'cancelled' || normalizedStatus === 'canceled';
      const isPastDue =
        normalizedStatus === 'rejected' ||
        normalizedStatus === 'charged_back' ||
        normalizedStatus === 'paused';

      if (!isApproved && !isCancelled && !isPastDue) {
        return NextResponse.json({
          received: true,
          handled: false,
          eventType: mpEventType,
          action: event?.action,
          status: normalizedStatus || 'pending',
          message: 'MercadoPago notification ignored (payment not approved/authorized)',
        });
      }

      let patch: Partial<Workspace>;
      if (isApproved) {
        const { existing } = await resolveWorkspaceContext(workspaceId);
        const plan = normalizePlan(requestedPlan || existing.plan);
        const planConfig = SAAS_PLANS[plan];
        patch = {
          plan,
          subscriptionStatus: 'active',
          maxAccounts: planConfig.maxAccounts,
          maxLeads: planConfig.maxLeads,
          credits: planConfig.credits,
          billingProvider: 'mercadopago',
          billingSubscriptionId: mpResourceId,
          updatedAt: nowIso,
        };
      } else if (isCancelled) {
        patch = {
          subscriptionStatus: 'canceled',
          billingProvider: 'mercadopago',
          billingSubscriptionId: mpResourceId,
          updatedAt: nowIso,
        };
      } else {
        patch = {
          subscriptionStatus: 'past_due',
          billingProvider: 'mercadopago',
          billingSubscriptionId: mpResourceId,
          updatedAt: nowIso,
        };
      }

      const updatedWorkspace = await applyWorkspaceUpdate(workspaceId, patch, nowIso);
      return NextResponse.json({
        received: true,
        handled: true,
        eventType: mpEventType,
        workspaceId,
        workspace: updatedWorkspace,
      });
    }

    // 3. Stripe webhook handling
    const eventType: string = event?.type || '';
    const dataObj = event?.data?.object;
    const metadata = dataObj?.metadata || event?.metadata || {};
    const workspaceId: string =
      metadata.workspaceId || dataObj?.client_reference_id || event?.workspaceId || 'ws-primary';
    const subscriptionId: string | undefined =
      typeof dataObj?.subscription === 'string'
        ? dataObj.subscription
        : dataObj?.id || event?.subscriptionId;

    const { existing } = await resolveWorkspaceContext(workspaceId);
    let patch: Partial<Workspace> | null = null;

    if (eventType === 'checkout.session.completed') {
      const plan = normalizePlan(metadata.planId || event?.planId || existing.plan);
      const planConfig = SAAS_PLANS[plan];
      patch = {
        plan,
        subscriptionStatus: 'active',
        maxAccounts: planConfig.maxAccounts,
        maxLeads: planConfig.maxLeads,
        credits: planConfig.credits,
        billingProvider: metadata.provider || event?.provider || 'stripe',
        billingSubscriptionId: subscriptionId,
        updatedAt: nowIso,
      };
    } else if (eventType === 'customer.subscription.updated') {
      const nextStatus = mapStripeSubStatus(dataObj?.status || event?.status);
      const requestedPlan = metadata.planId || event?.planId;
      if (requestedPlan) {
        const plan = normalizePlan(requestedPlan);
        const planConfig = SAAS_PLANS[plan];
        patch = {
          plan,
          subscriptionStatus: nextStatus,
          maxAccounts: planConfig.maxAccounts,
          maxLeads: planConfig.maxLeads,
          credits: planConfig.credits,
          billingSubscriptionId: subscriptionId,
          updatedAt: nowIso,
        };
      } else {
        patch = {
          subscriptionStatus: nextStatus,
          billingSubscriptionId: subscriptionId,
          updatedAt: nowIso,
        };
      }
    } else if (eventType === 'customer.subscription.deleted') {
      patch = {
        subscriptionStatus: 'canceled',
        billingSubscriptionId: subscriptionId,
        updatedAt: nowIso,
      };
    } else {
      return NextResponse.json({
        received: true,
        handled: false,
        eventType,
        message: 'Unhandled event type ignored cleanly',
      });
    }

    const updatedWorkspace = await applyWorkspaceUpdate(workspaceId, patch, nowIso);
    return NextResponse.json({
      received: true,
      handled: true,
      eventType,
      workspaceId,
      workspace: updatedWorkspace,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(err) || 'Webhook processing error' },
      { status: 500 }
    );
  }
}
