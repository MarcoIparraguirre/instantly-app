import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import dns from 'dns';
import { NextRequest } from 'next/server';
import type { IJsonStorageDriver } from '@/core/storage/JsonDriver';
import { CampaignRepository } from '@/core/storage/CampaignRepository';
import { LeadRepository } from '@/core/storage/LeadRepository';
import {
  EmailVerifierService,
  EnrichedEmailVerificationResult
} from '@/core/services/EmailVerifierService';
import { LeadEnrichmentService } from '@/core/services/LeadEnrichmentService';
import { MultichannelDispatcherService } from '@/core/services/MultichannelDispatcherService';
import type { Campaign, Lead } from '@/types';

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

const { mockContainer } = vi.hoisted(() => ({
  mockContainer: {} as Record<string, unknown>
}));

vi.mock('@/core/container', () => ({
  container: mockContainer
}));

import { POST as postEnrichLeads } from '@/app/api/leads/enrich/route';
import {
  GET as getMultichannel,
  POST as postMultichannel
} from '@/app/api/campaigns/[id]/multichannel/route';

function makeCampaign(id: string, workspaceId: string): Campaign {
  return {
    id,
    workspaceId,
    name: `Campaign ${id}`,
    status: 'active',
    steps: [],
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

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'lead-1',
    workspaceId: 'ws-alpha',
    campaignId: 'camp-1',
    email: 'sofia@nortetech.io',
    firstName: 'Sofía',
    lastName: 'Méndez',
    companyName: 'Norte Tech',
    title: 'VP Sales',
    website: 'https://nortetech.io',
    status: 'pending',
    currentStep: 1,
    customVariables: {
      Telefono: '+54 9 11 5555-1234',
      linkedinUrl: 'https://www.linkedin.com/in/sofia-mendez-nt'
    },
    ...overrides
  };
}

