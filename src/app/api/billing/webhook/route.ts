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
  type?: string;
  workspaceId?: string;
  planId?: string;
  subscriptionId?: string;
  status?: string;
  provider?: string;
  metadata?: Record<string, string | undefined>;
  data?: {
    object?: {
      id?: string;
      status?: string;
      subscription?: string;
      client_reference_id?: string;
      metadata?: Record<string, string | undefined>;
    };
  };
}

interface WorkspaceTableLike {
  update?: (row: Record<string, unknown>) => {
    eq: (col: string, val: string) => Promise<{ error?: { message?: string } | null }>;
  };
  upsert?: (row: Record<string, unknown>, opts?: { onConflict?: string }) => Promise<{ error?: { message?: string } | null }>;
}

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
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
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
  return safeTimingEqualHex(genericSig.replace(/^sha256=/i, ''), expected);
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

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const secret = process.env.STRIPE_WEBHOOK_SECRET || process.env.BILLING_WEBHOOK_SECRET;

    if (secret && !verifyWebhookHmac(rawBody, req, secret)) {
      return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
    }

    let event: WebhookEventPayload;
    try {
      event = JSON.parse(rawBody) as WebhookEventPayload;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const eventType: string = event?.type || '';
    const dataObj = event?.data?.object;
    const metadata = dataObj?.metadata || event?.metadata || {};
    const workspaceId: string =
      metadata.workspaceId || dataObj?.client_reference_id || event?.workspaceId || 'ws-primary';
    const subscriptionId: string | undefined =
      typeof dataObj?.subscription === 'string'
        ? dataObj.subscription
        : dataObj?.id || event?.subscriptionId;

    const store = getFallbackStore();
    const existing = store.find((w) => w.id === workspaceId) || store[0];
    const nowIso = new Date().toISOString();

    let patch: Partial<Workspace> | null = null;

    if (eventType === 'checkout.session.completed') {
      const plan = normalizePlan(metadata.planId || event?.planId || existing?.plan);
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

        if (typeof table.update === 'function') {
          await table.update(dbPatch).eq('id', workspaceId);
        } else if (typeof table.upsert === 'function') {
          await table.upsert({
            id: updatedWorkspace.id,
            name: updatedWorkspace.name,
            client_name: updatedWorkspace.clientName,
            ...dbPatch,
          }, { onConflict: 'id' });
        }
      } catch (err: unknown) {
        console.warn('POST /api/billing/webhook Supabase update warning:', getErrorMessage(err));
      }
    }

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
