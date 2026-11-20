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

const MEP_RATE_CACHE_TTL_MS = 15 * 60 * 1000;

interface CachedMepRate {
  rate: number;
  source: 'dolarapi-mep';
  expiresAt: number;
}

function getRequestOrigin(req: NextRequest): string {
  const nextOrigin = req.nextUrl?.origin;
  if (nextOrigin && nextOrigin !== 'null') return nextOrigin;
  try {
    return new URL(req.url).origin || 'https://misender.app';
  } catch {
    return 'https://misender.app';
  }
}

/**
 * Fetches and caches (15-min TTL) the live USD -> ARS MEP exchange rate from DolarAPI.
 * Falls back cleanly to MP_USD_TO_ARS_RATE or 1200 when offline, timed out, or in unit tests.
 */
async function getUsdToArsMepRate(): Promise<{ usdToArsRate: number; rateSource: string }> {
  const envRate = Number(process.env.MP_USD_TO_ARS_RATE);
  const hasEnvRate = Number.isFinite(envRate) && envRate > 0;
  const fallbackRate = hasEnvRate ? envRate : 1200;
  const fallbackSource = hasEnvRate ? 'env' : 'fallback';

  if (process.env.VITEST || process.env.NODE_ENV === 'test') {
    return { usdToArsRate: fallbackRate, rateSource: fallbackSource };
  }

  const g = globalThis as unknown as { __misenderMepRateCache?: CachedMepRate };
  const now = Date.now();
  if (g.__misenderMepRateCache && g.__misenderMepRateCache.expiresAt > now) {
    return {
      usdToArsRate: g.__misenderMepRateCache.rate,
      rateSource: g.__misenderMepRateCache.source,
    };
  }

  try {
    const signal =
      typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(2500)
        : undefined;

    const res = await fetch('https://dolarapi.com/v1/dolares/mep', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal,
    });

    if (res && res.ok) {
      const data = (await res.json()) as { venta?: unknown; compra?: unknown } | null;
      const venta = Number(data?.venta);
      const compra = Number(data?.compra);
      const liveRate =
        Number.isFinite(venta) && venta > 0
          ? venta
          : Number.isFinite(compra) && compra > 0
            ? compra
            : NaN;

      if (Number.isFinite(liveRate) && liveRate > 0) {
        const roundedRate = Math.round(liveRate * 100) / 100;
        g.__misenderMepRateCache = {
          rate: roundedRate,
          source: 'dolarapi-mep',
          expiresAt: now + MEP_RATE_CACHE_TTL_MS,
        };
        return { usdToArsRate: roundedRate, rateSource: 'dolarapi-mep' };
      }
    }
  } catch {
    // Ignore network / timeout errors and use configured fallback rate
  }

  return { usdToArsRate: fallbackRate, rateSource: fallbackSource };
}

function resolveLemonSqueezyVariantId(planId: WorkspacePlan): string | undefined {
  const variantMap: Record<WorkspacePlan, string | undefined> = {
    starter: process.env.LEMONSQUEEZY_VARIANT_STARTER,
    growth: process.env.LEMONSQUEEZY_VARIANT_GROWTH,
    agency: process.env.LEMONSQUEEZY_VARIANT_AGENCY,
  };
  return variantMap[planId] || process.env.LEMONSQUEEZY_VARIANT_ID;
}