describe('Wave 2 Track 6 — Growth & Multichannel', () => {
  let driver: InMemoryJsonDriver;
  let campaignRepo: CampaignRepository;
  let leadRepo: LeadRepository;

  const envBackup = {
    APOLLO_API_KEY: process.env.APOLLO_API_KEY,
    HUNTER_API_KEY: process.env.HUNTER_API_KEY,
    WHATSAPP_ACCESS_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN,
    WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID,
    WHATSAPP_WEBHOOK_URL: process.env.WHATSAPP_WEBHOOK_URL,
    WHATSAPP_WEBHOOK_SECRET: process.env.WHATSAPP_WEBHOOK_SECRET
  };

  beforeEach(() => {
    driver = new InMemoryJsonDriver();
    campaignRepo = new CampaignRepository(driver);
    leadRepo = new LeadRepository(driver);
    campaignRepo.saveCampaigns([]);
    leadRepo.saveLeads([]);

    mockContainer.campaignRepo = campaignRepo;
    mockContainer.leadRepo = leadRepo;

    MultichannelDispatcherService.clearTasks();

    delete process.env.APOLLO_API_KEY;
    delete process.env.HUNTER_API_KEY;
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    delete process.env.WHATSAPP_WEBHOOK_URL;
    delete process.env.WHATSAPP_WEBHOOK_SECRET;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const [key, val] of Object.entries(envBackup)) {
      if (val === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = val;
      }
    }
  });

  describe('LeadEnrichmentService — Layer 1 (SSRF Guard + Domain Intel + Email Permutator)', () => {
    it('blocks SSRF targets (localhost, metadata, private IPs, HTTP) before calling fetch', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const targets = [
        { website: 'https://169.254.169.254/latest/meta-data/' },
        { website: 'https://localhost:3000/internal' },
        { website: 'https://192.168.1.10/admin' },
        { website: 'http://127.0.0.1:8080/health' },
        { website: 'http://public-insecure.example.com' }
      ];

      for (const target of targets) {
        const res = await LeadEnrichmentService.enrich(target);
        expect(res.domainIntel.ssrfAllowed).toBe(false);
        expect(res.domainIntel.scrapeStatus).toBe('blocked');
        expect(res.waterfall.layer1Status).toBe('blocked');
      }

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('blocks SSRF redirect chains when an external site redirects to cloud metadata IP', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { Location: 'https://169.254.169.254/latest/meta-data/iam' }
        })
      );
      vi.spyOn(dns.promises, 'resolveMx').mockRejectedValue(new Error('No MX'));

      const res = await LeadEnrichmentService.enrich({ website: 'https://redirector.io' });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(res.domainIntel.ssrfAllowed).toBe(false);
      expect(res.domainIntel.scrapeStatus).toBe('blocked');
      expect(res.domainIntel.error).toContain('SSRF Block');
    });

    it('extracts HTML metadata, detected emails, LinkedIn URLs, social & tech signals and handles network failures gracefully', async () => {
      const html = `
        <!doctype html>
        <html>
          <head>
            <title>Norte Tech | AI B2B Revenue Platform</title>
            <meta name="description" content="Automate outbound growth for LATAM SaaS teams." />
            <meta property="og:site_name" content="Norte Tech" />
          </head>
          <body>
            <script src="/_next/static/chunks/main.js"></script>
            <script src="https://js.hs-scripts.com/12345.js"></script>
            <script src="https://js.stripe.com/v3/"></script>
            <img src="hero-logo@2x.png" alt="logo" />
            <a href="mailto:hola@nortetech.io">Contact</a>
            <a href="tel:+54-11-4444-9999">Call</a>
            <a href="https://www.linkedin.com/company/nortetech-io/">LinkedIn</a>
            <a href="https://x.com/nortetech">X</a>
            <a href="https://github.com/nortetech">GitHub</a>
          </body>
        </html>
      `;

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(html, { status: 200 }));
      vi.spyOn(dns.promises, 'resolveMx').mockResolvedValue([
        { exchange: 'aspmx.l.google.com', priority: 10 }
      ]);

      const res = await LeadEnrichmentService.enrich({ domain: 'nortetech.io' });

      expect(res.domainIntel.scrapeStatus).toBe('ok');
      expect(res.domainIntel.title).toBe('Norte Tech | AI B2B Revenue Platform');
      expect(res.domainIntel.description).toBe('Automate outbound growth for LATAM SaaS teams.');
      expect(res.domainIntel.detectedEmails).toEqual(['hola@nortetech.io']);
      expect(res.domainIntel.linkedinCompanyUrl).toBe('https://www.linkedin.com/company/nortetech-io');
      expect(res.domainIntel.socialSignals.twitter).toContain('https://x.com/nortetech');
      expect(res.domainIntel.socialSignals.github).toContain('https://github.com/nortetech');
      expect(res.domainIntel.techSignals).toEqual(expect.arrayContaining(['Next.js', 'HubSpot', 'Stripe']));
      expect(res.domainIntel.detectedPhones).toEqual(['+54-11-4444-9999']);
      expect(res.companyName).toBe('Norte Tech');
      expect(res.bestMatch?.email).toBe('hola@nortetech.io');
      expect(res.bestMatch?.verified).toBe(true);

      // Now simulate offline / network error — should never throw
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('connect ECONNREFUSED'));
      const offlineRes = await LeadEnrichmentService.enrich({
        domain: 'offline-b2b.io',
        firstName: 'Ana',
        lastName: 'Ríos'
      });

      expect(offlineRes.domainIntel.scrapeStatus).toBe('failed');
      expect(offlineRes.domainIntel.error).toContain('ECONNREFUSED');
      expect(offlineRes.waterfall.layer1Status).toBe('partial');
      expect(offlineRes.permutations).toHaveLength(5);
    });

    it('generates ranked email permutations with accent normalization and verifies via EmailVerifierService', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));

      const verifier = new EmailVerifierService();
      const verifyBatchSpy = vi.spyOn(verifier, 'verifyBatch').mockImplementation(async emails => {
        return emails.map((email): EnrichedEmailVerificationResult => ({
          email,
          isValid: email === 'jose.lopez@acme.io',
          score: email === 'jose.lopez@acme.io' ? 98 : 25,
          syntaxValid: true,
          domain: 'acme.io',
          hasMx: true,
          isDisposable: false,
          smtpVerified: email === 'jose.lopez@acme.io',
          isCatchAll: false,
          reason: email === 'jose.lopez@acme.io' ? 'SMTP verified' : 'Rejected'
        }));
      });

      const service = new LeadEnrichmentService(verifier);
      const res = await service.enrich({
        domain: 'acme.io',
        firstName: 'José',
        lastName: 'López',
        companyName: 'Acme Corp',
        smtpProbe: true
      });

      expect(verifyBatchSpy).toHaveBeenCalledTimes(1);
      expect(res.permutations.map(p => p.email)).toEqual([
        'jose.lopez@acme.io',
        'jose@acme.io',
        'jlopez@acme.io',
        'jose_lopez@acme.io',
        'lopez@acme.io'
      ]);
      expect(res.bestMatch).toMatchObject({
        email: 'jose.lopez@acme.io',
        firstName: 'José',
        lastName: 'López',
        companyName: 'Acme Corp',
        source: 'email_permutator',
        verified: true,
        verificationScore: 98
      });
    });
  });

  describe('LeadEnrichmentService — Layer 2 (Apollo.io & Hunter.io Waterfall)', () => {
    it('uses Apollo.io first and skips Hunter.io when Apollo returns a contact', async () => {
      vi.spyOn(dns.promises, 'resolveMx').mockResolvedValue([
        { exchange: 'mail.protonmail.ch', priority: 10 }
      ]);

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
        const url = String(input);
        if (url === 'https://acme.io') {
          return new Response('<html><title>Acme IO</title></html>', { status: 200 });
        }
        if (url.includes('api.apollo.io/api/v1/people/match')) {
          return new Response(
            JSON.stringify({
              person: {
                email: 'elena.vega@acme.io',
                email_status: 'verified',
                first_name: 'Elena',
                last_name: 'Vega',
                title: 'Head of Growth',
                linkedin_url: 'https://linkedin.com/in/elenavega',
                organization: { name: 'Acme IO', website_url: 'https://acme.io' }
              }
            }),
            { status: 200 }
          );
        }
        throw new Error(`Unexpected fetch to ${url}`);
      });

      const res = await LeadEnrichmentService.enrich({
        domain: 'acme.io',
        firstName: 'Elena',
        lastName: 'Vega',
        apolloApiKey: 'apollo-secret-key',
        hunterApiKey: 'hunter-secret-key'
      });

      expect(res.waterfall.apolloStatus).toBe('success');
      expect(res.waterfall.hunterStatus).toBe('skipped');
      expect(res.bestMatch).toMatchObject({
        email: 'elena.vega@acme.io',
        title: 'Head of Growth',
        companyName: 'Acme IO',
        source: 'apollo',
        confidence: 95,
        verified: true
      });
      expect(fetchSpy).toHaveBeenCalledTimes(2); // Website scrape + Apollo only
    });

    it('falls back to Hunter.io in waterfall when Apollo fails or yields no contacts', async () => {
      vi.spyOn(dns.promises, 'resolveMx').mockResolvedValue([
        { exchange: 'mx.growthcorp.com', priority: 10 }
      ]);

      vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
        const url = String(input);
        if (url.startsWith('https://growthcorp.com')) {
          return new Response('<html><title>GrowthCorp</title></html>', { status: 200 });
        }
        if (url.includes('api.apollo.io')) {
          return new Response(JSON.stringify({ error: 'Rate limited' }), { status: 429 });
        }
        if (url.includes('api.hunter.io/v2/email-finder')) {
          return new Response(
            JSON.stringify({
              data: {
                email: 'marcos.silva@growthcorp.com',
                score: 91,
                first_name: 'Marcos',
                last_name: 'Silva',
                position: 'CRO',
                company: 'GrowthCorp',
                linkedin: 'https://linkedin.com/in/marcossilva',
                verification: { status: 'valid' }
              }
            }),
            { status: 200 }
          );
        }
        return new Response('{}', { status: 404 });
      });

      const res = await LeadEnrichmentService.enrich({
        domain: 'growthcorp.com',
        firstName: 'Marcos',
        lastName: 'Silva',
        apolloApiKey: 'apollo-key',
        hunterApiKey: 'hunter-key'
      });

      expect(res.waterfall.apolloStatus).toBe('error');
      expect(res.waterfall.hunterStatus).toBe('success');
      expect(res.waterfall.errors.some(e => e.includes('429'))).toBe(true);
      expect(res.bestMatch).toMatchObject({
        email: 'marcos.silva@growthcorp.com',
        title: 'CRO',
        source: 'hunter',
        confidence: 91,
        verified: true
      });
    });

    it('supports Hunter domain-search via env var when no person name is provided', async () => {
      process.env.HUNTER_API_KEY = 'env-hunter-key';
      vi.spyOn(dns.promises, 'resolveMx').mockResolvedValue([
        { exchange: 'mx.saas.io', priority: 10 }
      ]);

      vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
        const url = String(input);
        if (url === 'https://saas.io') {
          return new Response('<html><title>SaaS IO</title></html>', { status: 200 });
        }
        if (url.includes('api.hunter.io/v2/domain-search') && url.includes('api_key=env-hunter-key')) {
          return new Response(
            JSON.stringify({
              data: {
                domain: 'saas.io',
                organization: 'SaaS IO',
                emails: [
                  {
                    value: 'clara@saas.io',
                    confidence: 88,
                    first_name: 'Clara',
                    last_name: 'Núñez',
                    position: 'Founder',
                    verification: { status: 'valid' }
                  }
                ]
              }
            }),
            { status: 200 }
          );
        }
        return new Response('{}', { status: 404 });
      });

      const res = await LeadEnrichmentService.enrich({ domain: 'saas.io' });
      expect(res.waterfall.apolloStatus).toBe('not_configured');
      expect(res.waterfall.hunterStatus).toBe('success');
      expect(res.leads.some(l => l.email === 'clara@saas.io' && l.title === 'Founder')).toBe(true);
    });
  });

  describe('POST /api/leads/enrich Route', () => {
    it('validates input and rejects empty payloads or batch sizes over 25', async () => {
      const emptyRes = await postEnrichLeads(
        new NextRequest('http://localhost/api/leads/enrich', {
          method: 'POST',
          body: JSON.stringify({})
        })
      );
      expect(emptyRes.status).toBe(400);

      const oversizedLeads = Array.from({ length: 26 }, (_, i) => ({ domain: `co${i}.io` }));
      const batchLimitRes = await postEnrichLeads(
        new NextRequest('http://localhost/api/leads/enrich', {
          method: 'POST',
          body: JSON.stringify({ leads: oversizedLeads })
        })
      );
      expect(batchLimitRes.status).toBe(400);
    });

    it('enriches and persists verified leads into workspace-scoped campaign via container.leadRepo', async () => {
      campaignRepo.saveCampaign(makeCampaign('camp-enrich', 'ws-growth'));
      vi.spyOn(dns.promises, 'resolveMx').mockResolvedValue([
        { exchange: 'aspmx.l.google.com', priority: 10 }
      ]);
      vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
        const url = String(input);
        if (url === 'https://vectra.io') {
          return new Response('<html><title>Vectra Systems</title></html>', { status: 200 });
        }
        if (url.includes('api.apollo.io')) {
          return new Response(
            JSON.stringify({
              person: {
                email: 'diego.cruz@vectra.io',
                email_status: 'verified',
                first_name: 'Diego',
                last_name: 'Cruz',
                title: 'CTO',
                organization: { name: 'Vectra Systems', website_url: 'https://vectra.io' }
              }
            }),
            { status: 200 }
          );
        }
        return new Response('{}', { status: 404 });
      });

      const res = await postEnrichLeads(
        new NextRequest('http://localhost/api/leads/enrich', {
          method: 'POST',
          body: JSON.stringify({
            domain: 'vectra.io',
            firstName: 'Diego',
            lastName: 'Cruz',
            campaignId: 'camp-enrich',
            workspaceId: 'ws-growth',
            saveToCampaign: true,
            apolloApiKey: 'test-apollo'
          })
        })
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.savedCount).toBe(1);
      expect(json.savedLeads[0]).toMatchObject({
        email: 'diego.cruz@vectra.io',
        workspaceId: 'ws-growth',
        campaignId: 'camp-enrich',
        title: 'CTO'
      });

      const storedLeads = leadRepo.getLeads('camp-enrich', 'ws-growth');
      expect(storedLeads).toHaveLength(1);
      expect(storedLeads[0].email).toBe('diego.cruz@vectra.io');
    });

    it('supports batch enrichment for multiple domains', async () => {
      vi.spyOn(dns.promises, 'resolveMx').mockResolvedValue([
        { exchange: 'mx.batch.io', priority: 10 }
      ]);
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('<html><title>Batch Co</title><a href="mailto:sales@batch1.io">Mail</a></html>', {
          status: 200
        })
      );

      const res = await postEnrichLeads(
        new NextRequest('http://localhost/api/leads/enrich', {
          method: 'POST',
          body: JSON.stringify({
            workspaceId: 'ws-batch',
            campaignId: 'camp-batch',
            saveToCampaign: true,
            leads: [{ domain: 'batch1.io' }, { domain: 'batch2.io', firstName: 'Leo', lastName: 'Paz' }]
          })
        })
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.mode).toBe('batch');
      expect(json.processedCount).toBe(2);
      expect(json.savedCount).toBeGreaterThanOrEqual(2);
    });
  });

  describe('MultichannelDispatcherService — WhatsApp, LinkedIn & Call Tasks', () => {
    it('simulates WhatsApp cleanly when unconfigured and renders variables + Spintax', async () => {
      const lead = makeLead({
        customVariables: {
          Telefono: '+54 9 11 5555-1234',
          linkedinUrl: 'https://www.linkedin.com/in/sofia-mendez-nt',
          Ciudad: 'Buenos Aires'
        }
      });
      const result = await MultichannelDispatcherService.dispatch({
        channel: 'whatsapp',
        workspaceId: 'ws-alpha',
        campaignId: 'camp-1',
        lead,
        messageTemplate: '{Hola|Qué tal} {{firstName}}, vi {{companyName}} ({{Ciudad}}) — {{title}}'
      });

      expect(result.status).toBe('simulated');
      expect(result.provider).toBe('simulation');
      expect(result.target).toBe('5491155551234');
      expect(result.renderedMessage).toMatch(
        /^(Hola|Qué tal) Sofía, vi Norte Tech \(Buenos Aires\) — VP Sales$/
      );

      const emailResult = await MultichannelDispatcherService.dispatch({
        channel: 'email',
        lead,
        subjectTemplate: '{Intro|Hola} {{firstName}}',
        messageTemplate: 'Propuesta para {{companyName}}'
      });
      expect(emailResult.provider).toBe('email_render');
      expect(emailResult.renderedSubject).toMatch(/^(Intro|Hola) Sofía$/);
      expect(emailResult.renderedMessage).toBe('Propuesta para Norte Tech');
    });

    it('dispatches WhatsApp via Cloud API when WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID are set', async () => {
      process.env.WHATSAPP_ACCESS_TOKEN = 'wa-cloud-token';
      process.env.WHATSAPP_PHONE_NUMBER_ID = '1020304050';

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ messages: [{ id: 'wamid.HBgM123' }] }), { status: 200 })
      );

      const result = await MultichannelDispatcherService.dispatch({
        channel: 'whatsapp',
        lead: makeLead(),
        messageTemplate: 'Hola {{firstName}} de {{companyName}}'
      });

      expect(result.status).toBe('sent');
      expect(result.provider).toBe('whatsapp_cloud');
      expect(result.messageId).toBe('wamid.HBgM123');
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://graph.facebook.com/v19.0/1020304050/messages',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: 'Bearer wa-cloud-token' })
        })
      );
    });

    it('blocks SSRF targets on WHATSAPP_WEBHOOK_URL and posts cleanly to valid HTTPS Evolution/webhook URLs', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      process.env.WHATSAPP_WEBHOOK_URL = 'https://169.254.169.254/latest/meta-data/';

      const blocked = await MultichannelDispatcherService.dispatch({
        channel: 'whatsapp',
        lead: makeLead(),
        messageTemplate: 'Hola {{firstName}}'
      });

      expect(blocked.status).toBe('error');
      expect(blocked.error).toContain('SSRF Block');
      expect(fetchSpy).not.toHaveBeenCalled();

      process.env.WHATSAPP_WEBHOOK_URL = 'https://evolution.nortetech.io/message/sendText/sales';
      process.env.WHATSAPP_ACCESS_TOKEN = 'evo-api-key';
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ key: { id: 'evo-msg-99' } }), { status: 201 })
      );

      const sent = await MultichannelDispatcherService.dispatch({
        channel: 'whatsapp',
        lead: makeLead(),
        messageTemplate: 'Hola {{firstName}}'
      });

      expect(sent.status).toBe('sent');
      expect(sent.provider).toBe('whatsapp_webhook');
      expect(sent.messageId).toBe('evo-msg-99');
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('creates LinkedIn & Call sales tasks with proper actionUrl, lists with filters, and completes tasks', async () => {
      const leadWithProfile = makeLead();
      const leadWithoutProfile = makeLead({
        id: 'lead-2',
        email: 'juan@acme.io',
        firstName: 'Juan',
        lastName: 'Pérez',
        companyName: 'Acme',
        customVariables: { phone: '(011) 4321-8765' }
      });

      const liRes = await MultichannelDispatcherService.dispatch({
        channel: 'linkedin_task',
        workspaceId: 'ws-alpha',
        campaignId: 'camp-1',
        lead: leadWithProfile,
        messageTemplate: '{Hola|Hey} {{firstName}}, conectemos por {{companyName}}'
      });

      const liSearchRes = await MultichannelDispatcherService.dispatch({
        channel: 'linkedin_task',
        workspaceId: 'ws-alpha',
        campaignId: 'camp-1',
        lead: leadWithoutProfile,
        messageTemplate: 'Conectar con {{firstName}}'
      });

      const callRes = await MultichannelDispatcherService.dispatch({
        channel: 'call_task',
        workspaceId: 'ws-alpha',
        campaignId: 'camp-1',
        lead: leadWithoutProfile,
        messageTemplate: 'Llamar a {{firstName}} de {{companyName}}'
      });

      expect(liRes.status).toBe('task_created');
      expect(liRes.task?.actionUrl).toBe('https://www.linkedin.com/in/sofia-mendez-nt');
      expect(liSearchRes.task?.actionUrl).toContain('https://www.linkedin.com/search/results/people/?keywords=');
      expect(callRes.task?.actionUrl).toBe('tel:01143218765');

      const pending = await MultichannelDispatcherService.getTasks({
        workspaceId: 'ws-alpha',
        campaignId: 'camp-1',
        status: 'pending'
      });
      expect(pending).toHaveLength(3);

      // Workspace isolation check on completeTask
      const wrongWsComplete = await MultichannelDispatcherService.completeTask(callRes.task!.id, {
        workspaceId: 'ws-other'
      });
      expect(wrongWsComplete).toBeNull();

      const completed = await MultichannelDispatcherService.completeTask(callRes.task!.id, {
        workspaceId: 'ws-alpha',
        notes: 'Spoke with Juan, demo booked'
      });
      expect(completed?.status).toBe('completed');
      expect(completed?.notes).toBe('Spoke with Juan, demo booked');
      expect(completed?.completedAt).toBeTruthy();
    });
  });

  describe('/api/campaigns/[id]/multichannel Route', () => {
    it('executes multichannel steps for campaign leads, summarizes tasks on GET, and completes tasks on POST', async () => {
      campaignRepo.saveCampaign(makeCampaign('camp-mc', 'ws-mc'));
      leadRepo.saveLeads([
        makeLead({ id: 'l-1', workspaceId: 'ws-mc', campaignId: 'camp-mc', email: 'a@test.io' }),
        makeLead({
          id: 'l-2',
          workspaceId: 'ws-mc',
          campaignId: 'camp-mc',
          email: 'b@test.io',
          firstName: 'Carlos',
          lastName: 'Gómez',
          customVariables: { Telefono: '+1-415-555-0199' }
        })
      ]);

      // 1. Dispatch LinkedIn tasks to both leads
      const postLiRes = await postMultichannel(
        new NextRequest('http://localhost/api/campaigns/camp-mc/multichannel', {
          method: 'POST',
          body: JSON.stringify({
            workspaceId: 'ws-mc',
            channel: 'linkedin_task',
            messageTemplate: 'Hola {{firstName}}, ¿charlamos sobre {{companyName}}?'
          })
        }),
        { params: Promise.resolve({ id: 'camp-mc' }) }
      );
      expect(postLiRes.status).toBe(200);
      const liJson = await postLiRes.json();
      expect(liJson.processed).toBe(2);
      expect(liJson.taskCreatedCount).toBe(2);
      const firstTaskId = liJson.tasksCreated[0].id as string;

      // 2. Dispatch WhatsApp (simulated) targeted to l-2 only
      const postWaRes = await postMultichannel(
        new NextRequest('http://localhost/api/campaigns/camp-mc/multichannel', {
          method: 'POST',
          body: JSON.stringify({
            workspaceId: 'ws-mc',
            channel: 'whatsapp',
            leadIds: ['l-2'],
            messageTemplate: '{Hola|Buenas} {{firstName}}'
          })
        }),
        { params: Promise.resolve({ id: 'camp-mc' }) }
      );
      expect(postWaRes.status).toBe(200);
      const waJson = await postWaRes.json();
      expect(waJson.processed).toBe(1);
      expect(waJson.simulatedCount).toBe(1);

      // 3. Complete a task via POST completeTaskId
      const completeRes = await postMultichannel(
        new NextRequest('http://localhost/api/campaigns/camp-mc/multichannel', {
          method: 'POST',
          body: JSON.stringify({
            workspaceId: 'ws-mc',
            completeTaskId: firstTaskId,
            notes: 'Connection accepted'
          })
        }),
        { params: Promise.resolve({ id: 'camp-mc' }) }
      );
      expect(completeRes.status).toBe(200);
      const completeJson = await completeRes.json();
      expect(completeJson.completedTask.status).toBe('completed');

      // 4. Verify GET summary + workspace isolation
      const getRes = await getMultichannel(
        new NextRequest('http://localhost/api/campaigns/camp-mc/multichannel?workspaceId=ws-mc'),
        { params: Promise.resolve({ id: 'camp-mc' }) }
      );
      expect(getRes.status).toBe(200);
      const getJson = await getRes.json();
      expect(getJson.leadsCount).toBe(2);
      expect(getJson.summary).toMatchObject({
        totalTasks: 2,
        pendingCount: 1,
        completedCount: 1,
        byChannel: {
          linkedin_task: { pending: 1, completed: 1 },
          call_task: { pending: 0, completed: 0 }
        }
      });

      const crossWsRes = await getMultichannel(
        new NextRequest('http://localhost/api/campaigns/camp-mc/multichannel?workspaceId=ws-attacker'),
        { params: Promise.resolve({ id: 'camp-mc' }) }
      );
      expect(crossWsRes.status).toBe(404);

      const badChannelRes = await postMultichannel(
        new NextRequest('http://localhost/api/campaigns/camp-mc/multichannel', {
          method: 'POST',
          body: JSON.stringify({ workspaceId: 'ws-mc', channel: 'sms', messageTemplate: 'Hola' })
        }),
        { params: Promise.resolve({ id: 'camp-mc' }) }
      );
      expect(badChannelRes.status).toBe(400);

      const missingTaskRes = await postMultichannel(
        new NextRequest('http://localhost/api/campaigns/camp-mc/multichannel', {
          method: 'POST',
          body: JSON.stringify({ workspaceId: 'ws-mc', completeTaskId: 'nonexistent-task' })
        }),
        { params: Promise.resolve({ id: 'camp-mc' }) }
      );
      expect(missingTaskRes.status).toBe(404);
    });
  });
});
