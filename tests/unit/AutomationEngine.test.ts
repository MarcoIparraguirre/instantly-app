import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';
import type { IJsonStorageDriver } from '@/core/storage/JsonDriver';
import { CampaignRepository } from '@/core/storage/CampaignRepository';
import { LeadRepository } from '@/core/storage/LeadRepository';
import { AccountRepository } from '@/core/storage/AccountRepository';
import { DealRepository } from '@/core/storage/DealRepository';
import { BlocklistRepository } from '@/core/storage/BlocklistRepository';
import { ThreadRepository } from '@/core/storage/ThreadRepository';
import { UniboxClassifierService } from '@/core/services/UniboxClassifierService';
import { WebhookDispatcherService } from '@/core/services/WebhookDispatcherService';
import { AutomationEngineService } from '@/core/services/AutomationEngineService';
import { ImapInboxService } from '@/core/services/ImapInboxService';
import type { IWebhookRepository } from '@/core/interfaces/storage';
import type { Campaign, Lead, SenderAccount, WebhookItem } from '@/types';

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

const { mockContainer } = vi.hoisted(() => {
  return {
    mockContainer: {} as Record<string, unknown>
  };
});

vi.mock('@/core/container', () => ({
  container: mockContainer
}));

import {
  GET as getAutomations,
  POST as postAutomations,
  PUT as putAutomations,
  DELETE as deleteAutomations
} from '@/app/api/automations/route';
import { GET as getCronUniboxSync, POST as postCronUniboxSync } from '@/app/api/cron/unibox-sync/route';
import { GET as getCronDispatch } from '@/app/api/cron/dispatch/route';
import { GET as getV1Leads, POST as postV1Leads } from '@/app/api/v1/leads/route';
import { GET as getV1Campaigns, POST as postV1Campaigns } from '@/app/api/v1/campaigns/route';

function makeCampaign(id: string, workspaceId: string, status: Campaign['status'] = 'draft'): Campaign {
  return {
    id,
    workspaceId,
    name: `Campaign ${id}`,
    status,
    steps: [
      {
        id: 'step-1',
        stepNumber: 1,
        waitDays: 0,
        variants: [
          {
            id: 'var-1',
            name: 'A',
            subject: 'Hola {{firstName}}',
            body: 'Mensaje para {{companyName}}'
          }
        ]
      }
    ],
    schedule: {
      timing: { from: '09:00', to: '18:00' },
      days: [1, 2, 3, 4, 5],
      timezone: 'UTC',
      dailyLimit: 50,
      strategy: 'office-hours'
    },
    senderAccountIds: [],
    openTracking: true,
    clickTracking: false,
    stats: { sent: 0, opened: 0, replied: 0, bounced: 0, opportunities: 0 },
    createdAt: '2026-11-23T00:00:00.000Z',
    updatedAt: '2026-11-23T00:00:00.000Z'
  };
}

function makeLead(id: string, campaignId: string, email: string, workspaceId: string): Lead {
  return {
    id,
    workspaceId,
    campaignId,
    email,
    firstName: 'Lucia',
    lastName: 'Gomez',
    companyName: 'Norte Tech',
    status: 'sent',
    currentStep: 1,
    customVariables: { ESTADO: 'Enviado' }
  };
}

function makeAccount(id: string, email: string, workspaceId: string): SenderAccount {
  return {
    id,
    workspaceId,
    name: `Account ${id}`,
    email,
    smtpHost: 'smtp.gmail.com',
    smtpPort: 587,
    smtpUser: email,
    smtpPass: 'app-secret',
    dailyLimit: 50,
    sentToday: 0,
    status: 'active'
  };
}

