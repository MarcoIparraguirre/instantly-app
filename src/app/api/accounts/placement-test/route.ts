import { NextRequest, NextResponse } from 'next/server';
import { container } from '@/core/container';
import {
  AddSeedMailboxInput,
  PlacementTestService,
  sanitizeSeedMailbox
} from '@/core/services/PlacementTestService';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function resolveWorkspaceId(req: NextRequest, bodyWorkspaceId?: unknown): string | undefined {
  const { searchParams } = new URL(req.url);
  const queryWs = searchParams.get('workspaceId')?.trim();
  if (queryWs) return queryWs;
  if (typeof bodyWorkspaceId === 'string' && bodyWorkspaceId.trim()) {
    return bodyWorkspaceId.trim();
  }
  const headerWs = req.headers.get('x-workspace-id')?.trim();
  return headerWs || undefined;
}

export async function GET(req: NextRequest) {
  try {
    const workspaceId = resolveWorkspaceId(req);
    const tester = container.placementTester;
    const seeds =
      typeof tester?.getSeedMailboxes === 'function'
        ? await tester.getSeedMailboxes(workspaceId)
        : await PlacementTestService.getSeedMailboxes(workspaceId);

    const safeSeeds = seeds.map(sanitizeSeedMailbox);
    return NextResponse.json({
      seeds: safeSeeds,
      count: safeSeeds.length
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error listing seed mailboxes' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const workspaceId = resolveWorkspaceId(req, body?.workspaceId);

    if (body?.action === 'add_seed') {
      const rawEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      if (!rawEmail || !EMAIL_REGEX.test(rawEmail)) {
        return NextResponse.json(
          { error: 'Valid seed mailbox email is required' },
          { status: 400 }
        );
      }

      const seedInput: AddSeedMailboxInput = {
        ...(typeof body.id === 'string' && body.id.trim() ? { id: body.id.trim() } : {}),
        workspaceId: workspaceId || 'ws-primary',
        email: rawEmail,
        ...(typeof body.provider === 'string' && body.provider.trim()
          ? { provider: body.provider.trim() }
          : {}),
        ...(typeof body.imapHost === 'string' && body.imapHost.trim()
          ? { imapHost: body.imapHost.trim() }
          : {}),
        ...(body.imapPort !== undefined ? { imapPort: Number(body.imapPort) || 993 } : {}),
        ...(typeof body.imapUser === 'string' && body.imapUser.trim()
          ? { imapUser: body.imapUser.trim() }
          : {}),
        ...(typeof body.imapPass === 'string' ? { imapPass: body.imapPass } : {}),
        ...(body.isActive !== undefined ? { isActive: Boolean(body.isActive) } : {})
      };

      const tester = container.placementTester;
      const created =
        typeof tester?.addSeedMailbox === 'function'
          ? await tester.addSeedMailbox(seedInput)
          : await PlacementTestService.addSeedMailbox(seedInput);

      return NextResponse.json(
        {
          success: true,
          seed: sanitizeSeedMailbox(created)
        },
        { status: 201 }
      );
    }

    const accountId = typeof body?.accountId === 'string' ? body.accountId : undefined;
    const subject =
      typeof body?.subject === 'string' && body.subject.trim()
        ? body.subject
        : 'Quick sync regarding next week';
    const emailBody =
      typeof body?.body === 'string' && body.body.trim()
        ? body.body
        : 'Hi there, wanted to follow up on our discussion.';
    const mode = body?.mode === 'live_seed' ? 'live_seed' : 'heuristic';

    const accounts = await container.accountRepo.getAccounts(workspaceId);
    const sender = accountId ? accounts.find((a) => a.id === accountId) : accounts[0];

    if (!sender) {
      return NextResponse.json({ error: 'No sender account found' }, { status: 400 });
    }

    const report = await container.placementTester.runPlacementTest(sender, subject, emailBody, {
      mode,
      workspaceId: workspaceId || sender.workspaceId,
      mailers: {
        smtp: container.smtpMailer,
        simulated: container.simulatedMailer
      }
    });
    return NextResponse.json(report);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error running placement test' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    let id = searchParams.get('id')?.trim() || '';

    if (!id) {
      try {
        const body = (await req.json()) as { id?: unknown };
        if (typeof body?.id === 'string') id = body.id.trim();
      } catch {
        // Query param only
      }
    }

    if (!id) {
      return NextResponse.json({ error: 'Seed mailbox id is required' }, { status: 400 });
    }

    const tester = container.placementTester;
    const removed =
      typeof tester?.removeSeedMailbox === 'function'
        ? await tester.removeSeedMailbox(id)
        : await PlacementTestService.removeSeedMailbox(id);

    return NextResponse.json({ success: true, removed, id });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error removing seed mailbox' },
      { status: 500 }
    );
  }
}
