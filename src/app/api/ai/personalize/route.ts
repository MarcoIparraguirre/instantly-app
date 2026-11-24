import { NextRequest, NextResponse } from 'next/server';
import { container } from '@/core/container';
import {
  aiOutreachService,
  IcebreakerLeadInput,
  normalizeAiLanguage,
} from '@/core/services/AiOutreachService';
import { Lead } from '@/types';

const MAX_LEADS_PER_REQUEST = 100;

export async function POST(req: NextRequest) {
  try {
    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Request body must be a JSON object' }, { status: 400 });
    }

    const rawLeads = body.leads;
    if (!Array.isArray(rawLeads) || rawLeads.length === 0) {
      return NextResponse.json(
        { error: 'leads must be a non-empty array (1 to 100 leads)' },
        { status: 400 }
      );
    }

    if (rawLeads.length > MAX_LEADS_PER_REQUEST) {
      return NextResponse.json(
        { error: `Maximum ${MAX_LEADS_PER_REQUEST} leads allowed per request` },
        { status: 400 }
      );
    }

    const hasInvalidLead = rawLeads.some(
      (item) => !item || typeof item !== 'object' || Array.isArray(item)
    );
    if (hasInvalidLead) {
      return NextResponse.json(
        { error: 'Each item in leads must be a valid lead object' },
        { status: 400 }
      );
    }

    const leads = rawLeads as IcebreakerLeadInput[];
    const campaignId = typeof body.campaignId === 'string' && body.campaignId.trim()
      ? body.campaignId.trim()
      : undefined;
    const language = normalizeAiLanguage(
      typeof body.language === 'string' ? body.language : undefined
    );
    const tone = typeof body.tone === 'string' && body.tone.trim()
      ? body.tone.trim()
      : 'consultative';
    const saveToLeads = Boolean(body.saveToLeads);

    const icebreakers = await aiOutreachService.generateIcebreakers(leads, language, tone);

    let savedCount = 0;
    if (saveToLeads) {
      const requestedWorkspaceId =
        req.headers.get('x-workspace-id')?.trim() ||
        (typeof body.workspaceId === 'string' ? body.workspaceId.trim() : undefined);

      for (let i = 0; i < leads.length; i++) {
        const inputLead = leads[i];
        const generated = icebreakers[i];
        const leadId = typeof inputLead.id === 'string' ? inputLead.id.trim() : '';

        if (!leadId || !generated?.icebreaker) {
          continue;
        }

        const existing =
          typeof container.leadRepo.getLeadById === 'function'
            ? await container.leadRepo.getLeadById(leadId)
            : undefined;

        const baseLead: Lead = existing || {
          id: leadId,
          workspaceId: inputLead.workspaceId || requestedWorkspaceId || 'ws-primary',
          campaignId: inputLead.campaignId || campaignId || 'campaign-1',
          email: inputLead.email || '',
          firstName: inputLead.firstName || '',
          lastName: inputLead.lastName || '',
          companyName: inputLead.companyName || '',
          website: inputLead.website || '',
          status: inputLead.status || 'pending',
          currentStep: inputLead.currentStep || 1,
          customVariables: inputLead.customVariables || {},
        };

        const updatedLead: Lead = {
          ...baseLead,
          customVariables: {
            ...(baseLead.customVariables || {}),
            ...(inputLead.customVariables || {}),
            ICEBREAKER: generated.icebreaker,
          },
        };

        await container.leadRepo.updateLead(updatedLead);
        savedCount++;
      }
    }

    const provider = icebreakers[0]?.provider || aiOutreachService.detectProvider();

    return NextResponse.json({
      success: true,
      provider,
      language,
      tone,
      campaignId,
      count: icebreakers.length,
      savedCount,
      icebreakers,
    });
  } catch (err: unknown) {
    console.error('AI personalize error:', err);
    const message = err instanceof Error ? err.message : 'Failed to generate icebreakers';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
