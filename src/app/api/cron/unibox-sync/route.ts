import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { container } from '@/core/container';
import { ImapInboxService } from '@/core/services/ImapInboxService';
import { AutomationEngineService } from '@/core/services/AutomationEngineService';
import { EmailThread } from '@/types';

function safeSecretEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function authorizeCronRequest(req: NextRequest): { authorized: boolean; error?: string } {
  const cronSecret = process.env.CRON_SECRET;
  const apiKey = process.env.MISENDER_API_KEY || process.env.APP_API_KEY;
  const apiKeyEnforced = Boolean(apiKey);

  const authHeader = req.headers.get('authorization');
  const xCronSecret = req.headers.get('x-cron-secret');
  const isManualTrigger = req.headers.get('x-manual-trigger') === 'true';

  // Always enforce strict validation when Authorization header is provided
  if (authHeader !== null) {
    const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    const token = bearerMatch?.[1]?.trim();

    if (!token) {
      return { authorized: false, error: 'Unauthorized: Malformed Authorization header' };
    }
    if (cronSecret && safeSecretEqual(token, cronSecret)) {
      return { authorized: true };
    }
    if (!cronSecret && apiKey && safeSecretEqual(token, apiKey)) {
      return { authorized: true };
    }
    return { authorized: false, error: 'Unauthorized: Invalid Authorization credentials' };
  }

  if (xCronSecret !== null) {
    if (!cronSecret || !safeSecretEqual(xCronSecret.trim(), cronSecret)) {
      return { authorized: false, error: 'Unauthorized: Invalid x-cron-secret header' };
    }
    return { authorized: true };
  }

  if (cronSecret) {
    if (isManualTrigger && !apiKeyEnforced) {
      return { authorized: true };
    }
    return { authorized: false, error: 'Unauthorized: CRON_SECRET credentials required' };
  }

  return { authorized: true };
}

