import crypto from 'crypto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { IJsonStorageDriver } from '@/core/storage/JsonDriver';
import { LeadRepository } from '@/core/storage/LeadRepository';
import { ThreadRepository } from '@/core/storage/ThreadRepository';
import { DealRepository } from '@/core/storage/DealRepository';
import { BlocklistRepository } from '@/core/storage/BlocklistRepository';

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
    useSupabase: true,
    userProfiles: [] as Array<Record<string, unknown>>,
    auditLogs: [] as Array<Record<string, unknown>>,
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
    }

    if (tableName === 'audit_logs') {
      return {
        select: vi.fn(() => {
          const filters: Array<{ col: string; val: string }> = [];
          let limitCount = 100;
          const buildChain = () => {
            const execute = async () => {
              let rows = [...state.auditLogs];
              for (const f of filters) {
                rows = rows.filter((r) => r[f.col] === f.val);
              }
              rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
              return { data: rows.slice(0, limitCount), error: null };
            };
            interface MockAuditQueryChain {
              eq: ReturnType<typeof vi.fn>;
              order: ReturnType<typeof vi.fn>;
              limit: ReturnType<typeof vi.fn>;
              then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => Promise<void>;
            }
            const chain: MockAuditQueryChain = {
              eq: vi.fn((col: string, val: string) => {
                filters.push({ col, val });
                return chain;
              }),
              order: vi.fn(() => chain),
              limit: vi.fn((n: number) => {
                limitCount = n;
                return chain;
              }),
              then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
                execute().then(resolve, reject),
            };
            return chain;
          };
          return buildChain();
        }),
        insert: vi.fn(async (row: Record<string, unknown>) => {
          state.auditLogs.unshift({ ...row });
          return { error: null };
        }),
        upsert: vi.fn(async (row: Record<string, unknown>) => {
          const idx = state.auditLogs.findIndex((r) => r.id === row.id);
          if (idx >= 0) {
            state.auditLogs[idx] = { ...state.auditLogs[idx], ...row };
          } else {
            state.auditLogs.unshift({ ...row });
          }
          return { error: null };
        }),
      };
    }

    return {};
  });

  const supabaseMock = {
    get supabaseUrl() {
      return state.useSupabase ? 'https://mock-project.supabase.co' : 'https://placeholder.supabase.co';
    },
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
  SESSION_COOKIE_NAME,
  hashAccessCode,
  verifyAccessCode,
  createSessionToken,
  verifySessionToken,
} from '@/core/security/session';
import {
  isProductionEncryptionKeyConfigured,
  signWebhookPayload,
  verifyWebhookSignature,
} from '@/core/security/crypto';
import { recordAuditLog, listAuditLogs } from '@/core/security/auditLog';
import { GET as getTeam, POST as postTeam, PUT as putTeam } from '@/app/api/team/route';
import { GET as getSession, POST as postSession, DELETE as deleteSession } from '@/app/api/auth/session/route';
import { GET as getAuditLogs, POST as postAuditLogs } from '@/app/api/audit-logs/route';
import { POST as postGdprErase, DELETE as deleteGdprErase } from '@/app/api/leads/gdpr-erase/route';
import { proxy } from '@/proxy';

