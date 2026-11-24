import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { container } from '@/core/container';
import { supabase } from '@/core/supabase/client';
import { recordAuditLog } from '@/core/security/auditLog';

interface GdprEraseParams {
  email?: string;
  leadId?: string;
  workspaceId?: string;
}

function shouldUseSupabase(): boolean {
  return Boolean(
    (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL) &&
      (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  );
}

function isSupabaseRepo(repo: unknown, expectedName: string): boolean {
  if (!repo || typeof repo !== 'object') return false;
  return (repo as { constructor?: { name?: string } }).constructor?.name === expectedName;
}

async function deleteSupabaseRowsByIds(tableName: string, ids: string[]): Promise<void> {
  if (!shouldUseSupabase() || ids.length === 0) return;
  try {
    const table = supabase.from(tableName) as unknown as {
      delete?: () => { in?: (col: string, vals: string[]) => Promise<unknown>; eq?: (col: string, val: string) => Promise<unknown> };
    };
    if (typeof table?.delete !== 'function') return;
    const del = table.delete();
    if (typeof del?.in === 'function') {
      await del.in('id', ids);
    } else if (typeof del?.eq === 'function') {
      for (const id of ids) {
        await del.eq('id', id);
      }
    }
  } catch (err) {
    console.warn(`GDPR erase Supabase delete warning on ${tableName}:`, err);
  }
}

async function parseEraseParams(req: NextRequest): Promise<GdprEraseParams> {
  const { searchParams } = new URL(req.url);
  let body: Record<string, unknown> = {};
  try {
    const raw = await req.text();
    if (raw.trim()) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        body = parsed as Record<string, unknown>;
      }
    }
  } catch {
    // Ignore malformed/empty body on DELETE or query-only POST
  }

  const email =
    (typeof body.email === 'string' ? body.email.trim().toLowerCase() : '') ||
    (searchParams.get('email')?.trim().toLowerCase() ?? '');
  const leadId =
    (typeof body.leadId === 'string' ? body.leadId.trim() : '') ||
    (searchParams.get('leadId')?.trim() ?? '');
  const workspaceId =
    (typeof body.workspaceId === 'string' ? body.workspaceId.trim() : '') ||
    searchParams.get('workspaceId')?.trim() ||
    req.headers.get('x-workspace-id')?.trim() ||
    undefined;

  return {
    email: email || undefined,
    leadId: leadId || undefined,
    workspaceId: workspaceId || undefined,
  };
}

