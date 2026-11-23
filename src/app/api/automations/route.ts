import { NextRequest, NextResponse } from 'next/server';
import {
  AutomationAction,
  AutomationEngineService,
  AutomationTrigger,
  isValidAutomationActionType,
  isValidAutomationTrigger
} from '@/core/services/AutomationEngineService';

function resolveWorkspaceId(req: NextRequest, bodyWorkspaceId?: unknown): string {
  const { searchParams } = new URL(req.url);
  const queryWs = searchParams.get('workspaceId')?.trim();
  if (queryWs) return queryWs;
  if (typeof bodyWorkspaceId === 'string' && bodyWorkspaceId.trim()) {
    return bodyWorkspaceId.trim();
  }
  const headerWs = req.headers.get('x-workspace-id')?.trim();
  return headerWs || 'ws-primary';
}

function normalizeActions(raw: unknown): AutomationAction[] | null {
  const list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? [raw] : null;
  if (!list || list.length === 0) return null;

  const normalized: AutomationAction[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') return null;
    const obj = item as Record<string, unknown>;
    if (!isValidAutomationActionType(obj.type)) return null;
    normalized.push(obj as unknown as AutomationAction);
  }
  return normalized;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId =
      searchParams.get('workspaceId')?.trim() ||
      req.headers.get('x-workspace-id')?.trim() ||
      undefined;

    const [rules, runs] = await Promise.all([
      AutomationEngineService.getRules(workspaceId),
      AutomationEngineService.getRuns(workspaceId)
    ]);

    return NextResponse.json({
      rules,
      runs,
      templates: AutomationEngineService.getConnectorTemplates()
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error fetching automations' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const workspaceId = resolveWorkspaceId(req, body?.workspaceId);

    if (body?.action === 'test') {
      const rawTrigger = body.triggerEvent ?? body.trigger ?? 'lead.interested';
      if (!isValidAutomationTrigger(rawTrigger)) {
        return NextResponse.json(
          { error: `Invalid triggerEvent: ${String(rawTrigger)}` },
          { status: 400 }
        );
      }

      const customPayload =
        body.payload && typeof body.payload === 'object'
          ? (body.payload as Record<string, unknown>)
          : {};

      const samplePayload: Record<string, unknown> = {
        leadId: 'lead-sample-1',
        leadName: 'Elena Martínez',
        firstName: 'Elena',
        lastName: 'Martínez',
        leadEmail: 'elena@acmecorp.io',
        companyName: 'Acme Corp',
        campaignId: 'camp-sample-1',
        campaignName: 'Q4 Outbound Demo',
        sentiment: 'interested',
        isTest: true,
        ...customPayload
      };

      const ruleId = typeof body.ruleId === 'string' && body.ruleId.trim() ? body.ruleId.trim() : undefined;
      const runs = await AutomationEngineService.executeTrigger(
        workspaceId,
        rawTrigger,
        samplePayload,
        ruleId ? { ruleId } : undefined
      );

      return NextResponse.json({
        success: true,
        tested: true,
        triggerEvent: rawTrigger,
        workspaceId,
        runs
      });
    }

    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) {
      return NextResponse.json({ error: 'Rule name is required' }, { status: 400 });
    }

    const rawTrigger = body?.triggerEvent ?? body?.trigger;
    if (!isValidAutomationTrigger(rawTrigger)) {
      return NextResponse.json(
        { error: 'Valid triggerEvent is required' },
        { status: 400 }
      );
    }

    const actions = normalizeActions(body?.actions);
    if (!actions) {
      return NextResponse.json(
        { error: 'At least one valid automation action is required' },
        { status: 400 }
      );
    }

    const rule = await AutomationEngineService.saveRule({
      id: typeof body.id === 'string' && body.id.trim() ? body.id.trim() : undefined,
      workspaceId,
      name,
      description: typeof body.description === 'string' ? body.description : '',
      triggerEvent: rawTrigger,
      conditions: (body.conditions as Record<string, unknown>) ?? {},
      actions,
      isActive: body.isActive !== false
    });

    return NextResponse.json({ success: true, rule }, { status: 201 });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error processing automation request' },
      { status: 400 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const id = typeof body?.id === 'string' ? body.id.trim() : '';
    if (!id) {
      return NextResponse.json({ error: 'Automation rule id is required' }, { status: 400 });
    }

    const rawTrigger = body.triggerEvent ?? body.trigger;
    let triggerEvent: AutomationTrigger | undefined;
    if (rawTrigger !== undefined) {
      if (!isValidAutomationTrigger(rawTrigger)) {
        return NextResponse.json(
          { error: `Invalid triggerEvent: ${String(rawTrigger)}` },
          { status: 400 }
        );
      }
      triggerEvent = rawTrigger;
    }

    let actions: AutomationAction[] | undefined;
    if (body.actions !== undefined) {
      const normalized = normalizeActions(body.actions);
      if (!normalized) {
        return NextResponse.json({ error: 'Invalid automation actions' }, { status: 400 });
      }
      actions = normalized;
    }

    const updated = await AutomationEngineService.updateRule(id, {
      ...(typeof body.workspaceId === 'string' && body.workspaceId.trim()
        ? { workspaceId: body.workspaceId.trim() }
        : {}),
      ...(typeof body.name === 'string' ? { name: body.name } : {}),
      ...(typeof body.description === 'string' ? { description: body.description } : {}),
      ...(triggerEvent ? { triggerEvent } : {}),
      ...(body.conditions !== undefined
        ? { conditions: body.conditions as Record<string, unknown> }
        : {}),
      ...(actions ? { actions } : {}),
      ...(body.isActive !== undefined ? { isActive: Boolean(body.isActive) } : {})
    });

    if (!updated) {
      return NextResponse.json({ error: 'Automation rule not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, rule: updated });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error updating automation rule' },
      { status: 400 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    let id = searchParams.get('id')?.trim() || '';
    if (!id) {
      try {
        const body = (await req.json()) as { id?: string };
        if (typeof body?.id === 'string') id = body.id.trim();
      } catch {
        // Query param only
      }
    }

    if (!id) {
      return NextResponse.json({ error: 'Missing automation rule id' }, { status: 400 });
    }

    await AutomationEngineService.deleteRule(id);
    return NextResponse.json({ success: true, deletedId: id });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error deleting automation rule' },
      { status: 400 }
    );
  }
}