describe('Wave 1 Track 1: Session, Crypto, Proxy, Audit Logs & GDPR Compliance', () => {
  const originalEnv = { ...process.env };
  let driver: InMemoryJsonDriver;
  let leadRepo: LeadRepository;
  let threadRepo: ThreadRepository;
  let dealRepo: DealRepository;
  let blocklistRepo: BlocklistRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    mockState.useSupabase = true;
    mockState.userProfiles = [];
    mockState.auditLogs = [];
    (globalThis as unknown as { __misenderTeamStore?: unknown }).__misenderTeamStore = undefined;
    (globalThis as unknown as { __misenderAuditLogsStore?: unknown }).__misenderAuditLogsStore = undefined;

    delete process.env.SESSION_SECRET;
    delete process.env.ENCRYPTION_KEY;
    delete process.env.MISENDER_API_KEY;
    delete process.env.APP_API_KEY;
    delete process.env.ENFORCE_SESSION_AUTH;
    delete process.env.CRON_SECRET;

    driver = new InMemoryJsonDriver();
    leadRepo = new LeadRepository(driver);
    threadRepo = new ThreadRepository(driver);
    dealRepo = new DealRepository(driver);
    blocklistRepo = new BlocklistRepository(driver);

    mockContainer.leadRepo = leadRepo;
    mockContainer.threadRepo = threadRepo;
    mockContainer.dealRepo = dealRepo;
    mockContainer.blocklistRepo = blocklistRepo;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  describe('Session & Scrypt Utilities (src/core/security/session.ts)', () => {
    it('hashes access codes with scrypt:v1 and unique 16-byte random salts and verifies via timingSafeEqual', () => {
      const h1 = hashAccessCode('SuperSecret-2026!');
      const h2 = hashAccessCode('SuperSecret-2026!');

      expect(h1).toMatch(/^scrypt:v1:[0-9a-f]{32}:[0-9a-f]{128}$/);
      expect(h2).toMatch(/^scrypt:v1:[0-9a-f]{32}:[0-9a-f]{128}$/);
      expect(h1).not.toBe(h2);

      expect(verifyAccessCode('SuperSecret-2026!', h1)).toBe(true);
      expect(verifyAccessCode('SuperSecret-2026!', h2)).toBe(true);
      expect(verifyAccessCode('WrongPass!', h1)).toBe(false);
      expect(verifyAccessCode('', h1)).toBe(false);
      expect(verifyAccessCode('SuperSecret-2026!', 'scrypt:v1:invalid:hex')).toBe(false);
    });

    it('supports backward-compatible plaintext access codes for legacy unmigrated rows', () => {
      expect(verifyAccessCode('LegacyCode123', 'LegacyCode123')).toBe(true);
      expect(verifyAccessCode('WrongCode123', 'LegacyCode123')).toBe(false);
      expect(verifyAccessCode('Vectra2026!', null)).toBe(false);
    });

    it('creates and verifies HMAC-SHA256 session tokens and rejects tampered or expired tokens', () => {
      process.env.SESSION_SECRET = 'unit-test-session-secret-32-chars';
      const exp = Math.floor(Date.now() / 1000) + 3600;
      const token = createSessionToken({
        userId: 'usr-101',
        email: 'Operator@Agency.IO',
        role: 'campaign_manager',
        agencyId: 'ag-101',
        workspaceId: 'ws-a',
        allowedWorkspaceIds: ['ws-a', 'ws-b'],
        exp,
      });

      expect(SESSION_COOKIE_NAME).toBe('misender_session');
      expect(token.split('.')).toHaveLength(3);
      expect(token.startsWith('v1.')).toBe(true);

      const verified = verifySessionToken(token);
      expect(verified).toEqual({
        userId: 'usr-101',
        email: 'operator@agency.io',
        role: 'campaign_manager',
        agencyId: 'ag-101',
        workspaceId: 'ws-a',
        allowedWorkspaceIds: ['ws-a', 'ws-b'],
        exp,
      });

      // Tampered payload
      const parts = token.split('.');
      const forgedPayload = Buffer.from(
        JSON.stringify({ ...verified, role: 'super_admin' }),
        'utf8'
      ).toString('base64url');
      expect(verifySessionToken(`${parts[0]}.${forgedPayload}.${parts[2]}`)).toBeNull();

      // Tampered signature
      expect(verifySessionToken(`${parts[0]}.${parts[1]}.tampered_sig`)).toBeNull();

      // Expired token (seconds and ms)
      const expiredSecToken = createSessionToken({
        userId: 'usr-101',
        email: 'operator@agency.io',
        role: 'admin',
        workspaceId: 'ws-a',
        allowedWorkspaceIds: ['ws-a'],
        exp: Math.floor(Date.now() / 1000) - 10,
      });
      expect(verifySessionToken(expiredSecToken)).toBeNull();

      const expiredMsToken = createSessionToken({
        userId: 'usr-101',
        email: 'operator@agency.io',
        role: 'admin',
        workspaceId: 'ws-a',
        allowedWorkspaceIds: ['ws-a'],
        exp: Date.now() - 1000,
      });
      expect(verifySessionToken(expiredMsToken)).toBeNull();
    });
  });

  describe('Crypto Helpers (src/core/security/crypto.ts)', () => {
    it('detects production encryption key configuration and signs/verifies webhook payloads', () => {
      delete process.env.ENCRYPTION_KEY;
      expect(isProductionEncryptionKeyConfigured()).toBe(false);

      process.env.ENCRYPTION_KEY = 'misender-secret-key-must-be-changed-in-production-32b';
      expect(isProductionEncryptionKeyConfigured()).toBe(false);

      process.env.ENCRYPTION_KEY = 'custom-prod-encryption-key-2026-secure';
      expect(isProductionEncryptionKeyConfigured()).toBe(true);

      const body = JSON.stringify({ event: 'lead.interested', id: 'lead-1' });
      const sig = signWebhookPayload(body, 'whsec_test_123');
      expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/);
      expect(verifyWebhookSignature(body, sig, 'whsec_test_123')).toBe(true);
      expect(verifyWebhookSignature(`${body} `, sig, 'whsec_test_123')).toBe(false);
      expect(verifyWebhookSignature(body, sig, 'wrong_secret')).toBe(false);
      expect(verifyWebhookSignature(body, 'sha256=deadbeef', 'whsec_test_123')).toBe(false);
    });
  });

  describe('/api/team Access Code Hashing & Sanitization + /api/auth/session', () => {
    it('hashes accessCode on POST/PUT while returning creation code once on POST and stripping on GET/PUT', async () => {
      const postReq = new NextRequest('http://localhost:3000/api/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: 'ws-alpha',
          allowedWorkspaceIds: ['ws-beta'],
          agencyId: 'ag-alpha',
          fullName: 'Lucia Perez',
          email: 'lucia@alpha.io',
          roleId: 'campaign_manager',
          accessCode: 'AlphaCode-77',
        }),
      });
      const postRes = await postTeam(postReq);
      const created = await postRes.json();

      expect(postRes.status).toBe(201);
      expect(created.accessCode).toBe('AlphaCode-77');
      expect(created.hasAccessCode).toBe(true);

      // Stored hash in Supabase must be scrypt:v1, never plaintext
      const storedRow = mockState.userProfiles.find((r) => r.id === created.id);
      expect(storedRow).toBeDefined();
      expect(String(storedRow?.access_code)).toMatch(/^scrypt:v1:[0-9a-f]{32}:[0-9a-f]{128}$/);
      expect(verifyAccessCode('AlphaCode-77', String(storedRow?.access_code))).toBe(true);

      // GET never exposes accessCode
      const getRes = await getTeam(new NextRequest('http://localhost:3000/api/team?workspaceId=ws-alpha'));
      const members = await getRes.json();
      expect(members).toHaveLength(1);
      expect(members[0].accessCode).toBeUndefined();
      expect(members[0].hasAccessCode).toBe(true);

      // PUT updates accessCode with new hash and strips accessCode from response
      const putRes = await putTeam(
        new NextRequest('http://localhost:3000/api/team', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: created.id,
            accessCode: 'RotatedCode-88',
          }),
        })
      );
      const updated = await putRes.json();
      expect(putRes.status).toBe(200);
      expect(updated.accessCode).toBeUndefined();
      expect(updated.hasAccessCode).toBe(true);

      const rotatedRow = mockState.userProfiles.find((r) => r.id === created.id);
      expect(String(rotatedRow?.access_code)).toMatch(/^scrypt:v1:/);
      expect(verifyAccessCode('RotatedCode-88', String(rotatedRow?.access_code))).toBe(true);
      expect(verifyAccessCode('AlphaCode-77', String(rotatedRow?.access_code))).toBe(false);
    });

    it('authenticates founder default and scrypt team users via POST /api/auth/session, checks GET, and clears on DELETE', async () => {
      // 1. Founder login with fallback default 'Vectra2026!'
      const loginFounderRes = await postSession(
        new NextRequest('http://localhost:3000/api/auth/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '203.0.113.10' },
          body: JSON.stringify({
            email: 'marcos@vectrasystems.com.ar',
            password: 'Vectra2026!',
          }),
        })
      );
      const founderData = await loginFounderRes.json();
      expect(loginFounderRes.status).toBe(200);
      expect(founderData.authenticated).toBe(true);
      expect(founderData.user.email).toBe('marcos@vectrasystems.com.ar');
      expect(founderData.user.role).toBe('super_admin');
      expect(founderData.user.accessCode).toBeUndefined();

      const setCookieHeader = loginFounderRes.headers.get('set-cookie') || '';
      expect(setCookieHeader).toContain(`${SESSION_COOKIE_NAME}=v1.`);
      expect(setCookieHeader.toLowerCase()).toContain('httponly');
      expect(setCookieHeader.toLowerCase()).toContain('samesite=lax');

      const cookieValue = loginFounderRes.cookies.get(SESSION_COOKIE_NAME)?.value;
      expect(cookieValue).toBeTruthy();

      // Audit log recorded 'auth.login'
      expect(mockState.auditLogs.some((l) => l.action === 'auth.login')).toBe(true);

      // 2. GET /api/auth/session with valid cookie
      const getValidRes = await getSession(
        new NextRequest('http://localhost:3000/api/auth/session', {
          headers: { cookie: `${SESSION_COOKIE_NAME}=${cookieValue}` },
        })
      );
      const getValidData = await getValidRes.json();
      expect(getValidData.authenticated).toBe(true);
      expect(getValidData.session.userId).toBe('admin-default');

      // 3. GET /api/auth/session with tampered cookie
      const getBadRes = await getSession(
        new NextRequest('http://localhost:3000/api/auth/session', {
          headers: { cookie: `${SESSION_COOKIE_NAME}=v1.tampered.sig` },
        })
      );
      expect(await getBadRes.json()).toEqual({ authenticated: false, session: null });

      // 4. Invalid password rejected with 401
      const badPassRes = await postSession(
        new NextRequest('http://localhost:3000/api/auth/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'marcos@vectrasystems.com.ar',
            password: 'WrongPassword!',
          }),
        })
      );
      expect(badPassRes.status).toBe(401);

      // 5. Team user created with scrypt accessCode logs in cleanly
      await postTeam(
        new NextRequest('http://localhost:3000/api/team', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspaceId: 'ws-client-7',
            fullName: 'Sdr Member',
            email: 'sdr@client7.io',
            roleId: 'campaign_manager',
            accessCode: 'Client7Pass!',
          }),
        })
      );

      const sdrLoginRes = await postSession(
        new NextRequest('http://localhost:3000/api/auth/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'sdr@client7.io',
            accessCode: 'Client7Pass!',
          }),
        })
      );
      expect(sdrLoginRes.status).toBe(200);
      const sdrBody = await sdrLoginRes.json();
      expect(sdrBody.user.workspaceId).toBe('ws-client-7');
      expect(sdrBody.user.accessCode).toBeUndefined();

      // 6. DELETE /api/auth/session clears cookie
      const logoutRes = await deleteSession(
        new NextRequest('http://localhost:3000/api/auth/session', {
          method: 'DELETE',
          headers: { cookie: `${SESSION_COOKIE_NAME}=${cookieValue}` },
        })
      );
      expect(logoutRes.status).toBe(200);
      const clearedCookie = logoutRes.cookies.get(SESSION_COOKIE_NAME);
      expect(clearedCookie?.value).toBe('');
      expect(clearedCookie?.maxAge).toBe(0);
    });
  });

  describe('src/proxy.ts Session, Workspace Enforcement & Backward Compatibility', () => {
    it('allows public routes even when ENFORCE_SESSION_AUTH is true', () => {
      process.env.ENFORCE_SESSION_AUTH = 'true';
      for (const path of [
        '/api/track/open?leadId=1',
        '/api/auth/session',
        '/api/billing/webhook',
        '/api/health',
      ]) {
        const res = proxy(new NextRequest(`http://localhost:3000${path}`));
        expect(res.status).toBe(200);
      }
    });

    it('preserves compatibility when unconfigured (no cookie, no API key, no ENFORCE_SESSION_AUTH)', () => {
      const res = proxy(new NextRequest('http://localhost:3000/api/leads'));
      expect(res.status).toBe(200);
    });

    it('rejects tampered or expired misender_session cookies with 401', () => {
      const tampered = proxy(
        new NextRequest('http://localhost:3000/api/leads', {
          headers: { cookie: `${SESSION_COOKIE_NAME}=v1.bad.sig` },
        })
      );
      expect(tampered.status).toBe(401);

      const expiredToken = createSessionToken({
        userId: 'u-1',
        email: 'u@x.io',
        role: 'admin',
        workspaceId: 'ws-1',
        allowedWorkspaceIds: ['ws-1'],
        exp: Math.floor(Date.now() / 1000) - 5,
      });
      const expired = proxy(
        new NextRequest('http://localhost:3000/api/leads', {
          headers: { cookie: `${SESSION_COOKIE_NAME}=${expiredToken}` },
        })
      );
      expect(expired.status).toBe(401);
    });

    it('enforces allowedWorkspaceIds (403) for non-super_admin and bypasses workspace lock for super_admin', () => {
      const adminToken = createSessionToken({
        userId: 'u-admin',
        email: 'admin@agency.io',
        role: 'admin',
        workspaceId: 'ws-1',
        allowedWorkspaceIds: ['ws-1', 'ws-2'],
        exp: Math.floor(Date.now() / 1000) + 600,
      });

      const okQuery = proxy(
        new NextRequest('http://localhost:3000/api/leads?workspaceId=ws-2', {
          headers: { cookie: `${SESSION_COOKIE_NAME}=${adminToken}` },
        })
      );
      expect(okQuery.status).toBe(200);

      const forbiddenQuery = proxy(
        new NextRequest('http://localhost:3000/api/leads?workspaceId=ws-forbidden', {
          headers: { cookie: `${SESSION_COOKIE_NAME}=${adminToken}` },
        })
      );
      expect(forbiddenQuery.status).toBe(403);

      const forbiddenHeader = proxy(
        new NextRequest('http://localhost:3000/api/leads', {
          headers: {
            cookie: `${SESSION_COOKIE_NAME}=${adminToken}`,
            'x-workspace-id': 'ws-forbidden',
          },
        })
      );
      expect(forbiddenHeader.status).toBe(403);

      const superToken = createSessionToken({
        userId: 'admin-default',
        email: 'marcos@vectrasystems.com.ar',
        role: 'super_admin',
        workspaceId: 'ws-founder',
        allowedWorkspaceIds: ['ws-founder'],
        exp: Math.floor(Date.now() / 1000) + 600,
      });
      const superAllowed = proxy(
        new NextRequest('http://localhost:3000/api/leads?workspaceId=ws-any', {
          headers: { cookie: `${SESSION_COOKIE_NAME}=${superToken}` },
        })
      );
      expect(superAllowed.status).toBe(200);
    });

    it('enforces ENFORCE_SESSION_AUTH=true with 401 unless valid session cookie or MISENDER_API_KEY is supplied', () => {
      process.env.ENFORCE_SESSION_AUTH = 'true';
      process.env.MISENDER_API_KEY = 'secret-api-key-99';

      const unauth = proxy(new NextRequest('http://localhost:3000/api/campaigns'));
      expect(unauth.status).toBe(401);

      const wrongKey = proxy(
        new NextRequest('http://localhost:3000/api/campaigns', {
          headers: { 'x-api-key': 'wrong-key' },
        })
      );
      expect(wrongKey.status).toBe(403);

      const validKey = proxy(
        new NextRequest('http://localhost:3000/api/campaigns', {
          headers: { 'x-api-key': 'secret-api-key-99' },
        })
      );
      expect(validKey.status).toBe(200);

      const validToken = createSessionToken({
        userId: 'u-2',
        email: 'u2@agency.io',
        role: 'viewer',
        workspaceId: 'ws-1',
        allowedWorkspaceIds: ['ws-1'],
        exp: Math.floor(Date.now() / 1000) + 600,
      });
      const validCookieReq = proxy(
        new NextRequest('http://localhost:3000/api/campaigns?workspaceId=ws-1', {
          headers: { cookie: `${SESSION_COOKIE_NAME}=${validToken}` },
        })
      );
      expect(validCookieReq.status).toBe(200);
    });
  });

  describe('Audit Logs & GDPR Erase (/api/audit-logs & /api/leads/gdpr-erase)', () => {
    it('records and queries workspace-scoped audit logs across Supabase and globalThis fallback', async () => {
      const post1 = await postAuditLogs(
        new NextRequest('http://localhost:3000/api/audit-logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspaceId: 'ws-1',
            actorEmail: 'admin@ws1.io',
            action: 'campaign.launched',
            resourceType: 'campaign',
            resourceId: 'camp-1',
          }),
        })
      );
      expect(post1.status).toBe(201);

      await recordAuditLog({
        workspaceId: 'ws-2',
        actorEmail: 'admin@ws2.io',
        action: 'deal.created',
      });

      const ws1Res = await getAuditLogs(
        new NextRequest('http://localhost:3000/api/audit-logs?workspaceId=ws-1')
      );
      const ws1Data = await ws1Res.json();
      expect(ws1Res.status).toBe(200);
      expect(ws1Data.logs).toHaveLength(1);
      expect(ws1Data.logs[0].action).toBe('campaign.launched');

      // Fallback mode without Supabase configured
      mockState.useSupabase = false;
      const fallbackLogs = await listAuditLogs({ workspaceId: 'ws-2' });
      expect(fallbackLogs).toHaveLength(1);
      expect(fallbackLogs[0].action).toBe('deal.created');
    });

    it('erases lead PII across leads, threads, deals in target workspace, stores SHA-256 blocklist hash, and logs gdpr.erase', async () => {
      const targetEmail = 'gdpr.subject@acme.io';
      const expectedHash = `sha256:${crypto.createHash('sha256').update(targetEmail).digest('hex')}`;

      leadRepo.saveLeads([
        {
          id: 'lead-ws1',
          workspaceId: 'ws-1',
          campaignId: 'camp-1',
          email: targetEmail,
          firstName: 'Ana',
          lastName: 'PII',
          companyName: 'Acme',
          status: 'replied',
          currentStep: 1,
        },
        {
          id: 'lead-ws2',
          workspaceId: 'ws-2',
          campaignId: 'camp-2',
          email: targetEmail,
          firstName: 'Ana',
          lastName: 'OtherWorkspace',
          companyName: 'Acme',
          status: 'pending',
          currentStep: 1,
        },
      ]);

      await threadRepo.saveThreads([
        {
          id: 'th-ws1',
          workspaceId: 'ws-1',
          campaignId: 'camp-1',
          leadId: 'lead-ws1',
          leadName: 'Ana PII',
          leadEmail: targetEmail,
          companyName: 'Acme',
          sentiment: 'interested',
          unread: false,
          lastMessageSnippet: 'Hi',
          lastActivityAt: '2026-11-20T00:00:00.000Z',
          senderAccountId: 'acc-1',
          messages: [],
        },
        {
          id: 'th-ws2',
          workspaceId: 'ws-2',
          campaignId: 'camp-2',
          leadId: 'lead-ws2',
          leadName: 'Ana Other',
          leadEmail: targetEmail,
          companyName: 'Acme',
          sentiment: 'not-interested',
          unread: false,
          lastMessageSnippet: 'Hi',
          lastActivityAt: '2026-11-20T00:00:00.000Z',
          senderAccountId: 'acc-2',
          messages: [],
        },
      ]);

      await dealRepo.saveDeal({
        id: 'deal-ws1',
        workspaceId: 'ws-1',
        leadId: 'lead-ws1',
        contactName: 'Ana PII',
        contactEmail: targetEmail,
        companyName: 'Acme',
        title: 'Acme Deal',
        stage: 'positive',
        value: 5000,
        daysInactive: 0,
        createdAt: '2026-11-20T00:00:00.000Z',
      });
      await dealRepo.saveDeal({
        id: 'deal-ws2',
        workspaceId: 'ws-2',
        leadId: 'lead-ws2',
        contactName: 'Ana Other',
        contactEmail: targetEmail,
        companyName: 'Acme',
        title: 'Other Deal',
        stage: 'positive',
        value: 3000,
        daysInactive: 0,
        createdAt: '2026-11-20T00:00:00.000Z',
      });

      const eraseRes = await postGdprErase(
        new NextRequest('http://localhost:3000/api/leads/gdpr-erase', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: targetEmail,
            workspaceId: 'ws-1',
          }),
        })
      );
      const eraseData = await eraseRes.json();

      expect(eraseRes.status).toBe(200);
      expect(eraseData.success).toBe(true);
      expect(eraseData.blocklistHash).toBe(expectedHash);
      expect(eraseData.erased).toEqual({ leads: 1, threads: 1, deals: 1 });

      // Target workspace ws-1 has zero PII remaining
      expect(leadRepo.getLeads(undefined, 'ws-1')).toHaveLength(0);
      expect(await threadRepo.getThreads('ws-1')).toHaveLength(0);
      expect(await dealRepo.getDeals('ws-1')).toHaveLength(0);

      // Isolated workspace ws-2 remains untouched
      expect(leadRepo.getLeads(undefined, 'ws-2')).toHaveLength(1);
      expect(await threadRepo.getThreads('ws-2')).toHaveLength(1);
      expect(await dealRepo.getDeals('ws-2')).toHaveLength(1);

      // Blocklist contains only SHA-256 hash, never plaintext email
      const blocklist = await blocklistRepo.getBlocklist();
      expect(blocklist.some((b) => b.value === expectedHash && b.workspaceId === 'ws-1')).toBe(true);
      expect(blocklist.some((b) => b.value === targetEmail)).toBe(false);

      // Audit log contains 'gdpr.erase' without plaintext email PII
      const gdprLogs = mockState.auditLogs.filter((l) => l.action === 'gdpr.erase');
      expect(gdprLogs).toHaveLength(1);
      expect(JSON.stringify(gdprLogs[0])).not.toContain(targetEmail);

      // DELETE endpoint validates missing inputs with 400 and works cleanly by leadId
      const badDelRes = await deleteGdprErase(
        new NextRequest('http://localhost:3000/api/leads/gdpr-erase', { method: 'DELETE' })
      );
      expect(badDelRes.status).toBe(400);

      const delByIdRes = await deleteGdprErase(
        new NextRequest('http://localhost:3000/api/leads/gdpr-erase?leadId=lead-ws2&workspaceId=ws-2', {
          method: 'DELETE',
        })
      );
      const delByIdData = await delByIdRes.json();
      expect(delByIdRes.status).toBe(200);
      expect(delByIdData.erased).toEqual({ leads: 1, threads: 1, deals: 1 });
    });
  });
});
