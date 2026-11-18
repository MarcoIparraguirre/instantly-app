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
import { POST as postBillingCheckout } from '@/app/api/billing/checkout/route';
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

    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.MERCADOPAGO_ACCESS_TOKEN;
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.MICROSOFT_CLIENT_ID;
    delete process.env.CRON_SECRET;
    delete process.env.MISENDER_API_KEY;
    delete process.env.APP_API_KEY;
  });

  afterEach(() => {
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
      // $149 * 0.8 = $119.20/mo => $1,430.40/year
      expect(data.pricing).toEqual({
        planId: 'agency',
        billingCycle: 'annual',
        monthlyEquivalent: 119.2,
        totalUsd: 1430.4,
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
        discountPercent: 0,
        currency: 'USD',
      });
      expect(growthData.workspace.maxAccounts).toBe(10);
      expect(growthData.workspace.maxLeads).toBe(10000);
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
