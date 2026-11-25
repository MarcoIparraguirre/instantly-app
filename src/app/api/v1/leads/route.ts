import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { container } from '@/core/container';
import { Lead } from '@/types';
import { checkLeadQuota } from '@/core/services/WorkspaceQuotaService';

const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

function resolveWorkspaceId(req: NextRequest, body?: unknown): string {
  const { searchParams } = new URL(req.url);
  const queryWs = searchParams.get('workspaceId')?.trim();
  if (queryWs) return queryWs;

  if (body && !Array.isArray(body) && typeof body === 'object') {
    const bodyWs = (body as Record<string, unknown>).workspaceId;
    if (typeof bodyWs === 'string' && bodyWs.trim()) {
      return bodyWs.trim();
    }
  }

  const headerWs = req.headers.get('x-workspace-id')?.trim();
  return headerWs || 'ws-primary';
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = resolveWorkspaceId(req);
    const campaignId = searchParams.get('campaignId')?.trim() || undefined;
    const status = searchParams.get('status')?.trim() || undefined;
    const limit = Math.min(500, Math.max(1, Number(searchParams.get('limit')) || 100));
    const offset = Math.max(0, Number(searchParams.get('offset')) || 0);

    let leads = await container.leadRepo.getLeads(campaignId, workspaceId);
    if (status) {
      leads = leads.filter(l => l.status === status);
    }

    const total = leads.length;
    const paginated = leads.slice(offset, offset + limit);

    return NextResponse.json({
      success: true,
      workspaceId,
      total,
      count: paginated.length,
      leads: paginated
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch leads' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const body = (await req.json()) as unknown;
    const workspaceId = resolveWorkspaceId(req, body);

    const bodyObj =
      body && !Array.isArray(body) && typeof body === 'object'
        ? (body as Record<string, unknown>)
        : null;

    const rawItems: unknown[] = Array.isArray(body)
      ? body
      : bodyObj && Array.isArray(bodyObj.leads)
        ? bodyObj.leads
        : bodyObj
          ? [bodyObj]
          : [];

    if (rawItems.length === 0) {
      return NextResponse.json(
        { error: 'Request body must include at least one lead' },
        { status: 400 }
      );
    }

    const defaultCampaignId =
      (bodyObj && typeof bodyObj.campaignId === 'string' && bodyObj.campaignId.trim()) ||
      searchParams.get('campaignId')?.trim() ||
      'campaign-1';

    const existingLeads = await container.leadRepo.getLeads(undefined, workspaceId);
    const existingKeys = new Set<string>(
      existingLeads.map(
        l => `${l.campaignId || 'campaign-1'}:${(l.email || '').toLowerCase().trim()}`
      )
    );

    const leadsToAdd: Lead[] = [];
    const duplicates: string[] = [];
    const invalid: { email: string; reason: string }[] = [];

    for (const rawItem of rawItems) {
      if (!rawItem || typeof rawItem !== 'object') {
        invalid.push({ email: '', reason: 'Lead payload must be an object' });
        continue;
      }

      const item = rawItem as Record<string, unknown>;
      const rawEmail = typeof item.email === 'string' ? item.email.trim().toLowerCase() : '';

      if (!rawEmail || !EMAIL_REGEX.test(rawEmail)) {
        invalid.push({ email: rawEmail, reason: 'Invalid email address format' });
        continue;
      }

      const targetCampaignId =
        typeof item.campaignId === 'string' && item.campaignId.trim()
          ? item.campaignId.trim()
          : defaultCampaignId;

      const dedupeKey = `${targetCampaignId}:${rawEmail}`;
      if (existingKeys.has(dedupeKey)) {
        duplicates.push(rawEmail);
        continue;
      }

      existingKeys.add(dedupeKey);

      const leadWorkspaceId =
        typeof item.workspaceId === 'string' && item.workspaceId.trim()
          ? item.workspaceId.trim()
          : workspaceId;

      const newLead: Lead = {
        id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : uuidv4(),
        workspaceId: leadWorkspaceId,
        campaignId: targetCampaignId,
        email: rawEmail,
        firstName: typeof item.firstName === 'string' ? item.firstName.trim() : '',
        lastName: typeof item.lastName === 'string' ? item.lastName.trim() : '',
        companyName: typeof item.companyName === 'string' ? item.companyName.trim() : '',
        website: typeof item.website === 'string' ? item.website.trim() : '',
        title: typeof item.title === 'string' ? item.title.trim() : undefined,
        customVariables:
          item.customVariables && typeof item.customVariables === 'object'
            ? (item.customVariables as Record<string, string>)
            : {},
        status: 'pending',
        currentStep: 1
      };

      leadsToAdd.push(newLead);
    }

    if (leadsToAdd.length === 0 && duplicates.length === 0 && invalid.length > 0) {
      return NextResponse.json(
        {
          error: 'No valid leads provided',
          invalid
        },
        { status: 400 }
      );
    }

    if (leadsToAdd.length > 0) {
      const newCountByWs = new Map<string, number>();
      for (const lead of leadsToAdd) {
        const wsId = lead.workspaceId || workspaceId;
        newCountByWs.set(wsId, (newCountByWs.get(wsId) || 0) + 1);
      }
      for (const [wsId, count] of newCountByWs.entries()) {
        const quota = await checkLeadQuota(wsId, count);
        if (!quota.allowed) {
          return NextResponse.json(quota, { status: quota.status });
        }
      }

      await container.leadRepo.addLeads(leadsToAdd);
    }

    return NextResponse.json(
      {
        success: true,
        workspaceId,
        addedCount: leadsToAdd.length,
        skippedDuplicates: duplicates.length,
        invalidCount: invalid.length,
        leads: leadsToAdd,
        duplicates,
        invalid
      },
      { status: leadsToAdd.length > 0 ? 201 : 200 }
    );
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create leads' },
      { status: 400 }
    );
  }
}
