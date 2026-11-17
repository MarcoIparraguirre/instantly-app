import {
  ICampaignRepository,
  ILeadRepository,
  IAccountRepository,
  IBlocklistRepository
} from '../interfaces/storage';
import { ITemplateRenderer } from './TemplateRenderer';
import { ISpintaxService } from './SpintaxService';
import { IAccountRotator } from './AccountRotator';
import { IMailer } from '../mailers/interfaces';
import { WebhookDispatcherService } from './WebhookDispatcherService';
import { CampaignRunResult, DispatchLog } from '@/lib/emailEngine';

export interface DispatchOptions {
  simulationOnly?: boolean;
  batchSize?: number;
  respectSchedule?: boolean;
  baseUrl?: string;
}

export interface ICampaignDispatcher {
  dispatchStep(campaignId: string, options?: DispatchOptions): Promise<CampaignRunResult>;
}

export class CampaignDispatcher implements ICampaignDispatcher {
  constructor(
    private campaignRepo: ICampaignRepository,
    private leadRepo: ILeadRepository,
    private accountRepo: IAccountRepository,
    private templateRenderer: ITemplateRenderer,
    private spintaxService: ISpintaxService,
    private rotator: IAccountRotator,
    private smtpMailer: IMailer,
    private simulatedMailer: IMailer,
    private blocklistRepo?: IBlocklistRepository,
    private webhookDispatcher?: WebhookDispatcherService
  ) {}

  private isWithinSchedule(schedule?: {
    days: number[];
    timing: { from: string; to: string };
    timezone: string;
  }): boolean {
    if (!schedule || !schedule.timing?.from || !schedule.timing?.to) return true;
    try {
      const tz = schedule.timezone || 'America/Buenos_Aires';
      const now = new Date();
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hour12: false,
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });
      const parts = formatter.formatToParts(now);
      const weekdayStr = parts.find(p => p.type === 'weekday')?.value || 'Mon';
      const hourStr = parts.find(p => p.type === 'hour')?.value || '00';
      const minuteStr = parts.find(p => p.type === 'minute')?.value || '00';

      const dayMap: Record<string, number> = {
        Sun: 0,
        Mon: 1,
        Tue: 2,
        Wed: 3,
        Thu: 4,
        Fri: 5,
        Sat: 6
      };
      const currentDay = dayMap[weekdayStr] ?? now.getDay();
      if (Array.isArray(schedule.days) && schedule.days.length > 0 && !schedule.days.includes(currentDay)) {
        return false;
      }

      const currentMinutes = (parseInt(hourStr, 10) % 24) * 60 + parseInt(minuteStr, 10);
      const [fromH, fromM] = schedule.timing.from.split(':').map(n => parseInt(n, 10) || 0);
      const [toH, toM] = schedule.timing.to.split(':').map(n => parseInt(n, 10) || 0);
      const fromMinutes = fromH * 60 + fromM;
      const toMinutes = toH * 60 + toM;

