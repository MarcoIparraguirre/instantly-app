import { NextRequest, NextResponse } from 'next/server';
import { container } from '@/core/container';
import { ImapInboxService } from '@/core/services/ImapInboxService';
import { EmailThread } from '@/types';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get('workspaceId') || undefined;
    const threads = await container.threadRepo.getThreads(workspaceId);
    return NextResponse.json({ success: true, threads });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error fetching threads' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    let bodyWorkspaceId: string | undefined;
    try {
      const body = await req.json();
      if (body && typeof body.workspaceId === 'string' && body.workspaceId.trim()) {
        bodyWorkspaceId = body.workspaceId.trim();
      }
    } catch {
      // Empty or non-JSON request body is allowed
    }
    const workspaceId = searchParams.get('workspaceId') || bodyWorkspaceId || undefined;

    const [accounts, leads, campaigns] = await Promise.all([
      container.accountRepo.getAccounts(workspaceId),
      container.leadRepo.getLeads(undefined, workspaceId),
      container.campaignRepo.getCampaigns(workspaceId)
    ]);

    const imapService = new ImapInboxService();
    const allThreads: EmailThread[] = [];
    const allBounced: { email: string; reason: string; timestamp: string }[] = [];
    const allReplied = new Set<string>();
    const errors: string[] = [];

    for (const account of accounts) {
      try {
        const res = await imapService.syncAccountInbox(account, leads, campaigns);
        allThreads.push(...res.threads);
        allBounced.push(...res.bouncedEmails);
        res.repliedEmails.forEach(e => allReplied.add(e.toLowerCase().trim()));
      } catch (err: any) {
        errors.push(`${account.email}: ${err.message || 'Error IMAP'}`);
      }
    }

    const bouncedSet = new Set(allBounced.map(b => b.email.toLowerCase().trim()));
    let leadsModified = false;

    for (const lead of leads) {
      const normEmail = (lead.email || '').toLowerCase().trim();
      if (bouncedSet.has(normEmail) && lead.status !== 'bounced') {
        lead.status = 'bounced';
        if (lead.customVariables && 'ESTADO' in lead.customVariables) {
          lead.customVariables = { ...lead.customVariables, ESTADO: 'Rebotado' };
        }
        await container.leadRepo.updateLead(lead);
        leadsModified = true;

        // Trigger Webhook for bounce
        container.webhookDispatcher.trigger('lead.bounced', {
          leadId: lead.id,
          leadEmail: lead.email,
          campaignId: lead.campaignId
        }).catch(() => {});
      } else if (allReplied.has(normEmail) && lead.status !== 'replied') {
        const matchingThread = allThreads.find(t => t.leadEmail.toLowerCase() === normEmail);
        const lastMsg = matchingThread?.messages[matchingThread.messages.length - 1];

        // OOO Guard: Check if reply is an Out-of-Office / Vacation autoresponder
        if (lastMsg) {
          const classification = container.uniboxClassifier.classify(lastMsg.subject, lastMsg.body);
          if (classification.sentiment === 'out-of-office') {
            // Postpone next step follow-up without marking as replied
            lead.lastContactedAt = new Date().toISOString();
            await container.leadRepo.updateLead(lead);
            leadsModified = true;
            continue;
          }
        }

        lead.status = 'replied';
        if (lead.customVariables && 'ESTADO' in lead.customVariables) {
          lead.customVariables = { ...lead.customVariables, ESTADO: 'Respondido' };
        }
        await container.leadRepo.updateLead(lead);
        leadsModified = true;

        // Auto-classify sentiment and auto-create CRM deal if interested
        if (lastMsg) {
          container.uniboxClassifier.processIncomingReply(lastMsg.subject, lastMsg.body, {
            leadId: lead.id,
            leadName: `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || normEmail,
            leadEmail: lead.email,
            companyName: lead.companyName
          }).catch(() => {});
        }

        // Trigger Webhook
        container.webhookDispatcher.trigger('lead.replied', {
          leadId: lead.id,
          leadEmail: lead.email,
          campaignId: lead.campaignId
        }).catch(() => {});
      }
    }

    // Recompute campaign stats accurately from real lead states
    if (leadsModified || campaigns.length > 0) {
      for (const camp of campaigns) {
        const campLeads = leads.filter(l => l.campaignId === camp.id);
        const sentCount = campLeads.filter(l => l.status !== 'pending').length;
        const openedCount = campLeads.filter(
          l => l.status === 'opened' || l.status === 'replied'
        ).length;
        const repliedCount = campLeads.filter(l => l.status === 'replied').length;
        const bouncedCount = campLeads.filter(l => l.status === 'bounced').length;

        const changed =
          camp.stats.sent !== Math.max(camp.stats.sent, sentCount) ||
          camp.stats.opened !== Math.max(camp.stats.opened, openedCount) ||
          camp.stats.replied !== Math.max(camp.stats.replied, repliedCount) ||
          camp.stats.bounced !== Math.max(camp.stats.bounced, bouncedCount);

        if (changed) {
          camp.stats = {
            ...camp.stats,
            sent: Math.max(camp.stats.sent, sentCount),
            opened: Math.max(camp.stats.opened, openedCount),
            replied: Math.max(camp.stats.replied, repliedCount),
            bounced: Math.max(camp.stats.bounced, bouncedCount)
          };
          await container.campaignRepo.saveCampaign(camp);
        }
      }
    }

    // Deduplicate threads by id while preserving workspaceId
    const uniqueThreadsMap = new Map<string, EmailThread>();
    for (const th of allThreads) {
      const matchingCampaign = campaigns.find(c => c.id === th.campaignId);
      const matchingAccount = accounts.find(a => a.id === th.senderAccountId);
      uniqueThreadsMap.set(th.id, {
        ...th,
        workspaceId:
          th.workspaceId ||
          matchingCampaign?.workspaceId ||
          matchingAccount?.workspaceId ||
          workspaceId ||
          'ws-primary'
      });
    }

    let finalThreads = Array.from(uniqueThreadsMap.values()).sort(
      (a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime()
    );

    if (finalThreads.length > 0) {
      await container.threadRepo.saveThreads(finalThreads).catch(err => {
        console.error('Failed to persist threads:', err);
      });
    } else {
      finalThreads = await container.threadRepo.getThreads(workspaceId);
    }

    return NextResponse.json({
      success: true,
      threads: finalThreads,
      bouncedEmails: allBounced,
      repliedEmails: Array.from(allReplied),
      errors
    });
  } catch (err: any) {
    console.error('Error in /api/unibox/sync:', err);
    return NextResponse.json(
      { error: err.message || 'Error sincronizando bandeja de entrada IMAP' },
      { status: 500 }
    );
  }
}