describe('Automations Engine, Crons & Public API v1', () => {
  let driver: InMemoryJsonDriver;
  let campaignRepo: CampaignRepository;
  let leadRepo: LeadRepository;
  let accountRepo: AccountRepository;
  let dealRepo: DealRepository;
  let blocklistRepo: BlocklistRepository;
  let threadRepo: ThreadRepository;
  let uniboxClassifier: UniboxClassifierService;
  let webhookList: WebhookItem[];
  let webhookDispatcher: WebhookDispatcherService;

  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.CRON_SECRET;
    delete process.env.MISENDER_API_KEY;
    delete process.env.APP_API_KEY;

    const g = globalThis as unknown as {
      __misenderAutomationStore?: unknown;
      __misenderCronDispatchLock?: { isRunning: boolean; startedAt: number };
    };
    g.__misenderAutomationStore = undefined;
    g.__misenderCronDispatchLock = { isRunning: false, startedAt: 0 };

    driver = new InMemoryJsonDriver();
    campaignRepo = new CampaignRepository(driver);
    leadRepo = new LeadRepository(driver);
    accountRepo = new AccountRepository(driver);
    dealRepo = new DealRepository(driver);
    blocklistRepo = new BlocklistRepository(driver);
    threadRepo = new ThreadRepository(driver);
    uniboxClassifier = new UniboxClassifierService(dealRepo);

    // Seed empty arrays so default mockData doesn't interfere
    driver.write('campaigns', []);
    driver.write('campaigns.json', []);
    driver.write('leads.json', []);
    driver.write('accounts.json', []);
    driver.write('deals', []);
    driver.write('blocklist', []);
    driver.write('threads', []);

    webhookList = [];
    const webhookRepo: IWebhookRepository = {
      getWebhooks: vi.fn(async () => webhookList),
      saveWebhook: vi.fn(async w => {
        webhookList.push(w);
      }),
      deleteWebhook: vi.fn(async id => {
        webhookList = webhookList.filter(w => w.id !== id);
      })
    };
    webhookDispatcher = new WebhookDispatcherService(webhookRepo);

    mockContainer.campaignRepo = campaignRepo;
    mockContainer.leadRepo = leadRepo;
    mockContainer.accountRepo = accountRepo;
    mockContainer.dealRepo = dealRepo;
    mockContainer.blocklistRepo = blocklistRepo;
    mockContainer.threadRepo = threadRepo;
    mockContainer.uniboxClassifier = uniboxClassifier;
    mockContainer.webhookDispatcher = webhookDispatcher;
    mockContainer.dispatcher = {
      dispatchStep: vi.fn().mockResolvedValue({
        campaignId: 'camp-1',
        totalPending: 1,
        processed: 1,
        sentCount: 1,
        remainingPending: 0,
        logs: []
      })
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  describe('WebhookDispatcherService workspace scoping, HMAC signing & single retry', () => {
    it('filters webhooks by workspaceId, signs payload with HMAC-SHA256, and keeps backward-compatible headers', async () => {
      webhookList = [
        {
          id: 'wh-ws1',
          workspaceId: 'ws-alpha',
          url: 'https://hooks.example.com/alpha',
          eventTypes: ['lead.interested', 'deal.created'],
          isActive: true,
          secret: 'top-secret-alpha',
          createdAt: '2026-11-23T00:00:00.000Z'
        },
        {
          id: 'wh-ws2',
          workspaceId: 'ws-beta',
          url: 'https://hooks.example.com/beta',
          eventTypes: ['lead.interested'],
          isActive: true,
          secret: 'top-secret-beta',
          createdAt: '2026-11-23T00:00:00.000Z'
        },
        {
          id: 'wh-global',
          url: 'https://hooks.example.com/global',
          eventTypes: ['*'],
          isActive: true,
          createdAt: '2026-11-23T00:00:00.000Z'
        }
      ];

      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response('OK', { status: 200 }));

      await webhookDispatcher.trigger(
        'lead.interested',
        { leadEmail: 'ceo@prospect.io', value: 5000 },
        'ws-alpha'
      );

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      const urls = fetchSpy.mock.calls.map(c => c[0]);
      expect(urls).toContain('https://hooks.example.com/alpha');
      expect(urls).toContain('https://hooks.example.com/global');
      expect(urls).not.toContain('https://hooks.example.com/beta');

      const alphaCall = fetchSpy.mock.calls.find(
        c => c[0] === 'https://hooks.example.com/alpha'
      )!;
      const init = alphaCall[1] as RequestInit;
      const headers = init.headers as Record<string, string>;
      const bodyStr = String(init.body);
      const expectedSig =
        'sha256=' + crypto.createHmac('sha256', 'top-secret-alpha').update(bodyStr).digest('hex');

      expect(headers['X-MiSender-Signature']).toBe(expectedSig);
      expect(headers['X-MiSender-Secret']).toBe('top-secret-alpha');
      expect(headers['X-MiSender-Timestamp']).toBeTruthy();
      expect(headers['X-MiSender-Event']).toBe('lead.interested');

      const parsedBody = JSON.parse(bodyStr);
      expect(parsedBody.event).toBe('lead.interested');
      expect(parsedBody.workspaceId).toBe('ws-alpha');
      expect(parsedBody.data.leadEmail).toBe('ceo@prospect.io');
    });

    it('retries once on HTTP >= 500 or network error and does not retry on HTTP 400', async () => {
      webhookList = [
        {
          id: 'wh-retry',
          workspaceId: 'ws-alpha',
          url: 'https://hooks.example.com/flaky',
          eventTypes: ['account.paused'],
          isActive: true,
          createdAt: '2026-11-23T00:00:00.000Z'
        }
      ];

      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(new Response('Server Error', { status: 502 }))
        .mockResolvedValueOnce(new Response('Recovered', { status: 200 }));

      await webhookDispatcher.trigger('account.paused', { accountId: 'acc-1' }, 'ws-alpha');
      expect(fetchSpy).toHaveBeenCalledTimes(2);

      // Network error -> single retry
      fetchSpy.mockReset();
      fetchSpy
        .mockRejectedValueOnce(new Error('ETIMEDOUT'))
        .mockResolvedValueOnce(new Response('OK', { status: 200 }));

      await webhookDispatcher.trigger('account.paused', { accountId: 'acc-2' }, 'ws-alpha');
      expect(fetchSpy).toHaveBeenCalledTimes(2);

      // 4xx -> no retry
      fetchSpy.mockReset();
      fetchSpy.mockResolvedValueOnce(new Response('Bad Request', { status: 400 }));

      await webhookDispatcher.trigger('account.paused', { accountId: 'acc-3' }, 'ws-alpha');
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('AutomationEngineService & /api/automations', () => {
    it('returns connector templates for HubSpot, Pipedrive, Slack, WhatsApp, n8n, Make, and Zapier', async () => {
      const res = await getAutomations(
        new NextRequest('http://localhost:3000/api/automations?workspaceId=ws-1')
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      const providers = (data.templates as Array<{ provider: string }>).map(t => t.provider);
      expect(providers).toEqual(
        expect.arrayContaining([
          'hubspot',
          'pipedrive',
          'slack',
          'whatsapp',
          'n8n',
          'make',
          'zapier'
        ])
      );
      expect(data.rules).toEqual([]);
      expect(data.runs).toEqual([]);
    });

    it('matches active workspace rules + conditions and executes Slack, create_deal (deduped), blocklist, and pause_account', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response('ok', { status: 200 }));

      // Create rule in ws-1 for lead.interested with Slack + create_deal
      const createRes = await postAutomations(
        new NextRequest('http://localhost:3000/api/automations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspaceId: 'ws-1',
            name: 'Notify Slack & Create Deal on Interest',
            triggerEvent: 'lead.interested',
            conditions: { sentiment: 'interested' },
            actions: [
              {
                type: 'slack_notify',
                config: {
                  webhookUrl: 'https://hooks.slack.com/services/T000/B000/XXXX',
                  secret: 'slack-hmac-key'
                }
              },
              {
                type: 'create_deal',
                config: { dealValue: 4200, stage: 'demo' }
              }
            ]
          })
        })
      );
      expect(createRes.status).toBe(201);
      const createdRule = (await createRes.json()).rule;

      // Create rule in ws-2 (must NOT execute when ws-1 triggers)
      await AutomationEngineService.saveRule({
        workspaceId: 'ws-2',
        name: 'Other Workspace Rule',
        triggerEvent: 'lead.interested',
        actions: [{ type: 'create_deal', config: { dealValue: 9999 } }],
        isActive: true
      });

      // Create bounce rule in ws-1 for add_to_blocklist
      await AutomationEngineService.saveRule({
        workspaceId: 'ws-1',
        name: 'Auto-Block Bounced Lead',
        triggerEvent: 'lead.bounced',
        actions: [{ type: 'add_to_blocklist', config: { reason: 'bounced' } }],
        isActive: true
      });

      // Execute lead.interested in ws-1 (first time creates deal + calls Slack)
      const firstRuns = await AutomationEngineService.executeTrigger('ws-1', 'lead.interested', {
        leadId: 'lead-100',
        leadEmail: 'carlos@fintech.io',
        leadName: 'Carlos Mendez',
        companyName: 'Fintech IO',
        sentiment: 'interested'
      });

      expect(firstRuns).toHaveLength(1);
      expect(firstRuns[0].status).toBe('success');
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const slackCallHeaders = (fetchSpy.mock.calls[0][1] as RequestInit).headers as Record<
        string,
        string
      >;
      expect(slackCallHeaders['X-MiSender-Signature']).toMatch(/^sha256=[a-f0-9]{64}$/);

      const dealsAfterFirst = await dealRepo.getDeals('ws-1');
      expect(dealsAfterFirst).toHaveLength(1);
      expect(dealsAfterFirst[0].value).toBe(4200);
      expect(dealsAfterFirst[0].stage).toBe('demo');
      expect(await dealRepo.getDeals('ws-2')).toHaveLength(0);

      // Second trigger for same lead avoids duplicate deal
      const secondRuns = await AutomationEngineService.executeTrigger('ws-1', 'lead.interested', {
        leadId: 'lead-100',
        leadEmail: 'carlos@fintech.io',
        leadName: 'Carlos Mendez',
        companyName: 'Fintech IO',
        sentiment: 'interested'
      });
      expect(secondRuns[0].actionResults[1].status).toBe('skipped');
      expect(await dealRepo.getDeals('ws-1')).toHaveLength(1);

      // Non-matching condition does not execute
      const nonMatch = await AutomationEngineService.executeTrigger('ws-1', 'lead.interested', {
        leadId: 'lead-101',
        leadEmail: 'other@fintech.io',
        sentiment: 'not-interested'
      });
      expect(nonMatch).toHaveLength(0);

      // Bounce triggers add_to_blocklist
      const bounceRuns = await AutomationEngineService.executeTrigger('ws-1', 'lead.bounced', {
        leadId: 'lead-bounce',
        leadEmail: 'hardbounce@dead.io'
      });
      expect(bounceRuns).toHaveLength(1);
      expect(bounceRuns[0].actionResults[0].status).toBe('success');
      expect(await blocklistRepo.isBlocked('hardbounce@dead.io')).toBe(true);

      // Toggle rule off via PUT, then test via POST action==='test' (inactive rule won't run), then delete via DELETE
      const putRes = await putAutomations(
        new NextRequest('http://localhost:3000/api/automations', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: createdRule.id, isActive: false })
        })
      );
      expect(putRes.status).toBe(200);
      expect((await putRes.json()).rule.isActive).toBe(false);

      const testRes = await postAutomations(
        new NextRequest('http://localhost:3000/api/automations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'test',
            workspaceId: 'ws-1',
            triggerEvent: 'lead.interested'
          })
        })
      );
      expect(testRes.status).toBe(200);
      expect((await testRes.json()).runs).toHaveLength(0);

      const delRes = await deleteAutomations(
        new NextRequest(`http://localhost:3000/api/automations?id=${createdRule.id}`, {
          method: 'DELETE'
        })
      );
      expect(delRes.status).toBe(200);
    });

    it('blocks SSRF targets on webhook and slack actions without issuing fetch', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      await AutomationEngineService.saveRule({
        workspaceId: 'ws-ssrf',
        name: 'Malicious Localhost & Metadata Rule',
        triggerEvent: 'lead.replied',
        actions: [
          { type: 'webhook', config: { url: 'https://169.254.169.254/latest/meta-data/' } },
          { type: 'slack_notify', config: { webhookUrl: 'https://localhost:8080/internal' } },
          { type: 'webhook', config: { url: 'https://192.168.0.10/admin' } }
        ],
        isActive: true
      });

      const runs = await AutomationEngineService.executeTrigger('ws-ssrf', 'lead.replied', {
        leadEmail: 'probe@attacker.io'
      });

      expect(runs).toHaveLength(1);
      expect(runs[0].status).toBe('error');
      expect(runs[0].actionResults).toHaveLength(3);
      expect(runs[0].actionResults.every(r => r.status === 'error' && r.detail?.includes('SSRF Block'))).toBe(
        true
      );
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('executes pause_account, webhook HMAC, hubspot_sync, pipedrive_sync, and whatsapp_notify and logs automation_runs', async () => {
      const acc = makeAccount('acc-pause-1', 'bad@domain.io', 'ws-crm');
      await accountRepo.saveAccount(acc);

      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(JSON.stringify({ id: 'ext-1' }), { status: 201 }));

      await AutomationEngineService.saveRule({
        workspaceId: 'ws-crm',
        name: 'CRM + WhatsApp + Webhook Fanout',
        triggerEvent: 'lead.interested',
        actions: [
          {
            type: 'webhook',
            config: { url: 'https://n8n.example.org/webhook/test', secret: 'n8n-secret', platform: 'n8n' }
          },
          {
            type: 'hubspot_sync',
            config: { accessToken: 'hs-pat-token' }
          },
          {
            type: 'pipedrive_sync',
            config: { apiToken: 'pd-token', companyDomain: 'acme', createDeal: false }
          },
          {
            type: 'whatsapp_notify',
            config: { webhookUrl: 'https://evo.example.org/send', to: '+5491155550000' }
          }
        ],
        isActive: true
      });

      await AutomationEngineService.saveRule({
        workspaceId: 'ws-crm',
        name: 'Pause Unhealthy Mailbox',
        triggerEvent: 'account.paused',
        actions: [{ type: 'pause_account' }],
        isActive: true
      });

      const crmRuns = await AutomationEngineService.executeTrigger('ws-crm', 'lead.interested', {
        leadId: 'lead-crm-1',
        leadEmail: 'founder@startup.io',
        leadName: 'Sofia Perez',
        companyName: 'Startup IO'
      });
      expect(crmRuns).toHaveLength(1);
      expect(crmRuns[0].status).toBe('success');
      expect(crmRuns[0].actionResults.map(r => r.status)).toEqual([
        'success',
        'success',
        'success',
        'success'
      ]);
      expect(fetchSpy).toHaveBeenCalledTimes(4);

      const n8nHeaders = (fetchSpy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
      expect(n8nHeaders['X-MiSender-Signature']).toMatch(/^sha256=[a-f0-9]{64}$/);

      // Pause account rule
      const pauseRuns = await AutomationEngineService.executeTrigger('ws-crm', 'account.paused', {
        accountId: 'acc-pause-1'
      });
      expect(pauseRuns).toHaveLength(1);
      expect(pauseRuns[0].actionResults[0].status).toBe('success');
      expect((await accountRepo.getAccountById('acc-pause-1'))?.status).toBe('error');

      // Runs persisted and returned by GET /api/automations
      const getRes = await getAutomations(
        new NextRequest('http://localhost:3000/api/automations?workspaceId=ws-crm')
      );
      const getData = await getRes.json();
      expect(getData.runs).toHaveLength(2);

      // HubSpot without token skips gracefully without calling fetch
      fetchSpy.mockClear();
      await AutomationEngineService.saveRule({
        workspaceId: 'ws-skip',
        name: 'HubSpot Missing Token',
        triggerEvent: 'lead.replied',
        actions: [{ type: 'hubspot_sync', config: {} }],
        isActive: true
      });
      const skipRuns = await AutomationEngineService.executeTrigger('ws-skip', 'lead.replied', {
        leadEmail: 'lead@skip.io'
      });
      expect(skipRuns[0].status).toBe('skipped');
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('Continuous Crons (/api/cron/unibox-sync, /api/cron/dispatch) & vercel.json', () => {
    it('vercel.json uses Hobby-compatible daily crons and GitHub Actions schedules 15m dispatch/unibox/warmup', () => {
      const raw = fs.readFileSync(path.resolve(process.cwd(), 'vercel.json'), 'utf8');
      const parsed = JSON.parse(raw) as { crons: Array<{ path: string; schedule: string }> };

      expect(parsed.crons).toEqual(
        expect.arrayContaining([
          { path: '/api/cron/dispatch', schedule: '0 13 * * *' },
          { path: '/api/cron/warmup', schedule: '0 14 * * *' }
        ])
      );

      const workflowRaw = fs.readFileSync(
        path.resolve(process.cwd(), '.github/workflows/cron-jobs.yml'),
        'utf8'
      );
      expect(workflowRaw).toContain("cron: '*/15 * * * *'");
      expect(workflowRaw).toContain('/api/cron/dispatch');
      expect(workflowRaw).toContain('/api/cron/unibox-sync');
      expect(workflowRaw).toContain('/api/cron/warmup');
    });

    it('dispatch cron returns { skipped: true, reason: "already_running" } on overlapping invocations within 60s', async () => {
      process.env.CRON_SECRET = 'cron-lock-secret';

      const camp = makeCampaign('camp-lock-1', 'ws-primary', 'active');
      await campaignRepo.saveCampaign(camp);

      let resolveFirstDispatch!: () => void;
      const firstDispatchWait = new Promise<void>(resolve => {
        resolveFirstDispatch = resolve;
      });

      (mockContainer.dispatcher as { dispatchStep: ReturnType<typeof vi.fn> }).dispatchStep = vi.fn(
        async () => {
          await firstDispatchWait;
          return {
            campaignId: camp.id,
            totalPending: 1,
            processed: 1,
            sentCount: 1,
            remainingPending: 0,
            logs: []
          };
        }
      );

      const req1 = new NextRequest('http://localhost:3000/api/cron/dispatch', {
        headers: { Authorization: 'Bearer cron-lock-secret' }
      });
      const req2 = new NextRequest('http://localhost:3000/api/cron/dispatch', {
        headers: { Authorization: 'Bearer cron-lock-secret' }
      });

      const firstPromise = getCronDispatch(req1);
      // Allow req1 to reach dispatchStep and hold the lock
      await new Promise(resolve => setTimeout(resolve, 10));

      const secondRes = await getCronDispatch(req2);
      const secondData = await secondRes.json();
      expect(secondRes.status).toBe(200);
      expect(secondData.skipped).toBe(true);
      expect(secondData.reason).toBe('already_running');

      resolveFirstDispatch();
      const firstRes = await firstPromise;
      const firstData = await firstRes.json();
      expect(firstRes.status).toBe(200);
      expect(firstData.totalSent).toBe(1);
    });

    it('unibox-sync enforces CRON_SECRET, applies OOO guard, updates bounced/replied leads, auto-creates deals, and runs automations', async () => {
      process.env.CRON_SECRET = 'unibox-cron-secret';

      const unauthRes = await getCronUniboxSync(
        new NextRequest('http://localhost:3000/api/cron/unibox-sync')
      );
      expect(unauthRes.status).toBe(401);

      const camp = makeCampaign('camp-sync-1', 'ws-sync', 'active');
      await campaignRepo.saveCampaign(camp);

      const acc = makeAccount('acc-sync-1', 'sender@ws-sync.io', 'ws-sync');
      await accountRepo.saveAccount(acc);

      const interestedLead = makeLead('lead-int', camp.id, 'interested@buyer.io', 'ws-sync');
      const oooLead = makeLead('lead-ooo', camp.id, 'ooo@buyer.io', 'ws-sync');
      const bouncedLead = makeLead('lead-bnc', camp.id, 'dead@buyer.io', 'ws-sync');
      await leadRepo.addLeads([interestedLead, oooLead, bouncedLead]);

      // Automation rules for interested + bounced
      await AutomationEngineService.saveRule({
        workspaceId: 'ws-sync',
        name: 'Slack on Interested',
        triggerEvent: 'lead.interested',
        actions: [
          { type: 'slack_notify', config: { webhookUrl: 'https://hooks.slack.com/services/A/B/C' } }
        ],
        isActive: true
      });
      await AutomationEngineService.saveRule({
        workspaceId: 'ws-sync',
        name: 'Blocklist on Bounce',
        triggerEvent: 'lead.bounced',
        actions: [{ type: 'add_to_blocklist', config: { reason: 'bounced' } }],
        isActive: true
      });

      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response('ok', { status: 200 }));

      vi.spyOn(ImapInboxService.prototype, 'syncAccountInbox').mockResolvedValue({
        threads: [
          {
            id: 'th-int',
            workspaceId: 'ws-sync',
            campaignId: camp.id,
            leadId: interestedLead.id,
            leadName: 'Lucia Gomez',
            leadEmail: interestedLead.email,
            companyName: 'Norte Tech',
            sentiment: 'interested',
            unread: true,
            lastMessageSnippet: 'Me interesa, hablemos para una demo',
            lastActivityAt: '2026-11-23T10:00:00.000Z',
            senderAccountId: acc.id,
            messages: [
              {
                id: 'm-1',
                sender: interestedLead.email,
                recipient: acc.email,
                subject: 'Re: Hola',
                body: 'Hola, me interesa mucho! Podemos coordinar una demo?',
                timestamp: '2026-11-23T10:00:00.000Z',
                isIncoming: true
              }
            ]
          },
          {
            id: 'th-ooo',
            workspaceId: 'ws-sync',
            campaignId: camp.id,
            leadId: oooLead.id,
            leadName: 'Lucia Gomez',
            leadEmail: oooLead.email,
            companyName: 'Norte Tech',
            sentiment: 'out-of-office',
            unread: true,
            lastMessageSnippet: 'Out of office until Monday',
            lastActivityAt: '2026-11-23T10:05:00.000Z',
            senderAccountId: acc.id,
            messages: [
              {
                id: 'm-2',
                sender: oooLead.email,
                recipient: acc.email,
                subject: 'Automatic reply: Out of Office',
                body: 'I am currently on vacation / out of office until next week.',
                timestamp: '2026-11-23T10:05:00.000Z',
                isIncoming: true
              }
            ]
          }
        ],
        bouncedEmails: [
          { email: bouncedLead.email, reason: '550 5.1.1 User unknown', timestamp: '2026-11-23T10:10:00.000Z' }
        ],
        repliedEmails: [interestedLead.email, oooLead.email]
      });

      const authRes = await postCronUniboxSync(
        new NextRequest('http://localhost:3000/api/cron/unibox-sync', {
          method: 'POST',
          headers: { 'x-cron-secret': 'unibox-cron-secret' }
        })
      );
      expect(authRes.status).toBe(200);
      const data = await authRes.json();

      expect(data.success).toBe(true);
      expect(data.accountsSynced).toBe(1);
      expect(data.repliedUpdated).toBe(1);
      expect(data.bouncedUpdated).toBe(1);
      expect(data.oooPostponed).toBe(1);
      expect(data.dealsCreated).toBe(1);

      // Lead statuses updated accurately
      expect((await leadRepo.getLeadById(interestedLead.id))?.status).toBe('replied');
      expect((await leadRepo.getLeadById(bouncedLead.id))?.status).toBe('bounced');
      expect((await leadRepo.getLeadById(oooLead.id))?.status).toBe('sent'); // OOO not marked replied!

      // Deal auto-created for interested lead (not OOO)
      const allDeals = await dealRepo.getDeals();
      expect(allDeals).toHaveLength(1);
      expect(allDeals[0].contactEmail).toBe(interestedLead.email);

      // Automation rules executed (Slack called + bounced added to blocklist)
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(await blocklistRepo.isBlocked(bouncedLead.email)).toBe(true);
    });
  });

  describe('Public REST API v1 (/api/v1/leads & /api/v1/campaigns)', () => {
    it('GET/POST /api/v1/leads validates emails, deduplicates, and isolates by x-workspace-id or ?workspaceId=', async () => {
      // Invalid email returns 400
      const invalidRes = await postV1Leads(
        new NextRequest('http://localhost:3000/api/v1/leads', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-workspace-id': 'ws-v1-a'
          },
          body: JSON.stringify({ email: 'not-an-email', campaignId: 'camp-a' })
        })
      );
      expect(invalidRes.status).toBe(400);

      // Create batch with duplicate in same payload -> deduplicated
      const createRes = await postV1Leads(
        new NextRequest('http://localhost:3000/api/v1/leads', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-workspace-id': 'ws-v1-a'
          },
          body: JSON.stringify({
            campaignId: 'camp-a',
            leads: [
              { email: 'Alice@Company.com', firstName: 'Alice', companyName: 'Company' },
              { email: 'alice@company.com', firstName: 'Alice Dup' },
              { email: 'bob@company.com', firstName: 'Bob' }
            ]
          })
        })
      );
      expect(createRes.status).toBe(201);
      const createData = await createRes.json();
      expect(createData.workspaceId).toBe('ws-v1-a');
      expect(createData.addedCount).toBe(2);
      expect(createData.skippedDuplicates).toBe(1);

      // Posting alice again skips existing duplicate
      const dupRes = await postV1Leads(
        new NextRequest('http://localhost:3000/api/v1/leads?workspaceId=ws-v1-a', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'alice@company.com', campaignId: 'camp-a' })
        })
      );
      expect(dupRes.status).toBe(200);
      expect((await dupRes.json()).skippedDuplicates).toBe(1);

      // Add lead to ws-v1-b and verify workspace isolation on GET
      await postV1Leads(
        new NextRequest('http://localhost:3000/api/v1/leads?workspaceId=ws-v1-b', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'carol@other.io', campaignId: 'camp-b' })
        })
      );

      const getARes = await getV1Leads(
        new NextRequest('http://localhost:3000/api/v1/leads', {
          headers: { 'x-workspace-id': 'ws-v1-a' }
        })
      );
      const getAData = await getARes.json();
      expect(getAData.count).toBe(2);
      expect(getAData.leads.map((l: Lead) => l.email)).toEqual(
        expect.arrayContaining(['alice@company.com', 'bob@company.com'])
      );

      const getBRes = await getV1Leads(
        new NextRequest('http://localhost:3000/api/v1/leads?workspaceId=ws-v1-b')
      );
      const getBData = await getBRes.json();
      expect(getBData.count).toBe(1);
      expect(getBData.leads[0].email).toBe('carol@other.io');
    });

    it('GET/POST /api/v1/campaigns scopes by workspaceId and supports activate, pause, and dispatch', async () => {
      await campaignRepo.saveCampaign(makeCampaign('camp-ws1', 'ws-camp-1', 'draft'));
      await campaignRepo.saveCampaign(makeCampaign('camp-ws2', 'ws-camp-2', 'draft'));

      const listRes = await getV1Campaigns(
        new NextRequest('http://localhost:3000/api/v1/campaigns?workspaceId=ws-camp-1')
      );
      expect(listRes.status).toBe(200);
      const listData = await listRes.json();
      expect(listData.count).toBe(1);
      expect(listData.campaigns[0].id).toBe('camp-ws1');

      // Cross-workspace action forbidden
      const forbiddenRes = await postV1Campaigns(
        new NextRequest('http://localhost:3000/api/v1/campaigns?workspaceId=ws-camp-1', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'activate', campaignId: 'camp-ws2' })
        })
      );
      expect(forbiddenRes.status).toBe(403);

      // Activate
      const activateRes = await postV1Campaigns(
        new NextRequest('http://localhost:3000/api/v1/campaigns', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-workspace-id': 'ws-camp-1'
          },
          body: JSON.stringify({ action: 'activate', campaignId: 'camp-ws1' })
        })
      );
      expect(activateRes.status).toBe(200);
      expect((await activateRes.json()).campaign.status).toBe('active');

      // Dispatch
      const dispatchRes = await postV1Campaigns(
        new NextRequest('http://localhost:3000/api/v1/campaigns?workspaceId=ws-camp-1', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'dispatch', campaignId: 'camp-ws1', batchSize: 10 })
        })
      );
      expect(dispatchRes.status).toBe(200);
      const dispatchData = await dispatchRes.json();
      expect(dispatchData.result.sentCount).toBe(1);
      expect(
        (mockContainer.dispatcher as { dispatchStep: ReturnType<typeof vi.fn> }).dispatchStep
      ).toHaveBeenCalledWith('camp-ws1', {
        batchSize: 10,
        respectSchedule: false,
        simulationOnly: false
      });

      // Pause
      const pauseRes = await postV1Campaigns(
        new NextRequest('http://localhost:3000/api/v1/campaigns?workspaceId=ws-camp-1', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'pause', campaignId: 'camp-ws1' })
        })
      );
      expect(pauseRes.status).toBe(200);
      expect((await pauseRes.json()).campaign.status).toBe('paused');
    });
  });
});