      if (fromMinutes <= toMinutes) {
        return currentMinutes >= fromMinutes && currentMinutes <= toMinutes;
      } else {
        // Window crosses midnight (e.g. 22:00 to 04:00)
        return currentMinutes >= fromMinutes || currentMinutes <= toMinutes;
      }
    } catch {
      return true;
    }
  }

  async dispatchStep(campaignId: string, options?: DispatchOptions): Promise<CampaignRunResult> {
    const campaign = await this.campaignRepo.getCampaignById(campaignId);
    if (!campaign) {
      throw new Error(`Campaign ${campaignId} not found`);
    }

    const allLeads = await this.leadRepo.getLeads(campaignId);
    const now = Date.now();

    // Select leads ready for dispatch:
    // 1. Initial pending leads on step 1
    // 2. Sent leads where waitDays have elapsed for the next step
    const readyLeads = allLeads.filter(lead => {
      if (lead.status === 'pending') {
        return true;
      }
      if (lead.status === 'sent' && lead.lastContactedAt) {
        const nextStepNum = lead.currentStep || 1;
        const nextStep = campaign.steps.find(s => s.stepNumber === nextStepNum);
        if (!nextStep) return false;

        const waitMs = (nextStep.waitDays || 0) * 86400000;
        const elapsedMs = now - new Date(lead.lastContactedAt).getTime();
        return elapsedMs >= waitMs;
      }
      return false;
    });

    if (options?.respectSchedule && !this.isWithinSchedule(campaign.schedule)) {
      const fromStr = campaign.schedule?.timing?.from || '09:00';
      const toStr = campaign.schedule?.timing?.to || '17:00';
      return {
        campaignId,
        totalPending: readyLeads.length,
        processed: 0,
        sentCount: 0,
        remainingPending: readyLeads.length,
        outsideScheduleWindow: true,
        scheduledWindow: `${fromStr} - ${toStr}`,
        logs: []
      };
    }

    const batchSize = options?.batchSize && options.batchSize > 0 ? options.batchSize : readyLeads.length;
    const leads = readyLeads.slice(0, batchSize);
    const allAccounts = await this.accountRepo.getAccounts();
    let accounts = allAccounts.filter(
      a => campaign.senderAccountIds.length === 0 || campaign.senderAccountIds.includes(a.id)
    );

    if (accounts.length === 0 && allAccounts.length > 0) {
      accounts = allAccounts.filter(a => a.status === 'active' || !a.status);
      if (accounts.length === 0) {
        accounts = allAccounts;
      }
    }

    if (accounts.length === 0) {
      throw new Error('No active sender accounts (mailboxes) found for this campaign.');
    }

    if (campaign.steps.length === 0) {
      throw new Error('This campaign does not have any sequence steps configured.');
    }

    const logs: DispatchLog[] = [];
    let sentCount = 0;
    let bouncedCount = 0;
    const baseUrl = options?.baseUrl || process.env.NEXT_PUBLIC_APP_URL || '';

    for (const lead of leads) {
      // 1. Check Global Blocklist
      if (this.blocklistRepo && (await this.blocklistRepo.isBlocked(lead.email))) {
        lead.status = 'unsubscribed';
        await this.leadRepo.updateLead(lead);
        logs.push({
          timestamp: new Date().toISOString(),
          leadEmail: lead.email,
          senderEmail: 'N/A',
          subject: 'Bloqueado por lista negra global',
          stepNumber: lead.currentStep,
          status: 'error',
          error: 'Email or domain is in global blocklist suppression'
        });
        continue;
      }

      const step = campaign.steps.find(s => s.stepNumber === lead.currentStep) || campaign.steps[0];
      if (!step || step.variants.length === 0) continue;

      // 2. Select variant with A/Z weighted distribution
      let variant = step.variants[0];
      if (step.variants.length > 1) {
        const totalWeight = step.variants.reduce((sum, v) => sum + (v.distributionWeight ?? 100), 0);
        let rand = Math.random() * totalWeight;
        for (const v of step.variants) {
          const w = v.distributionWeight ?? 100;
          if (rand < w) {
            variant = v;
            break;
          }
          rand -= w;
        }
      }

      // 3. Rotate sender account (Strict daily limit protection)
      const sender = this.rotator.getNextAccount(accounts);
      if (!sender) {
        logs.push({
          timestamp: new Date().toISOString(),
          leadEmail: lead.email,
          senderEmail: 'N/A',
          subject: 'Límite diario alcanzado',
          stepNumber: step.stepNumber,
          status: 'error',
          error: 'Daily limit reached for all available sender accounts'
        });
        break;
      }

      // 4. Render Subject & Body with variables and spintax
      const rawSubject = this.templateRenderer.render(variant.subject, lead);
      const finalSubject = this.spintaxService.resolve(rawSubject);

      const rawBody = this.templateRenderer.render(variant.body, lead);
      const finalBody = this.spintaxService.resolve(rawBody);

      const isMockAccount =
        sender.smtpHost.includes('ethereal') ||
        sender.smtpPass === 'demo-pass' ||
        sender.smtpPass === 'demo-app-pass' ||
        Boolean(options?.simulationOnly);

      const mailer = isMockAccount ? this.simulatedMailer : this.smtpMailer;

      const unsubUrl = baseUrl
        ? `${baseUrl.replace(/\/$/, '')}/api/track/unsubscribe?leadId=${encodeURIComponent(lead.id)}&campaignId=${encodeURIComponent(campaign.id)}`
        : '';

      let htmlBody: string | undefined;
      if (!campaign.options?.plainTextMode && baseUrl) {
        const escapedHtml = finalBody
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/\n/g, '<br/>');

        const trackPixel = campaign.openTracking !== false
          ? `<img src="${baseUrl.replace(/\/$/, '')}/api/track/open?leadId=${encodeURIComponent(lead.id)}&campaignId=${encodeURIComponent(campaign.id)}" width="1" height="1" alt="" style="display:none;" />`
          : '';

        const unsubFooter = unsubUrl
          ? `<div style="margin-top:28px;font-size:11px;color:#94a3b8;border-top:1px solid #f1f5f9;padding-top:10px;"><a href="${unsubUrl}" style="color:#64748b;text-decoration:underline;">Desuscribirme de estos correos</a></div>`
          : '';

        htmlBody = `<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;font-size:14px;line-height:1.6;color:#1e293b;">${escapedHtml}${unsubFooter}</div>${trackPixel}`;
      }

      // Threading and RFC 8058 headers
      const messageId = `<campaign-${campaign.id}-lead-${lead.id}-step-${step.stepNumber}@misender.io>`;
      const inReplyTo = step.stepNumber > 1
        ? `<campaign-${campaign.id}-lead-${lead.id}-step-${step.stepNumber - 1}@misender.io>`
        : undefined;

      const emailHeaders: Record<string, string> = {};
      if (unsubUrl) {
        emailHeaders['List-Unsubscribe'] = `<${unsubUrl}>`;
        emailHeaders['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
      }

      const result = await mailer.send(sender, {
        from: sender.email,
        fromName: sender.name,
        to: lead.email,
        subject: finalSubject,
        body: unsubUrl ? `${finalBody}\n\n---\nPara desuscribirte: ${unsubUrl}` : finalBody,
        html: htmlBody,
        messageId,
        inReplyTo,
        references: inReplyTo,
        headers: emailHeaders
      });

      if (result.success) {
        logs.push({
          timestamp: new Date().toISOString(),
          leadEmail: lead.email,
          senderEmail: sender.email,
          subject: finalSubject,
          stepNumber: step.stepNumber,
          status: result.mode === 'simulated' ? 'simulated' : 'sent'
        });

        // Multistep sequence advancement
        const nextStepNum = step.stepNumber + 1;
        const hasNextStep = campaign.steps.some(s => s.stepNumber === nextStepNum);

        if (hasNextStep) {
          lead.status = 'sent';
          lead.currentStep = nextStepNum;
        } else {
          lead.status = 'completed';
        }
        lead.lastContactedAt = new Date().toISOString();

        if (lead.customVariables) {
          const statusText = lead.status === 'completed' ? 'Completado' : 'Enviado';
          if ('ESTADO' in lead.customVariables) {
            lead.customVariables = { ...lead.customVariables, ESTADO: statusText };
          } else if ('Estado' in lead.customVariables) {
            lead.customVariables = { ...lead.customVariables, Estado: statusText };
          }
        }
        await this.leadRepo.updateLead(lead);

        sentCount++;
        sender.sentToday = (sender.sentToday || 0) + 1;
        await this.accountRepo.saveAccount(sender);

        // Dispatch Webhook in background
        if (this.webhookDispatcher) {
          this.webhookDispatcher.trigger('email.sent', {
            campaignId: campaign.id,
            campaignName: campaign.name,
            leadEmail: lead.email,
            senderEmail: sender.email,
            subject: finalSubject,
            stepNumber: step.stepNumber
          }).catch(() => {});
        }
      } else {
        logs.push({
          timestamp: new Date().toISOString(),
          leadEmail: lead.email,
          senderEmail: sender.email,
          subject: finalSubject,
          stepNumber: step.stepNumber,
          status: 'error',
          error: result.error || 'Dispatch error'
        });

        lead.status = 'bounced';
        lead.lastContactedAt = new Date().toISOString();
        if (lead.customVariables) {
          if ('ESTADO' in lead.customVariables) {
            lead.customVariables = { ...lead.customVariables, ESTADO: 'Rebotado' };
          } else if ('Estado' in lead.customVariables) {
            lead.customVariables = { ...lead.customVariables, Estado: 'Rebotado' };
          }
        }
        await this.leadRepo.updateLead(lead);
        bouncedCount++;

        // Trigger Webhook for bounced lead
        if (this.webhookDispatcher) {
          this.webhookDispatcher.trigger('lead.bounced', {
            campaignId: campaign.id,
            leadEmail: lead.email,
            error: result.error
          }).catch(() => {});
        }
      }
    }

    campaign.stats.sent += sentCount;
    campaign.stats.bounced = (campaign.stats.bounced || 0) + bouncedCount;
    await this.campaignRepo.saveCampaign(campaign);

    return {
      campaignId,
      totalPending: readyLeads.length,
      processed: leads.length,
      sentCount,
      bouncedCount,
      remainingPending: Math.max(0, readyLeads.length - sentCount - bouncedCount),
      logs
    };
  }
}
