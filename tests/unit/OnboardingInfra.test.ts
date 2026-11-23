import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { IJsonStorageDriver } from '@/core/storage/JsonDriver';
import { AccountRepository } from '@/core/storage/AccountRepository';
import { decryptCredential } from '@/core/security/crypto';
import type { DnsAuditResult } from '@/types';
import {
  DnsWizardService,
  EspProvider,
  SUPPORTED_ESP_PROVIDERS,
} from '@/core/services/DnsWizardService';
import type { DnsCheckerService } from '@/core/services/DnsCheckerService';

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

const { mockState, mockContainer } = vi.hoisted(() => {
  const state = {
    auditResultFactory: null as ((domain: string, selector?: string) => DnsAuditResult) | null,
  };
  const containerProxy: Record<string, unknown> = {};
  return { mockState: state, mockContainer: containerProxy };
});

vi.mock('@/core/container', () => ({
  container: mockContainer,
}));

import { GET as getDnsWizard, POST as postDnsWizard } from '@/app/api/accounts/dns-wizard/route';
import { GET as getBulkImport, POST as postBulkImport } from '@/app/api/accounts/bulk-import/route';

function makeEmptyAudit(domain: string): DnsAuditResult {
  return {
    domain,
    spf: { valid: false, details: 'No SPF found' },
    dmarc: { valid: false, details: 'No DMARC found' },
    dkim: { valid: false, details: 'No DKIM found' },
    mx: { valid: false, records: [], details: 'No MX found' },
    ctd: { valid: false, details: 'No CTD found' },
    overallHealth: 0,
  };
}

function makeHealthyAudit(
  domain: string,
  overrides: Partial<DnsAuditResult> = {}
): DnsAuditResult {
  return {
    domain,
    spf: {
      valid: true,
      record: 'v=spf1 include:_spf.google.com ~all',
      details: 'SPF valid',
    },
    dmarc: {
      valid: true,
      record: 'v=DMARC1; p=quarantine; pct=100',
      details: 'DMARC valid',
    },
    dkim: {
      valid: true,
      selector: 'google',
      details: 'DKIM valid',
    },
    mx: {
      valid: true,
      records: ['aspmx.l.google.com (Pri: 1)'],
      details: '1 MX detected',
    },
    ctd: {
      valid: true,
      details: `Custom Tracking Domain activo en track.${domain} -> prox.instantly.ai`,
    },
    overallHealth: 100,
    ...overrides,
  };
}