async function handleCronUniboxSync(req: NextRequest) {
  const auth = authorizeCronRequest(req);
  if (!auth.authorized) {
    return NextResponse.json({ success: false, error: auth.error }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const targetWorkspaceId = searchParams.get('workspaceId')?.trim() || undefined;

    const [allAccounts, allLeads, allCampaigns] = await Promise.all([
      container.accountRepo.getAccounts(targetWorkspaceId),
      container.leadRepo.getLeads(undefined, targetWorkspaceId),
      container.campaignRepo.getCampaigns(targetWorkspaceId)
    ]);

    const workspaceSet = new Set<string>();
    if (targetWorkspaceId) {
      workspaceSet.add(targetWorkspaceId);
    } else {
      for (const acc of allAccounts) {
        workspaceSet.add(acc.workspaceId || 'ws-primary');
      }
      if (workspaceSet.size === 0 && (allLeads.length > 0 || allCampaigns.length > 0)) {
        workspaceSet.add('ws-primary');
      }
    }

    const imapService = new ImapInboxService();
    let accountsSynced = 0;
    let threadsSaved = 0;
    let repliedUpdated = 0;
    let bouncedUpdated = 0;
    let oooPostponed = 0;
    let dealsCreated = 0;
    let automationsTriggered = 0;
    const errors: string[] = [];

    for (const wsId of workspaceSet) {
      const wsAccounts = allAccounts.filter(a => (a.workspaceId || 'ws-primary') === wsId);
      const wsLeads = allLeads.filter(l => (l.workspaceId || 'ws-primary') === wsId);
      const wsCampaigns = allCampaigns.filter(c => (c.workspaceId || 'ws-primary') === wsId);

      const wsThreads: EmailThread[] = [];
      const wsBounced: { email: string; reason: string; timestamp: string }[] = [];
      const wsReplied = new Set<string>();

      for (const account of wsAccounts) {
        try {
          const res = await imapService.syncAccountInbox(account, wsLeads, wsCampaigns);
          accountsSynced++;
          wsThreads.push(...res.threads);
          wsBounced.push(...res.bouncedEmails);
          res.repliedEmails.forEach(e => wsReplied.add(e.toLowerCase().trim()));
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'IMAP sync error';
          errors.push(`${account.email}: ${message}`);
        }
      }

      const bouncedSet = new Set(wsBounced.map(b => b.email.toLowerCase().trim()));
      let leadsModified = false;

      for (const lead of wsLeads) {
        const normEmail = (lead.email || '').toLowerCase().trim();
        const leadName =
          `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || normEmail;

        if (bouncedSet.has(normEmail) && lead.status !== 'bounced') {
          lead.status = 'bounced';
          if (lead.customVariables && 'ESTADO' in lead.customVariables) {
            lead.customVariables = { ...lead.customVariables, ESTADO: 'Rebotado' };
          }
          await container.leadRepo.updateLead(lead);
          leadsModified = true;
          bouncedUpdated++;

          const bouncePayload = {
            leadId: lead.id,
            leadEmail: lead.email,
            leadName,
            firstName: lead.firstName,
            lastName: lead.lastName,
            companyName: lead.companyName,
            campaignId: lead.campaignId,
            workspaceId: wsId
          };

          container.webhookDispatcher
            .trigger('lead.bounced', bouncePayload, wsId)
            .catch(() => {});

          try {
            const runs = await AutomationEngineService.executeTrigger(
              wsId,
              'lead.bounced',
              bouncePayload
            );
            automationsTriggered += runs.length;
          } catch (err) {
            console.warn('Cron unibox-sync AutomationEngine lead.bounced error:', err);
          }
        } else if (wsReplied.has(normEmail) && lead.status !== 'replied') {
          const matchingThread = wsThreads.find(
            t => t.leadEmail.toLowerCase().trim() === normEmail
          );
          const lastMsg = matchingThread?.messages[matchingThread.messages.length - 1];

          // OOO Guard via container.uniboxClassifier
          if (lastMsg) {
            const oooCheck = container.uniboxClassifier.classify(
              lastMsg.subject,
              lastMsg.body,
              {
                leadId: lead.id,
                leadName,
                leadEmail: lead.email,
                companyName: lead.companyName
              }
            );
            if (oooCheck.sentiment === 'out-of-office') {
              lead.lastContactedAt = new Date().toISOString();
              await container.leadRepo.updateLead(lead);
              leadsModified = true;
              oooPostponed++;
              continue;
            }
          }

          lead.status = 'replied';
          if (lead.customVariables && 'ESTADO' in lead.customVariables) {
            lead.customVariables = { ...lead.customVariables, ESTADO: 'Respondido' };
          }
          await container.leadRepo.updateLead(lead);
          leadsModified = true;
          repliedUpdated++;

          let sentiment = matchingThread?.sentiment || 'interested';
          let createdDealId: string | undefined;

          if (lastMsg) {
            try {
              const processed = await container.uniboxClassifier.processIncomingReply(
                lastMsg.subject,
                lastMsg.body,
                {
                  leadId: lead.id,
                  leadName,
                  leadEmail: lead.email,
                  companyName: lead.companyName
                }
              );
              if (processed?.sentiment) {
                sentiment = processed.sentiment;
              }
              if (processed?.autoCreatedDeal) {
                dealsCreated++;
                createdDealId = processed.autoCreatedDeal.id;
                container.webhookDispatcher
                  .trigger(
                    'deal.created',
                    {
                      dealId: processed.autoCreatedDeal.id,
                      leadId: lead.id,
                      leadEmail: lead.email,
                      companyName: lead.companyName,
                      value: processed.autoCreatedDeal.value,
                      stage: processed.autoCreatedDeal.stage,
                      workspaceId: wsId
                    },
                    wsId
                  )
                  .catch(() => {});
              }
            } catch (err) {
              console.warn('Cron unibox-sync processIncomingReply error:', err);
            }
          }

          const replyPayload = {
            leadId: lead.id,
            leadEmail: lead.email,
            leadName,
            firstName: lead.firstName,
            lastName: lead.lastName,
            companyName: lead.companyName,
            campaignId: lead.campaignId,
            sentiment,
            dealId: createdDealId,
            workspaceId: wsId
          };

          container.webhookDispatcher
            .trigger('lead.replied', replyPayload, wsId)
            .catch(() => {});

          try {
            const replyRuns = await AutomationEngineService.executeTrigger(
              wsId,
              'lead.replied',
              replyPayload
            );
            automationsTriggered += replyRuns.length;
          } catch (err) {
            console.warn('Cron unibox-sync AutomationEngine lead.replied error:', err);
          }

          if (sentiment === 'interested' || sentiment === 'meeting-booked') {
            container.webhookDispatcher
              .trigger('lead.interested', replyPayload, wsId)
              .catch(() => {});

            try {
              const interestedRuns = await AutomationEngineService.executeTrigger(
                wsId,
                'lead.interested',
                replyPayload
              );
              automationsTriggered += interestedRuns.length;
            } catch (err) {
              console.warn('Cron unibox-sync AutomationEngine lead.interested error:', err);
            }
          }
        }
      }

      if (leadsModified && wsCampaigns.length > 0) {
        for (const camp of wsCampaigns) {
          const campLeads = wsLeads.filter(l => l.campaignId === camp.id);
          const sentCount = campLeads.filter(l => l.status !== 'pending').length;
          const openedCount = campLeads.filter(
            l => l.status === 'opened' || l.status === 'replied'
          ).length;
          const repliedCount = campLeads.filter(l => l.status === 'replied').length;
          const bouncedCount = campLeads.filter(l => l.status === 'bounced').length;

          const nextStats = {
            ...camp.stats,
            sent: Math.max(camp.stats.sent, sentCount),
            opened: Math.max(camp.stats.opened, openedCount),
            replied: Math.max(camp.stats.replied, repliedCount),
            bounced: Math.max(camp.stats.bounced, bouncedCount)
          };

          if (
            camp.stats.sent !== nextStats.sent ||
            camp.stats.opened !== nextStats.opened ||
            camp.stats.replied !== nextStats.replied ||
            camp.stats.bounced !== nextStats.bounced
          ) {
            camp.stats = nextStats;
            await container.campaignRepo.saveCampaign(camp);
          }
        }
      }

      if (wsThreads.length > 0) {
        const uniqueThreadsMap = new Map<string, EmailThread>();
        for (const th of wsThreads) {
          uniqueThreadsMap.set(th.id, {
            ...th,
            workspaceId: th.workspaceId || wsId
          });
        }
        const finalThreads = Array.from(uniqueThreadsMap.values()).sort(
          (a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime()
        );
        await container.threadRepo.saveThreads(finalThreads).catch(err => {
          console.warn('Cron unibox-sync saveThreads error:', err);
        });
        threadsSaved += finalThreads.length;
      }

      if (container.deliverabilityGuard) {
        await container.deliverabilityGuard
          .enforceWorkspaceDeliverability(wsId)
          .catch(err => {
            console.warn('Cron unibox-sync DeliverabilityGuard error:', err);
          });
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      workspacesProcessed: workspaceSet.size,
      accountsSynced,
      threadsSaved,
      repliedUpdated,
      bouncedUpdated,
      oooPostponed,
      dealsCreated,
      automationsTriggered,
      errors
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Cron unibox-sync failed' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return handleCronUniboxSync(req);
}

export async function POST(req: NextRequest) {
  return handleCronUniboxSync(req);
}
