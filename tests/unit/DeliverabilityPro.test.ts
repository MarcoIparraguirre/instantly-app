import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  InternalWarmupService,
  WarmupSenderAccount,
  calculateWarmupRampTarget,
  isWarmupMessageMarker
} from '@/core/services/InternalWarmupService';
import { PlacementTestService, SeedMailbox } from '@/core/services/PlacementTestService';
import { DnsCheckerService } from '@/core/services/DnsCheckerService';
import { IAccountRepository, IWarmupRepository } from '@/core/interfaces/storage';
import { IMailer, MailOptions, MailResult } from '@/core/mailers/interfaces';
import { container } from '@/core/container';
import { GET, POST, DELETE } from '@/app/api/accounts/placement-test/route';
import { SenderAccount, WarmupLog } from '@/types';

function makeAccount(overrides: Partial<WarmupSenderAccount> = {}): WarmupSenderAccount {
  return {
    id: 'acc-1',
    workspaceId: 'ws-primary',
    name: 'Sender One',
    email: 'sender1@acme.io',
    provider: 'google',
    smtpHost: 'smtp.gmail.com',
    smtpPort: 587,
    smtpUser: 'sender1@acme.io',
    smtpPass: 'real-app-pass',
    dailyLimit: 50,
    sentToday: 0,
    status: 'active',
    warmupEnabled: true,
    warmupToday: 0,
    warmupTotal: 0,
    healthScore: 95,
    warmupRescueRate: 100,
    ...overrides
  };
}

function createStatefulRepos(initialAccounts: WarmupSenderAccount[]) {
  const store = initialAccounts.map((a) => ({ ...a }));
  const warmupLogs: WarmupLog[] = [];

  const accountRepo: IAccountRepository = {
    getAccounts: vi.fn(async (workspaceId?: string) =>
      workspaceId ? store.filter((a) => (a.workspaceId || 'ws-primary') === workspaceId) : [...store]
    ),
    getAccountById: vi.fn(async (id: string) => store.find((a) => a.id === id)),
    saveAccounts: vi.fn(async (accounts: SenderAccount[]) => {
      store.splice(0, store.length, ...accounts);
    }),
    saveAccount: vi.fn(async (account: SenderAccount) => {
      const idx = store.findIndex((a) => a.id === account.id);
      if (idx >= 0) store[idx] = { ...account };
      else store.push({ ...account });
    }),
    deleteAccount: vi.fn(async (id: string) => {
      const idx = store.findIndex((a) => a.id === id);
      if (idx >= 0) store.splice(idx, 1);
    })
  };

  const warmupRepo: IWarmupRepository = {
    logWarmup: vi.fn(async (log) => {
      const entry: WarmupLog = {
        id: `wl-${warmupLogs.length + 1}`,
        createdAt: new Date().toISOString(),
        ...log
      };
      warmupLogs.push(entry);
      return entry;
    }),
    getWarmupLogs: vi.fn(async (limit = 50) => warmupLogs.slice(0, limit))
  };

  return { store, warmupLogs, accountRepo, warmupRepo };
}

