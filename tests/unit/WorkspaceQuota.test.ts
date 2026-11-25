import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  TRIAL_QUOTA_CAPS,
  getEffectiveWorkspaceLimits,
} from '@/types';

const { state, mockContainer } = vi.hoisted(() => {
  const store = {
    accounts: [] as Array<Record<string, unknown>>,
    leads: [] as Array<Record<string, unknown>>,
  };

  return {
    state: store,
    mockContainer: {
      accountRepo: {
        getAccounts: vi.fn(async (workspaceId?: string) =>
          workspaceId
            ? store.accounts.filter((a) => (a.workspaceId || 'ws-primary') === workspaceId)
            : store.accounts
        ),
        saveAccount: vi.fn(async (acc: Record<string, unknown>) => {
          const idx = store.accounts.findIndex((a) => a.id === acc.id);
          if (idx >= 0) store.accounts[idx] = acc;
          else store.accounts.push(acc);
        }),
      },
      leadRepo: {
        getLeads: vi.fn(async (_campaignId?: string, workspaceId?: string) =>
          workspaceId
            ? store.leads.filter((l) => (l.workspaceId || 'ws-primary') === workspaceId)
            : store.leads
        ),
        addLeads: vi.fn(async (items: Array<Record<string, unknown>>) => {
          for (const item of items) {
            const idx = store.leads.findIndex((l) => l.id === item.id);
            if (idx >= 0) store.leads[idx] = item;
            else store.leads.push(item);
          }
        }),
      },
      emailVerifier: {
        verifyEmail: vi.fn(async (email: string) => ({ email, isValid: true, score: 95 })),
        verifyBatch: vi.fn(async (emails: string[]) =>
          emails.map((email) => ({ email, isValid: true, score: 95 }))
        ),
      },
    },
  };
});

vi.mock('@/core/container', () => ({
  container: mockContainer,
}));

vi.mock('@/core/supabase/client', () => ({
  supabase: {
    supabaseUrl: 'https://placeholder.supabase.co',
  },
}));

import { POST as postAccount } from '@/app/api/accounts/route';
import { POST as postBulkImport } from '@/app/api/accounts/bulk-import/route';
import { POST as postLeads } from '@/app/api/leads/route';
import { POST as postV1Leads } from '@/app/api/v1/leads/route';
import { POST as postVerifyLeads } from '@/app/api/leads/verify/route';

function setFallbackWorkspaces(workspaces: Array<Record<string, unknown>>): void {
  (globalThis as unknown as { __misenderWorkspacesStore?: Array<Record<string, unknown>> }).__misenderWorkspacesStore =
    workspaces;
}

