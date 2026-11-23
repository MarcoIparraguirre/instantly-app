import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import dns from 'dns';
import net from 'net';
import { NextRequest } from 'next/server';

const { mockRateLimitTable, mockSupabase } = vi.hoisted(() => {
  const tableState = {
    rows: new Map<string, { key: string; bucket: string; count: number; reset_at: string }>(),
    shouldError: false,
  };

  const fromMock = vi.fn((tableName: string) => {
    if (tableName !== 'rate_limits') {
      return {};
    }

    return {
      select: vi.fn(() => ({
        eq: vi.fn((_col: string, keyVal: string) => ({
          maybeSingle: vi.fn(async () => {
            if (tableState.shouldError) {
              return { data: null, error: { message: 'DB connection refused' } };
            }
            const found = tableState.rows.get(keyVal) || null;
            return { data: found, error: null };
          }),
        })),
      })),
      upsert: vi.fn(
        async (row: { key: string; bucket: string; count: number; reset_at: string }) => {
          if (tableState.shouldError) {
            return { error: { message: 'Upsert failed' } };
          }
          tableState.rows.set(row.key, { ...row });
          return { error: null };
        }
      ),
      update: vi.fn((patch: { count: number }) => ({
        eq: vi.fn(async (_col: string, keyVal: string) => {
          if (tableState.shouldError) {
            return { error: { message: 'Update failed' } };
          }
          const existing = tableState.rows.get(keyVal);
          if (existing) {
            tableState.rows.set(keyVal, { ...existing, count: patch.count });
          }
          return { error: null };
        }),
      })),
    };
  });

  return {
    mockRateLimitTable: tableState,
    mockSupabase: {
      supabaseUrl: 'https://mock-project.supabase.co',
      from: fromMock,
    },
  };
});

vi.mock('@/core/supabase/client', () => ({
  supabase: mockSupabase,
  getSupabaseClient: () => mockSupabase,
}));

import {
  checkRateLimit,
  checkDistributedRateLimit,
  getDistributedRateLimitBackend,
} from '@/core/security/rateLimiter';
import {
  RoundRobinAccountRotator,
  BalancedAccountRotator,
  RotatableSenderAccount,
} from '@/core/services/AccountRotator';
import {
  DeliverabilityGuardService,
  GuardedSenderAccount,
} from '@/core/services/DeliverabilityGuardService';
import { GoogleSheetsService } from '@/core/services/GoogleSheetsService';
import {
  EmailVerifierService,
  DISPOSABLE_DOMAINS,
  ROLE_BASED_PREFIXES,
} from '@/core/services/EmailVerifierService';
import { GET as getHealth } from '@/app/api/health/route';
import { IAccountRepository } from '@/core/interfaces/storage';
import { DnsAuditResult, SenderAccount } from '@/types';

function makeAccount(overrides: Partial<GuardedSenderAccount> = {}): GuardedSenderAccount {
  return {
    id: 'acc-1',
    workspaceId: 'ws-1',
    name: 'Mailbox 1',
    email: 'sender@company.com',
    smtpHost: 'smtp.company.com',
    smtpPort: 587,
    smtpUser: 'sender@company.com',
    smtpPass: 'secret',
    dailyLimit: 50,
    sentToday: 0,
    status: 'active',
    ...overrides,
  };
}

function makeDnsAudit(overrides: Partial<DnsAuditResult> = {}): DnsAuditResult {
  return {
    domain: 'company.com',
    spf: { valid: true, record: 'v=spf1 ~all', details: 'ok' },
    dmarc: { valid: true, record: 'v=DMARC1; p=quarantine', details: 'ok' },
    dkim: { valid: true, selector: 'google', details: 'ok' },
    mx: { valid: true, records: ['mx.company.com'], details: 'ok' },
    ctd: { valid: true, details: 'ok' },
    overallHealth: 100,
    ...overrides,
  };
}

