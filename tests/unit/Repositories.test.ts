import { describe, it, expect, beforeEach } from 'vitest';
import { IJsonStorageDriver } from '@/core/storage/JsonDriver';
import { CampaignRepository } from '@/core/storage/CampaignRepository';
import { LeadRepository } from '@/core/storage/LeadRepository';
import { AccountRepository } from '@/core/storage/AccountRepository';
import { Campaign, Lead, SenderAccount } from '@/types';

class MockInMemoryDriver implements IJsonStorageDriver {
  private store = new Map<string, any>();

  read<T>(filename: string, defaultValue: T): T {
    if (this.store.has(filename)) {
      return JSON.parse(JSON.stringify(this.store.get(filename)));
    }
    this.write(filename, defaultValue);
    return JSON.parse(JSON.stringify(defaultValue));
  }

  write<T>(filename: string, data: T): void {
    this.store.set(filename, JSON.parse(JSON.stringify(data)));
  }
}

describe('Repositories with In-Memory Storage Driver (LSP & ISP Unit Tests)', () => {
  let driver: MockInMemoryDriver;
  let campaignRepo: CampaignRepository;
  let leadRepo: LeadRepository;
  let accountRepo: AccountRepository;

  beforeEach(() => {
    driver = new MockInMemoryDriver();
    campaignRepo = new CampaignRepository(driver);
    leadRepo = new LeadRepository(driver);
    accountRepo = new AccountRepository(driver);
  });

  it('campaign repository creates and updates campaigns properly', () => {
    const campaigns = campaignRepo.getCampaigns();
    expect(campaigns.length).toBeGreaterThan(0);

    const testCampaign: Campaign = {
      id: 'test-camp-99',
      name: 'Test Campaign',
      status: 'draft',
      steps: [],
      schedule: {
        timing: { from: '09:00', to: '17:00' },
        days: [1, 2, 3],
        timezone: 'UTC',
        dailyLimit: 30,
        strategy: 'office-hours'
      },
      senderAccountIds: [],
      openTracking: true,
      clickTracking: true,
      stats: { sent: 0, opened: 0, replied: 0, bounced: 0, opportunities: 0 },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    campaignRepo.saveCampaign(testCampaign);
    const retrieved = campaignRepo.getCampaignById('test-camp-99');
    expect(retrieved).toBeDefined();
    expect(retrieved?.name).toBe('Test Campaign');

    // Update test
    testCampaign.name = 'Renamed Test Campaign';
    campaignRepo.saveCampaign(testCampaign);
    expect(campaignRepo.getCampaignById('test-camp-99')?.name).toBe('Renamed Test Campaign');
  });

  it('lead repository filters by campaignId and updates lead status', () => {
    const newLead: Lead = {
      id: 'lead-test-1',
      campaignId: 'camp-xyz',
      email: 'lead@test.com',
      firstName: 'Test',
      lastName: 'Lead',
      companyName: 'Acme',
      status: 'pending',
      currentStep: 1
    };

    leadRepo.addLeads([newLead]);

    const campaignLeads = leadRepo.getLeads('camp-xyz');
    expect(campaignLeads.length).toBe(1);
    expect(campaignLeads[0].email).toBe('lead@test.com');

    // Update lead
    newLead.status = 'sent';
    leadRepo.updateLead(newLead);

    const updated = leadRepo.getLeadById('lead-test-1');
    expect(updated?.status).toBe('sent');
  });

  it('account repository persists sender account configurations', () => {
    const account: SenderAccount = {
      id: 'acc-test',
      name: 'Custom SMTP',
      email: 'sender@test.com',
      smtpHost: 'smtp.test.com',
      smtpPort: 465,
      smtpUser: 'sender@test.com',
      smtpPass: 'secret',
      dailyLimit: 100,
      sentToday: 0,
      status: 'active'
    };

    accountRepo.saveAccount(account);
    const retrieved = accountRepo.getAccountById('acc-test');
    expect(retrieved?.email).toBe('sender@test.com');
    expect(retrieved?.dailyLimit).toBe(100);
  });
});