export async function GET(req: NextRequest) {
  const { usdToArsRate, rateSource } = await getUsdToArsMepRate();
  const origin = getRequestOrigin(req);

  return NextResponse.json({
    usdToArsRate,
    rateSource,
    mercadopagoConfigured: Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN),
    lemonsqueezyConfigured: Boolean(
      process.env.LEMONSQUEEZY_API_KEY && process.env.LEMONSQUEEZY_STORE_ID
    ),
    stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
    webhookUrl: `${origin}/api/billing/webhook`,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      workspaceId?: string;
      planId?: string;
      billingCycle?: string;
      provider?: string;
      recurring?: boolean;
    };
    const workspaceId: string = body?.workspaceId || 'ws-primary';
    const rawPlanId = body?.planId;
    const billingCycle: BillingCycle = body?.billingCycle === 'annual' ? 'annual' : 'monthly';
    const provider: BillingProvider =
      body?.provider === 'mercadopago'
        ? 'mercadopago'
        : body?.provider === 'lemonsqueezy'
          ? 'lemonsqueezy'
          : body?.provider === 'sandbox'
            ? 'sandbox'
            : 'stripe';
    const recurring = Boolean(body?.recurring);

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

    const { usdToArsRate, rateSource } = await getUsdToArsMepRate();
    const totalArs = Math.round(totalUsd * usdToArsRate);

    const pricing = {
      planId,
      billingCycle,
      monthlyEquivalent,
      totalUsd,
      totalArs,
      usdToArsRate,
      rateSource,
      discountPercent: billingCycle === 'annual' ? 20 : 0,
      currency: 'USD',
    };

    const origin = getRequestOrigin(req);

    // Optional live Stripe Checkout Session when STRIPE_SECRET_KEY is configured
    if (provider === 'stripe' && process.env.STRIPE_SECRET_KEY) {
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

    // Optional live MercadoPago Checkout (Preapproval recurring OR Checkout Pro ARS)
    if (provider === 'mercadopago' && process.env.MERCADOPAGO_ACCESS_TOKEN) {
      if (recurring) {
        const mpPreRes = await fetch('https://api.mercadopago.com/preapproval', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            reason: `MiSender ${planConfig.name} (${billingCycle})`,
            external_reference: `${workspaceId}:${planId}:${billingCycle}`,
            auto_recurring: {
              frequency: billingCycle === 'annual' ? 12 : 1,
              frequency_type: 'months',
              transaction_amount: totalArs,
              currency_id: 'ARS',
            },
            back_url: `${origin}/?billing=success&plan=${planId}&workspaceId=${encodeURIComponent(workspaceId)}`,
            status: 'pending',
          }),
        });

        const mpPreData = (await mpPreRes.json()) as {
          id?: string;
          init_point?: string;
          sandbox_init_point?: string;
          message?: string;
          error?: string;
        };

        if (!mpPreRes.ok || (!mpPreData.init_point && !mpPreData.sandbox_init_point)) {
          return NextResponse.json(
            { error: mpPreData?.message || mpPreData?.error || 'MercadoPago preapproval creation failed' },
            { status: 502 }
          );
        }

        return NextResponse.json({
          success: true,
          mode: 'mercadopago',
          recurring: true,
          url: mpPreData.init_point || mpPreData.sandbox_init_point,
          preapprovalId: mpPreData.id,
          pricing,
        });
      }

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
              currency_id: 'ARS',
              unit_price: totalArs,
            },
          ],
          external_reference: `${workspaceId}:${planId}:${billingCycle}`,
          notification_url: `${origin}/api/billing/webhook?provider=mercadopago`,
          back_urls: {
            success: `${origin}/?billing=success&plan=${planId}&workspaceId=${encodeURIComponent(workspaceId)}`,
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
        message?: string;
        error?: string;
      };

      if (!mpRes.ok || (!mpData.init_point && !mpData.sandbox_init_point)) {
        return NextResponse.json(
          { error: mpData?.message || mpData?.error || 'MercadoPago checkout preference creation failed' },
          { status: 502 }
        );
      }

      return NextResponse.json({
        success: true,
        mode: 'mercadopago',
        recurring: false,
        url: mpData.init_point || mpData.sandbox_init_point,
        preferenceId: mpData.id,
        pricing,
      });
    }

    // Optional live Lemon Squeezy Checkout when API key, Store ID, and Variant ID are configured
    if (
      provider === 'lemonsqueezy' &&
      process.env.LEMONSQUEEZY_API_KEY &&
      process.env.LEMONSQUEEZY_STORE_ID
    ) {
      const variantId = resolveLemonSqueezyVariantId(planId);
      if (variantId) {
        const lsRes = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.LEMONSQUEEZY_API_KEY}`,
            Accept: 'application/vnd.api+json',
            'Content-Type': 'application/vnd.api+json',
          },
          body: JSON.stringify({
            data: {
              type: 'checkouts',
              attributes: {
                checkout_data: {
                  custom: {
                    workspace_id: workspaceId,
                    plan_id: planId,
                    billing_cycle: billingCycle,
                  },
                },
                product_options: {
                  redirect_url: `${origin}/?billing=success&plan=${planId}&workspaceId=${encodeURIComponent(workspaceId)}`,
                },
              },
              relationships: {
                store: {
                  data: {
                    type: 'stores',
                    id: String(process.env.LEMONSQUEEZY_STORE_ID),
                  },
                },
                variant: {
                  data: {
                    type: 'variants',
                    id: String(variantId),
                  },
                },
              },
            },
          }),
        });

        const lsData = (await lsRes.json()) as {
          data?: { id?: string; attributes?: { url?: string } };
          url?: string;
          errors?: Array<{ detail?: string }>;
          message?: string;
        };

        const checkoutUrl = lsData?.data?.attributes?.url || lsData?.url;
        if (!lsRes.ok || !checkoutUrl) {
          return NextResponse.json(
            {
              error:
                lsData?.errors?.[0]?.detail ||
                lsData?.message ||
                'Lemon Squeezy checkout creation failed',
            },
            { status: 502 }
          );
        }

        return NextResponse.json({
          success: true,
          mode: 'lemonsqueezy',
          url: checkoutUrl,
          checkoutId: lsData?.data?.id,
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
