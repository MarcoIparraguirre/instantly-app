import { NextRequest, NextResponse } from 'next/server';
import { container } from '@/core/container';
import { v4 as uuidv4 } from 'uuid';
import { Lead } from '@/types';
import { checkLeadQuota } from '@/core/services/WorkspaceQuotaService';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const campaignId = searchParams.get('campaignId') || undefined;
  const workspaceId = searchParams.get('workspaceId') || undefined;
  const leads = await container.leadRepo.getLeads(campaignId, workspaceId);
  return NextResponse.json(leads);
}

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const body = await req.json();
    const items = Array.isArray(body) ? body : [body];

    const newLeads: Lead[] = items.map(item => ({
      id: item.id || uuidv4(),
      workspaceId:
        item.workspaceId ||
        (!Array.isArray(body) ? body?.workspaceId : undefined) ||
        searchParams.get('workspaceId') ||
        'ws-primary',
      campaignId: item.campaignId || 'campaign-1',
      email: item.email,
      firstName: item.firstName || '',
      lastName: item.lastName || '',
      companyName: item.companyName || '',
      website: item.website || '',
      status: 'pending',
      currentStep: 1,
      customVariables: item.customVariables || {}
    }));

    // Enforce workspace lead quota for genuinely new leads (updates to existing leads are exempt)
    const leadsByWorkspace = new Map<string, Lead[]>();
    for (const lead of newLeads) {
      const wsId = lead.workspaceId || 'ws-primary';
      const bucket = leadsByWorkspace.get(wsId) || [];
      bucket.push(lead);
      leadsByWorkspace.set(wsId, bucket);
    }

    for (const [wsId, wsNewLeads] of leadsByWorkspace.entries()) {
      const existing = await container.leadRepo.getLeads(undefined, wsId);
      const existingIds = new Set(existing.map(l => l.id));
      const existingKeys = new Set(
        existing.map(l => `${l.campaignId || 'campaign-1'}:${(l.email || '').toLowerCase().trim()}`)
      );
      const seenIncoming = new Set<string>();
      let netNewCount = 0;

      for (const candidate of wsNewLeads) {
        const key = `${candidate.campaignId || 'campaign-1'}:${(candidate.email || '').toLowerCase().trim()}`;
        if (existingIds.has(candidate.id) || existingKeys.has(key) || seenIncoming.has(key)) {
          continue;
        }
        seenIncoming.add(key);
        netNewCount++;
      }

      if (netNewCount > 0) {
        const quota = await checkLeadQuota(wsId, netNewCount);
        if (!quota.allowed) {
          return NextResponse.json(quota, { status: quota.status });
        }
      }
    }

    await container.leadRepo.addLeads(newLeads);
    return NextResponse.json(newLeads, { status: 201 });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to add leads' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const campaignId = searchParams.get('campaignId');
    if (!campaignId) {
      return NextResponse.json(
        { error: 'campaignId query parameter is strictly required to prevent global lead deletion' },
        { status: 400 }
      );
    }
    await container.leadRepo.deleteLeads(campaignId);
    return NextResponse.json({ success: true, clearedCampaignId: campaignId });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to delete leads' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const campaignId = searchParams.get('campaignId') || undefined;
    const workspaceId = searchParams.get('workspaceId') || undefined;
    const body = await req.json();

    if (body.action === 'reset_status') {
      const leads = await container.leadRepo.getLeads(campaignId, workspaceId || body.workspaceId || undefined);
      const updated = leads.map(l => {
        const nextCustomVars = l.customVariables ? { ...l.customVariables } : {};
        if ('ESTADO' in nextCustomVars) nextCustomVars.ESTADO = 'Pendiente';
        return {
          ...l,
          status: 'pending' as const,
          currentStep: 1,
          lastContactedAt: undefined,
          customVariables: nextCustomVars
        };
      });
      await container.leadRepo.addLeads(updated);
      return NextResponse.json({ success: true, count: updated.length });
    }

    if (body.action === 'update_lead' && body.lead) {
      let leadWorkspaceId = body.lead.workspaceId || workspaceId || body.workspaceId;
      if (!leadWorkspaceId && typeof container.leadRepo.getLeadById === 'function') {
        const existing = await container.leadRepo.getLeadById(body.lead.id);
        leadWorkspaceId = existing?.workspaceId;
      }
      const updatedLead: Lead = {
        ...body.lead,
        workspaceId: leadWorkspaceId || 'ws-primary'
      };
      await container.leadRepo.updateLead(updatedLead);
      return NextResponse.json({ success: true, lead: updatedLead });
    }

    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to update leads' }, { status: 500 });
  }
}
