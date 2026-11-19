import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { IJsonStorageDriver } from '@/core/storage/JsonDriver';
import { CampaignRepository } from '@/core/storage/CampaignRepository';
import { LeadRepository } from '@/core/storage/LeadRepository';
import { AccountRepository } from '@/core/storage/AccountRepository';
import { DealRepository } from '@/core/storage/DealRepository';
import { ThreadRepository } from '@/core/storage/ThreadRepository';
import { SupabaseCampaignRepository } from '@/core/storage/supabase/SupabaseCampaignRepository';
import { SupabaseLeadRepository } from '@/core/storage/supabase/SupabaseLeadRepository';
import { SupabaseAccountRepository } from '@/core/storage/supabase/SupabaseAccountRepository';
import { SupabaseDealRepository } from '@/core/storage/supabase/SupabaseDealRepository';
import { SupabaseThreadRepository } from '@/core/storage/supabase/SupabaseThreadRepository';
import { initialUniboxThreads } from '@/core/storage/mockData';
import type { Campaign, Lead, SenderAccount, Deal, EmailThread } from '@/types';

class InMemoryJsonDriver implements IJsonStorageDriver {
  private store = new Map<string, unknown>();

  read<T>(filename: string, defaultValue: T): T {
    if (this.store.has(filename)) {
      return JSON.parse(JSON.stringify(this.store.get(filename))) as T;
    }
    this.write(filename, defaultValue);
    return JSON.parse(JSON.stringify(defaultValue)) as T;
  }

  write<T>(filename: string, data: T): void {
    this.store.set(filename, JSON.parse(JSON.stringify(data)));
  }
}

