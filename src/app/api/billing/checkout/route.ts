import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/core/supabase/client';
import {
  BillingCycle,
  BillingProvider,
  SAAS_PLANS,
  SubscriptionStatus,
  Workspace,
  WorkspacePlan,
  normalizePlan,
} from '@/types';

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
  select: (cols: string) => Promise<{ data?: WorkspaceRow[] | null; error?: { message?: string } | null }>;
  upsert?: (row: Record<string, unknown>, opts?: { onConflict?: string }) => Promise<{ error?: { message?: string } | null }>;
  update?: (row: Record<string, unknown>) => {
    eq: (col: string, val: string) => Promise<{ error?: { message?: string } | null }>;
  };
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

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      workspaceId?: string;
      planId?: string;
      billingCycle?: string;
      provider?: string;
    };
    const workspaceId: string = body?.workspaceId || 'ws-primary';
    const rawPlanId = body?.planId;
    const billingCycle: BillingCycle = body?.billingCycle === 'annual' ? 'annual' : 'monthly';
    const provider: BillingProvider =
      body?.provider === 'mercadopago'
        ? 'mercadopago'
        : body?.provider === 'sandbox'
          ? 'sandbox'
          : 'stripe';

    if (!rawPlanId || !(rawPlanId in SAAS_PLANS)) {
      return NextResponse.json(
        { error: 'Invalid planId. Expected starter, growth, or agency.' },
        { status: 400 }
      );
    }

    const planId = rawPlanId as WorkspacePlan;
    const planConfig = SAAS_PLANS[planId];
    const discountMultiplier = billingCycle === 'annual' ? 0.8 : 1;
    const monthlyEquivalent = Number((planConfig.monthlyPriceUsd * discountMultiplier).toFixed(2));
    const totalUsd =
      billingCycle === 'annual'
        ? Number((monthlyEquivalent * 12).toFixed(2))
        : monthlyEquivalent;

    const pricing = {
      planId,
      billingCycle,
      monthlyEquivalent,
      totalUsd,
      discountPercent: billingCycle === 'annual' ? 20 : 0,
      currency: 'USD',
    };

    // Optional live Stripe Checkout Session when STRIPE_SECRET_KEY is configured
    if (provider === 'stripe' && process.env.STRIPE_SECRET_KEY) {
      const origin = req.nextUrl?.origin || 'https://misender.app';
      const params = new URLSearchParams({
        mode: 'subscription',
        success_url: `${origin}/?billing=success&plan=${planId}&workspaceId=${encodeURIComponent(workspaceId)}`,
        cancel_url: `${origin}/?billing=canceled`,
        client_reference_id: workspaceId,
        'metadata[workspaceId]': workspaceId,
        'metadata[planId]': planId,
        'metadata[billingCycle]': billingCycle,
        'line_items[0][price_data][currency]': 'usd',
        'line_items[0][price_data][product_data][name]': `MiSender ${planConfig.name} (${billingCycle})`,
        'line_items[0][price_data][unit_amount]': String(Math.round(totalUsd * 100)),
        'line_items[0][price_data][recurring][interval]': billingCycle === 'annual' ? 'year' : 'month',
        'line_items[0][quantity]': '1',
      });

      const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      const stripeData = (await stripeRes.json()) as {
        id?: string;
        url?: string;
        error?: { message?: string };
      };
      if (!stripeRes.ok) {
        return NextResponse.json(
          { error: stripeData?.error?.message || 'Stripe checkout session creation failed' },
          { status: 502 }
        );
      }

      return NextResponse.json({
        success: true,
        mode: 'stripe',
        url: stripeData.url,
        sessionId: stripeData.id,
        pricing,
      });
    }

    // Optional live MercadoPago Checkout Preference when MERCADOPAGO_ACCESS_TOKEN is configured
    if (provider === 'mercadopago' && process.env.MERCADOPAGO_ACCESS_TOKEN) {
      const origin = req.nextUrl?.origin || 'https://misender.app';
      const mpRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          items: [
            {
              title: `MiSender ${planConfig.name} (${billingCycle})`,
              quantity: 1,
              currency_id: 'USD',
              unit_price: totalUsd,
            },
          ],
          external_reference: `${workspaceId}:${planId}:${billingCycle}`,
          back_urls: {
            success: `${origin}/?billing=success&plan=${planId}`,
            failure: `${origin}/?billing=canceled`,
            pending: `${origin}/?billing=pending`,
          },
          auto_return: 'approved',
        }),
      });

      const mpData = (await mpRes.json()) as {
        id?: string;
        init_point?: string;
        sandbox_init_point?: string;
      };
      if (mpRes.ok && (mpData.init_point || mpData.sandbox_init_point)) {
        return NextResponse.json({
          success: true,
          mode: 'mercadopago',
          url: mpData.init_point || mpData.sandbox_init_point,
          preferenceId: mpData.id,
          pricing,
        });
      }
    }

    // Staging / Sandbox mode: update workspace entitlements immediately
    const store = getFallbackStore();
    let existing: Workspace | undefined = store.find((w) => w.id === workspaceId);

    if (shouldUseSupabase()) {
      try {
        const table = supabase.from('workspaces') as unknown as WorkspaceTableLike;
        const selectRes = await table.select('*');
        if (Array.isArray(selectRes?.data)) {
          const found = selectRes.data.find((r) => r.id === workspaceId);
          if (found) {
            existing = {
              id: found.id,
              name: found.name || 'Workspace',
              clientName: found.client_name || 'Internal',
              credits: Number(found.credits ?? planConfig.credits),
              ownerId: found.owner_id ?? undefined,
              ownerEmail: found.owner_email ?? undefined,
              plan: normalizePlan(found.plan),
              subscriptionStatus: (found.subscription_status || 'trialing') as SubscriptionStatus,
              trialEndsAt: found.trial_ends_at ?? undefined,
              maxAccounts: found.max_accounts ?? planConfig.maxAccounts,
              maxLeads: found.max_leads ?? planConfig.maxLeads,
              billingProvider: found.billing_provider ?? undefined,
            };
          }
        }
      } catch {
        // Ignore read error and fall back gracefully
      }
    }

    const nowIso = new Date().toISOString();
    const updatedWorkspace: Workspace = {
      ...(existing || {
        id: workspaceId,
        name: workspaceId === 'ws-primary' ? 'Espacio Principal' : 'Workspace',
        clientName: workspaceId === 'ws-primary' ? 'Vectra Systems' : 'Internal',
      }),
      plan: planId,
      subscriptionStatus: 'active',
      maxAccounts: planConfig.maxAccounts,
      maxLeads: planConfig.maxLeads,
      credits: planConfig.credits,
      billingProvider: provider,
      updatedAt: nowIso,
    };

    const nextStore = store.some((w) => w.id === workspaceId)
      ? store.map((w) => (w.id === workspaceId ? updatedWorkspace : w))
      : [...store, updatedWorkspace];
    setFallbackStore(nextStore);

    if (shouldUseSupabase()) {
      try {
        const table = supabase.from('workspaces') as unknown as WorkspaceTableLike;
        const dbRow: Record<string, unknown> = {
          id: updatedWorkspace.id,
          name: updatedWorkspace.name,
          client_name: updatedWorkspace.clientName,
          plan: updatedWorkspace.plan,
          subscription_status: updatedWorkspace.subscriptionStatus,
          max_accounts: updatedWorkspace.maxAccounts,
          max_leads: updatedWorkspace.maxLeads,
          credits: updatedWorkspace.credits,
          billing_provider: updatedWorkspace.billingProvider,
          updated_at: nowIso,
        };

        if (typeof table.upsert === 'function') {
          await table.upsert(dbRow, { onConflict: 'id' });
        } else if (typeof table.update === 'function') {
          await table.update(dbRow).eq('id', workspaceId);
        }
      } catch (err: unknown) {
        console.warn('POST /api/billing/checkout Supabase persistence fallback:', getErrorMessage(err));
      }
    }

    return NextResponse.json({
      success: true,
      mode: 'sandbox',
      workspace: updatedWorkspace,
      pricing,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(err) || 'Billing checkout failed' },
      { status: 500 }
    );
  }
}
