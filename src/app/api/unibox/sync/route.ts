import { NextRequest, NextResponse } from 'next/server';
import { container } from '@/core/container';
import { ImapInboxService } from '@/core/services/ImapInboxService';
import { EmailThread } from '@/types';

export async function POST(_req: NextRequest) {
  try {
    const [accounts, leads, campaigns] = await Promise.all([
      container.accountRepo.getAccounts(),
      container.leadRepo.getLeads(),
      container.campaignRepo.getCampaigns()
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
      } else if (allReplied.has(normEmail) && lead.status !== 'replied') {
        lead.status = 'replied';
        if (lead.customVariables && 'ESTADO' in lead.customVariables) {
          lead.customVariables = { ...lead.customVariables, ESTADO: 'Respondido' };
        }
        await container.leadRepo.updateLead(lead);
        leadsModified = true;
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

    // Deduplicate threads by id
    const uniqueThreadsMap = new Map<string, EmailThread>();
    for (const th of allThreads) {
      uniqueThreadsMap.set(th.id, th);
    }

    const finalThreads = Array.from(uniqueThreadsMap.values()).sort(
      (a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime()
    );

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
