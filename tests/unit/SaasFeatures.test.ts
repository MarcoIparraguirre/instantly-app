import crypto from 'crypto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockState, mockSupabase, mockContainer } = vi.hoisted(() => {
  const state = {
    workspaces: [] as Array<Record<string, unknown>>,
    upsertedWorkspaces: [] as Array<Record<string, unknown>>,
    userProfiles: [] as Array<Record<string, unknown>>,
    upsertedUserProfiles: [] as Array<Record<string, unknown>>,
    campaigns: [] as Array<Record<string, unknown>>,
    accounts: [] as Array<Record<string, unknown>>,
  };

  const fromMock = vi.fn((tableName: string) => {
    if (tableName === 'user_profiles') {
      return {
        select: vi.fn(() => {
          const result = { data: [...state.userProfiles], error: null };
          const promise = Promise.resolve(result) as Promise<typeof result> & {
            order: ReturnType<typeof vi.fn>;
          };
          promise.order = vi.fn().mockResolvedValue(result);
          return promise;
        }),
        upsert: vi.fn(async (row: Record<string, unknown>) => {
          state.upsertedUserProfiles.push(row);
          const idx = state.userProfiles.findIndex((m) => m.id === row.id);
          if (idx >= 0) {
            state.userProfiles[idx] = { ...state.userProfiles[idx], ...row };
          } else {
            state.userProfiles.push(row);
          }
          return { error: null };
        }),
        delete: vi.fn(() => ({
          eq: vi.fn(async (_col: string, val: string) => {
            state.userProfiles = state.userProfiles.filter((m) => m.id !== val);
            return { error: null };
          }),
        })),
      };
    }

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
import { GET as getTeam, POST as postTeam, PUT as putTeam, DELETE as deleteTeam } from '@/app/api/team/route';
import { Campaign, SAAS_PLANS, ROLE_PERMISSIONS, normalizeRole, canAccessTab } from '@/types';

describe('SaaS Features, Billing, Crons, OAuth & Repository Options', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    mockState.workspaces = [];
    mockState.upsertedWorkspaces = [];
    mockState.userProfiles = [];
    mockState.upsertedUserProfiles = [];
    (globalThis as unknown as { __misenderWorkspacesStore?: unknown }).__misenderWorkspacesStore = undefined;
    (globalThis as unknown as { __misenderTeamStore?: unknown }).__misenderTeamStore = undefined;
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
    it('GET returns [] when empty (clean zero state) without auto-seeding ws-primary', async () => {
      const req = new NextRequest('http://localhost:3000/api/workspaces');
      const res = await getWorkspaces(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
      expect(data).toHaveLength(0);
      expect(mockState.upsertedWorkspaces).toHaveLength(0);
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

    it('blocks non-super_admin from mutating billing fields on PUT /api/workspaces while allowing name updates', async () => {
      mockState.workspaces = [
        {
          id: 'ws-sec-1',
          name: 'Starter Org',
          client_name: 'Starter',
          plan: 'starter',
          subscription_status: 'trialing',
          max_accounts: 3,
          max_leads: 1000,
          credits: 1000,
        },
      ];

      const forbiddenReq = new NextRequest('http://localhost:3000/api/workspaces', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': 'admin',
        },
        body: JSON.stringify({
          id: 'ws-sec-1',
          plan: 'agency',
          subscriptionStatus: 'active',
          credits: 99999,
        }),
      });
      const forbiddenRes = await putWorkspace(forbiddenReq);
      const forbiddenData = await forbiddenRes.json();
      expect(forbiddenRes.status).toBe(403);
      expect(forbiddenData.code).toBe('FORBIDDEN_BILLING_MUTATION');

      const renameReq = new NextRequest('http://localhost:3000/api/workspaces', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': 'admin',
        },
        body: JSON.stringify({
          id: 'ws-sec-1',
          name: 'Renamed Org',
        }),
      });
      const renameRes = await putWorkspace(renameReq);
      const renameData = await renameRes.json();
      expect(renameRes.status).toBe(200);
      expect(renameData.name).toBe('Renamed Org');
      expect(renameData.plan).toBe('starter');
      expect(renameData.credits).toBe(1000);
    });
  });

  describe('/api/billing/checkout plan upgrade calculation', () => {
    it('calculates monthly and annual (-15%) upgrade pricing and updates workspace entitlements', async () => {
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
      // $149 * 0.85 = $126.65/mo => $1,519.80/year; default test rate = 1200 ARS/USD => 1,823,760 ARS
      expect(data.pricing).toEqual({
        planId: 'agency',
        billingCycle: 'annual',
        monthlyEquivalent: 126.65,
        totalUsd: 1519.8,
        totalArs: Math.round(1519.8 * 1200),
        usdToArsRate: 1200,
        rateSource: 'fallback',
        discountPercent: 15,
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
      expect(mpRecData.pricing.totalArs).toBe(Math.round(1519.8 * 1275.5));

      const recCallBody = JSON.parse(String(fetchSpy.mock.calls[1][1]?.body));
      expect(fetchSpy.mock.calls[1][0]).toBe('https://api.mercadopago.com/preapproval');
      expect(recCallBody.auto_recurring.frequency).toBe(12);
      expect(recCallBody.auto_recurring.transaction_amount).toBe(Math.round(1519.8 * 1275.5));
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

    it('blocks sandbox auto-activation in VERCEL_ENV=production for non-super_admin and allows super_admin', async () => {
      mockState.workspaces = [
        {
          id: 'ws-prod-sec',
          name: 'Prod WS',
          client_name: 'Client',
          plan: 'starter',
          subscription_status: 'trialing',
          max_accounts: 3,
          max_leads: 1000,
          credits: 1000,
        },
      ];

      const prevVercelEnv = process.env.VERCEL_ENV;
      const prevAllowSandbox = process.env.ALLOW_BILLING_SANDBOX;
      process.env.VERCEL_ENV = 'production';
      delete process.env.ALLOW_BILLING_SANDBOX;

      try {
        const adminReq = new NextRequest('http://localhost:3000/api/billing/checkout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-role': 'admin',
          },
          body: JSON.stringify({
            workspaceId: 'ws-prod-sec',
            planId: 'agency',
            billingCycle: 'monthly',
            provider: 'stripe',
          }),
        });
        const adminRes = await postBillingCheckout(adminReq);
        const adminData = await adminRes.json();
        expect(adminRes.status).toBe(503);
        expect(adminData.code).toBe('BILLING_PROVIDER_UNCONFIGURED');

        const superReq = new NextRequest('http://localhost:3000/api/billing/checkout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-role': 'super_admin',
          },
          body: JSON.stringify({
            workspaceId: 'ws-prod-sec',
            planId: 'agency',
            billingCycle: 'monthly',
            provider: 'stripe',
          }),
        });
        const superRes = await postBillingCheckout(superReq);
        const superData = await superRes.json();
        expect(superRes.status).toBe(200);
        expect(superData.mode).toBe('sandbox');
        expect(superData.workspace.plan).toBe('agency');
      } finally {
        if (prevVercelEnv === undefined) delete process.env.VERCEL_ENV;
        else process.env.VERCEL_ENV = prevVercelEnv;

        if (prevAllowSandbox === undefined) delete process.env.ALLOW_BILLING_SANDBOX;
        else process.env.ALLOW_BILLING_SANDBOX = prevAllowSandbox;
      }
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

  describe('RBAC permissions (ROLE_PERMISSIONS, canAccessTab) & /api/team management', () => {
    it('enforces exact tab and capability access across super_admin, admin, campaign_manager, and viewer', () => {
      // 1. Super Admin (restricted solely to Backoffice SaaS agency & user management)
      expect(ROLE_PERMISSIONS.super_admin.canAccessBackoffice).toBe(true);
      expect(ROLE_PERMISSIONS.super_admin.canManageTeam).toBe(true);
      expect(ROLE_PERMISSIONS.super_admin.canManageBilling).toBe(true);
      expect(ROLE_PERMISSIONS.super_admin.canManageWorkspaces).toBe(true);
      expect(ROLE_PERMISSIONS.super_admin.isReadOnly).toBe(false);
      expect(canAccessTab('super_admin', 'backoffice')).toBe(true);
      expect(canAccessTab('super_admin', 'campaigns')).toBe(false);
      expect(canAccessTab('super_admin', 'team')).toBe(false);
      expect(canAccessTab('super_admin', 'billing')).toBe(false);

      // 2. Agency Admin
      expect(ROLE_PERMISSIONS.admin.canAccessBackoffice).toBe(false);
      expect(ROLE_PERMISSIONS.admin.canManageTeam).toBe(true);
      expect(ROLE_PERMISSIONS.admin.canManageBilling).toBe(true);
      expect(ROLE_PERMISSIONS.admin.canManageWorkspaces).toBe(true);
      expect(ROLE_PERMISSIONS.admin.isReadOnly).toBe(false);
      expect(canAccessTab('admin', 'backoffice')).toBe(false);
      expect(canAccessTab('admin', 'team')).toBe(true);
      expect(canAccessTab('admin', 'billing')).toBe(true);
      expect(canAccessTab('admin', 'campaigns')).toBe(true);

      // 3. Campaign Manager (SDR)
      expect(ROLE_PERMISSIONS.campaign_manager.canAccessBackoffice).toBe(false);
      expect(ROLE_PERMISSIONS.campaign_manager.canManageTeam).toBe(false);
      expect(ROLE_PERMISSIONS.campaign_manager.canManageBilling).toBe(false);
      expect(ROLE_PERMISSIONS.campaign_manager.canManageWorkspaces).toBe(false);
      expect(ROLE_PERMISSIONS.campaign_manager.isReadOnly).toBe(false);
      expect(canAccessTab('campaign_manager', 'campaigns')).toBe(true);
      expect(canAccessTab('campaign_manager', 'finder')).toBe(true);
      expect(canAccessTab('campaign_manager', 'accounts')).toBe(true);
      expect(canAccessTab('campaign_manager', 'unibox')).toBe(true);
      expect(canAccessTab('campaign_manager', 'billing')).toBe(false);
      expect(canAccessTab('campaign_manager', 'team')).toBe(false);
      expect(canAccessTab('campaign_manager', 'backoffice')).toBe(false);

      // 4. Viewer (Client Read-Only)
      expect(ROLE_PERMISSIONS.viewer.isReadOnly).toBe(true);
      expect(ROLE_PERMISSIONS.viewer.canManageTeam).toBe(false);
      expect(ROLE_PERMISSIONS.viewer.canManageBilling).toBe(false);
      expect(canAccessTab('viewer', 'campaigns')).toBe(true);
      expect(canAccessTab('viewer', 'unibox')).toBe(true);
      expect(canAccessTab('viewer', 'crm')).toBe(true);
      expect(canAccessTab('viewer', 'analytics')).toBe(true);
      expect(canAccessTab('viewer', 'finder')).toBe(false);
      expect(canAccessTab('viewer', 'accounts')).toBe(false);
      expect(canAccessTab('viewer', 'billing')).toBe(false);
      expect(canAccessTab('viewer', 'team')).toBe(false);
      expect(canAccessTab('viewer', 'backoffice')).toBe(false);

      expect(normalizeRole('unknown-role')).toBe('admin');
    });

    it('supports GET by workspaceId/agencyId/email, POST creation with accessCode, PUT role update, and DELETE protection on /api/team', async () => {
      // Seed only founder super_admin on initial empty GET
      const getAllReq = new NextRequest('http://localhost:3000/api/team');
      const getAllRes = await getTeam(getAllReq);
      const initialMembers = await getAllRes.json();

      expect(getAllRes.status).toBe(200);
      expect(Array.isArray(initialMembers)).toBe(true);
      expect(initialMembers).toHaveLength(1);
      expect(initialMembers[0].id).toBe('admin-default');
      expect(initialMembers[0].email).toBe('marcos@vectrasystems.com.ar');
      expect(initialMembers[0].roleId).toBe('super_admin');
      expect(mockState.upsertedUserProfiles).toHaveLength(1);

      // Lookup by email (case-insensitive)
      const byEmailReq = new NextRequest('http://localhost:3000/api/team?email=MARCOS@vectrasystems.com.ar');
      const byEmailRes = await getTeam(byEmailReq);
      const byEmailData = await byEmailRes.json();
      expect(byEmailRes.status).toBe(200);
      expect(byEmailData).toHaveLength(1);
      expect(byEmailData[0].roleId).toBe('super_admin');

      // POST creates campaign_manager in isolated agency & workspace with accessCode
      const createSdrReq = new NextRequest('http://localhost:3000/api/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: 'ws-agency-99',
          agencyId: 'ag-99',
          accessCode: 'Code-9911',
          fullName: 'Valeria Soto',
          email: 'valeria@agencia99.com',
          company: 'Agencia 99',
          roleId: 'campaign_manager',
        }),
      });
      const createSdrRes = await postTeam(createSdrReq);
      const sdrData = await createSdrRes.json();
      expect(createSdrRes.status).toBe(201);
      expect(sdrData.id).toMatch(/^usr-/);
      expect(sdrData.workspaceId).toBe('ws-agency-99');
      expect(sdrData.agencyId).toBe('ag-99');
      expect(sdrData.accessCode).toBe('Code-9911');
      expect(sdrData.roleId).toBe('campaign_manager');

      // POST creates viewer client
      const createViewerReq = new NextRequest('http://localhost:3000/api/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: 'ws-agency-99',
          fullName: 'Cliente Demo',
          email: 'cliente@empresa.io',
          roleId: 'viewer',
        }),
      });
      const createViewerRes = await postTeam(createViewerReq);
      expect(createViewerRes.status).toBe(201);

      // GET filtered by workspaceId returns only ws-agency-99 members
      const wsFilterReq = new NextRequest('http://localhost:3000/api/team?workspaceId=ws-agency-99');
      const wsFilterRes = await getTeam(wsFilterReq);
      const wsFilterData = await wsFilterRes.json();
      expect(wsFilterData).toHaveLength(2);

      // PUT updates Valeria's role to admin
      const putReq = new NextRequest('http://localhost:3000/api/team', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: sdrData.id,
          roleId: 'admin',
        }),
      });
      const putRes = await putTeam(putReq);
      const putData = await putRes.json();
      expect(putRes.status).toBe(200);
      expect(putData.roleId).toBe('admin');

      // DELETE refuses to delete admin-default
      const protectReq = new NextRequest('http://localhost:3000/api/team?id=admin-default', {
        method: 'DELETE',
      });
      const protectRes = await deleteTeam(protectReq);
      expect(protectRes.status).toBe(400);

      // DELETE removes created member cleanly
      const delReq = new NextRequest(`http://localhost:3000/api/team?id=${sdrData.id}`, {
        method: 'DELETE',
      });
      const delRes = await deleteTeam(delReq);
      const delData = await delRes.json();
      expect(delRes.status).toBe(200);
      expect(delData.success).toBe(true);
    });
  });
});
