import {
  ICampaignRepository,
  ILeadRepository,
  IAccountRepository
} from '../interfaces/storage';
import { ITemplateRenderer } from './TemplateRenderer';
import { ISpintaxService } from './SpintaxService';
import { IAccountRotator } from './AccountRotator';
import { IMailer } from '../mailers/interfaces';
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
    private simulatedMailer: IMailer
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

      return currentMinutes >= fromMinutes && currentMinutes <= toMinutes;
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
    const pendingLeads = allLeads.filter(l => l.status === 'pending');

    // If respectSchedule is requested, check whether current time in campaign timezone is inside window
    if (options?.respectSchedule && !this.isWithinSchedule(campaign.schedule)) {
      const fromStr = campaign.schedule?.timing?.from || '09:00';
      const toStr = campaign.schedule?.timing?.to || '17:00';
      return {
        campaignId,
        totalPending: pendingLeads.length,
        processed: 0,
        sentCount: 0,
        remainingPending: pendingLeads.length,
        outsideScheduleWindow: true,
        scheduledWindow: `${fromStr} - ${toStr}`,
        logs: []
      };
    }

    const batchSize = options?.batchSize && options.batchSize > 0 ? options.batchSize : pendingLeads.length;
    const leads = pendingLeads.slice(0, batchSize);
    const allAccounts = await this.accountRepo.getAccounts();
    let accounts = allAccounts.filter(
      a => campaign.senderAccountIds.length === 0 || campaign.senderAccountIds.includes(a.id)
    );

    // If campaign senderAccountIds are not matching any account, fallback gracefully to all active accounts
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
      const step = campaign.steps.find(s => s.stepNumber === lead.currentStep) || campaign.steps[0];
      if (!step || step.variants.length === 0) continue;

      // Select variant (e.g. A/B testing)
      const variant = step.variants[Math.floor(Math.random() * step.variants.length)];

      // Rotate sender
      const sender = this.rotator.getNextAccount(accounts);
      if (!sender) continue;

      // Render Subject & Body with variables and spintax
      const rawSubject = this.templateRenderer.render(variant.subject, lead);
      const finalSubject = this.spintaxService.resolve(rawSubject);

      const rawBody = this.templateRenderer.render(variant.body, lead);
      const finalBody = this.spintaxService.resolve(rawBody);

      const isMockAccount =
        sender.smtpHost.includes('ethereal') ||
        sender.smtpPass === 'demo-pass' ||
        Boolean(options?.simulationOnly);

      const mailer = isMockAccount ? this.simulatedMailer : this.smtpMailer;

      let htmlBody: string | undefined;
      if (campaign.openTracking !== false && !campaign.options?.plainTextMode && baseUrl) {
        const escapedHtml = finalBody
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/\n/g, '<br/>');
        const trackUrl = `${baseUrl.replace(/\/$/, '')}/api/track/open?leadId=${encodeURIComponent(lead.id)}&campaignId=${encodeURIComponent(campaign.id)}`;
        htmlBody = `<div style="font-family:sans-serif;font-size:14px;line-height:1.5;">${escapedHtml}</div><img src="${trackUrl}" width="1" height="1" alt="" style="display:none;" />`;
      }

      const result = await mailer.send(sender, {
        from: sender.email,
        fromName: sender.name,
        to: lead.email,
        subject: finalSubject,
        body: finalBody,
        html: htmlBody
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

        // Update lead state and sync custom ESTADO column if present
        lead.status = 'sent';
        lead.lastContactedAt = new Date().toISOString();
        if (lead.customVariables) {
          if ('ESTADO' in lead.customVariables) {
            lead.customVariables = { ...lead.customVariables, ESTADO: 'Enviado' };
          } else if ('Estado' in lead.customVariables) {
            lead.customVariables = { ...lead.customVariables, Estado: 'Enviado' };
          }
        }
        await this.leadRepo.updateLead(lead);

        sentCount++;
        sender.sentToday = (sender.sentToday || 0) + 1;
        await this.accountRepo.saveAccount(sender);
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

        // Mark lead as bounced if SMTP rejected the recipient
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
      }
    }

    // Update campaign stats
    campaign.stats.sent += sentCount;
    campaign.stats.bounced = (campaign.stats.bounced || 0) + bouncedCount;
    await this.campaignRepo.saveCampaign(campaign);

    return {
      campaignId,
      totalPending: pendingLeads.length,
      processed: leads.length,
      sentCount,
      bouncedCount,
      remainingPending: Math.max(0, pendingLeads.length - sentCount - bouncedCount),
      logs
    };
  }
}