describe('Deliverability Pro (Bidirectional Warmup & Live Seed Placement)', () => {
  const originalSeedEnv = process.env.SEED_MAILBOXES_JSON;

  beforeEach(() => {
    delete process.env.SEED_MAILBOXES_JSON;
    const g = globalThis as unknown as { __misenderSeedMailboxes?: { seeds: SeedMailbox[] } };
    if (g.__misenderSeedMailboxes) {
      g.__misenderSeedMailboxes.seeds = [];
    }

    vi.spyOn(DnsCheckerService.prototype, 'auditDomain').mockResolvedValue({
      domain: 'acme.io',
      spf: { valid: true, record: 'v=spf1 include:_spf.google.com ~all', details: 'OK' },
      dmarc: { valid: true, record: 'v=DMARC1; p=reject', details: 'OK' },
      dkim: { valid: true, selector: 'google', details: 'OK' },
      mx: { valid: true, records: ['ASPMX.L.GOOGLE.COM'], details: 'OK' },
      ctd: { valid: true, details: 'OK' },
      overallHealth: 100
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalSeedEnv === undefined) delete process.env.SEED_MAILBOXES_JSON;
    else process.env.SEED_MAILBOXES_JSON = originalSeedEnv;
  });

  describe('1. Gradual Ramp-Up Schedule', () => {
    it('computes 5 + (rampDay - 1) * 3 capped at warmupDailyLimit || 40', () => {
      expect(calculateWarmupRampTarget(1)).toBe(5);
      expect(calculateWarmupRampTarget(2)).toBe(8);
      expect(calculateWarmupRampTarget(5)).toBe(17);
      expect(calculateWarmupRampTarget(12)).toBe(38);
      expect(calculateWarmupRampTarget(15)).toBe(40);
      expect(calculateWarmupRampTarget(15, 25)).toBe(25);
      expect(calculateWarmupRampTarget(20, 60)).toBe(60);
    });

    it('skips accounts where warmupToday >= rampTarget while running uncapped accounts', async () => {
      const capped = makeAccount({
        id: 'acc-capped',
        email: 'capped@acme.io',
        warmupRampDay: 1, // rampTarget = 5
        warmupToday: 5
      });
      const uncapped = makeAccount({
        id: 'acc-open',
        email: 'open@acme.io',
        warmupRampDay: 2, // rampTarget = 8
        warmupToday: 4
      });
      const { accountRepo, warmupRepo } = createStatefulRepos([capped, uncapped]);

      const sentCalls: Array<{ sender: string; opts: MailOptions }> = [];
      const smtpMailer: IMailer = {
        send: vi.fn(async (acc, opts): Promise<MailResult> => {
          sentCalls.push({ sender: acc.email, opts });
          return { success: true, mode: 'smtp', messageId: opts.messageId };
        })
      };
      const simMailer: IMailer = {
        send: vi.fn(async (acc, opts): Promise<MailResult> => {
          sentCalls.push({ sender: acc.email, opts });
          return { success: true, mode: 'simulated', messageId: opts.messageId };
        })
      };

      const service = new InternalWarmupService(accountRepo, warmupRepo, smtpMailer, simMailer);
      const res = await service.runWarmupRound();

      expect(res.success).toBe(true);
      expect(res.skippedRampLimit).toBe(1);
      expect(res.roundsExecuted).toBe(1);
      expect(sentCalls.some((c) => c.opts.from === 'capped@acme.io')).toBe(false);
      expect(sentCalls.some((c) => c.opts.from === 'open@acme.io')).toBe(true);
    });

    it('returns clear error when all active accounts have reached daily ramp target', async () => {
      const a1 = makeAccount({ id: 'a1', email: 'a1@acme.io', warmupRampDay: 1, warmupToday: 5 });
      const a2 = makeAccount({ id: 'a2', email: 'a2@acme.io', warmupRampDay: 2, warmupToday: 8 });
      const { accountRepo, warmupRepo } = createStatefulRepos([a1, a2]);
      const mailer: IMailer = { send: vi.fn() };

      const service = new InternalWarmupService(accountRepo, warmupRepo, mailer, mailer);
      const res = await service.runWarmupRound();

      expect(res.success).toBe(false);
      expect(res.roundsExecuted).toBe(0);
      expect(res.skippedRampLimit).toBe(2);
      expect(mailer.send).not.toHaveBeenCalled();
    });
  });

  describe('2. Multi-Tenant Opt-In Pool & Single-Mailbox Support', () => {
    it('pairs a single workspace mailbox with a global opt-in pool account from another workspace', async () => {
      const ws1Acc = makeAccount({
        id: 'acc-ws1',
        workspaceId: 'ws-one',
        email: 'solo@wsone.io',
        warmupNetworkOptIn: true
      });
      const ws2Acc = makeAccount({
        id: 'acc-ws2',
        workspaceId: 'ws-two',
        email: 'peer@wstwo.io',
        warmupNetworkOptIn: true
      });
      const { accountRepo, warmupRepo } = createStatefulRepos([ws1Acc, ws2Acc]);
      const mailer: IMailer = {
        send: vi.fn(async (_acc, opts): Promise<MailResult> => ({
          success: true,
          mode: 'smtp',
          messageId: opts.messageId
        }))
      };

      const service = new InternalWarmupService(accountRepo, warmupRepo, mailer, mailer);
      const res = await service.runWarmupRound({ workspaceId: 'ws-one' });

      expect(res.success).toBe(true);
      expect(res.roundsExecuted).toBe(1);
      expect(res.logs[0].fromEmail).toBe('solo@wsone.io');
      expect(res.logs[0].toEmail).toBe('peer@wstwo.io');
      expect(res.logs[0].partnerType).toBe('opt_in_pool');
    });

    it('pairs a single opt-in mailbox with seed mailboxes when no other accounts exist', async () => {
      const solo = makeAccount({
        id: 'acc-solo',
        workspaceId: 'ws-solo',
        email: 'solo@acme.io',
        warmupNetworkOptIn: true
      });
      await PlacementTestService.addSeedMailbox({
        id: 'seed-g1',
        workspaceId: 'ws-solo',
        email: 'seed-inbox@gmail.com',
        provider: 'google'
      });

      const { accountRepo, warmupRepo } = createStatefulRepos([solo]);
      const mailer: IMailer = {
        send: vi.fn(async (_acc, opts): Promise<MailResult> => ({
          success: true,
          mode: 'smtp',
          messageId: opts.messageId
        }))
      };
      const simMailer: IMailer = {
        send: vi.fn(async (_acc, opts): Promise<MailResult> => ({
          success: true,
          mode: 'simulated',
          messageId: opts.messageId
        }))
      };

      const service = new InternalWarmupService(accountRepo, warmupRepo, mailer, simMailer);
      const res = await service.runWarmupRound({ workspaceId: 'ws-solo' });

      expect(res.success).toBe(true);
      expect(res.roundsExecuted).toBe(1);
      expect(res.logs[0].toEmail).toBe('seed-inbox@gmail.com');
      expect(res.logs[0].partnerType).toBe('seed_mailbox');
    });

    it('uses pool partner fallback when single opt-in account has zero other accounts or seeds', async () => {
      const solo = makeAccount({
        id: 'acc-solo',
        workspaceId: 'ws-solo',
        email: 'solo@acme.io',
        warmupNetworkOptIn: true
      });
      const { accountRepo, warmupRepo } = createStatefulRepos([solo]);
      const mailer: IMailer = {
        send: vi.fn(async (_acc, opts): Promise<MailResult> => ({
          success: true,
          mode: 'smtp',
          messageId: opts.messageId
        }))
      };

      const service = new InternalWarmupService(accountRepo, warmupRepo, mailer, mailer);
      const res = await service.runWarmupRound({ workspaceId: 'ws-solo' });

      expect(res.success).toBe(true);
      expect(res.roundsExecuted).toBe(1);
      expect(res.logs[0].partnerType).toBe('pool_fallback');
    });

    it('fails with clear Spanish message when single account has opt-in explicitly disabled and no workspace partner exists', async () => {
      const soloOptOut = makeAccount({
        id: 'acc-optout',
        workspaceId: 'ws-private',
        email: 'private@acme.io',
        warmupNetworkOptIn: false
      });
      const otherOptIn = makeAccount({
        id: 'acc-other',
        workspaceId: 'ws-other',
        email: 'other@other.io',
        warmupNetworkOptIn: true
      });
      const { accountRepo, warmupRepo } = createStatefulRepos([soloOptOut, otherOptIn]);
      const mailer: IMailer = { send: vi.fn() };

      const service = new InternalWarmupService(accountRepo, warmupRepo, mailer, mailer);
      const res = await service.runWarmupRound({ workspaceId: 'ws-private' });

      expect(res.success).toBe(false);
      expect(res.roundsExecuted).toBe(0);
      expect(res.logs[0].status).toBe('error');
      expect(res.logs[0].error).toContain('Se requieren al menos 2 casillas');
      expect(mailer.send).not.toHaveBeenCalled();
    });
  });

  describe('3. Bidirectional Threading, Real Health Calculation & IMAP Rescue', () => {
    it('sends realistic Message-ID without [Warmup] subject tag and executes reverse Re: reply with In-Reply-To/References', async () => {
      const acc1 = makeAccount({ id: 'a1', email: 'alice@alpha.io' });
      const acc2 = makeAccount({ id: 'a2', email: 'bob@beta.io' });
      const { accountRepo, warmupRepo } = createStatefulRepos([acc1, acc2]);

      const dispatched: MailOptions[] = [];
      const mailer: IMailer = {
        send: vi.fn(async (_acc, opts): Promise<MailResult> => {
          dispatched.push(opts);
          return { success: true, mode: 'smtp', messageId: opts.messageId };
        })
      };

      const service = new InternalWarmupService(accountRepo, warmupRepo, mailer, mailer);
      const res = await service.runWarmupRound();

      expect(res.success).toBe(true);
      expect(res.roundsExecuted).toBe(2);
      expect(res.repliesExecuted).toBe(2);
      expect(dispatched.length).toBe(4); // 2 initial + 2 reverse replies

      const outbound = dispatched[0];
      const reply = dispatched[1];

      expect(outbound.subject).not.toMatch(/\[warmup\]/i);
      expect(outbound.messageId).toMatch(/^<warmup-[a-f0-9-]+@alpha\.io>$|^<warmup-[a-f0-9-]+@beta\.io>$/);

      expect(reply.from).toBe(outbound.to);
      expect(reply.to).toBe(outbound.from);
      expect(reply.subject).toBe(`Re: ${outbound.subject}`);
      expect(reply.inReplyTo).toBe(outbound.messageId);
      expect(reply.references).toBe(outbound.messageId);
    });

    it('drops healthScore and warmupRescueRate on send errors and never increments score on failure', async () => {
      const acc1 = makeAccount({
        id: 'a1',
        email: 'a1@acme.io',
        healthScore: 95,
        warmupRescueRate: 98,
        warmupTotal: 0
      });
      const acc2 = makeAccount({
        id: 'a2',
        email: 'a2@acme.io',
        healthScore: 95,
        warmupRescueRate: 98,
        warmupTotal: 0
      });
      const { store, accountRepo, warmupRepo } = createStatefulRepos([acc1, acc2]);

      let callNum = 0;
      const failingMailer: IMailer = {
        send: vi.fn(async (_acc, opts): Promise<MailResult> => {
          callNum++;
          if (opts.from === 'a1@acme.io' && !opts.inReplyTo) {
            return { success: false, mode: 'smtp', error: '550 5.7.1 Relaying denied' };
          }
          if (opts.from === 'a2@acme.io' && !opts.inReplyTo) {
            throw new Error('SMTP connection timeout');
          }
          return { success: true, mode: 'smtp', messageId: opts.messageId };
        })
      };

      const service = new InternalWarmupService(accountRepo, warmupRepo, failingMailer, failingMailer);
      const res = await service.runWarmupRound();

      expect(callNum).toBe(2);
      expect(res.success).toBe(false);
      expect(res.roundsExecuted).toBe(0);

      const savedA1 = store.find((a) => a.id === 'a1')!;
      const savedA2 = store.find((a) => a.id === 'a2')!;

      expect(savedA1.healthScore).toBeLessThan(95);
      expect(savedA1.warmupRescueRate).toBeLessThan(98);
      expect(savedA1.warmupToday).toBe(0);
      expect(savedA2.healthScore).toBeLessThan(95);
      expect(savedA2.warmupRescueRate).toBeLessThan(98);
      expect(savedA2.warmupToday).toBe(0);
    });

    it('computes accurate delivery success vs error ratio across mixed rounds', async () => {
      const acc1 = makeAccount({
        id: 'a1',
        email: 'a1@acme.io',
        healthScore: 95,
        warmupTotal: 0
      });
      const acc2 = makeAccount({
        id: 'a2',
        email: 'a2@acme.io',
        healthScore: 95,
        warmupTotal: 0
      });
      const { store, accountRepo, warmupRepo } = createStatefulRepos([acc1, acc2]);

      let a1Attempt = 0;
      const mixedMailer: IMailer = {
        send: vi.fn(async (_acc, opts): Promise<MailResult> => {
          if (opts.from === 'a1@acme.io' && !opts.inReplyTo) {
            a1Attempt++;
            if (a1Attempt === 4) {
              return { success: false, mode: 'smtp', error: '421 Temporary defer' };
            }
          }
          return { success: true, mode: 'smtp', messageId: opts.messageId };
        })
      };

      const service = new InternalWarmupService(accountRepo, warmupRepo, mixedMailer, mixedMailer);
      for (let round = 0; round < 4; round++) {
        await service.runWarmupRound();
      }

      const savedA1 = store.find((a) => a.id === 'a1')!;
      // 3 successes + 1 failure = 75%
      expect(savedA1.warmupDeliveries).toBe(3);
      expect(savedA1.warmupErrors).toBe(1);
      expect(savedA1.healthScore).toBe(75);
      expect(savedA1.warmupRescueRate).toBe(75);
    });

    it('rescues warmup messages from Spam/Junk folders via IMAP rescue helper', async () => {
      const acc = makeAccount({
        id: 'a-rescue',
        email: 'rescue@acme.io',
        warmupTotal: 4,
        warmupDeliveries: 4,
        warmupErrors: 0,
        healthScore: 100
      });
      const { store, accountRepo, warmupRepo } = createStatefulRepos([acc]);
      const mailer: IMailer = { send: vi.fn() };
      const service = new InternalWarmupService(accountRepo, warmupRepo, mailer, mailer);

      const moveToInbox = vi.fn().mockResolvedValue(true);
      const imapMock = {
        scanSpamFolder: vi.fn().mockResolvedValue([
          {
            uid: '101',
            subject: 'Quick sync regarding Q4 roadmap',
            messageId: '<warmup-abc@acme.io>'
          },
          {
            uid: '102',
            subject: 'Unrelated newsletter promo',
            messageId: '<news-999@vendor.io>'
          },
          {
            uid: '103',
            subject: 'Re: Document shared: Draft strategy',
            messageId: '<warmup-reply-def@partner.io>'
          }
        ]),
        moveToInbox
      };

      expect(isWarmupMessageMarker('Quick sync regarding Q4 roadmap', '<warmup-abc@acme.io>')).toBe(true);
      expect(isWarmupMessageMarker('Unrelated newsletter promo', '<news-999@vendor.io>')).toBe(false);

      const rescueRes = await service.rescueWarmupSpam(acc, imapMock);

      expect(rescueRes.scanned).toBe(3);
      expect(rescueRes.foundInSpam).toBe(2);
      expect(rescueRes.rescued).toBe(2);
      expect(moveToInbox).toHaveBeenCalledTimes(2);
      expect(store[0].warmupRescuedCount).toBe(2);
      expect(store[0].warmupRescueRate).toBe(100);
    });
  });

  describe('4. Seed Mailbox CRUD & Live Seed Placement Test', () => {
    it('supports addSeedMailbox, getSeedMailboxes, SEED_MAILBOXES_JSON env, and removeSeedMailbox', async () => {
      process.env.SEED_MAILBOXES_JSON = JSON.stringify([
        { email: 'env-seed@yahoo.com', provider: 'yahoo' }
      ]);

      const service = new PlacementTestService();
      const added = await service.addSeedMailbox({
        id: 'seed-1',
        workspaceId: 'ws-alpha',
        email: 'seed1@gmail.com',
        imapPass: 'secret-imap-pass'
      });

      expect(added.provider).toBe('google');
      expect(added.imapHost).toBe('imap.gmail.com');

      const wsAlphaSeeds = await service.getSeedMailboxes('ws-alpha');
      expect(wsAlphaSeeds.map((s) => s.email)).toEqual(
        expect.arrayContaining(['env-seed@yahoo.com', 'seed1@gmail.com'])
      );

      const wsBetaSeeds = await service.getSeedMailboxes('ws-beta');
      expect(wsBetaSeeds.map((s) => s.email)).toEqual(['env-seed@yahoo.com']);

      const removed = await service.removeSeedMailbox('seed-1');
      expect(removed).toBe(true);

      const afterDelete = await service.getSeedMailboxes('ws-alpha');
      expect(afterDelete.some((s) => s.id === 'seed-1')).toBe(false);
    });

    it('runs live_seed placement test with [MS-SEED-<id>] token, provider breakdown, and real seedInboxRate', async () => {
      const service = new PlacementTestService();
      await service.addSeedMailbox({
        id: 'seed-g',
        workspaceId: 'ws-live',
        email: 'probe@gmail.com',
        provider: 'google'
      });
      await service.addSeedMailbox({
        id: 'seed-ms',
        workspaceId: 'ws-live',
        email: 'probe@outlook.com',
        provider: 'microsoft'
      });
      await service.addSeedMailbox({
        id: 'seed-z',
        workspaceId: 'ws-live',
        email: 'probe@zoho.com',
        provider: 'zoho'
      });

      const sender = makeAccount({
        id: 'sender-real',
        workspaceId: 'ws-live',
        email: 'rep@acme.io',
        smtpPass: 'real-pass'
      });

      const dispatchedSubjects: string[] = [];
      const mockSmtp: IMailer = {
        send: vi.fn(async (_acc, opts): Promise<MailResult> => {
          dispatchedSubjects.push(opts.subject);
          return { success: true, mode: 'smtp', messageId: opts.messageId };
        })
      };

      const seedImapChecker = vi.fn(async ({ seed, token }) => {
        expect(token).toMatch(/^\[MS-SEED-[A-Z0-9]+\]$/);
        if (seed.provider === 'google') return { folder: 'inbox' as const, latencyMs: 120 };
        if (seed.provider === 'microsoft') return { folder: 'promotions' as const, latencyMs: 210 };
        return { folder: 'inbox' as const, latencyMs: 95 };
      });

      const report = await service.runPlacementTest(
        sender,
        'Quick sync on Q4 pipeline',
        'Hi team, wanted to share our short summary.',
        {
          mode: 'live_seed',
          workspaceId: 'ws-live',
          mailers: { smtp: mockSmtp },
          seedImapChecker
        }
      );

      expect(report.mode).toBe('live_seed');
      expect(report.seedTestId).toMatch(/^seed-[a-z0-9]+$/);
      expect(report.seedToken).toMatch(/^\[MS-SEED-[A-Z0-9]+\]$/);
      expect(report.predictedInboxRate).toBeGreaterThan(80);
      expect(report.dnsHealth).toBe(100);
      expect(report.providerBreakdown).toHaveLength(3);
      expect(report.seedInboxRate).toBe(67); // 2 of 3 in primary inbox

      for (const sub of dispatchedSubjects) {
        expect(sub).toContain(report.seedToken!);
      }
      expect(report.providerBreakdown?.find((p) => p.provider === 'microsoft')?.folder).toBe(
        'promotions'
      );
    });

    it('preserves heuristic mode and runs simulated live_seed for demo accounts without configured seeds', async () => {
      const service = new PlacementTestService();
      const demoSender = makeAccount({
        id: 'demo-1',
        email: 'demo@acme.io',
        smtpPass: 'demo-pass'
      });

      const heuristicReport = await service.runPlacementTest(
        demoSender,
        '100% free urgent offer',
        'Click here to buy now at http://insecure.example.com'
      );
      expect(heuristicReport.mode).toBe('heuristic');
      expect(heuristicReport.spamScore).toBeGreaterThanOrEqual(3);
      expect(heuristicReport.predictedInboxRate).toBeLessThan(80);
      expect(heuristicReport.recommendations.some((r) => r.includes('HTTPS'))).toBe(true);

      vi.spyOn(DnsCheckerService.prototype, 'auditDomain').mockResolvedValueOnce({
        domain: 'acme.io',
        spf: { valid: false, details: 'Missing SPF' },
        dmarc: { valid: false, details: 'Missing DMARC' },
        dkim: { valid: false, details: 'Missing DKIM' },
        mx: { valid: true, records: ['MX1'], details: 'OK' },
        ctd: { valid: false, details: 'Missing CTD' },
        overallHealth: 15
      });

      const riskyReport = await service.runPlacementTest(
        demoSender,
        '100% free urgent winner',
        'Act now and buy now'
      );
      expect(riskyReport.predictedSpamRisk).toBe('high');

      const simLiveReport = await service.runPlacementTest(
        demoSender,
        'Quarterly sync',
        'Looking forward to connecting tomorrow.',
        { mode: 'live_seed' }
      );
      expect(simLiveReport.mode).toBe('live_seed');
      expect(simLiveReport.providerBreakdown?.length).toBeGreaterThanOrEqual(3);
      expect(simLiveReport.seedInboxRate).toBe(100);
    });
  });

  describe('5. /api/accounts/placement-test Route Handlers', () => {
    it('validates invalid seed emails and missing DELETE id cleanly', async () => {
      const badAddReq = new NextRequest('http://localhost:3000/api/accounts/placement-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add_seed', email: 'not-an-email' })
      });
      const badAddRes = await POST(badAddReq);
      expect(badAddRes.status).toBe(400);

      const badDelReq = new NextRequest('http://localhost:3000/api/accounts/placement-test', {
        method: 'DELETE'
      });
      const badDelRes = await DELETE(badDelReq);
      expect(badDelRes.status).toBe(400);
    });
    it('supports GET (safe without passwords), POST add_seed, POST live_seed test, and DELETE', async () => {
      const demoSender = makeAccount({
        id: 'acc-route-1',
        workspaceId: 'ws-api',
        email: 'api@acme.io',
        smtpPass: 'demo-pass'
      });

      vi.spyOn(container.accountRepo, 'getAccounts').mockResolvedValue([demoSender]);

      // POST action: 'add_seed'
      const addReq = new NextRequest('http://localhost:3000/api/accounts/placement-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_seed',
          id: 'api-seed-1',
          workspaceId: 'ws-api',
          email: 'checker@gmail.com',
          imapPass: 'super-secret-imap-password'
        })
      });
      const addRes = await POST(addReq);
      const addData = await addRes.json();

      expect(addRes.status).toBe(201);
      expect(addData.success).toBe(true);
      expect(addData.seed.email).toBe('checker@gmail.com');
      expect(addData.seed.hasImapPass).toBe(true);
      expect('imapPass' in addData.seed).toBe(false);

      // GET list seeds safely without passwords
      const getReq = new NextRequest(
        'http://localhost:3000/api/accounts/placement-test?workspaceId=ws-api'
      );
      const getRes = await GET(getReq);
      const getData = await getRes.json();

      expect(getRes.status).toBe(200);
      expect(getData.count).toBe(1);
      expect(getData.seeds[0].email).toBe('checker@gmail.com');
      expect('imapPass' in getData.seeds[0]).toBe(false);

      // POST live_seed placement test
      const runReq = new NextRequest('http://localhost:3000/api/accounts/placement-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: 'acc-route-1',
          workspaceId: 'ws-api',
          mode: 'live_seed',
          subject: 'Checking in on rollout',
          body: 'Hi there, let me know if Tuesday works.'
        })
      });
      const runRes = await POST(runReq);
      const runData = await runRes.json();

      expect(runRes.status).toBe(200);
      expect(runData.mode).toBe('live_seed');
      expect(runData.seedTestId).toMatch(/^seed-/);
      expect(runData.providerBreakdown).toHaveLength(1);
      expect(runData.seedInboxRate).toBe(100);

      // DELETE remove seed
      const delReq = new NextRequest(
        'http://localhost:3000/api/accounts/placement-test?id=api-seed-1',
        { method: 'DELETE' }
      );
      const delRes = await DELETE(delReq);
      const delData = await delRes.json();

      expect(delRes.status).toBe(200);
      expect(delData.success).toBe(true);
      expect(delData.removed).toBe(true);

      const getAfterRes = await GET(getReq);
      const getAfterData = await getAfterRes.json();
      expect(getAfterData.count).toBe(0);
    });
  });
});
