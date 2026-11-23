import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGenerateText, mockOpenai, mockGoogle, mockContainer } = vi.hoisted(() => ({
  mockGenerateText: vi.fn(),
  mockOpenai: vi.fn((modelId: string) => ({ provider: 'openai', modelId })),
  mockGoogle: vi.fn((modelId: string) => ({ provider: 'google', modelId })),
  mockContainer: {
    leadRepo: {
      getLeadById: vi.fn(),
      updateLead: vi.fn(),
    },
  },
}));

vi.mock('ai', () => ({
  generateText: mockGenerateText,
}));

vi.mock('@ai-sdk/openai', () => ({
  openai: mockOpenai,
}));

vi.mock('@ai-sdk/google', () => ({
  google: mockGoogle,
}));

vi.mock('@/core/container', () => ({
  container: mockContainer,
}));

import { AiOutreachService } from '@/core/services/AiOutreachService';
import { CopilotService } from '@/core/copilot/CopilotService';
import { CopilotActionRegistry } from '@/core/copilot/CopilotActionRegistry';
import {
  ActivateCampaignAction,
  PauseCampaignAction,
  ApplySpamFixesAction,
  ApplySpintaxAction,
} from '@/core/copilot/actions';
import { SpamDetectorService } from '@/core/services/SpamDetectorService';
import { SpintaxService } from '@/core/services/SpintaxService';
import { POST as postPersonalize } from '@/app/api/ai/personalize/route';
import { POST as postSuggestReply } from '@/app/api/ai/suggest-reply/route';
import type { Campaign, Lead } from '@/types';
import type {
  ICampaignRepository,
  ILeadRepository,
  IAccountRepository,
} from '@/core/interfaces/storage';

function makeCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: 'camp-ai-1',
    workspaceId: 'ws-primary',
    name: 'LATAM SaaS Outbound',
    status: 'draft',
    steps: [
      {
        id: 'step-1',
        stepNumber: 1,
        waitDays: 0,
        variants: [
          {
            id: 'var-1',
            name: 'Variant A',
            subject: 'Quick question for {{companyName}}',
            body: 'Hi {{firstName}}, wanted to reach out regarding pipeline efficiency.',
          },
        ],
      },
    ],
    schedule: {
      timing: { from: '09:00', to: '17:00' },
      days: [1, 2, 3, 4, 5],
      timezone: 'America/Argentina/Buenos_Aires',
      dailyLimit: 50,
      strategy: 'office-hours',
    },
    senderAccountIds: ['acc-1'],
    openTracking: true,
    clickTracking: true,
    stats: {
      sent: 120,
      opened: 54,
      replied: 12,
      bounced: 2,
      opportunities: 4,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('AiOutreachService, AI API Routes & CopilotService', () => {
  const originalEnv = { ...process.env };
  let service: AiOutreachService;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.OPENAI_API_KEY;
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    service = new AiOutreachService();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe('Provider Detection', () => {
    it('detects deterministic when no API keys are configured, and prefers openai over google', () => {
      expect(service.detectProvider()).toBe('deterministic');

      process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'goog-key-123';
      expect(service.detectProvider()).toBe('google');

      process.env.OPENAI_API_KEY = 'sk-openai-123';
      expect(service.detectProvider()).toBe('openai');
    });
  });

  describe('Deterministic ES/EN Icebreakers', () => {
    it('generates personalized Spanish icebreakers without API keys', async () => {
      const leads = [
        {
          id: 'lead-1',
          firstName: 'Lucia',
          companyName: 'NubeFin',
          email: 'lucia@nubefin.io',
          customVariables: { Cargo: 'VP de Ventas', Ciudad: 'Buenos Aires' },
        },
        {
          id: 'lead-2',
          firstName: 'Mateo',
          companyName: 'LogiTrack',
          email: 'mateo@logitrack.com',
        },
      ];

      const results = await service.generateIcebreakers(leads, 'es', 'consultative');
      expect(results).toHaveLength(2);
      expect(results[0].provider).toBe('deterministic');
      expect(results[0].language).toBe('es');
      expect(results[0].icebreaker).toContain('NubeFin');
      expect(results[0].icebreaker).toContain('VP de Ventas');
      expect(results[0].icebreaker).not.toContain('undefined');
      expect(results[1].icebreaker).toContain('LogiTrack');
      expect(mockGenerateText).not.toHaveBeenCalled();
    });

    it('generates personalized English icebreakers across tones without API keys', async () => {
      const leads = [
        {
          id: 'lead-en-1',
          firstName: 'Sarah',
          companyName: 'Acme Cloud',
          title: 'Head of Growth',
          email: 'sarah@acmecloud.io',
        },
      ];

      const direct = await service.generateIcebreakers(leads, 'en', 'direct');
      const friendly = await service.generateIcebreakers(leads, 'en', 'friendly');
      const executive = await service.generateIcebreakers(leads, 'en', 'executive');

      expect(direct[0].provider).toBe('deterministic');
      expect(direct[0].language).toBe('en');
      expect(direct[0].icebreaker).toContain('Acme Cloud');
      expect(direct[0].icebreaker).toContain('Head of Growth');
      expect(friendly[0].icebreaker).toContain('Sarah');
      expect(executive[0].icebreaker).toContain('ROI');
      expect(direct[0].icebreaker).not.toBe(friendly[0].icebreaker);
    });

    it('returns empty array for empty leads input', async () => {
      const results = await service.generateIcebreakers([], 'es', 'consultative');
      expect(results).toEqual([]);
    });
  });

  describe('Deterministic Unibox Reply Suggestions (3 tones)', () => {
    it('returns 3 tailored Spanish drafts (Directo, Consultivo, Reunión)', async () => {
      const result = await service.suggestUniboxReplies({
        subject: 'Consulta comercial sobre MiSender',
        body: 'Hola, me interesa conocer el precio y ver una demo para nuestro equipo.',
        leadName: 'Carlos Gómez',
        companyName: 'Fintech Sur',
        sentiment: 'interested',
        language: 'es',
      });

      expect(result.provider).toBe('deterministic');
      expect(result.language).toBe('es');
      expect(result.drafts).toHaveLength(3);
      expect(result.drafts.map((d) => d.tone)).toEqual(['direct', 'consultative', 'meeting']);
      expect(result.drafts[0].label).toContain('Directo');
      expect(result.drafts[1].label).toContain('Consultivo');
      expect(result.drafts[2].label).toContain('Reunión');
      expect(result.drafts[0].subject).toBe('Re: Consulta comercial sobre MiSender');
      expect(result.drafts[0].body).toContain('Carlos');
      expect(result.drafts[0].body).toContain('Fintech Sur');
    });

    it('returns 3 tailored English drafts and adapts to negative/OOO sentiment', async () => {
      const interested = await service.suggestUniboxReplies({
        subject: 'Re: Outbound automation',
        body: 'Can you share pricing and availability for a quick walkthrough?',
        leadName: 'Elena Vance',
        companyName: 'ScaleOps',
        sentiment: 'interested',
        language: 'en',
      });

      expect(interested.provider).toBe('deterministic');
      expect(interested.language).toBe('en');
      expect(interested.drafts).toHaveLength(3);
      expect(interested.drafts[0].label).toContain('Direct');
      expect(interested.drafts[1].label).toContain('Consultative');
      expect(interested.drafts[2].label).toContain('Meeting');
      expect(interested.drafts[0].body).toContain('Elena');
      expect(interested.drafts[2].body).toContain('ScaleOps');

      const optOut = await service.suggestUniboxReplies({
        subject: 'Outreach',
        body: 'Not interested right now, please remove me.',
        leadName: 'Elena Vance',
        companyName: 'ScaleOps',
        sentiment: 'not-interested',
        language: 'en',
      });
      expect(optOut.drafts[0].body.toLowerCase()).toContain('removed');
    });
  });

  describe('Mocked Vercel AI SDK LLM Path', () => {
    it('uses openai(gpt-4o-mini) when OPENAI_API_KEY is configured for icebreakers & askCopilotLLM', async () => {
      process.env.OPENAI_API_KEY = 'sk-test-openai';

      mockGenerateText.mockResolvedValueOnce({
        text: JSON.stringify([
          { index: 0, icebreaker: 'Impressive Series B expansion at NubeFin across LatAm.' },
        ]),
      });

      const icebreakers = await service.generateIcebreakers(
        [{ id: 'l-1', firstName: 'Lucia', companyName: 'NubeFin' }],
        'en',
        'consultative'
      );

      expect(mockOpenai).toHaveBeenCalledWith('gpt-4o-mini');
      expect(mockGenerateText).toHaveBeenCalledTimes(1);
      expect(icebreakers[0].provider).toBe('openai');
      expect(icebreakers[0].icebreaker).toBe('Impressive Series B expansion at NubeFin across LatAm.');

      mockGenerateText.mockResolvedValueOnce({
        text: 'Shorten Step 1 subject to 4 words and A/B test a personalized question.',
      });

      const advice = await service.askCopilotLLM(
        'How can I lift reply rate?',
        'Sent: 120, Opened: 54, Replied: 12',
        'en'
      );
      expect(advice).toBe('Shorten Step 1 subject to 4 words and A/B test a personalized question.');
    });

    it('uses google(gemini-2.5-flash) when GOOGLE_GENERATIVE_AI_API_KEY is configured for suggestUniboxReplies', async () => {
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'goog-test-key';

      mockGenerateText.mockResolvedValueOnce({
        text: JSON.stringify([
          {
            tone: 'direct',
            label: 'Directo / Ejecutivo',
            subject: 'Re: Demo MiSender',
            body: 'Hola Sofía, claro: nuestro plan Growth arranca en $79/mes. ¿Lo vemos mañana?',
          },
          {
            tone: 'consultative',
            label: 'Consultivo / Valor',
            subject: 'Re: Demo MiSender',
            body: 'Hola Sofía, antes de enviarte números cerrados, ¿cuántos buzones manejan en FinOps?',
          },
          {
            tone: 'meeting',
            label: 'Propuesta de Reunión',
            subject: 'Re: Demo MiSender',
            body: 'Hola Sofía, ¿te viene bien una demo de 15 min este jueves 10:00?',
          },
        ]),
      });

      const result = await service.suggestUniboxReplies({
        subject: 'Demo MiSender',
        body: 'Nos interesa verlo esta semana',
        leadName: 'Sofía Ruiz',
        companyName: 'FinOps',
        sentiment: 'interested',
        language: 'es',
      });

      expect(mockGoogle).toHaveBeenCalledWith('gemini-2.5-flash');
      expect(result.provider).toBe('google');
      expect(result.drafts).toHaveLength(3);
      expect(result.drafts[0].body).toContain('$79/mes');
    });

    it('gracefully falls back to deterministic mode without crashing when generateText throws', async () => {
      process.env.OPENAI_API_KEY = 'sk-broken-offline';
      mockGenerateText.mockRejectedValue(new Error('Network offline'));

      const icebreakers = await service.generateIcebreakers(
        [{ id: 'l-1', firstName: 'Ana', companyName: 'DataPulse' }],
        'es',
        'consultative'
      );
      expect(icebreakers[0].provider).toBe('deterministic');
      expect(icebreakers[0].icebreaker).toContain('DataPulse');

      const replies = await service.suggestUniboxReplies({
        subject: 'Hola',
        body: 'Quiero más info',
        leadName: 'Ana',
        companyName: 'DataPulse',
        language: 'es',
      });
      expect(replies.provider).toBe('deterministic');
      expect(replies.drafts).toHaveLength(3);

      const advice = await service.askCopilotLLM('Ayuda', 'Campaign summary', 'es');
      expect(advice).toBeNull();
    });
  });

  describe('API Routes: /api/ai/personalize and /api/ai/suggest-reply', () => {
    it('POST /api/ai/personalize validates 1 to 100 leads bounds', async () => {
      const emptyReq = new NextRequest('http://localhost:3000/api/ai/personalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leads: [] }),
      });
      const emptyRes = await postPersonalize(emptyReq);
      expect(emptyRes.status).toBe(400);

      const tooManyLeads = Array.from({ length: 101 }, (_, i) => ({
        id: `lead-${i}`,
        firstName: `User${i}`,
        companyName: `Corp${i}`,
      }));
      const maxReq = new NextRequest('http://localhost:3000/api/ai/personalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leads: tooManyLeads }),
      });
      const maxRes = await postPersonalize(maxReq);
      expect(maxRes.status).toBe(400);
    });

    it('POST /api/ai/personalize generates icebreakers and persists customVariables.ICEBREAKER when saveToLeads=true', async () => {
      const existingLead: Lead = {
        id: 'lead-1',
        workspaceId: 'ws-alpha',
        campaignId: 'camp-99',
        email: 'lucia@nubefin.io',
        firstName: 'Lucia',
        lastName: 'Perez',
        companyName: 'NubeFin',
        status: 'pending',
        currentStep: 1,
        customVariables: { Cargo: 'CRO' },
      };

      mockContainer.leadRepo.getLeadById.mockImplementation(async (id: string) =>
        id === 'lead-1' ? existingLead : undefined
      );
      mockContainer.leadRepo.updateLead.mockResolvedValue(undefined);

      const req = new NextRequest('http://localhost:3000/api/ai/personalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId: 'camp-99',
          language: 'es',
          tone: 'consultative',
          saveToLeads: true,
          leads: [
            { id: 'lead-1', firstName: 'Lucia', companyName: 'NubeFin' },
            { firstName: 'NoId', companyName: 'SoloPreview' },
          ],
        }),
      });

      const res = await postPersonalize(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.provider).toBe('deterministic');
      expect(data.count).toBe(2);
      expect(data.savedCount).toBe(1);
      expect(data.icebreakers).toHaveLength(2);
      expect(mockContainer.leadRepo.updateLead).toHaveBeenCalledTimes(1);
      expect(mockContainer.leadRepo.updateLead).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'lead-1',
          workspaceId: 'ws-alpha',
          customVariables: {
            Cargo: 'CRO',
            ICEBREAKER: data.icebreakers[0].icebreaker,
          },
        })
      );
    });

    it('POST /api/ai/suggest-reply validates body and returns 3 drafts + detected provider', async () => {
      const badReq = new NextRequest('http://localhost:3000/api/ai/suggest-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: 'Hello', body: '   ' }),
      });
      const badRes = await postSuggestReply(badReq);
      expect(badRes.status).toBe(400);

      process.env.OPENAI_API_KEY = 'sk-route-test';
      mockGenerateText.mockResolvedValueOnce({
        text: JSON.stringify([
          { tone: 'direct', label: 'Direct / Executive', subject: 'Re: Pricing', body: 'Direct draft' },
          { tone: 'consultative', label: 'Consultative / Value', subject: 'Re: Pricing', body: 'Consultative draft' },
          { tone: 'meeting', label: 'Meeting Proposal', subject: 'Re: Pricing', body: 'Meeting draft' },
        ]),
      });

      const validReq = new NextRequest('http://localhost:3000/api/ai/suggest-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: 'Pricing',
          body: 'Interested in pricing for 5 seats.',
          leadName: 'Alex Morgan',
          companyName: 'BetaCorp',
          sentiment: 'interested',
          language: 'en',
        }),
      });

      const validRes = await postSuggestReply(validReq);
      const validData = await validRes.json();

      expect(validRes.status).toBe(200);
      expect(validData.success).toBe(true);
      expect(validData.provider).toBe('openai');
      expect(validData.drafts).toHaveLength(3);
      expect(validData.drafts[0].body).toBe('Direct draft');
    });
  });

  describe('CopilotService Backward Compatibility & LLM Enrichment', () => {
    function buildCopilot(campaign: Campaign) {
      const campaignRepo: ICampaignRepository = {
        getCampaigns: vi.fn().mockResolvedValue([campaign]),
        getCampaignById: vi.fn().mockResolvedValue(campaign),
        saveCampaigns: vi.fn().mockResolvedValue(undefined),
        saveCampaign: vi.fn().mockResolvedValue(undefined),
      };
      const leadRepo: ILeadRepository = {
        getLeads: vi.fn().mockResolvedValue([]),
        getLeadById: vi.fn().mockResolvedValue(undefined),
        saveLeads: vi.fn().mockResolvedValue(undefined),
        addLeads: vi.fn().mockResolvedValue(undefined),
        updateLead: vi.fn().mockResolvedValue(undefined),
        deleteLeads: vi.fn().mockResolvedValue(undefined),
      };
      const accountRepo: IAccountRepository = {
        getAccounts: vi.fn().mockResolvedValue([]),
        getAccountById: vi.fn().mockResolvedValue(undefined),
        saveAccounts: vi.fn().mockResolvedValue(undefined),
        saveAccount: vi.fn().mockResolvedValue(undefined),
        deleteAccount: vi.fn().mockResolvedValue(undefined),
      };

      const spamDetector = new SpamDetectorService();
      const spintaxService = new SpintaxService();
      const registry = new CopilotActionRegistry();
      registry
        .register(new ActivateCampaignAction())
        .register(new PauseCampaignAction())
        .register(new ApplySpamFixesAction(spamDetector))
        .register(new ApplySpintaxAction(spintaxService));

      const copilot = new CopilotService(
        campaignRepo,
        leadRepo,
        accountRepo,
        spamDetector,
        registry
      );

      return { copilot, campaignRepo };
    }

    it('preserves deterministic spam audit, ActionApproval HITL, diagnostics, and fallback menu without keys', async () => {
      const spammyCampaign = makeCampaign({
        steps: [
          {
            id: 's1',
            stepNumber: 1,
            waitDays: 0,
            variants: [
              {
                id: 'v1',
                name: 'Variant A',
                subject: '100% Free Urgent Offer',
                body: 'Act now for guaranteed money!',
              },
            ],
          },
        ],
      });
      const { copilot, campaignRepo } = buildCopilot(spammyCampaign);

      const spamCheck = await copilot.process({
        message: 'Check this campaign for spam words',
        campaignId: spammyCampaign.id,
        language: 'en',
      });
      expect(spamCheck.approval).toBeDefined();
      expect(spamCheck.approval?.toolName).toBe('applyCampaignSpamWordFixes');
      expect(spamCheck.approval?.status).toBe('pending');

      const activatePrompt = await copilot.process({
        message: 'Activar el envío ahora',
        campaignId: spammyCampaign.id,
        language: 'es',
      });
      expect(activatePrompt.approval?.toolName).toBe('activateCampaign');
      expect(activatePrompt.reply).toContain('¿Confirmas que deseas activar');

      const approved = await copilot.process({
        campaignId: spammyCampaign.id,
        actionApproval: { ...activatePrompt.approval!, status: 'approved' },
      });
      expect(approved.updatedCampaign.status).toBe('active');
      expect(campaignRepo.saveCampaign).toHaveBeenCalled();

      const rejected = await copilot.process({
        campaignId: spammyCampaign.id,
        actionApproval: { ...activatePrompt.approval!, status: 'rejected' },
      });
      expect(rejected.reply).toContain('cancelled by the user');

      const spintaxPrompt = await copilot.process({
        message: 'Apply spintax variations',
        campaignId: spammyCampaign.id,
        language: 'en',
      });
      expect(spintaxPrompt.approval?.toolName).toBe('applyCampaignBodySpintax');

      const sequenceRes = await copilot.process({
        message: 'Generate a sequence',
        campaignId: spammyCampaign.id,
        language: 'en',
      });
      expect(sequenceRes.updatedCampaign.steps).toHaveLength(3);

      const healthRes = await copilot.process({
        message: 'Diagnose health',
        campaignId: spammyCampaign.id,
        language: 'en',
      });
      expect(healthRes.reply).toContain('Campaign Health Diagnostics');
      expect(healthRes.approval).toBeUndefined();

      const fallbackEs = await copilot.process({
        message: 'hola',
        campaignId: spammyCampaign.id,
      });
      expect(fallbackEs.reply).toContain('Copilot de MiSender');
      expect(mockGenerateText).not.toHaveBeenCalled();
    });

    it('enriches general strategic fallback path via askCopilotLLM when an LLM key is configured, without altering HITL approvals', async () => {
      process.env.OPENAI_API_KEY = 'sk-copilot-test';
      const campaign = makeCampaign();
      const { copilot } = buildCopilot(campaign);

      // ActionApproval rule still takes precedence over LLM
      const pauseRes = await copilot.process({
        message: 'Pause sending',
        campaignId: campaign.id,
        language: 'en',
      });
      expect(pauseRes.approval?.toolName).toBe('pauseCampaign');
      expect(mockGenerateText).not.toHaveBeenCalled();

      // General strategic fallback enriches reply with campaign stats & steps context
      mockGenerateText.mockResolvedValueOnce({
        text: 'With a 45% open rate and 10% reply rate across 120 sends, add a case-study Step 2 follow-up after 3 days.',
      });

      const strategicRes = await copilot.process({
        message: 'How can I improve my cold email reply rate?',
        campaignId: campaign.id,
        language: 'en',
      });

      expect(mockGenerateText).toHaveBeenCalledTimes(1);
      const callArgs = mockGenerateText.mock.calls[0][0];
      expect(callArgs.prompt).toContain('sent=120');
      expect(callArgs.prompt).toContain('Quick question for {{companyName}}');
      expect(strategicRes.reply).toContain('45% open rate');
      expect(strategicRes.reply).toContain('MiSender Copilot');
    });
  });
});