const { mockState, mockSupabase, mockContainer } = vi.hoisted(() => {
  const state = {
    userProfiles: [] as Array<Record<string, unknown>>,
    upsertCalls: [] as Array<Record<string, unknown>>,
    failAllowedWorkspaceColumnOnce: false,
  };

  const fromMock = vi.fn((tableName: string) => {
    if (tableName !== 'user_profiles') {
      return {};
    }

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
        state.upsertCalls.push({ ...row });
        if (state.failAllowedWorkspaceColumnOnce && 'allowed_workspace_ids' in row) {
          state.failAllowedWorkspaceColumnOnce = false;
          return {
            error: {
              message: "Could not find the 'allowed_workspace_ids' column of 'user_profiles' in the schema cache",
            },
          };
        }

        const idx = state.userProfiles.findIndex((m) => m.id === row.id);
        if (idx >= 0) {
          state.userProfiles[idx] = { ...state.userProfiles[idx], ...row };
        } else {
          state.userProfiles.push({ ...row });
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
  });

  const supabaseMock = {
    supabaseUrl: 'https://mock-project.supabase.co',
    from: fromMock,
  };

  const containerProxy: Record<string, unknown> = {};

  return {
    mockState: state,
    mockSupabase: supabaseMock,
    mockContainer: containerProxy,
  };
});

vi.mock('@/core/supabase/client', () => ({
  supabase: mockSupabase,
  getSupabaseClient: () => mockSupabase,
}));

vi.mock('@/core/container', () => ({
  container: mockContainer,
}));

import {
  GET as getTeam,
  POST as postTeam,
  PUT as putTeam,
  normalizeAllowedWorkspaceIds,
} from '@/app/api/team/route';
import { GET as getCampaigns, POST as postCampaign } from '@/app/api/campaigns/route';
import { GET as getLeads, POST as postLeads } from '@/app/api/leads/route';
import { POST as postLeadsSync } from '@/app/api/leads/sync/route';
import { GET as getAccounts, POST as postAccount } from '@/app/api/accounts/route';
import { POST as postAccountOAuth } from '@/app/api/accounts/oauth/route';
import { GET as getDeals, POST as postDeal, PUT as putDeal } from '@/app/api/deals/route';
import { GET as getUniboxSync, POST as postUniboxSync } from '@/app/api/unibox/sync/route';

function makeCampaign(id: string, workspaceId?: string): Campaign {
  return {
    id,
    workspaceId,
    name: `Campaign ${id}`,
    status: 'draft',
    steps: [],
    schedule: {
      timing: { from: '09:00', to: '17:00' },
      days: [1, 2, 3, 4, 5],
      timezone: 'UTC',
      dailyLimit: 50,
      strategy: 'office-hours',
    },
    senderAccountIds: [],
    openTracking: true,
    clickTracking: false,
    stats: { sent: 0, opened: 0, replied: 0, bounced: 0, opportunities: 0 },
    createdAt: '2026-11-19T00:00:00.000Z',
    updatedAt: '2026-11-19T00:00:00.000Z',
  };
}

function makeLead(id: string, campaignId: string, email: string, workspaceId?: string): Lead {
  return {
    id,
    workspaceId,
    campaignId,
    email,
    firstName: 'Test',
    lastName: 'User',
    companyName: 'TestCo',
    status: 'pending',
    currentStep: 1,
  };
}

function makeAccount(id: string, email: string, workspaceId?: string): SenderAccount {
  return {
    id,
    workspaceId,
    name: `Account ${id}`,
    email,
    smtpHost: 'smtp.gmail.com',
    smtpPort: 587,
    smtpUser: email,
    smtpPass: 'secret-pass',
    dailyLimit: 50,
    sentToday: 0,
    status: 'active',
  };
}

function makeDeal(id: string, email: string, workspaceId?: string): Deal {
  return {
    id,
    workspaceId,
    leadId: `lead-${id}`,
    contactName: 'Contact',
    contactEmail: email,
    companyName: 'Acme',
    title: `Deal ${id}`,
    stage: 'positive',
    value: 3000,
    daysInactive: 0,
    createdAt: '2026-11-19T00:00:00.000Z',
  };
}

function makeThread(id: string, leadEmail: string, workspaceId?: string): EmailThread {
  return {
    id,
    workspaceId,
    campaignId: 'camp-1',
    leadId: `lead-${id}`,
    leadName: 'Lead Name',
    leadEmail,
    companyName: 'Acme',
    sentiment: 'interested',
    unread: true,
    lastMessageSnippet: 'Interested',
    lastActivityAt: '2026-11-19T00:00:00.000Z',
    senderAccountId: 'acc-1',
    messages: [],
  };
}

describe('Multi-tenant Workspace Isolation & Team Visibility', () => {
  let driver: InMemoryJsonDriver;
  let campaignRepo: CampaignRepository;
  let leadRepo: LeadRepository;
  let accountRepo: AccountRepository;
  let dealRepo: DealRepository;
  let threadRepo: ThreadRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    mockState.userProfiles = [];
    mockState.upsertCalls = [];
    mockState.failAllowedWorkspaceColumnOnce = false;
    (globalThis as unknown as { __misenderTeamStore?: unknown }).__misenderTeamStore = undefined;

    driver = new InMemoryJsonDriver();
    campaignRepo = new CampaignRepository(driver);
    leadRepo = new LeadRepository(driver);
    accountRepo = new AccountRepository(driver);
    dealRepo = new DealRepository(driver);
    threadRepo = new ThreadRepository(driver);

    mockContainer.campaignRepo = campaignRepo;
    mockContainer.leadRepo = leadRepo;
    mockContainer.accountRepo = accountRepo;
    mockContainer.dealRepo = dealRepo;
    mockContainer.threadRepo = threadRepo;
    mockContainer.dnsChecker = {
      auditDomain: vi.fn().mockRejectedValue(new Error('DNS offline in unit test')),
    };
    mockContainer.uniboxClassifier = {
      classify: vi.fn(),
      processIncomingReply: vi.fn().mockResolvedValue({}),
    };
    mockContainer.webhookDispatcher = {
      trigger: vi.fn().mockResolvedValue(undefined),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('In-memory JSON repositories isolate ws-primary vs ws-client-2', () => {
    it('CampaignRepository isolates campaigns by workspaceId and preserves workspaceId on update', () => {
      campaignRepo.saveCampaign(makeCampaign('camp-p1'));
      campaignRepo.saveCampaign(makeCampaign('camp-c2', 'ws-client-2'));

      const primaryCampaigns = campaignRepo.getCampaigns('ws-primary');
      const clientCampaigns = campaignRepo.getCampaigns('ws-client-2');

      expect(primaryCampaigns.some((c) => c.id === 'camp-p1')).toBe(true);
      expect(primaryCampaigns.some((c) => c.id === 'camp-c2')).toBe(false);
      expect(clientCampaigns.map((c) => c.id)).toEqual(['camp-c2']);

      // Updating camp-c2 without workspaceId preserves its existing ws-client-2
      const withoutWs = { ...makeCampaign('camp-c2'), name: 'Renamed Client Campaign' };
      delete withoutWs.workspaceId;
      campaignRepo.saveCampaign(withoutWs);

      expect(campaignRepo.getCampaigns('ws-client-2')[0].name).toBe('Renamed Client Campaign');
      expect(campaignRepo.getCampaigns('ws-client-2')[0].workspaceId).toBe('ws-client-2');
      expect(campaignRepo.getCampaigns('ws-primary').some((c) => c.id === 'camp-c2')).toBe(false);
    });

    it('LeadRepository filters by both campaignId and workspaceId and preserves workspaceId', () => {
      leadRepo.addLeads([
        makeLead('l-p1', 'shared-camp', 'p1@primary.com', 'ws-primary'),
        makeLead('l-c2', 'shared-camp', 'c2@client2.com', 'ws-client-2'),
        makeLead('l-c2-other', 'other-camp', 'c2b@client2.com', 'ws-client-2'),
      ]);

      expect(leadRepo.getLeads('shared-camp', 'ws-primary').map((l) => l.id)).toEqual(['l-p1']);
      expect(leadRepo.getLeads('shared-camp', 'ws-client-2').map((l) => l.id)).toEqual(['l-c2']);
      expect(leadRepo.getLeads(undefined, 'ws-client-2').map((l) => l.id)).toEqual([
        'l-c2',
        'l-c2-other',
      ]);

      const updatedLead = { ...makeLead('l-c2', 'shared-camp', 'c2@client2.com'), status: 'sent' as const };
      delete updatedLead.workspaceId;
      leadRepo.updateLead(updatedLead);

      const fetched = leadRepo.getLeads('shared-camp', 'ws-client-2');
      expect(fetched).toHaveLength(1);
      expect(fetched[0].status).toBe('sent');
      expect(fetched[0].workspaceId).toBe('ws-client-2');
    });

    it('AccountRepository isolates sender accounts between ws-primary and ws-client-2', () => {
      accountRepo.saveAccount(makeAccount('acc-p1', 'sales@primary.io'));
      accountRepo.saveAccount(makeAccount('acc-c2', 'sales@client2.io', 'ws-client-2'));

      expect(accountRepo.getAccounts('ws-primary').map((a) => a.id)).toEqual(['acc-p1']);
      expect(accountRepo.getAccounts('ws-client-2').map((a) => a.id)).toEqual(['acc-c2']);

      // Masked password update without workspaceId preserves ws-client-2 and real smtpPass
      const maskedEdit = { ...makeAccount('acc-c2', 'sales@client2.io'), smtpPass: '••••••••', dailyLimit: 90 };
      delete maskedEdit.workspaceId;
      accountRepo.saveAccount(maskedEdit);

      const clientAccounts = accountRepo.getAccounts('ws-client-2');
      expect(clientAccounts).toHaveLength(1);
      expect(clientAccounts[0].dailyLimit).toBe(90);
      expect(clientAccounts[0].smtpPass).toBe('secret-pass');
      expect(clientAccounts[0].workspaceId).toBe('ws-client-2');
    });

    it('DealRepository isolates deals between ws-primary and ws-client-2', async () => {
      await dealRepo.saveDeal(makeDeal('deal-p1', 'p@primary.io'));
      await dealRepo.saveDeal(makeDeal('deal-c2', 'c@client2.io', 'ws-client-2'));

      expect((await dealRepo.getDeals('ws-primary')).map((d) => d.id)).toEqual(['deal-p1']);
      expect((await dealRepo.getDeals('ws-client-2')).map((d) => d.id)).toEqual(['deal-c2']);

      const updated = { ...makeDeal('deal-c2', 'c@client2.io'), stage: 'won' as const };
      delete updated.workspaceId;
      await dealRepo.updateDeal(updated);

      const clientDeals = await dealRepo.getDeals('ws-client-2');
      expect(clientDeals).toHaveLength(1);
      expect(clientDeals[0].stage).toBe('won');
      expect(clientDeals[0].workspaceId).toBe('ws-client-2');
    });

    it('ThreadRepository isolates threads between ws-primary and ws-client-2 even for same leadEmail', async () => {
      await threadRepo.upsertThread(makeThread('th-p1', 'buyer@shared.com', 'ws-primary'));
      await threadRepo.upsertThread(makeThread('th-c2', 'buyer@shared.com', 'ws-client-2'));

      const primaryThreads = await threadRepo.getThreads('ws-primary');
      const clientThreads = await threadRepo.getThreads('ws-client-2');

      expect(primaryThreads.map((t) => t.id)).toEqual(['th-p1']);
      expect(clientThreads.map((t) => t.id)).toEqual(['th-c2']);
    });
  });

  describe('Supabase repositories workspace_id filtering and mapping', () => {
    it('SupabaseCampaignRepository only chains .eq("workspace_id", ...) when workspaceId is supplied and maps workspace_id', async () => {
      const rowPrimary = {
        id: 'camp-1',
        workspace_id: 'ws-primary',
        name: 'Primary',
        status: 'draft',
        steps: [],
        schedule: {},
        sender_account_ids: [],
        stats: { sent: 0, opened: 0, replied: 0, bounced: 0, opportunities: 0 },
      };
      const rowClient = { ...rowPrimary, id: 'camp-2', workspace_id: 'ws-client-2', name: 'Client 2' };

      // 1. Without workspaceId: .order() resolves directly with NO .eq() method
      const noWorkspaceOrder = vi.fn().mockResolvedValue({ data: [rowPrimary], error: null });
      const upsertSpy = vi.fn().mockResolvedValue({ error: null });
      const clientNoWs = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({ order: noWorkspaceOrder }),
          upsert: upsertSpy,
        }),
      } as unknown as SupabaseClient;

      const repoNoWs = new SupabaseCampaignRepository(clientNoWs);
      const all = await repoNoWs.getCampaigns();
      expect(all).toHaveLength(1);
      expect(all[0].workspaceId).toBe('ws-primary');

      // 2. With workspaceId: chains .eq('workspace_id', 'ws-client-2')
      const eqSpy = vi.fn().mockResolvedValue({ data: [rowClient], error: null });
      const clientWithWs = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({ eq: eqSpy }),
          }),
          upsert: upsertSpy,
        }),
      } as unknown as SupabaseClient;

      const repoWithWs = new SupabaseCampaignRepository(clientWithWs);
      const filtered = await repoWithWs.getCampaigns('ws-client-2');
      expect(eqSpy).toHaveBeenCalledWith('workspace_id', 'ws-client-2');
      expect(filtered[0].workspaceId).toBe('ws-client-2');

      await repoWithWs.saveCampaign(makeCampaign('camp-2', 'ws-client-2'));
      expect(upsertSpy).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'camp-2', workspace_id: 'ws-client-2' }),
        { onConflict: 'id' }
      );
    });

    it('SupabaseLeadRepository chains .eq("workspace_id", ...) only when provided and maps workspace_id', async () => {
      const leadRow = {
        id: 'lead-1',
        workspace_id: 'ws-client-2',
        campaign_id: 'camp-1',
        email: 'a@b.com',
        first_name: 'A',
        last_name: 'B',
        company_name: 'Co',
        status: 'pending',
        current_step: 1,
      };

      const secondEqSpy = vi.fn().mockResolvedValue({ data: [leadRow], error: null });
      const firstEqSpy = vi.fn().mockReturnValue({ eq: secondEqSpy });
      const upsertSpy = vi.fn().mockResolvedValue({ error: null });

      const client = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({ eq: firstEqSpy }),
          }),
          upsert: upsertSpy,
        }),
      } as unknown as SupabaseClient;

      const repo = new SupabaseLeadRepository(client);
      const leads = await repo.getLeads('camp-1', 'ws-client-2');
      expect(firstEqSpy).toHaveBeenCalledWith('campaign_id', 'camp-1');
      expect(secondEqSpy).toHaveBeenCalledWith('workspace_id', 'ws-client-2');
      expect(leads[0].workspaceId).toBe('ws-client-2');

      await repo.addLeads([makeLead('lead-2', 'camp-1', 'x@y.com', 'ws-client-2')]);
      expect(upsertSpy).toHaveBeenCalledWith(
        [expect.objectContaining({ id: 'lead-2', workspace_id: 'ws-client-2' })],
        { onConflict: 'id' }
      );
    });

    it('SupabaseAccountRepository and SupabaseDealRepository filter & map workspace_id cleanly', async () => {
      const accEqSpy = vi.fn().mockResolvedValue({
        data: [{ id: 'acc-2', workspace_id: 'ws-client-2', name: 'C2', email: 'c2@co.io', smtp_host: 'smtp.gmail.com', smtp_port: 587, smtp_user: 'c2@co.io', smtp_pass: 'p', daily_limit: 50 }],
        error: null,
      });
      const accUpsertSpy = vi.fn().mockResolvedValue({ error: null });
      const accClient = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ eq: accEqSpy }) }),
          upsert: accUpsertSpy,
        }),
      } as unknown as SupabaseClient;

      const accRepo = new SupabaseAccountRepository(accClient);
      const accounts = await accRepo.getAccounts('ws-client-2');
      expect(accEqSpy).toHaveBeenCalledWith('workspace_id', 'ws-client-2');
      expect(accounts[0].workspaceId).toBe('ws-client-2');

      await accRepo.saveAccount(makeAccount('acc-2', 'c2@co.io', 'ws-client-2'));
      expect(accUpsertSpy).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'acc-2', workspace_id: 'ws-client-2' }),
        { onConflict: 'id' }
      );

      const dealEqSpy = vi.fn().mockResolvedValue({
        data: [{ id: 'deal-2', workspace_id: 'ws-client-2', lead_id: 'l-1', contact_name: 'Ana', contact_email: 'ana@c2.io', company_name: 'C2', title: 'Deal', stage: 'demo', value: 1500, days_inactive: 1 }],
        error: null,
      });
      const dealUpsertSpy = vi.fn().mockResolvedValue({ error: null });
      const dealClient = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ eq: dealEqSpy }) }),
          upsert: dealUpsertSpy,
        }),
      } as unknown as SupabaseClient;

      const dealRepo = new SupabaseDealRepository(dealClient);
      const deals = await dealRepo.getDeals('ws-client-2');
      expect(dealEqSpy).toHaveBeenCalledWith('workspace_id', 'ws-client-2');
      expect(deals[0].workspaceId).toBe('ws-client-2');

      await dealRepo.saveDeal(makeDeal('deal-2', 'ana@c2.io', 'ws-client-2'));
      expect(dealUpsertSpy).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'deal-2', workspace_id: 'ws-client-2' }),
        { onConflict: 'id' }
      );
    });

    it('SupabaseThreadRepository returns [] for empty non-primary workspace and initialUniboxThreads for ws-primary', async () => {
      const eqSpy = vi.fn().mockResolvedValue({ data: [], error: null });
      const upsertSpy = vi.fn().mockResolvedValue({ error: null });
      const client = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({ eq: eqSpy }),
          }),
          upsert: upsertSpy,
        }),
      } as unknown as SupabaseClient;

      const repo = new SupabaseThreadRepository(client);

      const clientThreads = await repo.getThreads('ws-client-2');
      expect(eqSpy).toHaveBeenCalledWith('workspace_id', 'ws-client-2');
      expect(clientThreads).toEqual([]);

      const primaryThreads = await repo.getThreads('ws-primary');
      expect(eqSpy).toHaveBeenCalledWith('workspace_id', 'ws-primary');
      expect(primaryThreads).toEqual(initialUniboxThreads);

      await repo.upsertThread(makeThread('th-2', 'lead@c2.io', 'ws-client-2'));
      expect(upsertSpy).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'th-2', workspace_id: 'ws-client-2' }),
        { onConflict: 'id' }
      );
    });
  });

  describe('/api/team allowedWorkspaceIds multi-workspace visibility', () => {
    it('normalizeAllowedWorkspaceIds deduplicates, trims, and always includes primaryWorkspaceId', () => {
      expect(normalizeAllowedWorkspaceIds(undefined, 'ws-primary')).toEqual(['ws-primary']);
      expect(
        normalizeAllowedWorkspaceIds([' ws-client-2 ', '', null, 'ws-primary', 'ws-client-2'], 'ws-primary')
      ).toEqual(['ws-primary', 'ws-client-2']);
      expect(normalizeAllowedWorkspaceIds(['ws-client-3'], 'ws-client-2')).toEqual([
        'ws-client-2',
        'ws-client-3',
      ]);
    });

    it('POST & PUT store/update allowedWorkspaceIds and GET returns multi-workspace member under all assigned workspaces', async () => {
      const postReq = new NextRequest('http://localhost:3000/api/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: 'ws-primary',
          allowedWorkspaceIds: ['ws-client-2', 'ws-client-3', 'ws-client-2'],
          fullName: 'Camila Operadora',
          email: 'camila@agency.io',
          roleId: 'campaign_manager',
        }),
      });

      const postRes = await postTeam(postReq);
      const created = await postRes.json();
      expect(postRes.status).toBe(201);
      expect(created.workspaceId).toBe('ws-primary');
      expect(created.allowedWorkspaceIds).toEqual(['ws-primary', 'ws-client-2', 'ws-client-3']);

      // Member appears in ws-primary, ws-client-2, and ws-client-3, but NOT ws-unassigned
      for (const ws of ['ws-primary', 'ws-client-2', 'ws-client-3']) {
        const res = await getTeam(new NextRequest(`http://localhost:3000/api/team?workspaceId=${ws}`));
        const list = (await res.json()) as Array<{ email: string }>;
        expect(list.some((m) => m.email === 'camila@agency.io')).toBe(true);
      }

      const unassignedRes = await getTeam(
        new NextRequest('http://localhost:3000/api/team?workspaceId=ws-unassigned')
      );
      const unassignedList = (await unassignedRes.json()) as Array<{ email: string }>;
      expect(unassignedList.some((m) => m.email === 'camila@agency.io')).toBe(false);

      // PUT updates allowedWorkspaceIds removing ws-client-3 and adding ws-client-4
      const putReq = new NextRequest('http://localhost:3000/api/team', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: created.id,
          allowedWorkspaceIds: ['ws-client-4'],
        }),
      });
      const putRes = await putTeam(putReq);
      const updated = await putRes.json();
      expect(putRes.status).toBe(200);
      expect(updated.allowedWorkspaceIds).toEqual(['ws-primary', 'ws-client-4']);

      const client3After = await getTeam(
        new NextRequest('http://localhost:3000/api/team?workspaceId=ws-client-3')
      );
      expect(((await client3After.json()) as Array<{ email: string }>).some((m) => m.email === 'camila@agency.io')).toBe(false);

      const client4After = await getTeam(
        new NextRequest('http://localhost:3000/api/team?workspaceId=ws-client-4')
      );
      expect(((await client4After.json()) as Array<{ email: string }>).some((m) => m.email === 'camila@agency.io')).toBe(true);
    });

    it('POST & PUT gracefully retry upsert omitting allowed_workspace_ids when Supabase column is missing', async () => {
      mockState.failAllowedWorkspaceColumnOnce = true;

      const postReq = new NextRequest('http://localhost:3000/api/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: 'ws-primary',
          allowedWorkspaceIds: ['ws-client-2'],
          fullName: 'Graceful Fallback',
          email: 'fallback@agency.io',
          roleId: 'viewer',
        }),
      });

      const postRes = await postTeam(postReq);
      const created = await postRes.json();
      expect(postRes.status).toBe(201);
      expect(created.allowedWorkspaceIds).toEqual(['ws-primary', 'ws-client-2']);
      // 2 upsert calls: first with allowed_workspace_ids, second retry without it
      expect(mockState.upsertCalls).toHaveLength(2);
      expect(mockState.upsertCalls[0]).toHaveProperty('allowed_workspace_ids', ['ws-primary', 'ws-client-2']);
      expect(mockState.upsertCalls[1]).not.toHaveProperty('allowed_workspace_ids');

      mockState.upsertCalls = [];
      mockState.failAllowedWorkspaceColumnOnce = true;

      const putReq = new NextRequest('http://localhost:3000/api/team', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: created.id,
          allowedWorkspaceIds: ['ws-client-5'],
        }),
      });
      const putRes = await putTeam(putReq);
      const updated = await putRes.json();
      expect(putRes.status).toBe(200);
      expect(updated.allowedWorkspaceIds).toEqual(['ws-primary', 'ws-client-5']);
      expect(mockState.upsertCalls).toHaveLength(2);
      expect(mockState.upsertCalls[0]).toHaveProperty('allowed_workspace_ids', ['ws-primary', 'ws-client-5']);
      expect(mockState.upsertCalls[1]).not.toHaveProperty('allowed_workspace_ids');
    });
  });

  describe('Workspace-scoped API routes isolation', () => {
    it('isolates campaigns, leads, accounts, oauth, deals, and unibox threads across workspaces', async () => {
      // Campaigns
      const campRes = await postCampaign(
        new NextRequest('http://localhost:3000/api/campaigns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Client 2 Camp', workspaceId: 'ws-client-2' }),
        })
      );
      const createdCamp = await campRes.json();
      expect(campRes.status).toBe(201);
      expect(createdCamp.workspaceId).toBe('ws-client-2');

      const clientCamps = await (
        await getCampaigns(new NextRequest('http://localhost:3000/api/campaigns?workspaceId=ws-client-2'))
      ).json();
      const primaryCamps = await (
        await getCampaigns(new NextRequest('http://localhost:3000/api/campaigns?workspaceId=ws-primary'))
      ).json();
      expect(clientCamps.map((c: Campaign) => c.id)).toEqual([createdCamp.id]);
      expect(primaryCamps.some((c: Campaign) => c.id === createdCamp.id)).toBe(false);

      // Leads POST + sync fallback to campaign's workspaceId
      await postLeads(
        new NextRequest('http://localhost:3000/api/leads?workspaceId=ws-client-2', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify([{ campaignId: createdCamp.id, email: 'one@client2.io', firstName: 'One' }]),
        })
      );
      await postLeadsSync(
        new NextRequest('http://localhost:3000/api/leads/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            campaignId: createdCamp.id,
            rows: [{ email: 'two@client2.io', firstName: 'Two' }],
          }),
        })
      );

      const clientLeads = await (
        await getLeads(
          new NextRequest(`http://localhost:3000/api/leads?campaignId=${createdCamp.id}&workspaceId=ws-client-2`)
        )
      ).json();
      const primaryLeads = await (
        await getLeads(new NextRequest('http://localhost:3000/api/leads?workspaceId=ws-primary'))
      ).json();
      expect(clientLeads).toHaveLength(2);
      expect(clientLeads.every((l: Lead) => l.workspaceId === 'ws-client-2')).toBe(true);
      expect(primaryLeads.some((l: Lead) => l.email === 'two@client2.io')).toBe(false);

      // Accounts & OAuth
      await postAccount(
        new NextRequest('http://localhost:3000/api/accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'smtp@client2.io', workspaceId: 'ws-client-2' }),
        })
      );
      const oauthRes = await postAccountOAuth(
        new NextRequest('http://localhost:3000/api/accounts/oauth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: 'google',
            email: 'oauth@client2.io',
            workspaceId: 'ws-client-2',
          }),
        })
      );
      expect(oauthRes.status).toBe(201);
      expect((await oauthRes.json()).account.workspaceId).toBe('ws-client-2');

      const clientAccounts = await (
        await getAccounts(new NextRequest('http://localhost:3000/api/accounts?workspaceId=ws-client-2'))
      ).json();
      expect(clientAccounts).toHaveLength(2);

      // Deals
      const dealRes = await postDeal(
        new NextRequest('http://localhost:3000/api/deals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contactName: 'C2 Buyer',
            contactEmail: 'buyer@client2.io',
            workspaceId: 'ws-client-2',
            value: 4500,
          }),
        })
      );
      const createdDeal = await dealRes.json();
      expect(createdDeal.workspaceId).toBe('ws-client-2');

      const putDealRes = await putDeal(
        new NextRequest('http://localhost:3000/api/deals', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...createdDeal, stage: 'demo' }),
        })
      );
      expect((await putDealRes.json()).deal.workspaceId).toBe('ws-client-2');

      const clientDeals = await (
        await getDeals(new NextRequest('http://localhost:3000/api/deals?workspaceId=ws-client-2'))
      ).json();
      expect(clientDeals).toHaveLength(1);
      expect(clientDeals[0].stage).toBe('demo');

      // Unibox GET & POST with empty body and workspaceId query
      await threadRepo.upsertThread(makeThread('th-c2-api', 'buyer@client2.io', 'ws-client-2'));
      const uniboxGetRes = await getUniboxSync(
        new NextRequest('http://localhost:3000/api/unibox/sync?workspaceId=ws-client-2')
      );
      const uniboxGetData = await uniboxGetRes.json();
      expect(uniboxGetData.threads.map((t: EmailThread) => t.id)).toEqual(['th-c2-api']);

      const uniboxPostRes = await postUniboxSync(
        new NextRequest('http://localhost:3000/api/unibox/sync?workspaceId=ws-client-2', {
          method: 'POST',
        })
      );
      expect(uniboxPostRes.status).toBe(200);
      const uniboxPostData = await uniboxPostRes.json();
      expect(uniboxPostData.threads.map((t: EmailThread) => t.id)).toEqual(['th-c2-api']);
    });
  });
});
