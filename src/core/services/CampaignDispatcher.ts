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

  async dispatchStep(campaignId: string, options?: DispatchOptions): Promise<CampaignRunResult> {
    const campaign = await this.campaignRepo.getCampaignById(campaignId);
    if (!campaign) {
      throw new Error(`Campaign ${campaignId} not found`);
    }

    const allLeads = await this.leadRepo.getLeads(campaignId);
    const leads = allLeads.filter(l => l.status === 'pending');
    const allAccounts = await this.accountRepo.getAccounts();
    const accounts = allAccounts.filter(
      a => campaign.senderAccountIds.length === 0 || campaign.senderAccountIds.includes(a.id)
    );

    if (accounts.length === 0) {
      throw new Error('No active sender accounts (mailboxes) found for this campaign.');
    }

    if (campaign.steps.length === 0) {
      throw new Error('This campaign does not have any sequence steps configured.');
    }

    const logs: DispatchLog[] = [];
    let sentCount = 0;

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

      const result = await mailer.send(sender, {
        from: sender.email,
        fromName: sender.name,
        to: lead.email,
        subject: finalSubject,
        body: finalBody
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

        // Update lead state
        lead.status = 'sent';
        lead.lastContactedAt = new Date().toISOString();
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
      }
    }

    // Update campaign stats
    campaign.stats.sent += sentCount;
    await this.campaignRepo.saveCampaign(campaign);

    return {
      campaignId,
      totalPending: leads.length,
      processed: leads.length,
      sentCount,
      logs
    };
  }
}