describe('Onboarding Infra (DNS Wizard, Cloudflare 1-Click, Bulk Importer)', () => {
  let accountRepo: AccountRepository;
  let auditDomainSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const driver = new InMemoryJsonDriver();
    accountRepo = new AccountRepository(driver);
    mockState.auditResultFactory = (domain) => makeEmptyAudit(domain);

    auditDomainSpy = vi.fn(async (domain: string, selector?: string) => {
      return mockState.auditResultFactory
        ? mockState.auditResultFactory(domain, selector)
        : makeEmptyAudit(domain);
    });

    mockContainer.accountRepo = accountRepo;
    mockContainer.dnsChecker = {
      auditDomain: auditDomainSpy,
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('DnsWizardService.generateDnsBlueprint', () => {
    it('supports all 7 ESP presets and generates SPF, DKIM, DMARC, and CNAME tracking records with ES/EN registrar guides', async () => {
      const mockChecker = {
        auditDomain: vi.fn(async (domain: string) => makeEmptyAudit(domain)),
      } as unknown as DnsCheckerService;

      const wizard = new DnsWizardService(mockChecker);

      const expectedSpfFragments: Record<EspProvider, string> = {
        google_workspace: 'include:_spf.google.com',
        microsoft_365: 'include:spf.protection.outlook.com',
        zoho: 'include:zoho.com',
        resend: 'include:amazonses.com',
        amazon_ses: 'include:amazonses.com',
        mailgun: 'include:mailgun.org',
        custom: 'v=spf1 a mx ~all',
      };

      for (const provider of SUPPORTED_ESP_PROVIDERS) {
        const blueprint = await wizard.generateDnsBlueprint('https://Acme.io/path', provider);
        expect(blueprint.domain).toBe('acme.io');
        expect(blueprint.provider).toBe(provider);
        expect(blueprint.records).toHaveLength(4);

        const spf = blueprint.records.find((r) => r.category === 'SPF');
        const dkim = blueprint.records.find((r) => r.category === 'DKIM');
        const dmarc = blueprint.records.find((r) => r.category === 'DMARC');
        const ctd = blueprint.records.find((r) => r.category === 'CNAME');

        expect(spf?.host).toBe('@');
        expect(spf?.type).toBe('TXT');
        expect(spf?.value).toContain(expectedSpfFragments[provider]);
        expect(spf?.ttl).toBe(3600);
        expect(spf?.status).toBe('missing');

        expect(dkim?.host).toContain('._domainkey');
        expect(dkim?.status).toBe('missing');

        expect(dmarc?.host).toBe('_dmarc');
        expect(dmarc?.type).toBe('TXT');
        expect(dmarc?.value).toContain('v=DMARC1; p=quarantine');
        expect(dmarc?.status).toBe('missing');

        expect(ctd?.host).toBe('track');
        expect(ctd?.type).toBe('CNAME');
        expect(ctd?.value).toBe('prox.instantly.ai');
        expect(ctd?.status).toBe('missing');

        const registrarIds = blueprint.registrarGuides.map((g) => g.id);
        expect(registrarIds).toEqual(['cloudflare', 'godaddy', 'namecheap', 'nic_ar']);
        for (const guide of blueprint.registrarGuides) {
          expect(guide.steps.es.length).toBeGreaterThanOrEqual(4);
          expect(guide.steps.en.length).toBeGreaterThanOrEqual(4);
          expect(guide.importantNotes.es.length).toBeGreaterThan(10);
          expect(guide.importantNotes.en.length).toBeGreaterThan(10);
        }
      }
    });

    it('detects valid vs needs_update statuses based on live audit and custom options', async () => {
      const mockChecker = {
        auditDomain: vi.fn(async (domain: string) =>
          makeHealthyAudit(domain, {
            spf: {
              valid: true,
              record: 'v=spf1 include:mailgun.org ~all', // wrong ESP for google_workspace
              details: 'SPF present',
            },
            dmarc: {
              valid: true,
              record: 'v=DMARC1; p=none', // policy weaker than requested reject
              details: 'DMARC monitor mode',
            },
            dkim: {
              valid: true,
              selector: 'customsel',
              details: 'DKIM active',
            },
          })
        ),
      } as unknown as DnsCheckerService;

      const wizard = new DnsWizardService(mockChecker);
      const blueprint = await wizard.generateDnsBlueprint('outreach.com.ar', 'google_workspace', {
        dkimSelector: 'customsel',
        trackingSubdomain: 'go.outreach.com.ar',
        dmarcPolicy: 'reject',
        dmarcReportEmail: 'dmarc-reports@outreach.com.ar',
      });

      const spf = blueprint.records.find((r) => r.category === 'SPF');
      const dkim = blueprint.records.find((r) => r.category === 'DKIM');
      const dmarc = blueprint.records.find((r) => r.category === 'DMARC');
      const ctd = blueprint.records.find((r) => r.category === 'CNAME');

      expect(spf?.status).toBe('needs_update');
      expect(dkim?.status).toBe('valid');
      expect(dkim?.host).toBe('customsel._domainkey');
      expect(dmarc?.status).toBe('needs_update');
      expect(dmarc?.value).toBe(
        'v=DMARC1; p=reject; rua=mailto:dmarc-reports@outreach.com.ar; pct=100'
      );
      expect(ctd?.host).toBe('go');
      expect(ctd?.fqdn).toBe('go.outreach.com.ar');
      expect(ctd?.status).toBe('needs_update');
    });

    it('marks all records valid when domain audit matches provider configuration', async () => {
      const mockChecker = {
        auditDomain: vi.fn(async (domain: string) => makeHealthyAudit(domain)),
      } as unknown as DnsCheckerService;

      const wizard = new DnsWizardService(mockChecker);
      const blueprint = await wizard.generateDnsBlueprint('ready.io', 'google_workspace');

      expect(blueprint.records.every((r) => r.status === 'valid')).toBe(true);
      expect(blueprint.summary).toEqual({
        total: 4,
        valid: 4,
        missing: 0,
        needsUpdate: 0,
        readyToSend: true,
      });
    });
  });

  describe('DnsWizardService.provisionCloudflareDns', () => {
    it('lists existing records and creates missing SPF, DMARC, and tracking CNAME records via Cloudflare v4', async () => {
      const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === 'GET') {
          return new Response(
            JSON.stringify({
              success: true,
              errors: [],
              result: [],
            }),
            { status: 200 }
          );
        }

        const payload = JSON.parse(String(init?.body || '{}')) as {
          type: string;
          name: string;
          content: string;
          proxied?: boolean;
        };

        return new Response(
          JSON.stringify({
            success: true,
            errors: [],
            result: {
              id: `cf-rec-${payload.type.toLowerCase()}`,
              ...payload,
            },
          }),
          { status: 200 }
        );
      });

      vi.stubGlobal('fetch', fetchMock);

      const wizard = new DnsWizardService();
      const result = await wizard.provisionCloudflareDns({
        domain: 'ventas.com.ar',
        provider: 'google_workspace',
        cloudflareApiToken: 'cf-secret-token',
        cloudflareZoneId: 'zone123abc',
        trackingSubdomain: 'click',
      });

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.skipped).toHaveLength(0);
      expect(result.provisioned).toHaveLength(3);

      expect(fetchMock).toHaveBeenCalledTimes(4);
      expect(fetchMock.mock.calls[0][0]).toBe(
        'https://api.cloudflare.com/client/v4/zones/zone123abc/dns_records'
      );
      expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({
        Authorization: 'Bearer cf-secret-token',
      });

      const createdCname = result.provisioned.find((r) => r.category === 'CNAME');
      expect(createdCname).toMatchObject({
        fqdn: 'click.ventas.com.ar',
        value: 'prox.instantly.ai',
        proxied: false,
      });
    });

    it('safely skips duplicate SPF, DMARC, and tracking CNAME records already in Cloudflare', async () => {
      const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === 'GET') {
          return new Response(
            JSON.stringify({
              success: true,
              errors: [],
              result: [
                {
                  id: 'existing-spf',
                  type: 'TXT',
                  name: 'acme.io',
                  content: '"v=spf1 include:_spf.google.com ~all"',
                },
                {
                  id: 'existing-dmarc',
                  type: 'TXT',
                  name: '_dmarc.acme.io',
                  content: 'v=DMARC1; p=none',
                },
                {
                  id: 'existing-ctd',
                  type: 'CNAME',
                  name: 'track.acme.io',
                  content: 'prox.instantly.ai',
                },
              ],
            }),
            { status: 200 }
          );
        }

        throw new Error('POST should not be called when all records already exist');
      });

      vi.stubGlobal('fetch', fetchMock);

      const wizard = new DnsWizardService();
      const result = await wizard.provisionCloudflareDns({
        domain: 'acme.io',
        provider: 'google_workspace',
        cloudflareApiToken: 'cf-token',
        cloudflareZoneId: 'zone999',
      });

      expect(result.success).toBe(true);
      expect(result.provisioned).toHaveLength(0);
      expect(result.skipped).toHaveLength(3);
      expect(result.errors).toHaveLength(0);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('records partial POST errors while continuing remaining records', async () => {
      let postCount = 0;
      const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === 'GET') {
          return new Response(
            JSON.stringify({
              success: true,
              errors: [],
              result: [
                {
                  id: 'existing-spf',
                  type: 'TXT',
                  name: 'acme.io',
                  content: 'v=spf1 include:mailgun.org ~all', // existing different SPF -> skip safely
                },
              ],
            }),
            { status: 200 }
          );
        }

        postCount++;
        if (postCount === 1) {
          return new Response(
            JSON.stringify({
              success: false,
              errors: [{ code: 81057, message: 'Record already exists' }],
            }),
            { status: 400 }
          );
        }

        return new Response(
          JSON.stringify({
            success: true,
            errors: [],
            result: { id: 'cf-cname-1' },
          }),
          { status: 200 }
        );
      });

      vi.stubGlobal('fetch', fetchMock);

      const wizard = new DnsWizardService();
      const result = await wizard.provisionCloudflareDns({
        domain: 'acme.io',
        provider: 'google_workspace',
        cloudflareApiToken: 'cf-token',
        cloudflareZoneId: 'zone999',
      });

      expect(result.success).toBe(false);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].category).toBe('SPF');
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].category).toBe('DMARC');
      expect(result.provisioned).toHaveLength(1);
      expect(result.provisioned[0].category).toBe('CNAME');
    });
  });

  describe('/api/accounts/dns-wizard route', () => {
    it('GET returns DNS audit, blueprint records, and registrar guides', async () => {
      mockState.auditResultFactory = (domain) => makeHealthyAudit(domain);

      const req = new NextRequest(
        'http://localhost:3000/api/accounts/dns-wizard?domain=cliente.com.ar&provider=google_workspace'
      );
      const res = await getDnsWizard(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.domain).toBe('cliente.com.ar');
      expect(data.provider).toBe('google_workspace');
      expect(data.audit.overallHealth).toBe(100);
      expect(data.records).toHaveLength(4);
      expect(data.registrarGuides.map((g: { id: string }) => g.id)).toContain('nic_ar');
    });

    it('GET validates required domain and supported provider', async () => {
      const missingDomainRes = await getDnsWizard(
        new NextRequest('http://localhost:3000/api/accounts/dns-wizard')
      );
      expect(missingDomainRes.status).toBe(400);

      const badProviderRes = await getDnsWizard(
        new NextRequest('http://localhost:3000/api/accounts/dns-wizard?domain=a.com&provider=unknown')
      );
      expect(badProviderRes.status).toBe(400);
    });

    it('POST handles preview and provision_cloudflare actions', async () => {
      const previewRes = await postDnsWizard(
        new NextRequest('http://localhost:3000/api/accounts/dns-wizard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            domain: 'outbound.io',
            provider: 'resend',
            action: 'preview',
          }),
        })
      );
      const previewData = await previewRes.json();
      expect(previewRes.status).toBe(200);
      expect(previewData.action).toBe('preview');
      expect(previewData.provider).toBe('resend');
      expect(previewData.records).toHaveLength(4);

      const missingCredsRes = await postDnsWizard(
        new NextRequest('http://localhost:3000/api/accounts/dns-wizard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            domain: 'outbound.io',
            provider: 'resend',
            action: 'provision_cloudflare',
          }),
        })
      );
      expect(missingCredsRes.status).toBe(400);

      const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === 'GET') {
          return new Response(JSON.stringify({ success: true, result: [] }), { status: 200 });
        }
        return new Response(
          JSON.stringify({ success: true, result: { id: 'cf-new-id' } }),
          { status: 200 }
        );
      });
      vi.stubGlobal('fetch', fetchMock);

      const provisionRes = await postDnsWizard(
        new NextRequest('http://localhost:3000/api/accounts/dns-wizard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            domain: 'outbound.io',
            provider: 'resend',
            action: 'provision_cloudflare',
            cloudflareApiToken: 'token-123',
            cloudflareZoneId: 'zone-abc',
          }),
        })
      );
      const provisionData = await provisionRes.json();
      expect(provisionRes.status).toBe(200);
      expect(provisionData.action).toBe('provision_cloudflare');
      expect(provisionData.provisioned).toHaveLength(3);
    });

    it('POST returns 502 when Cloudflare API rejects token on initial zone lookup', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          new Response(
            JSON.stringify({
              success: false,
              errors: [{ code: 10000, message: 'Authentication error' }],
            }),
            { status: 401 }
          )
        )
      );

      const res = await postDnsWizard(
        new NextRequest('http://localhost:3000/api/accounts/dns-wizard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            domain: 'outbound.io',
            provider: 'google_workspace',
            action: 'provision_cloudflare',
            cloudflareApiToken: 'bad-token',
            cloudflareZoneId: 'zone-abc',
          }),
        })
      );

      expect(res.status).toBe(502);
      const data = await res.json();
      expect(data.error).toContain('Authentication error');
    });
  });

  describe('/api/accounts/bulk-import route', () => {
    it('GET returns SMTP/IMAP presets for all 7 providers with TLS and auth hints', async () => {
      const res = await getBulkImport();
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.providers).toHaveLength(7);
      expect(Object.keys(data.presetsByProvider).sort()).toEqual([
        'amazon_ses',
        'google_workspace',
        'mailgun',
        'microsoft_365',
        'postmark',
        'resend',
        'zoho',
      ]);

      expect(data.presetsByProvider.google_workspace).toMatchObject({
        smtpHost: 'smtp.gmail.com',
        smtpPort: 587,
        imapHost: 'imap.gmail.com',
        imapPort: 993,
      });
      expect(data.presetsByProvider.microsoft_365.smtpHost).toBe('smtp.office365.com');
      expect(data.presetsByProvider.zoho.smtpHost).toBe('smtp.zoho.com');
      expect(data.presetsByProvider.amazon_ses.smtpHost).toContain('amazonaws.com');
      expect(data.presetsByProvider.resend.smtpHost).toBe('smtp.resend.com');
      expect(data.presetsByProvider.postmark.smtpHost).toBe('smtp.postmarkapp.com');
      expect(data.presetsByProvider.mailgun.smtpHost).toBe('smtp.mailgun.org');

      for (const preset of data.providers) {
        expect(preset.tlsNotes).toBeTruthy();
        expect(preset.authHint).toBeTruthy();
      }
    });

    it('POST imports CSV mailboxes, infers SMTP presets, encrypts smtpPass, masks response, and audits each unique domain once', async () => {
      mockState.auditResultFactory = (domain) =>
        domain === 'gmail.com'
          ? makeHealthyAudit(domain, { overallHealth: 90 })
          : makeHealthyAudit(domain, { overallHealth: 75 });

      const csvText = [
        'email,name,smtpPass,smtpHost,smtpPort,dailyLimit',
        'ana@gmail.com,"Ana, Sales",app-pass-1,,,60',
        'luis@gmail.com,Luis SDR,app-pass-2,,,45',
        'sofia@outlook.com,Sofia MS,ms-pass-3,,,40',
        'carlos@zoho.com,Carlos Zoho,zoho-pass-4,,,35',
        'bad-email,Invalid Row,secret,,,50',
        'ana@gmail.com,Duplicate In Batch,dup-pass,,,50',
      ].join('\n');

      const res = await postBulkImport(
        new NextRequest('http://localhost:3000/api/accounts/bulk-import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspaceId: 'ws-onboarding',
            csvText,
          }),
        })
      );

      const data = await res.json();
      expect(res.status).toBe(201);
      expect(data.importedCount).toBe(4);
      expect(data.skippedCount).toBe(2);
      expect(data.errors).toHaveLength(2);
      expect(data.accounts).toHaveLength(4);

      // Response passwords MUST be masked, never plaintext or ciphertext
      for (const acc of data.accounts) {
        expect(acc.smtpPass).toBe('••••••••');
        expect(acc.workspaceId).toBe('ws-onboarding');
      }

      // Auto-filled hosts/ports from domain inference
      expect(data.accounts[0]).toMatchObject({
        email: 'ana@gmail.com',
        name: 'Ana, Sales',
        provider: 'google',
        smtpHost: 'smtp.gmail.com',
        smtpPort: 587,
        dailyLimit: 60,
        healthScore: 90,
      });
      expect(data.accounts[2]).toMatchObject({
        email: 'sofia@outlook.com',
        provider: 'microsoft',
        smtpHost: 'smtp.office365.com',
        smtpPort: 587,
        healthScore: 75,
      });
      expect(data.accounts[3]).toMatchObject({
        email: 'carlos@zoho.com',
        provider: 'smtp',
        smtpHost: 'smtp.zoho.com',
        smtpPort: 465,
        healthScore: 75,
      });

      // DNS audit ran ONCE per unique valid domain (gmail.com, outlook.com, zoho.com = 3 calls, NOT 4)
      expect(auditDomainSpy).toHaveBeenCalledTimes(3);

      // Verify stored credentials in repository are AES-256-GCM encrypted and decryptable
      const stored = accountRepo.getAccounts('ws-onboarding');
      expect(stored).toHaveLength(4);
      expect(stored[0].smtpPass).toMatch(/^enc:v1:[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/);
      expect(decryptCredential(stored[0].smtpPass)).toBe('app-pass-1');
      expect(decryptCredential(stored[2].smtpPass)).toBe('ms-pass-3');
      expect(decryptCredential(stored[3].smtpPass)).toBe('zoho-pass-4');
    });

    it('POST imports JSON array with explicit provider preset, skips existing workspace duplicates, and respects runDnsAudit=false', async () => {
      // Seed an existing account in ws-json
      await postBulkImport(
        new NextRequest('http://localhost:3000/api/accounts/bulk-import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspaceId: 'ws-json',
            provider: 'resend',
            runDnsAudit: false,
            accounts: [
              { email: 'existing@agency.io', name: 'Existing', smtpPass: 're_existing' },
            ],
          }),
        })
      );

      expect(auditDomainSpy).not.toHaveBeenCalled();

      const res = await postBulkImport(
        new NextRequest('http://localhost:3000/api/accounts/bulk-import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspaceId: 'ws-json',
            provider: 'resend',
            runDnsAudit: false,
            accounts: [
              { email: 'existing@agency.io', smtpPass: 're_dup' },
              { email: 'team@agency.io', name: 'Team Resend', smtpPass: 're_live_123', dailyLimit: 120 },
            ],
          }),
        })
      );

      const data = await res.json();
      expect(res.status).toBe(201);
      expect(data.importedCount).toBe(1);
      expect(data.skippedCount).toBe(1);
      expect(data.accounts[0]).toMatchObject({
        email: 'team@agency.io',
        smtpHost: 'smtp.resend.com',
        smtpPort: 465,
        smtpUser: 'resend',
        dailyLimit: 120,
        smtpPass: '••••••••',
      });
      expect(auditDomainSpy).not.toHaveBeenCalled();

      const stored = accountRepo.getAccounts('ws-json');
      expect(stored).toHaveLength(2);
      expect(decryptCredential(stored[1].smtpPass)).toBe('re_live_123');
    });

    it('POST imports headerless CSV and infers hotmail.com to Microsoft 365', async () => {
      const csvText = [
        'rep@hotmail.com,Rep Hotmail,ms-hot-pass,,,55',
        'ops@mailgun-custom.io,Ops Mailgun,mg-pass,smtp.eu.mailgun.org,2525,80',
      ].join('\n');

      const res = await postBulkImport(
        new NextRequest('http://localhost:3000/api/accounts/bulk-import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspaceId: 'ws-headerless',
            csvText,
            runDnsAudit: false,
          }),
        })
      );

      const data = await res.json();
      expect(res.status).toBe(201);
      expect(data.importedCount).toBe(2);
      expect(data.accounts[0]).toMatchObject({
        email: 'rep@hotmail.com',
        provider: 'microsoft',
        smtpHost: 'smtp.office365.com',
        smtpPort: 587,
        dailyLimit: 55,
        smtpPass: '••••••••',
      });
      expect(data.accounts[1]).toMatchObject({
        email: 'ops@mailgun-custom.io',
        provider: 'smtp',
        smtpHost: 'smtp.eu.mailgun.org',
        smtpPort: 2525,
        dailyLimit: 80,
        smtpPass: '••••••••',
      });
    });

    it('POST rejects imports exceeding 100 mailboxes', async () => {
      const tooMany = Array.from({ length: 101 }, (_, idx) => ({
        email: `sender${idx}@bulkdomain.io`,
        smtpPass: `pass-${idx}`,
      }));

      const res = await postBulkImport(
        new NextRequest('http://localhost:3000/api/accounts/bulk-import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accounts: tooMany }),
        })
      );

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('100');
    });
  });
});
