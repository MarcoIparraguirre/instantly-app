import { NextRequest, NextResponse } from 'next/server';
import { container } from '@/core/container';
import {
  isValidMultichannelChannel,
  MultichannelDispatcherService,
  SalesTask
} from '@/core/services/MultichannelDispatcherService';

function getExplicitWorkspaceId(req: NextRequest, bodyWorkspaceId?: unknown): string | undefined {
  const { searchParams } = new URL(req.url);
  const queryWs = searchParams.get('workspaceId')?.trim();
  if (queryWs) return queryWs;
  if (typeof bodyWorkspaceId === 'string' && bodyWorkspaceId.trim()) {
    return bodyWorkspaceId.trim();
  }
  const headerWs = req.headers.get('x-workspace-id')?.trim();
  return headerWs || undefined;
}

function summarizeTasks(tasks: SalesTask[]) {
  const pendingTasks = tasks.filter(t => t.status === 'pending');
  const completedTasks = tasks.filter(t => t.status === 'completed');

  return {
    pendingTasks,
    completedTasks,
    summary: {
      totalTasks: tasks.length,
      pendingCount: pendingTasks.length,
      completedCount: completedTasks.length,
      byChannel: {
        linkedin_task: {
          pending: pendingTasks.filter(t => t.channel === 'linkedin_task').length,
          completed: completedTasks.filter(t => t.channel === 'linkedin_task').length
        },
        call_task: {
          pending: pendingTasks.filter(t => t.channel === 'call_task').length,
          completed: completedTasks.filter(t => t.channel === 'call_task').length
        }
      }
    }
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: campaignId } = await params;
    const { searchParams } = new URL(req.url);
    const explicitWorkspaceId = getExplicitWorkspaceId(req);

    const campaign =
      typeof container.campaignRepo?.getCampaignById === 'function'
        ? await container.campaignRepo.getCampaignById(campaignId)
        : undefined;

    if (
      campaign &&
      explicitWorkspaceId &&
      campaign.workspaceId &&
      campaign.workspaceId !== explicitWorkspaceId
    ) {
      return NextResponse.json(
        { error: `Campaign ${campaignId} not found in workspace ${explicitWorkspaceId}` },
        { status: 404 }
      );
    }

    const workspaceId = explicitWorkspaceId || campaign?.workspaceId || 'ws-primary';
    const statusParam = searchParams.get('status')?.trim();
    const channelParam = searchParams.get('channel')?.trim();

    const allTasks = await MultichannelDispatcherService.getTasks({
      workspaceId,
      campaignId
    });

    const filteredTasks = allTasks.filter(task => {
      if (statusParam === 'pending' || statusParam === 'completed') {
        if (task.status !== statusParam) return false;
      }
      if (channelParam === 'linkedin_task' || channelParam === 'call_task') {
        if (task.channel !== channelParam) return false;
      }
      return true;
    });

    const leads =
      typeof container.leadRepo?.getLeads === 'function'
        ? await container.leadRepo.getLeads(campaignId, workspaceId)
        : [];

    const { pendingTasks, completedTasks, summary } = summarizeTasks(allTasks);

    return NextResponse.json({
      campaignId,
      workspaceId,
      leadsCount: leads.length,
      tasks: filteredTasks,
      pendingTasks,
      completedTasks,
      summary
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch multichannel tasks' },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: campaignId } = await params;

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Request body must be a JSON object' }, { status: 400 });
    }

    const explicitWorkspaceId = getExplicitWorkspaceId(req, body.workspaceId);
    const campaign =
      typeof container.campaignRepo?.getCampaignById === 'function'
        ? await container.campaignRepo.getCampaignById(campaignId)
        : undefined;

    if (
      campaign &&
      explicitWorkspaceId &&
      campaign.workspaceId &&
      campaign.workspaceId !== explicitWorkspaceId
    ) {
      return NextResponse.json(
        { error: `Campaign ${campaignId} not found in workspace ${explicitWorkspaceId}` },
        { status: 404 }
      );
    }

    const workspaceId = explicitWorkspaceId || campaign?.workspaceId || 'ws-primary';
    const completeTaskId =
      typeof body.completeTaskId === 'string' && body.completeTaskId.trim()
        ? body.completeTaskId.trim()
        : undefined;

    let completedTask: SalesTask | null = null;
    if (completeTaskId) {
      const notes = typeof body.notes === 'string' ? body.notes : undefined;
      completedTask = await MultichannelDispatcherService.completeTask(completeTaskId, {
        workspaceId,
        campaignId,
        notes
      });

      if (!completedTask) {
        return NextResponse.json(
          { error: `Task ${completeTaskId} not found in campaign ${campaignId}` },
          { status: 404 }
        );
      }

      if (body.channel === undefined) {
        return NextResponse.json({
          success: true,
          campaignId,
          workspaceId,
          completedTask
        });
      }
    }

    if (!isValidMultichannelChannel(body.channel)) {
      return NextResponse.json(
        { error: 'Valid channel is required (email, whatsapp, linkedin_task, call_task)' },
        { status: 400 }
      );
    }

    const messageTemplate =
      typeof body.messageTemplate === 'string' ? body.messageTemplate.trim() : '';
    if (!messageTemplate) {
      return NextResponse.json(
        { error: 'messageTemplate is required to execute a multichannel step' },
        { status: 400 }
      );
    }

    const allLeads =
      typeof container.leadRepo?.getLeads === 'function'
        ? await container.leadRepo.getLeads(campaignId, workspaceId)
        : [];

    const requestedLeadIds = Array.isArray(body.leadIds)
      ? new Set(body.leadIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0))
      : null;

    const targetLeads = requestedLeadIds
      ? allLeads.filter(l => requestedLeadIds.has(l.id))
      : allLeads.filter(l => l.status !== 'unsubscribed' && l.status !== 'bounced');

    const results = await MultichannelDispatcherService.dispatchBatch({
      channel: body.channel,
      workspaceId,
      campaignId,
      leads: targetLeads,
      messageTemplate,
      subjectTemplate:
        typeof body.subjectTemplate === 'string' ? body.subjectTemplate : undefined,
      whatsappAccessToken:
        typeof body.whatsappAccessToken === 'string' ? body.whatsappAccessToken : undefined,
      whatsappPhoneNumberId:
        typeof body.whatsappPhoneNumberId === 'string' ? body.whatsappPhoneNumberId : undefined,
      whatsappWebhookUrl:
        typeof body.whatsappWebhookUrl === 'string' ? body.whatsappWebhookUrl : undefined,
      whatsappWebhookSecret:
        typeof body.whatsappWebhookSecret === 'string' ? body.whatsappWebhookSecret : undefined
    });

    const tasksCreated = results.map(r => r.task).filter((t): t is SalesTask => Boolean(t));

    return NextResponse.json({
      success: true,
      campaignId,
      workspaceId,
      channel: body.channel,
      processed: results.length,
      sentCount: results.filter(r => r.status === 'sent').length,
      simulatedCount: results.filter(r => r.status === 'simulated').length,
      taskCreatedCount: tasksCreated.length,
      skippedCount: results.filter(r => r.status === 'skipped').length,
      errorCount: results.filter(r => r.status === 'error').length,
      results,
      tasksCreated,
      ...(completedTask ? { completedTask } : {})
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Multichannel dispatch failed' },
      { status: 500 }
    );
  }
}
