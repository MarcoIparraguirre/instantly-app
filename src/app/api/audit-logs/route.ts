import { NextRequest, NextResponse } from 'next/server';
import { listAuditLogs, recordAuditLog } from '@/core/security/auditLog';

function getClientIp(req: NextRequest): string | undefined {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get('x-real-ip')?.trim();
  return realIp || undefined;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId =
      searchParams.get('workspaceId')?.trim() ||
      req.headers.get('x-workspace-id')?.trim() ||
      undefined;
    const action = searchParams.get('action')?.trim() || undefined;
    const rawLimit = searchParams.get('limit');
    const limit = rawLimit ? Number(rawLimit) : 100;

    const logs = await listAuditLogs({
      workspaceId,
      action,
      limit: Number.isFinite(limit) && limit > 0 ? limit : 100,
    });

    return NextResponse.json({
      logs,
      count: logs.length,
      workspaceId: workspaceId || null,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch audit logs' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    let body: Record<string, unknown>;
    try {
      const parsed = await req.json();
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
      }
      body = parsed as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const action = typeof body.action === 'string' ? body.action.trim() : '';
    if (!action) {
      return NextResponse.json({ error: 'action is required' }, { status: 400 });
    }

    const workspaceId =
      (typeof body.workspaceId === 'string' && body.workspaceId.trim()) ||
      searchParams.get('workspaceId')?.trim() ||
      req.headers.get('x-workspace-id')?.trim() ||
      'ws-primary';

    const actorId =
      (typeof body.actorId === 'string' && body.actorId.trim()) ||
      req.headers.get('x-user-id')?.trim() ||
      undefined;
    const actorEmail =
      (typeof body.actorEmail === 'string' && body.actorEmail.trim()) ||
      req.headers.get('x-user-email')?.trim() ||
      undefined;

    const entry = await recordAuditLog({
      workspaceId,
      actorId,
      actorEmail,
      action,
      resourceType: typeof body.resourceType === 'string' ? body.resourceType.trim() : undefined,
      resourceId: typeof body.resourceId === 'string' ? body.resourceId.trim() : undefined,
      metadata:
        body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
          ? (body.metadata as Record<string, unknown>)
          : undefined,
      ipAddress: getClientIp(req),
      userAgent: req.headers.get('user-agent') || undefined,
    });

    return NextResponse.json({ success: true, entry }, { status: 201 });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to record audit log' },
      { status: 500 }
    );
  }
}