async function handleGdprErase(req: NextRequest) {
  try {
    const { email, leadId, workspaceId: explicitWorkspaceId } = await parseEraseParams(req);

    if (!email && !leadId) {
      return NextResponse.json(
        { error: 'email or leadId is required for GDPR erasure' },
        { status: 400 }
      );
    }

    // Load leads once to resolve email/workspaceId when only leadId is provided
    const allLeads = typeof container.leadRepo?.getLeads === 'function'
      ? await container.leadRepo.getLeads()
      : [];

    let resolvedEmail = email;
    let resolvedLeadWorkspaceId: string | undefined;

    if (leadId) {
      const matchedById =
        allLeads.find((l) => l.id === leadId) ||
        (typeof container.leadRepo?.getLeadById === 'function'
          ? await container.leadRepo.getLeadById(leadId)
          : undefined);
      if (matchedById) {
        if (!resolvedEmail && matchedById.email) {
          resolvedEmail = matchedById.email.trim().toLowerCase();
        }
        resolvedLeadWorkspaceId = matchedById.workspaceId;
      }
    }

    const effectiveWorkspaceId = explicitWorkspaceId || resolvedLeadWorkspaceId || 'ws-primary';

    // 1. Erase Leads
    const leadsToErase = allLeads.filter((l) => {
      const leadWs = l.workspaceId || 'ws-primary';
      if (leadWs !== effectiveWorkspaceId) return false;
      const matchesEmail = Boolean(resolvedEmail && l.email?.trim().toLowerCase() === resolvedEmail);
      const matchesId = Boolean(leadId && l.id === leadId);
      return matchesEmail || matchesId;
    });

    const erasedLeadIds = new Set<string>(leadsToErase.map((l) => l.id));
    if (leadId) erasedLeadIds.add(leadId);

    if (leadsToErase.length > 0) {
      if (isSupabaseRepo(container.leadRepo, 'SupabaseLeadRepository')) {
        await deleteSupabaseRowsByIds(
          'leads',
          leadsToErase.map((l) => l.id)
        );
      } else if (typeof container.leadRepo?.saveLeads === 'function') {
        const remainingLeads = allLeads.filter((l) => !erasedLeadIds.has(l.id));
        await container.leadRepo.saveLeads(remainingLeads);
      }
    }

    // 2. Erase Email Threads
    let erasedThreadsCount = 0;
    if (typeof container.threadRepo?.getThreads === 'function') {
      const allThreads = await container.threadRepo.getThreads();
      const threadsToErase = allThreads.filter((t) => {
        const threadWs = t.workspaceId || 'ws-primary';
        if (threadWs !== effectiveWorkspaceId) return false;
        const matchesEmail = Boolean(
          resolvedEmail && t.leadEmail?.trim().toLowerCase() === resolvedEmail
        );
        const matchesLeadId = Boolean(t.leadId && erasedLeadIds.has(t.leadId));
        return matchesEmail || matchesLeadId;
      });
      erasedThreadsCount = threadsToErase.length;

      if (threadsToErase.length > 0) {
        const eraseThreadIds = new Set(threadsToErase.map((t) => t.id));
        if (isSupabaseRepo(container.threadRepo, 'SupabaseThreadRepository')) {
          await deleteSupabaseRowsByIds(
            'email_threads',
            threadsToErase.map((t) => t.id)
          );
        } else if (typeof container.threadRepo?.saveThreads === 'function') {
          const remainingThreads = allThreads.filter((t) => !eraseThreadIds.has(t.id));
          await container.threadRepo.saveThreads(remainingThreads);
        }
      }
    }

    // 3. Erase Deals
    let erasedDealsCount = 0;
    if (typeof container.dealRepo?.getDeals === 'function') {
      const workspaceDeals = await container.dealRepo.getDeals(effectiveWorkspaceId);
      const dealsToErase = workspaceDeals.filter((d) => {
        const matchesEmail = Boolean(
          resolvedEmail && d.contactEmail?.trim().toLowerCase() === resolvedEmail
        );
        const matchesLeadId = Boolean(d.leadId && erasedLeadIds.has(d.leadId));
        return matchesEmail || matchesLeadId;
      });

      for (const deal of dealsToErase) {
        if (typeof container.dealRepo.deleteDeal === 'function') {
          await container.dealRepo.deleteDeal(deal.id);
          erasedDealsCount += 1;
        }
      }
    }

    // 4. Record irreversible SHA-256 blocklist hash (retaining zero plaintext email PII)
    let blocklistHash: string | null = null;
    if (resolvedEmail) {
      const digest = crypto.createHash('sha256').update(resolvedEmail, 'utf8').digest('hex');
      blocklistHash = `sha256:${digest}`;

      if (typeof container.blocklistRepo?.getBlocklist === 'function') {
        const existingItems = await container.blocklistRepo.getBlocklist();
        // Scrub any pre-existing plaintext blocklist entry for this email in the target workspace
        if (typeof container.blocklistRepo.removeFromBlocklist === 'function') {
          for (const item of existingItems) {
            const itemWs = item.workspaceId || 'ws-primary';
            if (
              itemWs === effectiveWorkspaceId &&
              item.value.trim().toLowerCase() === resolvedEmail
            ) {
              await container.blocklistRepo.removeFromBlocklist(item.id);
            }
          }
        }

        const alreadyHasHash = existingItems.some(
          (item) =>
            (item.workspaceId || 'ws-primary') === effectiveWorkspaceId &&
            item.value.trim().toLowerCase() === blocklistHash
        );
        if (!alreadyHasHash && typeof container.blocklistRepo.addToBlocklist === 'function') {
          await container.blocklistRepo.addToBlocklist({
            workspaceId: effectiveWorkspaceId,
            type: 'email',
            value: blocklistHash,
            reason: 'unsubscribed',
          });
        }
      }
    }

    // 5. Record GDPR audit log without storing plaintext PII
    const forwarded = req.headers.get('x-forwarded-for');
    const ipAddress = forwarded?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || undefined;

    await recordAuditLog({
      workspaceId: effectiveWorkspaceId,
      actorId: req.headers.get('x-user-id')?.trim() || undefined,
      actorEmail: req.headers.get('x-user-email')?.trim() || undefined,
      action: 'gdpr.erase',
      resourceType: 'lead',
      resourceId: blocklistHash || leadId || undefined,
      metadata: {
        emailHash: blocklistHash,
        erasedLeads: leadsToErase.length,
        erasedThreads: erasedThreadsCount,
        erasedDeals: erasedDealsCount,
      },
      ipAddress,
      userAgent: req.headers.get('user-agent') || undefined,
    });

    return NextResponse.json({
      success: true,
      workspaceId: effectiveWorkspaceId,
      blocklistHash,
      erased: {
        leads: leadsToErase.length,
        threads: erasedThreadsCount,
        deals: erasedDealsCount,
      },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'GDPR erasure failed' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return handleGdprErase(req);
}

export async function DELETE(req: NextRequest) {
  return handleGdprErase(req);
}
