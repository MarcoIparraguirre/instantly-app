import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { container } from '@/core/container';
import {
  EnrichedLeadContact,
  LeadEnrichmentInput,
  LeadEnrichmentResult,
  LeadEnrichmentService
} from '@/core/services/LeadEnrichmentService';
import { Lead } from '@/types';

const MAX_BATCH_SIZE = 25;

interface EnrichRequestItem {
  domain?: unknown;
  website?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  companyName?: unknown;
  title?: unknown;
  email?: unknown;
  apolloApiKey?: unknown;
  hunterApiKey?: unknown;
  smtpProbe?: unknown;
  externalVerify?: unknown;
}

function asOptionalString(val: unknown): string | undefined {
  return typeof val === 'string' && val.trim() ? val.trim() : undefined;
}

function hasSearchTarget(item: EnrichRequestItem): boolean {
  return Boolean(
    asOptionalString(item.domain) ||
      asOptionalString(item.website) ||
      asOptionalString(item.companyName) ||
      asOptionalString(item.email)
  );
}

function toServiceInput(
  item: EnrichRequestItem,
  sharedDefaults: {
    apolloApiKey?: string;
    hunterApiKey?: string;
    smtpProbe?: boolean;
    externalVerify?: boolean;
  }
): LeadEnrichmentInput {
  return {
    domain: asOptionalString(item.domain),
    website: asOptionalString(item.website),
    firstName: asOptionalString(item.firstName),
    lastName: asOptionalString(item.lastName),
    companyName: asOptionalString(item.companyName),
    title: asOptionalString(item.title),
    email: asOptionalString(item.email),
    apolloApiKey: asOptionalString(item.apolloApiKey) || sharedDefaults.apolloApiKey,
    hunterApiKey: asOptionalString(item.hunterApiKey) || sharedDefaults.hunterApiKey,
    smtpProbe: typeof item.smtpProbe === 'boolean' ? item.smtpProbe : sharedDefaults.smtpProbe,
    externalVerify:
      typeof item.externalVerify === 'boolean' ? item.externalVerify : sharedDefaults.externalVerify
  };
}

function selectPersistableContacts(
  input: LeadEnrichmentInput,
  result: LeadEnrichmentResult
): EnrichedLeadContact[] {
  const verified = result.leads.filter(c => c.verified && c.email);
  if (verified.length === 0) return [];

  // When enriching a specific person by name, avoid saving 5 permutation duplicates for catch-all domains
  if (input.firstName && input.lastName) {
    const externalPreferred = verified.filter(c => c.source === 'apollo' || c.source === 'hunter');
    if (externalPreferred.length > 0) {
      return [externalPreferred[0]];
    }
    return [verified[0]];
  }

  return verified;
}

async function resolveWorkspaceId(
  req: NextRequest,
  bodyWorkspaceId: unknown,
  campaignId?: string
): Promise<string> {
  const { searchParams } = new URL(req.url);
  const explicit =
    asOptionalString(bodyWorkspaceId) ||
    searchParams.get('workspaceId')?.trim() ||
    req.headers.get('x-workspace-id')?.trim();

  if (explicit) return explicit;

  if (campaignId && typeof container.campaignRepo?.getCampaignById === 'function') {
    const campaign = await container.campaignRepo.getCampaignById(campaignId);
    if (campaign?.workspaceId) {
      return campaign.workspaceId;
    }
  }

  return 'ws-primary';
}

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

    const campaignId = asOptionalString(body.campaignId) || 'campaign-1';
    const workspaceId = await resolveWorkspaceId(req, body.workspaceId, campaignId);
    const saveToCampaign = body.saveToCampaign === true;

    const sharedDefaults = {
      apolloApiKey: asOptionalString(body.apolloApiKey),
      hunterApiKey: asOptionalString(body.hunterApiKey),
      smtpProbe: typeof body.smtpProbe === 'boolean' ? body.smtpProbe : undefined,
      externalVerify: typeof body.externalVerify === 'boolean' ? body.externalVerify : undefined
    };

    const isBatch = 'leads' in body && body.leads !== undefined;
    let items: EnrichRequestItem[];

    if (isBatch) {
      if (!Array.isArray(body.leads) || body.leads.length === 0) {
        return NextResponse.json(
          { error: 'leads must be a non-empty array when provided' },
          { status: 400 }
        );
      }
      if (body.leads.length > MAX_BATCH_SIZE) {
        return NextResponse.json(
          { error: `Batch enrichment limit exceeded: maximum ${MAX_BATCH_SIZE} items per request` },
          { status: 400 }
        );
      }

      for (let i = 0; i < body.leads.length; i++) {
        const entry = body.leads[i] as EnrichRequestItem;
        if (!entry || typeof entry !== 'object' || !hasSearchTarget(entry)) {
          return NextResponse.json(
            {
              error: `Item at index ${i} must include at least one of domain, website, companyName, or email`
            },
            { status: 400 }
          );
        }
      }
      items = body.leads as EnrichRequestItem[];
    } else {
      const single = body as unknown as EnrichRequestItem;
      if (!hasSearchTarget(single)) {
        return NextResponse.json(
          { error: 'Please provide at least one of domain, website, companyName, or email' },
          { status: 400 }
        );
      }
      items = [single];
    }

    const serviceInputs = items.map(item => toServiceInput(item, sharedDefaults));
    const results: LeadEnrichmentResult[] = [];
    for (const svcInput of serviceInputs) {
      const enriched = await LeadEnrichmentService.enrich(svcInput);
      results.push(enriched);
    }

    const savedLeads: Lead[] = [];
    if (saveToCampaign && container.leadRepo) {
      const existingLeads = await container.leadRepo.getLeads(campaignId, workspaceId);
      const existingEmails = new Set(
        existingLeads.map(l => (l.email || '').trim().toLowerCase()).filter(Boolean)
      );

      for (let i = 0; i < results.length; i++) {
        const candidates = selectPersistableContacts(serviceInputs[i], results[i]);
        for (const contact of candidates) {
          const normEmail = contact.email.trim().toLowerCase();
          if (existingEmails.has(normEmail)) continue;
          existingEmails.add(normEmail);

          savedLeads.push({
            id: uuidv4(),
            workspaceId,
            campaignId,
            email: normEmail,
            firstName: contact.firstName || '',
            lastName: contact.lastName || '',
            companyName: contact.companyName || '',
            website: contact.website || '',
            title: contact.title || '',
            status: 'pending',
            currentStep: 1,
            customVariables: {
              ...(contact.title ? { Cargo: contact.title } : {}),
              ...(contact.linkedinUrl ? { LinkedIn: contact.linkedinUrl } : {}),
              ...(contact.phone ? { Telefono: contact.phone } : {}),
              EnrichmentSource: contact.source,
              EnrichmentConfidence: String(contact.confidence)
            }
          });
        }
      }

      if (savedLeads.length > 0) {
        await container.leadRepo.addLeads(savedLeads);
      }
    }

    if (isBatch) {
      return NextResponse.json({
        success: true,
        mode: 'batch',
        workspaceId,
        campaignId,
        processedCount: results.length,
        savedCount: savedLeads.length,
        savedLeads,
        results
      });
    }

    return NextResponse.json({
      success: true,
      mode: 'single',
      workspaceId,
      campaignId,
      savedCount: savedLeads.length,
      savedLeads,
      ...results[0]
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Lead enrichment failed' },
      { status: 500 }
    );
  }
}
