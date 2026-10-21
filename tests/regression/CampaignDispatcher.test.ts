import { describe, it, expect, beforeEach } from 'vitest';
import { CampaignDispatcher } from '@/core/services/CampaignDispatcher';
import { CampaignRepository } from '@/core/storage/CampaignRepository';
import { LeadRepository } from '@/core/storage/LeadRepository';
import { AccountRepository } from '@/core/storage/AccountRepository';
import { TemplateRenderer } from '@/core/services/TemplateRenderer';
import { SpintaxService } from '@/core/services/SpintaxService';
import { RoundRobinAccountRotator } from '@/core/services/AccountRotator';
import { SimulatedMailer } from '@/core/mailers/SimulatedMailer';
import { IJsonStorageDriver } from '@/core/storage/JsonDriver';
import { Campaign, Lead, SenderAccount } from '@/types';

class MemoryDriver implements IJsonStorageDriver {
  private data = new Map<string, any>();
  read<T>(filename: string, defaultValue: T): T {
    return this.data.has(filename) ? JSON.parse(JSON.stringify(this.data.get(filename))) : defaultValue;
  }
  write<T>(filename: string, val: T): void {
    this.data.set(filename, JSON.parse(JSON.stringify(val)));
  }
}

describe('CampaignDispatcher (Regression Tests)', () => {
  let driver: MemoryDriver;
  let campaignRepo: CampaignRepository;
  let leadRepo: LeadRepository;
  let accountRepo: AccountRepository;
  let dispatcher: CampaignDispatcher;

  const testCampaignId = 'regression-camp-1';

  beforeEach(() => {
    driver = new MemoryDriver();
    campaignRepo = new CampaignRepository(driver);
    leadRepo = new LeadRepository(driver);
    accountRepo = new AccountRepository(driver);

    const testCampaign: Campaign = {
      id: testCampaignId,
      name: 'Regression Outbound Flow',
      status: 'active',
      steps: [
        {
          id: 'step-1',
          stepNumber: 1,
          waitDays: 0,
          variants: [
            {
              id: 'var-1',
              name: 'Var A',
              subject: 'Hello {{firstName}} from {{companyName}}',
              body: 'Hi {{firstName}}, {hope you are great|reaching out}.'
            }
          ]
        }
      ],
      schedule: {
        timing: { from: '09:00', to: '17:00' },
        days: [1, 2, 3, 4, 5],
        timezone: 'UTC',
        dailyLimit: 100,
        strategy: 'office-hours'
      },
      senderAccountIds: ['acc-reg-1'],
      openTracking: true,
      clickTracking: true,
      stats: { sent: 0, opened: 0, replied: 0, bounced: 0, opportunities: 0 },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const testAccount: SenderAccount = {
      id: 'acc-reg-1',
      name: 'Sales Rep',
      email: 'rep@outreach.io',
      smtpHost: 'smtp.ethereal.email',
      smtpPort: 587,
      smtpUser: 'rep@outreach.io',
      smtpPass: 'demo-pass',
      dailyLimit: 50,
      sentToday: 0,
      status: 'active'
    };

    const testLeads: Lead[] = [
      {
        id: 'lead-reg-1',
        campaignId: testCampaignId,
        email: 'ceo@target.com',
        firstName: 'Alice',
        lastName: 'Smith',
        companyName: 'TargetCo',
        status: 'pending',
        currentStep: 1
      },
      {
        id: 'lead-reg-2',
        campaignId: testCampaignId,
        email: 'cto@target.com',
        firstName: 'Bob',
        lastName: 'Jones',
        companyName: 'TargetCo',
        status: 'pending',
        currentStep: 1
      }
    ];

    campaignRepo.saveCampaign(testCampaign);
    accountRepo.saveAccounts([testAccount]);
    leadRepo.saveLeads(testLeads);

    const mailer = new SimulatedMailer();
    dispatcher = new CampaignDispatcher(
      campaignRepo,
      leadRepo,
      accountRepo,
      new TemplateRenderer(),
      new SpintaxService(),
      new RoundRobinAccountRotator(),
      mailer,
      mailer
    );
  });

  it('successfully executes step dispatch and updates all domain state correctly', async () => {
    const result = await dispatcher.dispatchStep(testCampaignId, { simulationOnly: true });

    expect(result.processed).toBe(2);
    expect(result.sentCount).toBe(2);
    expect(result.logs.length).toBe(2);

    // Verify lead state transition
    const updatedLeads = leadRepo.getLeads(testCampaignId);
    expect(updatedLeads.every(l => l.status === 'sent')).toBe(true);
    expect(updatedLeads.every(l => Boolean(l.lastContactedAt))).toBe(true);

    // Verify account daily send count increment
    const updatedAccount = accountRepo.getAccountById('acc-reg-1');
    expect(updatedAccount?.sentToday).toBe(2);

    // Verify campaign stats increment
    const updatedCampaign = campaignRepo.getCampaignById(testCampaignId);
    expect(updatedCampaign?.stats.sent).toBe(2);
  });

  it('prevents regression: gracefully handles running campaign with no pending leads', async () => {
    // Run once to mark all as sent
    await dispatcher.dispatchStep(testCampaignId, { simulationOnly: true });

    // Run second time
    const secondResult = await dispatcher.dispatchStep(testCampaignId, { simulationOnly: true });
    expect(secondResult.processed).toBe(0);
    expect(secondResult.sentCount).toBe(0);
    expect(secondResult.logs).toHaveLength(0);
  });

  it('prevents regression: throws descriptive error when campaign has no sender accounts', async () => {
    accountRepo.saveAccounts([]); // clear accounts

    await expect(
      dispatcher.dispatchStep(testCampaignId)
    ).rejects.toThrow('No active sender accounts (mailboxes) found for this campaign.');
  });

  it('prevents regression: throws descriptive error when campaign has no sequence steps', async () => {
    const campaign = campaignRepo.getCampaignById(testCampaignId)!;
    campaign.steps = [];
    campaignRepo.saveCampaign(campaign);

    await expect(
      dispatcher.dispatchStep(testCampaignId)
    ).rejects.toThrow('This campaign does not have any sequence steps configured.');
  });
});
