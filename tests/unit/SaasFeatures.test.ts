import crypto from 'crypto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockState, mockSupabase, mockContainer } = vi.hoisted(() => {
  const state = {
    workspaces: [] as Array<Record<string, unknown>>,
    upsertedWorkspaces: [] as Array<Record<string, unknown>>,
    campaigns: [] as Array<Record<string, unknown>>,
    accounts: [] as Array<Record<string, unknown>>,
  };

  const fromMock = vi.fn((tableName: string) => {
    if (tableName !== 'workspaces') {
      return {};
    }

    return {
      select: vi.fn(() => {
        const result = { data: [...state.workspaces], error: null };
        const promise = Promise.resolve(result) as Promise<typeof result> & {
          order: ReturnType<typeof vi.fn>;
        };
        promise.order = vi.fn().mockResolvedValue(result);
        return promise;
      }),
      upsert: vi.fn(async (row: Record<string, unknown>) => {
        state.upsertedWorkspaces.push(row);
        const idx = state.workspaces.findIndex((w) => w.id === row.id);
        if (idx >= 0) {
          state.workspaces[idx] = { ...state.workspaces[idx], ...row };
        } else {
          state.workspaces.push(row);
        }
        return { error: null };
      }),
      update: vi.fn((row: Record<string, unknown>) => ({
        eq: vi.fn(async (_col: string, val: string) => {
          const idx = state.workspaces.findIndex((w) => w.id === val);
          if (idx >= 0) {
            state.workspaces[idx] = { ...state.workspaces[idx], ...row };
          }
          return { error: null };
        }),
      })),
      delete: vi.fn(() => ({
        eq: vi.fn(async (_col: string, val: string) => {
          state.workspaces = state.workspaces.filter((w) => w.id !== val);
          return { error: null };
        }),
      })),
    };
  });

  const supabaseMock = {
    supabaseUrl: 'https://mock-project.supabase.co',
    from: fromMock,
  };

  const containerMock = {
    campaignRepo: {
      getCampaigns: vi.fn(),
    },
    dispatcher: {
      dispatchStep: vi.fn(),
    },
    accountRepo: {
      getAccounts: vi.fn(),
      saveAccount: vi.fn(),
      saveAccounts: vi.fn(),
    },
    warmupService: {
      runWarmupRound: vi.fn(),
    },
    dnsChecker: {
      auditDomain: vi.fn(),
      checkDomain: vi.fn(),
    },
  };

  return {
    mockState: state,
    mockSupabase: supabaseMock,
    mockContainer: containerMock,
  };
});

vi.mock('@/core/supabase/client', () => ({
  supabase: mockSupabase,
  getSupabaseClient: () => mockSupabase,
}));

vi.mock('@/core/container', () => ({
  container: mockContainer,
  createContainer: () => mockContainer,
}));

import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseCampaignRepository } from '@/core/storage/supabase/SupabaseCampaignRepository';
import { GET as getWorkspaces, POST as postWorkspace, PUT as putWorkspace } from '@/app/api/workspaces/route';
import { GET as getBillingCheckout, POST as postBillingCheckout } from '@/app/api/billing/checkout/route';
import { POST as postBillingWebhook } from '@/app/api/billing/webhook/route';
import { GET as getCronDispatch, POST as postCronDispatch } from '@/app/api/cron/dispatch/route';
import { GET as getCronWarmup, POST as postCronWarmup } from '@/app/api/cron/warmup/route';
import { GET as getAccountsOAuth, POST as postAccountsOAuth } from '@/app/api/accounts/oauth/route';
import { Campaign, SAAS_PLANS } from '@/types';

