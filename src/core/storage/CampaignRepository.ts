import { Campaign } from '@/types';
import { ICampaignRepository } from '../interfaces/storage';
import { IJsonStorageDriver } from './JsonDriver';

export const initialCampaignsSeed: Campaign[] = [
  {
    id: 'campaign-1',
    name: 'SaaS Outbound Demo Campaign',
    status: 'draft',
    steps: [
      {
        id: 'step-1',
        stepNumber: 1,
        waitDays: 0,
        variants: [
          {
            id: 'var-1',
            name: 'Variant A',
            subject: 'Quick question regarding {{companyName}}',
            body: 'Hi {{firstName}},\n\nNoticed {{companyName}} is expanding outbound sales efforts. We recently helped a similar B2B team book 45 qualified meetings last month by optimizing deliverability and sequence timing.\n\nWould you be open to a 5-minute chat next Tuesday?\n\nBest,\nAlex'
          }
        ]
      },
      {
        id: 'step-2',
        stepNumber: 2,
        waitDays: 3,
        variants: [
          {
            id: 'var-2',
            name: 'Variant A',
            subject: 'Re: Quick question regarding {{companyName}}',
            body: 'Hi {{firstName}},\n\nWanted to quickly follow up in case my previous note got buried.\n\nAre you available for a brief conversation this week?\n\nBest,\nAlex'
          }
        ]
      }
    ],
    schedule: {
      timing: { from: '09:00', to: '17:00' },
      days: [1, 2, 3, 4, 5],
      timezone: 'America/New_York',
      dailyLimit: 50,
      strategy: 'office-hours'
    },
    senderAccountIds: ['acc-1'],
    openTracking: true,
    clickTracking: true,
    stats: {
      sent: 0,
      opened: 0,
      replied: 0,
      bounced: 0,
      opportunities: 0
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

export class CampaignRepository implements ICampaignRepository {
  private driver: IJsonStorageDriver;
  private filename = 'campaigns.json';

  constructor(driver: IJsonStorageDriver) {
    this.driver = driver;
  }

  getCampaigns(): Campaign[] {
    return this.driver.read<Campaign[]>(this.filename, initialCampaignsSeed);
  }

  getCampaignById(id: string): Campaign | undefined {
    const campaigns = this.getCampaigns();
    return campaigns.find(c => c.id === id);
  }

  saveCampaigns(campaigns: Campaign[]): void {
    this.driver.write(this.filename, campaigns);
  }

  saveCampaign(campaign: Campaign): void {
    const campaigns = this.getCampaigns();
    const index = campaigns.findIndex(c => c.id === campaign.id);
    if (index >= 0) {
      campaigns[index] = { ...campaign, updatedAt: new Date().toISOString() };
    } else {
      campaigns.push({
        ...campaign,
        createdAt: campaign.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
    this.saveCampaigns(campaigns);
  }

  deleteCampaign(id: string): void {
    const campaigns = this.getCampaigns().filter(c => c.id !== id);
    this.saveCampaigns(campaigns);
  }
}