describe('Scalability, Deliverability Guard, Verifier & Health Suite', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
    mockRateLimitTable.rows.clear();
    mockRateLimitTable.shouldError = false;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. Distributed Rate Limiter
  // =========================================================================
  describe('Rate Limiter (Sync + Distributed)', () => {
    it('keeps synchronous checkRateLimit intact', () => {
      const bucket = `sync-bucket-${Date.now()}`;
      const r1 = checkRateLimit(bucket, '1.2.3.4', 2, 60_000);
      const r2 = checkRateLimit(bucket, '1.2.3.4', 2, 60_000);
      const r3 = checkRateLimit(bucket, '1.2.3.4', 2, 60_000);

      expect(r1.allowed).toBe(true);
      expect(r1.remaining).toBe(1);
      expect(r2.allowed).toBe(true);
      expect(r2.remaining).toBe(0);
      expect(r3.allowed).toBe(false);
      expect(r3.remaining).toBe(0);
    });

    it('uses Upstash REST INCR + EXPIRE pipeline when Upstash env vars are set', async () => {
      process.env.UPSTASH_REDIS_REST_URL = 'https://test-redis.upstash.io';
      process.env.UPSTASH_REDIS_REST_TOKEN = 'upstash-token-123';

      expect(getDistributedRateLimitBackend()).toBe('upstash');

      let callCount = 0;
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
        callCount++;
        const parsedBody = JSON.parse(String(init?.body || '[]')) as unknown[][];
        expect(parsedBody[0]?.[0]).toBe('INCR');
        expect(parsedBody[1]?.[0]).toBe('EXPIRE');
        return new Response(JSON.stringify([{ result: callCount }, { result: 1 }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      const first = await checkDistributedRateLimit('api-test', 'ip-1', 2, 60_000);
      const second = await checkDistributedRateLimit('api-test', 'ip-1', 2, 60_000);
      const third = await checkDistributedRateLimit('api-test', 'ip-1', 2, 60_000);

      expect(fetchSpy).toHaveBeenCalledTimes(3);
      expect(first).toMatchObject({ allowed: true, remaining: 1, backend: 'upstash' });
      expect(second).toMatchObject({ allowed: true, remaining: 0, backend: 'upstash' });
      expect(third).toMatchObject({ allowed: false, remaining: 0, backend: 'upstash' });
    });

    it('falls back gracefully from Upstash to memory on HTTP/network error', async () => {
      process.env.UPSTASH_REDIS_REST_URL = 'https://test-redis.upstash.io';
      process.env.UPSTASH_REDIS_REST_TOKEN = 'upstash-token-123';

      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network down'));

      const res = await checkDistributedRateLimit(`upstash-fallback-${Date.now()}`, 'ip-2', 5, 60_000);
      expect(res.allowed).toBe(true);
      expect(res.remaining).toBe(4);
      expect(res.backend).toBe('memory');
    });

    it('uses Supabase rate_limits table outside VITEST and falls back to memory on DB error', async () => {
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
      delete process.env.VITEST;
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://mock-project.supabase.co';
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';

      expect(getDistributedRateLimitBackend()).toBe('supabase');

      const r1 = await checkDistributedRateLimit('login', 'user@co.com', 2, 60_000);
      const r2 = await checkDistributedRateLimit('login', 'user@co.com', 2, 60_000);
      const r3 = await checkDistributedRateLimit('login', 'user@co.com', 2, 60_000);

      expect(r1).toMatchObject({ allowed: true, remaining: 1, backend: 'supabase' });
      expect(r2).toMatchObject({ allowed: true, remaining: 0, backend: 'supabase' });
      expect(r3).toMatchObject({ allowed: false, remaining: 0, backend: 'supabase' });

      // Simulate DB error -> graceful memory fallback
      mockRateLimitTable.shouldError = true;
      const fallback = await checkDistributedRateLimit(`login-err-${Date.now()}`, 'user@co.com', 3, 60_000);
      expect(fallback).toMatchObject({ allowed: true, remaining: 2, backend: 'memory' });
    });

    it('uses memory backend inside VITEST even when Supabase env vars are set', async () => {
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
      process.env.VITEST = 'true';
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://mock-project.supabase.co';
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';

      const res = await checkDistributedRateLimit(`vitest-mem-${Date.now()}`, 'k1', 4, 60_000);
      expect(res).toMatchObject({ allowed: true, remaining: 3, backend: 'memory' });
    });
  });

  // =========================================================================
  // 2. AccountRotator Cold-Start & Utilization Resilience
  // =========================================================================
  describe('AccountRotator (Cold-Start & Utilization Resilience)', () => {
    it('rotates fairly starting with least-recently-used account on cold start when lastUsedAt is present', () => {
      const accounts: RotatableSenderAccount[] = [
        makeAccount({
          id: 'acc-recent',
          sentToday: 10,
          dailyLimit: 50,
          lastUsedAt: '2026-11-23T12:00:00.000Z',
        }),
        makeAccount({
          id: 'acc-oldest',
          sentToday: 12,
          dailyLimit: 50,
          lastUsedAt: '2026-11-23T09:00:00.000Z',
        }),
        makeAccount({
          id: 'acc-mid',
          sentToday: 8,
          dailyLimit: 50,
          lastUsedAt: '2026-11-23T10:30:00.000Z',
        }),
      ];

      const rotator = new RoundRobinAccountRotator();
      const first = rotator.getNextAccount(accounts);
      const second = rotator.getNextAccount(accounts);
      const third = rotator.getNextAccount(accounts);

      expect(first?.id).toBe('acc-oldest');
      expect(second?.id).toBe('acc-mid');
      expect(third?.id).toBe('acc-recent');
    });

    it('breaks equal lastUsedAt cold-start ties by lowest relative utilization (sentToday / dailyLimit)', () => {
      const accounts: RotatableSenderAccount[] = [
        makeAccount({
          id: 'acc-heavy',
          sentToday: 40,
          dailyLimit: 50, // 80%
          lastUsedAt: '2026-11-23T10:00:00.000Z',
        }),
        makeAccount({
          id: 'acc-light',
          sentToday: 10,
          dailyLimit: 100, // 10%
          lastUsedAt: '2026-11-23T10:00:00.000Z',
        }),
      ];

      const rotator = new RoundRobinAccountRotator();
      expect(rotator.getNextAccount(accounts)?.id).toBe('acc-light');
    });

    it('supports balanced mode selecting lowest relative utilization and breaking ties via round-robin', () => {
      const accounts: SenderAccount[] = [
        makeAccount({ id: 'acc-a', sentToday: 25, dailyLimit: 50 }), // 50%
        makeAccount({ id: 'acc-b', sentToday: 10, dailyLimit: 100 }), // 10%
        makeAccount({ id: 'acc-c', sentToday: 10, dailyLimit: 100 }), // 10%
      ];

      const rotator = new BalancedAccountRotator();
      const pick1 = rotator.getNextAccount(accounts);
      const pick2 = rotator.getNextAccount(accounts);

      expect(pick1?.id).toBe('acc-b');
      expect(pick2?.id).toBe('acc-c');
    });

    it('skips accounts with status error or exhausted daily limit', () => {
      const accounts: SenderAccount[] = [
        makeAccount({ id: 'acc-paused', status: 'error', sentToday: 0, dailyLimit: 50 }),
        makeAccount({ id: 'acc-full', status: 'active', sentToday: 50, dailyLimit: 50 }),
        makeAccount({ id: 'acc-ok', status: 'active', sentToday: 5, dailyLimit: 50 }),
      ];

      const rotator = new RoundRobinAccountRotator();
      expect(rotator.getNextAccount(accounts)?.id).toBe('acc-ok');
    });
  });

  // =========================================================================
  // 3. DeliverabilityGuardService
  // =========================================================================
  describe('DeliverabilityGuardService', () => {
    it('does not pause accounts below 10 sent even if 1 bounce occurs', () => {
      const guard = new DeliverabilityGuardService();
      const account = makeAccount();

      const res = guard.evaluateAccountHealth(account, { sent: 5, bounced: 1 });
      expect(res.healthy).toBe(true);
      expect(res.shouldPause).toBe(false);
      expect(res.bounceRate).toBeCloseTo(0.2);
    });

    it('pauses when sent >= 10 and bounceRate >= 0.04', () => {
      const guard = new DeliverabilityGuardService();
      const account = makeAccount();

      const belowThreshold = guard.evaluateAccountHealth(account, { sent: 100, bounced: 3 });
      expect(belowThreshold.healthy).toBe(true);
      expect(belowThreshold.shouldPause).toBe(false);

      const atThreshold = guard.evaluateAccountHealth(account, { sent: 25, bounced: 1 });
      expect(atThreshold.healthy).toBe(false);
      expect(atThreshold.shouldPause).toBe(true);
      expect(atThreshold.bounceRate).toBeCloseTo(0.04);
      expect(atThreshold.reason).toContain('4.0%');
    });

    it('pauses on critical DNS failure when spf.valid === false or dkim.valid === false', () => {
      const guard = new DeliverabilityGuardService();
      const account = makeAccount();

      const spfFail = guard.evaluateAccountHealth(account, {
        sent: 0,
        bounced: 0,
        dnsAudit: makeDnsAudit({ spf: { valid: false, details: 'missing' } }),
      });
      expect(spfFail.healthy).toBe(false);
      expect(spfFail.shouldPause).toBe(true);
      expect(spfFail.reason).toContain('SPF');

      const dkimFail = guard.evaluateAccountHealth(account, {
        sent: 0,
        bounced: 0,
        dnsAudit: makeDnsAudit({ dkim: { valid: false, details: 'missing' } }),
      });
      expect(dkimFail.healthy).toBe(false);
      expect(dkimFail.shouldPause).toBe(true);
      expect(dkimFail.reason).toContain('DKIM');

      const dmarcOnlyFail = guard.evaluateAccountHealth(account, {
        sent: 20,
        bounced: 0,
        dnsAudit: makeDnsAudit({ dmarc: { valid: false, details: 'missing' } }),
      });
      expect(dmarcOnlyFail.healthy).toBe(true);
      expect(dmarcOnlyFail.shouldPause).toBe(false);
    });

    it('enforceWorkspaceDeliverability pauses unhealthy accounts, saves them, fires webhook, and calculates remaining capacity', async () => {
      const accounts: GuardedSenderAccount[] = [
        makeAccount({
          id: 'acc-healthy',
          email: 'good@okdomain.com',
          dailyLimit: 50,
          sentToday: 12,
          totalSent: 12,
          bounceCount: 0,
        }),
        makeAccount({
          id: 'acc-bouncer',
          email: 'bad@okdomain.com',
          dailyLimit: 50,
          sentToday: 20,
          totalSent: 20,
          bounceCount: 2, // 10%
        }),
        makeAccount({
          id: 'acc-bad-dns',
          email: 'dns@broken.com',
          dailyLimit: 40,
          sentToday: 5,
          totalSent: 5,
          bounceCount: 0,
        }),
      ];

      const savedAccounts: GuardedSenderAccount[] = [];
      const mockRepo: IAccountRepository = {
        getAccounts: vi.fn().mockResolvedValue(accounts),
        getAccountById: vi.fn(),
        saveAccounts: vi.fn(),
        saveAccount: vi.fn(async acc => {
          savedAccounts.push(acc as GuardedSenderAccount);
        }),
        deleteAccount: vi.fn(),
      };

      const mockDns = {
        auditDomain: vi.fn(async (domain: string) =>
          domain === 'broken.com'
            ? makeDnsAudit({ domain, spf: { valid: false, details: 'no spf' } })
            : makeDnsAudit({ domain })
        ),
      };

      const mockWebhook = {
        trigger: vi.fn().mockResolvedValue(undefined),
      };

      const guard = new DeliverabilityGuardService(mockRepo, mockDns, mockWebhook);
      const summary = await guard.enforceWorkspaceDeliverability('ws-1');

      expect(summary.checked).toBe(3);
      expect(summary.paused).toBe(2);
      expect(summary.healthyAccounts).toBe(1);
      expect(summary.remainingDailyCapacity).toBe(38); // 50 - 12

      expect(savedAccounts).toHaveLength(2);
      expect(savedAccounts[0].id).toBe('acc-bouncer');
      expect(savedAccounts[0].status).toBe('error');
      expect(savedAccounts[0].pausedReason).toContain('10.0%');

      expect(savedAccounts[1].id).toBe('acc-bad-dns');
      expect(savedAccounts[1].status).toBe('error');
      expect(savedAccounts[1].pausedReason).toContain('SPF');

      expect(mockWebhook.trigger).toHaveBeenCalledTimes(2);
      expect(mockWebhook.trigger).toHaveBeenCalledWith(
        'account.paused',
        expect.objectContaining({
          accountId: 'acc-bouncer',
          workspaceId: 'ws-1',
        }),
        'ws-1'
      );
      // DNS audit should be cached per domain (okdomain.com queried once, broken.com queried once)
      expect(mockDns.auditDomain).toHaveBeenCalledTimes(2);
    });
  });

  // =========================================================================
  // 4. GoogleSheetsService Pagination & GID Tab Resolution
  // =========================================================================
  describe('GoogleSheetsService (Pagination & GID Resolution)', () => {
    it('paginates in 5,000-row chunks and prepends resolved tab title when gid is present', async () => {
      const service = new GoogleSheetsService();
      const chunk1Rows = [
        ['email', 'first_name'],
        ...Array.from({ length: 4999 }, (_, i) => [`user${i}@example.com`, `User${i}`]),
      ]; // total 5,000 rows (1 header + 4999 data)
      const chunk2Rows = [
        ['user4999@example.com', 'User4999'],
        ['user5000@example.com', 'User5000'],
      ]; // < 5,000 rows -> stops pagination

      const calledUrls: string[] = [];
      vi.spyOn(globalThis, 'fetch').mockImplementation(async urlInput => {
        const url = String(urlInput);
        calledUrls.push(url);

        if (url.includes('?fields=sheets.properties')) {
          return new Response(
            JSON.stringify({
              sheets: [
                { properties: { sheetId: 0, title: 'Sheet1' } },
                { properties: { sheetId: 987654, title: 'Q4 Prospects' } },
              ],
            }),
            { status: 200 }
          );
        }

        if (decodeURIComponent(url).includes('A1:ZZ5000')) {
          return new Response(JSON.stringify({ values: chunk1Rows }), { status: 200 });
        }

        if (decodeURIComponent(url).includes('A5001:ZZ10000')) {
          return new Response(JSON.stringify({ values: chunk2Rows }), { status: 200 });
        }

        return new Response(JSON.stringify({ values: [] }), { status: 200 });
      });

      const records = await service.fetchSheetRows(
        'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=987654',
        'oauth-access-token'
      );

      expect(calledUrls.length).toBe(3); // metadata + chunk1 + chunk2
      expect(calledUrls[0]).toContain('?fields=sheets.properties');
      expect(decodeURIComponent(calledUrls[1])).toContain("'Q4 Prospects'!A1:ZZ5000");
      expect(decodeURIComponent(calledUrls[2])).toContain("'Q4 Prospects'!A5001:ZZ10000");
      expect(records.length).toBe(5001);
      expect(records[0].email).toBe('user0@example.com');
      expect(records[5000].email).toBe('user5000@example.com');
    });

    it('gracefully falls back to unprefixed range when metadata request fails and caps at 50,000 rows', async () => {
      const service = new GoogleSheetsService();
      const calledUrls: string[] = [];

      vi.spyOn(globalThis, 'fetch').mockImplementation(async urlInput => {
        const url = String(urlInput);
        calledUrls.push(url);

        if (url.includes('?fields=sheets.properties')) {
          return new Response('Forbidden', { status: 403 });
        }

        // Return 5,000 rows for every chunk to verify hard 50,000-row cap (10 chunks)
        const isFirstChunk = url.includes('A1:ZZ5000');
        const rows = isFirstChunk
          ? [['email'], ...Array.from({ length: 4999 }, (_, i) => [`lead${i}@test.com`])]
          : Array.from({ length: 5000 }, (_, i) => [`lead${i}@test.com`]);

        return new Response(JSON.stringify({ values: rows }), { status: 200 });
      });

      const records = await service.fetchSheetRows(
        'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=555',
        'oauth-token'
      );

      // 1 metadata + 10 chunks (A1:ZZ5000 .. A45001:ZZ50000)
      expect(calledUrls.length).toBe(11);
      expect(calledUrls[1]).toContain('/values/A1:ZZ5000');
      expect(calledUrls[10]).toContain('/values/A45001:ZZ50000');
      expect(records.length).toBe(49999); // 50,000 rows minus 1 header row
    });
  });

  // =========================================================================
  // 5. EmailVerifierService (70+ Disposable, Role-Based, 5th Layer, Batch)
  // =========================================================================
  describe('EmailVerifierService (Enriched Layers)', () => {
    it('contains 70+ disposable domains and detects expanded disposable providers', async () => {
      expect(DISPOSABLE_DOMAINS.size).toBeGreaterThanOrEqual(70);
      expect(ROLE_BASED_PREFIXES.size).toBe(12);

      const service = new EmailVerifierService();
      const res = await service.verifyEmail('lead@getnada.com');
      expect(res.isValid).toBe(false);
      expect(res.isDisposable).toBe(true);
    });

    it('detects role-based prefixes while preserving MX validation', async () => {
      vi.spyOn(dns.promises, 'resolveMx').mockResolvedValue([
        { exchange: 'mx.company.com', priority: 10 },
      ]);

      const service = new EmailVerifierService();
      const roleRes = await service.verifyEmail('support@company.com');
      expect(roleRes.isValid).toBe(true);
      expect(roleRes.isRoleBased).toBe(true);
      expect(roleRes.score).toBe(75);

      const personalRes = await service.verifyEmail('marco@company.com');
      expect(personalRes.isValid).toBe(true);
      expect(personalRes.isRoleBased).toBe(false);
      expect(personalRes.score).toBe(95);
    });

    it('queries external verifier API when EMAIL_VERIFIER_API_KEY is set and falls back gracefully on error', async () => {
      process.env.EMAIL_VERIFIER_API_KEY = 'verifier-key-123';
      vi.spyOn(dns.promises, 'resolveMx').mockResolvedValue([
        { exchange: 'mx.company.com', priority: 10 },
      ]);

      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              status: 'catch-all',
              is_catchall: true,
              smtp_check: true,
              score: 72,
            }),
            { status: 200 }
          )
        )
        .mockRejectedValueOnce(new Error('External verifier timeout'));

      const service = new EmailVerifierService();
      const first = await service.verifyEmail('founder@acme.com');
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(first.isValid).toBe(true);
      expect(first.isCatchAll).toBe(true);
      expect(first.smtpVerified).toBe(true);
      expect(first.score).toBe(72);

      const fallback = await service.verifyEmail('founder2@acme.com');
      expect(fallback.isValid).toBe(true);
      expect(fallback.hasMx).toBe(true);
      expect(fallback.score).toBe(95);
    });

    it('probes SMTP RCPT TO and detects catch-all domains via net.Socket without real network traffic', async () => {
      vi.spyOn(dns.promises, 'resolveMx').mockResolvedValue([
        { exchange: 'mx.probe-test.com', priority: 10 },
      ]);

      const simulateSmtpServer = (targetCode: string, catchAllCode: string) => {
        vi.spyOn(net.Socket.prototype, 'setTimeout').mockReturnThis();
        vi.spyOn(net.Socket.prototype, 'destroy').mockReturnThis();
        vi.spyOn(net.Socket.prototype, 'connect').mockImplementation(function (this: net.Socket) {
          queueMicrotask(() => {
            this.emit('data', Buffer.from('220 mx.probe-test.com ESMTP ready\r\n'));
          });
          return this;
        });

        let rcptCount = 0;
        vi.spyOn(net.Socket.prototype, 'write').mockImplementation(function (
          this: net.Socket,
          chunk: string | Uint8Array
        ) {
          const cmd = String(chunk);
          queueMicrotask(() => {
            if (cmd.startsWith('EHLO')) {
              this.emit('data', Buffer.from('250-Hello\r\n250 OK\r\n'));
            } else if (cmd.startsWith('MAIL FROM:')) {
              this.emit('data', Buffer.from('250 Sender OK\r\n'));
            } else if (cmd.startsWith('RCPT TO:')) {
              rcptCount++;
              const code = rcptCount === 1 ? targetCode : catchAllCode;
              this.emit('data', Buffer.from(`${code}\r\n`));
            }
          });
          return true;
        });
      };

      const service = new EmailVerifierService();

      // Case 1: Target accepted (250), random probe rejected (550) => smtpVerified: true, isCatchAll: false
      simulateSmtpServer('250 Recipient OK', '550 5.1.1 User unknown');
      const verifiedRes = await service.verifyEmail('real.person@probe-test.com', {
        smtpProbe: true,
      });
      expect(verifiedRes.isValid).toBe(true);
      expect(verifiedRes.smtpVerified).toBe(true);
      expect(verifiedRes.isCatchAll).toBe(false);
      expect(verifiedRes.score).toBe(98);

      vi.restoreAllMocks();
      vi.spyOn(dns.promises, 'resolveMx').mockResolvedValue([
        { exchange: 'mx.probe-test.com', priority: 10 },
      ]);

      // Case 2: Target accepted (250) AND random probe accepted (250) => isCatchAll: true
      simulateSmtpServer('250 Recipient OK', '250 Catch-all accepted');
      const catchAllRes = await service.verifyEmail('anyone@probe-test.com', {
        smtpProbe: true,
      });
      expect(catchAllRes.isValid).toBe(true);
      expect(catchAllRes.smtpVerified).toBe(true);
      expect(catchAllRes.isCatchAll).toBe(true);
      expect(catchAllRes.score).toBe(70);

      vi.restoreAllMocks();
      vi.spyOn(dns.promises, 'resolveMx').mockResolvedValue([
        { exchange: 'mx.probe-test.com', priority: 10 },
      ]);

      // Case 3: Target rejected (550) => isValid: false, smtpVerified: false
      simulateSmtpServer('550 5.1.1 No such user', '550 5.1.1 No such user');
      const rejectedRes = await service.verifyEmail('ghost@probe-test.com', {
        smtpProbe: true,
      });
      expect(rejectedRes.isValid).toBe(false);
      expect(rejectedRes.smtpVerified).toBe(false);

      vi.restoreAllMocks();
      vi.spyOn(dns.promises, 'resolveMx').mockResolvedValue([
        { exchange: 'mx.probe-test.com', priority: 10 },
      ]);

      // Case 4: Socket error/blocked port 25 falls back gracefully to MX validity
      vi.spyOn(net.Socket.prototype, 'setTimeout').mockReturnThis();
      vi.spyOn(net.Socket.prototype, 'destroy').mockReturnThis();
      vi.spyOn(net.Socket.prototype, 'connect').mockImplementation(function (this: net.Socket) {
        queueMicrotask(() => {
          this.emit('error', new Error('connect ETIMEDOUT'));
        });
        return this;
      });
      const fallbackProbeRes = await service.verifyEmail('fallback@probe-test.com', {
        smtpProbe: true,
      });
      expect(fallbackProbeRes.isValid).toBe(true);
      expect(fallbackProbeRes.smtpVerified).toBe(false);
      expect(fallbackProbeRes.hasMx).toBe(true);
    });

    it('processes verifyBatch in bounded chunks of max 10 concurrent calls', async () => {
      const service = new EmailVerifierService();
      let inFlight = 0;
      let peakInFlight = 0;

      vi.spyOn(service, 'verifyEmail').mockImplementation(async email => {
        inFlight++;
        peakInFlight = Math.max(peakInFlight, inFlight);
        await new Promise(resolve => setTimeout(resolve, 10));
        inFlight--;
        return {
          email,
          isValid: true,
          score: 95,
          syntaxValid: true,
          domain: 'example.com',
          hasMx: true,
          isDisposable: false,
          reason: 'ok',
        };
      });

      const emails = Array.from({ length: 25 }, (_, i) => `user${i}@example.com`);
      const results = await service.verifyBatch(emails, 50); // intentionally pass > 10

      expect(results).toHaveLength(25);
      expect(peakInFlight).toBeLessThanOrEqual(10);
      expect(peakInFlight).toBe(10);
    });
  });

  // =========================================================================
  // 6. Health Readiness Endpoint
  // =========================================================================
  describe('GET /api/health', () => {
    it('returns degraded status and all pending billing keys when environment is unconfigured', async () => {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      delete process.env.ENCRYPTION_KEY;
      delete process.env.TRACKING_SECRET;
      delete process.env.CRON_SECRET;
      delete process.env.SESSION_SECRET;
      delete process.env.OPENAI_API_KEY;
      delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
      delete process.env.MERCADOPAGO_ACCESS_TOKEN;
      delete process.env.STRIPE_SECRET_KEY;
      delete process.env.STRIPE_WEBHOOK_SECRET;
      delete process.env.LEMONSQUEEZY_API_KEY;

      const res = await getHealth(new NextRequest('http://localhost:3000/api/health'));
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.status).toBe('degraded');
      expect(body.checks).toEqual({
        supabaseConfigured: false,
        encryptionKeyConfigured: false,
        trackingSecretConfigured: false,
        cronSecretConfigured: false,
        sessionSecretConfigured: false,
        serviceRoleKeyConfigured: false,
        aiProviderConfigured: false,
        distributedRateLimitBackend: 'memory',
      });
      expect(body.pendingBillingKeys).toEqual([
        'MERCADOPAGO_ACCESS_TOKEN',
        'STRIPE_SECRET_KEY',
        'STRIPE_WEBHOOK_SECRET',
        'LEMONSQUEEZY_API_KEY',
      ]);
    });

    it('returns ok status when core secrets/DB are configured and never leaks raw secret values', async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://prod.supabase.co';
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-secret-val';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret-val';
      process.env.ENCRYPTION_KEY = 'prod-strong-encryption-key-32-chars';
      process.env.TRACKING_SECRET = 'prod-tracking-secret-val';
      process.env.CRON_SECRET = 'prod-cron-secret-val';
      process.env.SESSION_SECRET = 'prod-session-secret-val';
      process.env.OPENAI_API_KEY = 'sk-test-secret-openai';
      process.env.UPSTASH_REDIS_REST_URL = 'https://redis.upstash.io';
      process.env.UPSTASH_REDIS_REST_TOKEN = 'upstash-secret-token';
      process.env.STRIPE_SECRET_KEY = 'sk_live_secret_do_not_leak';
      delete process.env.MERCADOPAGO_ACCESS_TOKEN;
      delete process.env.STRIPE_WEBHOOK_SECRET;
      delete process.env.LEMONSQUEEZY_API_KEY;

      const res = await getHealth();
      const rawText = await res.text();
      const body = JSON.parse(rawText);

      expect(body.status).toBe('ok');
      expect(body.checks).toEqual({
        supabaseConfigured: true,
        encryptionKeyConfigured: true,
        trackingSecretConfigured: true,
        cronSecretConfigured: true,
        sessionSecretConfigured: true,
        serviceRoleKeyConfigured: true,
        aiProviderConfigured: true,
        distributedRateLimitBackend: 'upstash',
      });
      expect(body.pendingBillingKeys).toEqual([
        'MERCADOPAGO_ACCESS_TOKEN',
        'STRIPE_WEBHOOK_SECRET',
        'LEMONSQUEEZY_API_KEY',
      ]);

      // Ensure raw key values are never exposed
      expect(rawText).not.toContain('sk_live_secret_do_not_leak');
      expect(rawText).not.toContain('prod-strong-encryption-key-32-chars');
      expect(rawText).not.toContain('service-role-secret-val');
      expect(rawText).not.toContain('upstash-secret-token');
    });
  });
});