describe('SaaS Features, Billing, Crons, OAuth & Repository Options', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    mockState.workspaces = [];
    mockState.upsertedWorkspaces = [];
    (globalThis as unknown as { __misenderWorkspacesStore?: unknown }).__misenderWorkspacesStore = undefined;
    (globalThis as unknown as { __misenderMepRateCache?: unknown }).__misenderMepRateCache = undefined;

    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.BILLING_WEBHOOK_SECRET;
    delete process.env.MERCADOPAGO_ACCESS_TOKEN;
    delete process.env.MP_USD_TO_ARS_RATE;
    delete process.env.LEMONSQUEEZY_API_KEY;
    delete process.env.LEMONSQUEEZY_STORE_ID;
    delete process.env.LEMONSQUEEZY_VARIANT_ID;
    delete process.env.LEMONSQUEEZY_VARIANT_STARTER;
    delete process.env.LEMONSQUEEZY_VARIANT_GROWTH;
    delete process.env.LEMONSQUEEZY_VARIANT_AGENCY;
    delete process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.MICROSOFT_CLIENT_ID;
    delete process.env.CRON_SECRET;
    delete process.env.MISENDER_API_KEY;
    delete process.env.APP_API_KEY;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  describe('SupabaseCampaignRepository options mapping', () => {
    it('maps and preserves campaign options (stopOnDomainReply, plainTextMode, etc.) from DB and to DB', async () => {
      const upsertSpy = vi.fn().mockResolvedValue({ error: null });
      const mockRow = {
        id: 'camp-opt-1',
        name: 'SaaS Outbound Options',
        status: 'active',
        steps: [],
        schedule: {
          timing: { from: '09:00', to: '17:00' },
          days: [1, 2, 3, 4, 5],
          timezone: 'America/New_York',
          dailyLimit: 50,
          strategy: 'office-hours',
        },
        sender_account_ids: ['acc-1'],
        open_tracking: false,
        click_tracking: true,
        options: {
          stopOnReply: false,
          stopOnDomainReply: true,
          plainTextMode: true,
          openTracking: false,
          clickTracking: true,
        },
        stats: { sent: 10, opened: 3, replied: 1, bounced: 0, opportunities: 1 },
      };

      const mockRowNoOptions = {
        ...mockRow,
        id: 'camp-opt-default',
        open_tracking: true,
        click_tracking: false,
        options: null,
      };

      const mockClient = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [mockRow, mockRowNoOptions], error: null }),
          }),
          upsert: upsertSpy,
        }),
      } as unknown as SupabaseClient;

      const repo = new SupabaseCampaignRepository(mockClient);
      const campaigns = await repo.getCampaigns();

      expect(campaigns).toHaveLength(2);
      expect(campaigns[0].options).toEqual({
        stopOnReply: false,
        stopOnDomainReply: true,
        plainTextMode: true,
        openTracking: false,
        clickTracking: true,
      });
      expect(campaigns[1].options).toEqual({
        stopOnReply: true,
        stopOnDomainReply: false,
        plainTextMode: false,
        openTracking: true,
        clickTracking: false,
      });

      const toSave: Campaign = {
        ...campaigns[0],
        options: {
          stopOnReply: true,
          stopOnDomainReply: true,
          plainTextMode: true,
          openTracking: false,
          clickTracking: true,
        },
      };

      await repo.saveCampaign(toSave);
      expect(upsertSpy).toHaveBeenCalledTimes(1);
      const [dbPayload] = upsertSpy.mock.calls[0];
      expect(dbPayload.options).toEqual({
        stopOnReply: true,
        stopOnDomainReply: true,
        plainTextMode: true,
        openTracking: false,
        clickTracking: true,
      });
      expect(dbPayload.open_tracking).toBe(false);
      expect(dbPayload.click_tracking).toBe(true);
    });
  });

  describe('/api/workspaces GET, POST, PUT handlers', () => {
    it('GET seeds ws-primary when empty and returns mapped workspaces', async () => {
      const req = new NextRequest('http://localhost:3000/api/workspaces');
      const res = await getWorkspaces(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
      expect(data[0].id).toBe('ws-primary');
      expect(data[0].plan).toBe('growth');
      expect(mockState.upsertedWorkspaces).toHaveLength(1);
    });

    it('POST creates a new SaaS workspace with 7-day trial and plan limits', async () => {
      const req = new NextRequest('http://localhost:3000/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Agency Client Alpha',
          clientName: 'Alpha Corp',
          plan: 'agency',
          ownerId: 'user-123',
          ownerEmail: 'founder@alpha.io',
        }),
      });

      const res = await postWorkspace(req);
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.id).toMatch(/^ws-/);
      expect(data.name).toBe('Agency Client Alpha');
      expect(data.plan).toBe('agency');
      expect(data.subscriptionStatus).toBe('trialing');
      expect(data.maxAccounts).toBe(SAAS_PLANS.agency.maxAccounts);
      expect(data.maxLeads).toBe(SAAS_PLANS.agency.maxLeads);
      expect(data.credits).toBe(SAAS_PLANS.agency.credits);
      expect(Date.parse(data.trialEndsAt)).toBeGreaterThan(Date.now());
    });

    it('PUT updates workspace name and upgrades plan limits accurately', async () => {
      mockState.workspaces = [
        {
          id: 'ws-upgrade-1',
          name: 'Starter Org',
          client_name: 'Starter',
          plan: 'starter',
          subscription_status: 'trialing',
          max_accounts: 3,
          max_leads: 1000,
          credits: 1000,
        },
      ];

      const req = new NextRequest('http://localhost:3000/api/workspaces', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'ws-upgrade-1',
          name: 'Growth Org',
          plan: 'growth',
          subscriptionStatus: 'active',
        }),
      });

      const res = await putWorkspace(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.id).toBe('ws-upgrade-1');
      expect(data.name).toBe('Growth Org');
      expect(data.plan).toBe('growth');
      expect(data.subscriptionStatus).toBe('active');
      expect(data.maxAccounts).toBe(SAAS_PLANS.growth.maxAccounts);
      expect(data.maxLeads).toBe(SAAS_PLANS.growth.maxLeads);
      expect(data.credits).toBe(SAAS_PLANS.growth.credits);
    });
  });

  describe('/api/billing/checkout plan upgrade calculation', () => {
    it('calculates monthly and annual (-20%) upgrade pricing and updates workspace entitlements', async () => {
      mockState.workspaces = [
        {
          id: 'ws-primary',
          name: 'Espacio Principal',
          client_name: 'Vectra Systems',
          plan: 'starter',
          subscription_status: 'trialing',
          max_accounts: 3,
          max_leads: 1000,
          credits: 1000,
        },
      ];

      const annualAgencyReq = new NextRequest('http://localhost:3000/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: 'ws-primary',
          planId: 'agency',
          billingCycle: 'annual',
          provider: 'mercadopago',
        }),
      });

      const res = await postBillingCheckout(annualAgencyReq);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.mode).toBe('sandbox');
      // $149 * 0.8 = $119.20/mo => $1,430.40/year; default test rate = 1200 ARS/USD => 1,716,480 ARS
      expect(data.pricing).toEqual({
        planId: 'agency',
        billingCycle: 'annual',
        monthlyEquivalent: 119.2,
        totalUsd: 1430.4,
        totalArs: Math.round(1430.4 * 1200),
        usdToArsRate: 1200,
        rateSource: 'fallback',
        discountPercent: 20,
        currency: 'USD',
      });
      expect(data.workspace.plan).toBe('agency');
      expect(data.workspace.subscriptionStatus).toBe('active');
      expect(data.workspace.maxAccounts).toBe(999);
      expect(data.workspace.maxLeads).toBe(50000);
      expect(data.workspace.credits).toBe(15000);
      expect(data.workspace.billingProvider).toBe('mercadopago');

      const monthlyGrowthReq = new NextRequest('http://localhost:3000/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: 'ws-primary',
          planId: 'growth',
          billingCycle: 'monthly',
          provider: 'stripe',
        }),
      });

      const growthRes = await postBillingCheckout(monthlyGrowthReq);
      const growthData = await growthRes.json();
      expect(growthRes.status).toBe(200);
      expect(growthData.pricing).toEqual({
        planId: 'growth',
        billingCycle: 'monthly',
        monthlyEquivalent: 79,
        totalUsd: 79,
        totalArs: 79 * 1200,
        usdToArsRate: 1200,
        rateSource: 'fallback',
        discountPercent: 0,
        currency: 'USD',
      });
      expect(growthData.workspace.maxAccounts).toBe(10);
      expect(growthData.workspace.maxLeads).toBe(10000);
    });

    it('GET returns usdToArsRate, webhookUrl, and gateway configuration flags', async () => {
      const unconfiguredReq = new NextRequest('http://localhost:3000/api/billing/checkout');
      const unconfiguredRes = await getBillingCheckout(unconfiguredReq);
      const unconfiguredData = await unconfiguredRes.json();

      expect(unconfiguredRes.status).toBe(200);
      expect(unconfiguredData).toEqual({
        usdToArsRate: 1200,
        rateSource: 'fallback',
        mercadopagoConfigured: false,
        lemonsqueezyConfigured: false,
        stripeConfigured: false,
        webhookUrl: 'http://localhost:3000/api/billing/webhook',
      });

      process.env.MP_USD_TO_ARS_RATE = '1340';
      process.env.MERCADOPAGO_ACCESS_TOKEN = 'APP_USR-test-token';
      process.env.LEMONSQUEEZY_API_KEY = 'ls-api-key';
      process.env.LEMONSQUEEZY_STORE_ID = 'store-42';
      process.env.STRIPE_SECRET_KEY = 'sk_test_51abc';

      const configuredReq = new NextRequest('https://app.misender.io/api/billing/checkout');
      const configuredRes = await getBillingCheckout(configuredReq);
      const configuredData = await configuredRes.json();

      expect(configuredRes.status).toBe(200);
      expect(configuredData).toEqual({
        usdToArsRate: 1340,
        rateSource: 'env',
        mercadopagoConfigured: true,
        lemonsqueezyConfigured: true,
        stripeConfigured: true,
        webhookUrl: 'https://app.misender.io/api/billing/webhook',
      });
    });

    it('POST handles provider mercadopago (Checkout Pro & recurring preapproval) with totalArs = Math.round(totalUsd * usdToArsRate)', async () => {
      process.env.MP_USD_TO_ARS_RATE = '1275.5';
      mockState.workspaces = [
        {
          id: 'ws-primary',
          name: 'Espacio Principal',
          client_name: 'Vectra Systems',
          plan: 'starter',
          subscription_status: 'trialing',
          max_accounts: 3,
          max_leads: 1000,
          credits: 1000,
        },
      ];

      // 1. Sandbox fallback still calculates exact totalArs
      const sandboxReq = new NextRequest('http://localhost:3000/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: 'ws-primary',
          planId: 'starter',
          billingCycle: 'monthly',
          provider: 'mercadopago',
        }),
      });
      const sandboxRes = await postBillingCheckout(sandboxReq);
      const sandboxData = await sandboxRes.json();

      expect(sandboxRes.status).toBe(200);
      expect(sandboxData.mode).toBe('sandbox');
      expect(sandboxData.pricing.usdToArsRate).toBe(1275.5);
      expect(sandboxData.pricing.rateSource).toBe('env');
      expect(sandboxData.pricing.totalArs).toBe(Math.round(sandboxData.pricing.totalUsd * 1275.5));
      expect(sandboxData.workspace.billingProvider).toBe('mercadopago');

      // 2. Live MercadoPago Checkout Pro preference & recurring preapproval
      process.env.MERCADOPAGO_ACCESS_TOKEN = 'APP_USR-live-mp';
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              id: 'pref-123',
              init_point: 'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-123',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              id: 'pre-456',
              init_point: 'https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_id=pre-456',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        );

      const mpPrefReq = new NextRequest('http://localhost:3000/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: 'ws-primary',
          planId: 'growth',
          billingCycle: 'monthly',
          provider: 'mercadopago',
          recurring: false,
        }),
      });
      const mpPrefRes = await postBillingCheckout(mpPrefReq);
      const mpPrefData = await mpPrefRes.json();

      expect(mpPrefRes.status).toBe(200);
      expect(mpPrefData.success).toBe(true);
      expect(mpPrefData.mode).toBe('mercadopago');
      expect(mpPrefData.recurring).toBe(false);
      expect(mpPrefData.preferenceId).toBe('pref-123');
      expect(mpPrefData.pricing.totalArs).toBe(Math.round(79 * 1275.5));

      const prefCallBody = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body));
      expect(fetchSpy.mock.calls[0][0]).toBe('https://api.mercadopago.com/checkout/preferences');
      expect(prefCallBody.items[0].currency_id).toBe('ARS');
      expect(prefCallBody.items[0].unit_price).toBe(Math.round(79 * 1275.5));
      expect(prefCallBody.external_reference).toBe('ws-primary:growth:monthly');

      const mpRecReq = new NextRequest('http://localhost:3000/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: 'ws-primary',
          planId: 'agency',
          billingCycle: 'annual',
          provider: 'mercadopago',
          recurring: true,
        }),
      });
      const mpRecRes = await postBillingCheckout(mpRecReq);
      const mpRecData = await mpRecRes.json();

      expect(mpRecRes.status).toBe(200);
      expect(mpRecData.mode).toBe('mercadopago');
      expect(mpRecData.recurring).toBe(true);
      expect(mpRecData.preapprovalId).toBe('pre-456');
      expect(mpRecData.pricing.totalArs).toBe(Math.round(1430.4 * 1275.5));

      const recCallBody = JSON.parse(String(fetchSpy.mock.calls[1][1]?.body));
      expect(fetchSpy.mock.calls[1][0]).toBe('https://api.mercadopago.com/preapproval');
      expect(recCallBody.auto_recurring.frequency).toBe(12);
      expect(recCallBody.auto_recurring.transaction_amount).toBe(Math.round(1430.4 * 1275.5));
      expect(recCallBody.auto_recurring.currency_id).toBe('ARS');
    });

    it('POST handles provider lemonsqueezy in both sandbox fallback and live checkout API mode', async () => {
      mockState.workspaces = [
        {
          id: 'ws-primary',
          name: 'Espacio Principal',
          client_name: 'Vectra Systems',
          plan: 'starter',
          subscription_status: 'trialing',
          max_accounts: 3,
          max_leads: 1000,
          credits: 1000,
        },
      ];

      // 1. Sandbox fallback when Lemon Squeezy credentials are missing
      const lsSandboxReq = new NextRequest('http://localhost:3000/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: 'ws-primary',
          planId: 'growth',
          billingCycle: 'monthly',
          provider: 'lemonsqueezy',
        }),
      });
      const lsSandboxRes = await postBillingCheckout(lsSandboxReq);
      const lsSandboxData = await lsSandboxRes.json();

      expect(lsSandboxRes.status).toBe(200);
      expect(lsSandboxData.success).toBe(true);
      expect(lsSandboxData.mode).toBe('sandbox');
      expect(lsSandboxData.workspace.plan).toBe('growth');
      expect(lsSandboxData.workspace.billingProvider).toBe('lemonsqueezy');

      // 2. Live Lemon Squeezy JSON:API checkout when credentials & variant are set
      process.env.LEMONSQUEEZY_API_KEY = 'ls-secret-key';
      process.env.LEMONSQUEEZY_STORE_ID = '998877';
      process.env.LEMONSQUEEZY_VARIANT_GROWTH = 'var-growth-1';

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              id: 'chk-789',
              attributes: { url: 'https://checkout.lemonsqueezy.com/buy/chk-789' },
            },
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const lsLiveReq = new NextRequest('http://localhost:3000/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: 'ws-primary',
          planId: 'growth',
          billingCycle: 'monthly',
          provider: 'lemonsqueezy',
        }),
      });
      const lsLiveRes = await postBillingCheckout(lsLiveReq);
      const lsLiveData = await lsLiveRes.json();

      expect(lsLiveRes.status).toBe(200);
      expect(lsLiveData.success).toBe(true);
      expect(lsLiveData.mode).toBe('lemonsqueezy');
      expect(lsLiveData.checkoutId).toBe('chk-789');
      expect(lsLiveData.url).toBe('https://checkout.lemonsqueezy.com/buy/chk-789');

      const lsPayload = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body));
      expect(fetchSpy.mock.calls[0][0]).toBe('https://api.lemonsqueezy.com/v1/checkouts');
      expect(lsPayload.data.attributes.checkout_data.custom).toEqual({
        workspace_id: 'ws-primary',
        plan_id: 'growth',
        billing_cycle: 'monthly',
      });
      expect(lsPayload.data.relationships.store.data.id).toBe('998877');
      expect(lsPayload.data.relationships.variant.data.id).toBe('var-growth-1');
    });

    it('rejects unknown planId with HTTP 400', async () => {
      const req = new NextRequest('http://localhost:3000/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: 'ws-primary', planId: 'enterprise_invalid' }),
      });

      const res = await postBillingCheckout(req);
      expect(res.status).toBe(400);
    });
  });

  describe('/api/billing/webhook MercadoPago & Lemon Squeezy handlers', () => {
    it('activates workspace on MercadoPago payment approved notification and ignores pending ones', async () => {
      mockState.workspaces = [
        {
          id: 'ws-primary',
          name: 'Espacio Principal',
          client_name: 'Vectra Systems',
          plan: 'starter',
          subscription_status: 'trialing',
          max_accounts: 3,
          max_leads: 1000,
          credits: 1000,
        },
      ];

      const pendingReq = new NextRequest('http://localhost:3000/api/billing/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'payment',
          external_reference: 'ws-primary:agency:monthly',
          status: 'pending',
        }),
      });
      const pendingRes = await postBillingWebhook(pendingReq);
      const pendingData = await pendingRes.json();

      expect(pendingRes.status).toBe(200);
      expect(pendingData.received).toBe(true);
      expect(pendingData.handled).toBe(false);

      const approvedReq = new NextRequest('http://localhost:3000/api/billing/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'payment',
          external_reference: 'ws-primary:agency:monthly',
          status: 'approved',
          data: { id: 'mp-pay-999' },
        }),
      });
      const approvedRes = await postBillingWebhook(approvedReq);
      const approvedData = await approvedRes.json();

      expect(approvedRes.status).toBe(200);
      expect(approvedData.received).toBe(true);
      expect(approvedData.handled).toBe(true);
      expect(approvedData.eventType).toBe('payment');
      expect(approvedData.workspaceId).toBe('ws-primary');
      expect(approvedData.workspace.plan).toBe('agency');
      expect(approvedData.workspace.subscriptionStatus).toBe('active');
      expect(approvedData.workspace.billingProvider).toBe('mercadopago');
      expect(approvedData.workspace.billingSubscriptionId).toBe('mp-pay-999');
      expect(approvedData.workspace.maxAccounts).toBe(SAAS_PLANS.agency.maxAccounts);
      expect(approvedData.workspace.maxLeads).toBe(SAAS_PLANS.agency.maxLeads);
      expect(approvedData.workspace.credits).toBe(SAAS_PLANS.agency.credits);
    });

    it('activates workspace on Lemon Squeezy subscription_created webhook and verifies HMAC when secret is set', async () => {
      mockState.workspaces = [
        {
          id: 'ws-primary',
          name: 'Espacio Principal',
          client_name: 'Vectra Systems',
          plan: 'starter',
          subscription_status: 'trialing',
          max_accounts: 3,
          max_leads: 1000,
          credits: 1000,
        },
      ];

      const lsBody = JSON.stringify({
        meta: {
          event_name: 'subscription_created',
          custom_data: {
            workspace_id: 'ws-primary',
            plan_id: 'growth',
          },
        },
        data: {
          id: 'ls-sub-555',
          attributes: {
            status: 'active',
          },
        },
      });

      process.env.LEMONSQUEEZY_WEBHOOK_SECRET = 'ls-webhook-secret';

      const badSigReq = new NextRequest('http://localhost:3000/api/billing/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-signature': 'deadbeef',
        },
        body: lsBody,
      });
      const badSigRes = await postBillingWebhook(badSigReq);
      expect(badSigRes.status).toBe(401);

      const validSig = crypto
        .createHmac('sha256', 'ls-webhook-secret')
        .update(lsBody)
        .digest('hex');

      const validReq = new NextRequest('http://localhost:3000/api/billing/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-signature': validSig,
        },
        body: lsBody,
      });
      const validRes = await postBillingWebhook(validReq);
      const validData = await validRes.json();

      expect(validRes.status).toBe(200);
      expect(validData.received).toBe(true);
      expect(validData.handled).toBe(true);
      expect(validData.eventType).toBe('subscription_created');
      expect(validData.workspaceId).toBe('ws-primary');
      expect(validData.workspace.plan).toBe('growth');
      expect(validData.workspace.subscriptionStatus).toBe('active');
      expect(validData.workspace.billingProvider).toBe('lemonsqueezy');
      expect(validData.workspace.billingSubscriptionId).toBe('ls-sub-555');
      expect(validData.workspace.maxAccounts).toBe(SAAS_PLANS.growth.maxAccounts);
      expect(validData.workspace.maxLeads).toBe(SAAS_PLANS.growth.maxLeads);
      expect(validData.workspace.credits).toBe(SAAS_PLANS.growth.credits);
    });
  });

  describe('/api/cron/dispatch and /api/cron/warmup handlers', () => {
    it('enforces CRON_SECRET and dispatches active campaigns only', async () => {
      process.env.CRON_SECRET = 'super-cron-secret';

      mockContainer.campaignRepo.getCampaigns.mockResolvedValue([
        { id: 'c-active-1', name: 'Active 1', status: 'active' },
        { id: 'c-draft-1', name: 'Draft 1', status: 'draft' },
        { id: 'c-active-2', name: 'Active 2', status: 'active' },
      ]);
      mockContainer.dispatcher.dispatchStep
        .mockResolvedValueOnce({ sentCount: 4, processed: 5, outsideScheduleWindow: false, remainingPending: 10 })
        .mockResolvedValueOnce({ sentCount: 2, processed: 2, outsideScheduleWindow: false, remainingPending: 0 });

      const unauthReq = new NextRequest('http://localhost:3000/api/cron/dispatch');
      const unauthRes = await getCronDispatch(unauthReq);
      expect(unauthRes.status).toBe(401);

      const authReq = new NextRequest('http://localhost:3000/api/cron/dispatch', {
        headers: { Authorization: 'Bearer super-cron-secret' },
      });
      const authRes = await getCronDispatch(authReq);
      const data = await authRes.json();

      expect(authRes.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.campaignsProcessed).toBe(2);
      expect(data.totalSent).toBe(6);
      expect(mockContainer.dispatcher.dispatchStep).toHaveBeenCalledTimes(2);
      expect(mockContainer.dispatcher.dispatchStep).toHaveBeenCalledWith('c-active-1', {
        batchSize: 15,
        respectSchedule: true,
      });

      // Manual trigger works on staging when MISENDER_API_KEY is not set
      const manualReq = new NextRequest('http://localhost:3000/api/cron/dispatch', {
        method: 'POST',
        headers: { 'x-manual-trigger': 'true' },
      });
      const manualRes = await postCronDispatch(manualReq);
      expect(manualRes.status).toBe(200);
    });

    it('runs warmup round and resets daily counters when resetDaily=true', async () => {
      process.env.CRON_SECRET = 'super-cron-secret';

      mockContainer.accountRepo.getAccounts.mockResolvedValue([
        { id: 'acc-1', email: 'a@test.io', sentToday: 25, warmupToday: 12 },
        { id: 'acc-2', email: 'b@test.io', sentToday: 10, warmupToday: 5 },
      ]);
      mockContainer.accountRepo.saveAccounts.mockResolvedValue(undefined);
      mockContainer.warmupService.runWarmupRound.mockResolvedValue({
        processed: 2,
        emailsSent: 4,
      });

      const unauthReq = new NextRequest('http://localhost:3000/api/cron/warmup');
      const unauthRes = await getCronWarmup(unauthReq);
      expect(unauthRes.status).toBe(401);

      const req = new NextRequest('http://localhost:3000/api/cron/warmup?resetDaily=true', {
        method: 'POST',
        headers: { Authorization: 'Bearer super-cron-secret' },
      });
      const res = await postCronWarmup(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.resetDaily).toBe(true);
      expect(data.warmupResult).toEqual({ processed: 2, emailsSent: 4 });
      expect(mockContainer.accountRepo.saveAccounts).toHaveBeenCalledWith([
        expect.objectContaining({ id: 'acc-1', sentToday: 0, warmupToday: 0 }),
        expect.objectContaining({ id: 'acc-2', sentToday: 0, warmupToday: 0 }),
      ]);
      expect(mockContainer.warmupService.runWarmupRound).toHaveBeenCalledTimes(1);
    });
  });

  describe('/api/accounts/oauth 1-click mailbox connection', () => {
    it('GET returns guided-1click metadata when OAuth client ID is not configured', async () => {
      const req = new NextRequest('http://localhost:3000/api/accounts/oauth?provider=google');
      const res = await getAccountsOAuth(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.configured).toBe(false);
      expect(data.mode).toBe('guided-1click');
      expect(data.smtpDefaults).toEqual({
        smtpHost: 'smtp.gmail.com',
        smtpPort: 587,
        dkimSelector: 'google',
      });
    });

    it('POST provisions Google/Microsoft mailbox via 1-click and returns masked smtpPass', async () => {
      mockContainer.accountRepo.getAccounts.mockResolvedValue([]);
      mockContainer.accountRepo.saveAccount.mockResolvedValue(undefined);
      mockContainer.dnsChecker.auditDomain.mockRejectedValue(new Error('DNS lookup timeout'));

      const req = new NextRequest('http://localhost:3000/api/accounts/oauth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'google',
          email: 'Sales@AcmeCorp.io',
          name: 'Acme Sales Mailbox',
          accessToken: 'ya29.super-secret-oauth-token',
        }),
      });

      const res = await postAccountsOAuth(req);
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.account.email).toBe('sales@acmecorp.io');
      expect(data.account.provider).toBe('google');
      expect(data.account.smtpHost).toBe('smtp.gmail.com');
      expect(data.account.smtpPort).toBe(587);
      // Credential must be masked before returning to client
      expect(data.account.smtpPass).toBe('••••••••');
      expect(data.account.smtpPass).not.toContain('ya29.super-secret');
      expect(mockContainer.accountRepo.saveAccount).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'sales@acmecorp.io',
          smtpPass: 'ya29.super-secret-oauth-token',
          smtpHost: 'smtp.gmail.com',
        })
      );
    });
  });
});