describe('WorkspaceQuotaService & Backend Quota Enforcement', () => {
  beforeEach(() => {
    state.accounts = [];
    state.leads = [];
    setFallbackWorkspaces([]);
    vi.clearAllMocks();
  });

  it('caps trialing workspaces at TRIAL_QUOTA_CAPS and unlocks plan limits when active', () => {
    const trialLimits = getEffectiveWorkspaceLimits({
      plan: 'growth',
      subscriptionStatus: 'trialing',
      maxAccounts: 10,
      maxLeads: 10000,
      credits: 2500,
    });
    expect(trialLimits.isTrial).toBe(true);
    expect(trialLimits.maxAccounts).toBe(TRIAL_QUOTA_CAPS.maxAccounts);
    expect(trialLimits.maxLeads).toBe(TRIAL_QUOTA_CAPS.maxLeads);

    const activeLimits = getEffectiveWorkspaceLimits({
      plan: 'growth',
      subscriptionStatus: 'active',
      maxAccounts: 10,
      maxLeads: 10000,
      credits: 2500,
    });
    expect(activeLimits.isTrial).toBe(false);
    expect(activeLimits.maxAccounts).toBe(10);
    expect(activeLimits.maxLeads).toBe(10000);
  });

  it('enforces trial mailbox cap on POST /api/accounts and /api/accounts/bulk-import, while allowing existing updates', async () => {
    setFallbackWorkspaces([
      {
        id: 'ws-trial',
        name: 'Trial WS',
        clientName: 'Test',
        plan: 'growth',
        subscriptionStatus: 'trialing',
        trialEndsAt: new Date(Date.now() + 86400000).toISOString(),
        maxAccounts: 10,
        maxLeads: 10000,
        credits: 2500,
      },
    ]);

    // 1st and 2nd mailbox succeed
    for (const email of ['m1@empresa.com', 'm2@empresa.com']) {
      const res = await postAccount(
        new NextRequest('http://localhost:3000/api/accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspaceId: 'ws-trial', email, smtpHost: 'smtp.gmail.com' }),
        })
      );
      expect(res.status).toBe(201);
    }

    // 3rd new mailbox is blocked by trial cap (2)
    const blockedRes = await postAccount(
      new NextRequest('http://localhost:3000/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: 'ws-trial',
          email: 'm3@empresa.com',
          smtpHost: 'smtp.gmail.com',
        }),
      })
    );
    const blockedData = await blockedRes.json();
    expect(blockedRes.status).toBe(403);
    expect(blockedData.code).toBe('QUOTA_EXCEEDED');
    expect(blockedData.resource).toBe('accounts');

    // Updating an existing mailbox in the workspace still succeeds
    const updateRes = await postAccount(
      new NextRequest('http://localhost:3000/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: 'ws-trial',
          email: 'm1@empresa.com',
          name: 'Updated Mailbox 1',
          smtpHost: 'smtp.gmail.com',
        }),
      })
    );
    expect(updateRes.status).toBe(201);

    // Bulk import adding 1 new mailbox above cap fails atomically with 403
    const bulkRes = await postBulkImport(
      new NextRequest('http://localhost:3000/api/accounts/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: 'ws-trial',
          runDnsAudit: false,
          accounts: [{ email: 'm4@empresa.com', smtpPass: 'secret' }],
        }),
      })
    );
    expect(bulkRes.status).toBe(403);
  });

  it('enforces lead quota on /api/leads and /api/v1/leads and blocks expired trials', async () => {
    setFallbackWorkspaces([
      {
        id: 'ws-leads-trial',
        name: 'Trial Leads WS',
        clientName: 'Test',
        plan: 'starter',
        subscriptionStatus: 'trialing',
        trialEndsAt: new Date(Date.now() + 86400000).toISOString(),
        maxAccounts: 3,
        maxLeads: 1000,
        credits: 1000,
      },
    ]);

    // Pre-populate 149 leads
    for (let i = 0; i < 149; i++) {
      state.leads.push({
        id: `l-${i}`,
        workspaceId: 'ws-leads-trial',
        campaignId: 'camp-1',
        email: `lead${i}@acme.com`,
      });
    }

    // Adding 2 leads exceeds 150 trial cap
    const overRes = await postLeads(
      new NextRequest('http://localhost:3000/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([
          { workspaceId: 'ws-leads-trial', campaignId: 'camp-1', email: 'new1@acme.com' },
          { workspaceId: 'ws-leads-trial', campaignId: 'camp-1', email: 'new2@acme.com' },
        ]),
      })
    );
    const overData = await overRes.json();
    expect(overRes.status).toBe(403);
    expect(overData.code).toBe('QUOTA_EXCEEDED');
    expect(overData.limit).toBe(150);

    // Adding 1 lead fits within 150
    const okRes = await postV1Leads(
      new NextRequest('http://localhost:3000/api/v1/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: 'ws-leads-trial',
          campaignId: 'camp-1',
          email: 'new1@acme.com',
        }),
      })
    );
    expect(okRes.status).toBe(201);

    // Expired trial blocks writes with 402 TRIAL_EXPIRED
    setFallbackWorkspaces([
      {
        id: 'ws-expired',
        name: 'Expired WS',
        clientName: 'Test',
        plan: 'starter',
        subscriptionStatus: 'trialing',
        trialEndsAt: new Date(Date.now() - 3600000).toISOString(),
        maxAccounts: 3,
        maxLeads: 1000,
        credits: 1000,
      },
    ]);

    const expiredRes = await postLeads(
      new NextRequest('http://localhost:3000/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: 'ws-expired',
          campaignId: 'camp-1',
          email: 'someone@acme.com',
        }),
      })
    );
    const expiredData = await expiredRes.json();
    expect(expiredRes.status).toBe(402);
    expect(expiredData.code).toBe('TRIAL_EXPIRED');
  });

  it('caps /api/leads/verify batch size at 100 and deducts workspace verification credits', async () => {
    const tooMany = Array.from({ length: 101 }, (_, idx) => `u${idx}@acme.com`);
    const batchErrRes = await postVerifyLeads(
      new NextRequest('http://localhost:3000/api/leads/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails: tooMany }),
      })
    );
    expect(batchErrRes.status).toBe(400);

    setFallbackWorkspaces([
      {
        id: 'ws-credits',
        name: 'Credits WS',
        clientName: 'Test',
        plan: 'starter',
        subscriptionStatus: 'active',
        maxAccounts: 3,
        maxLeads: 1000,
        credits: 2,
      },
    ]);

    const okVerifyRes = await postVerifyLeads(
      new NextRequest('http://localhost:3000/api/leads/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: 'ws-credits',
          emails: ['a@acme.com', 'b@acme.com'],
        }),
      })
    );
    expect(okVerifyRes.status).toBe(200);

    const noCreditsRes = await postVerifyLeads(
      new NextRequest('http://localhost:3000/api/leads/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: 'ws-credits',
          email: 'c@acme.com',
        }),
      })
    );
    const noCreditsData = await noCreditsRes.json();
    expect(noCreditsRes.status).toBe(403);
    expect(noCreditsData.code).toBe('QUOTA_EXCEEDED');
    expect(noCreditsData.resource).toBe('credits');
  });
});
