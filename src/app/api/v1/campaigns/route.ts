import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { container } from '@/core/container';
import { Campaign } from '@/types';

function resolveWorkspaceId(req: NextRequest, body?: Record<string, unknown>): string {
  const { searchParams } = new URL(req.url);
  const queryWs = searchParams.get('workspaceId')?.trim();
  if (queryWs) return queryWs;

  if (body && typeof body.workspaceId === 'string' && body.workspaceId.trim()) {
    return body.workspaceId.trim();
  }

  const headerWs = req.headers.get('x-workspace-id')?.trim();
  return headerWs || 'ws-primary';
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = resolveWorkspaceId(req);
    const status = searchParams.get('status')?.trim() || undefined;

    let campaigns = await container.campaignRepo.getCampaigns(workspaceId);
    if (status) {
      campaigns = campaigns.filter(c => c.status === status);
    }

    return NextResponse.json({
      success: true,
      workspaceId,
      count: campaigns.length,
      campaigns
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch campaigns' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const workspaceId = resolveWorkspaceId(req, body);
    const action = typeof body?.action === 'string' ? body.action.trim().toLowerCase() : '';

    if (action) {
      const campaignId =
        (typeof body.campaignId === 'string' && body.campaignId.trim()) ||
        (typeof body.id === 'string' && body.id.trim()) ||
        '';

      if (!campaignId) {
        return NextResponse.json(
          { error: 'campaignId is required for campaign actions' },
          { status: 400 }
        );
      }

      if (!['dispatch', 'pause', 'activate'].includes(action)) {
        return NextResponse.json(
          { error: `Unsupported action "${action}". Allowed: dispatch, pause, activate` },
          { status: 400 }
        );
      }

      const campaign = await container.campaignRepo.getCampaignById(campaignId);
      if (!campaign) {
        return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
      }

      const campaignWs = campaign.workspaceId || 'ws-primary';
      if (campaignWs !== workspaceId) {
        return NextResponse.json(
          { error: 'Forbidden: Campaign does not belong to the requested workspace' },
          { status: 403 }
        );
      }

      if (action === 'activate') {
        const updated: Campaign = {
          ...campaign,
          status: 'active',
          updatedAt: new Date().toISOString()
        };
        await container.campaignRepo.saveCampaign(updated);
        return NextResponse.json({
          success: true,
          action: 'activate',
          workspaceId,
          campaign: updated
        });
      }

      if (action === 'pause') {
        const updated: Campaign = {
          ...campaign,
          status: 'paused',
          updatedAt: new Date().toISOString()
        };
        await container.campaignRepo.saveCampaign(updated);
        return NextResponse.json({
          success: true,
          action: 'pause',
          workspaceId,
          campaign: updated
        });
      }

      // action === 'dispatch'
      const batchSize =
        typeof body.batchSize === 'number' && body.batchSize > 0 ? body.batchSize : 15;
      const respectSchedule = Boolean(body.respectSchedule ?? false);
      const simulationOnly = Boolean(body.simulationOnly ?? false);

      const result = await container.dispatcher.dispatchStep(campaign.id, {
        batchSize,
        respectSchedule,
        simulationOnly
      });

      return NextResponse.json({
        success: true,
        action: 'dispatch',
        workspaceId,
        campaignId: campaign.id,
        result
      });
    }

    // Create campaign via v1 API when name is supplied without action
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) {
      return NextResponse.json(
        { error: 'Provide either action (dispatch|pause|activate) or campaign name' },
        { status: 400 }
      );
    }

    const nowIso = new Date().toISOString();
    const newCampaign: Campaign = {
      id: typeof body.id === 'string' && body.id.trim() ? body.id.trim() : uuidv4(),
      workspaceId,
      name,
      status: 'draft',
      steps: Array.isArray(body.steps) ? (body.steps as Campaign['steps']) : [],
      schedule: (body.schedule as Campaign['schedule']) || {
        timing: { from: '09:00', to: '17:00' },
        days: [1, 2, 3, 4, 5],
        timezone: 'America/New_York',
        dailyLimit: 50,
        strategy: 'office-hours'
      },
      senderAccountIds: Array.isArray(body.senderAccountIds)
        ? (body.senderAccountIds as string[])
        : [],
      openTracking: body.openTracking !== false,
      clickTracking: Boolean(body.clickTracking),
      stats: { sent: 0, opened: 0, replied: 0, bounced: 0, opportunities: 0 },
      createdAt: nowIso,
      updatedAt: nowIso
    };

    await container.campaignRepo.saveCampaign(newCampaign);
    return NextResponse.json(
      {
        success: true,
        workspaceId,
        campaign: newCampaign
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to process campaign request' },
      { status: 400 }
    );
  }
}
