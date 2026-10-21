import { SupabaseClient } from '@supabase/supabase-js';
import { Campaign } from '@/types';
import { ICampaignRepository } from '../../interfaces/storage';
import { supabase as defaultClient } from '../../supabase/client';

export class SupabaseCampaignRepository implements ICampaignRepository {
  private client: SupabaseClient;

  constructor(client: SupabaseClient = defaultClient) {
    this.client = client;
  }

  async getCampaigns(): Promise<Campaign[]> {
    const { data, error } = await this.client
      .from('campaigns')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('SupabaseCampaignRepository getCampaigns error:', error);
      return [];
    }

    return (data || []).map(this.mapToDomain);
  }

  async getCampaignById(id: string): Promise<Campaign | undefined> {
    const { data, error } = await this.client
      .from('campaigns')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error || !data) {
      return undefined;
    }

    return this.mapToDomain(data);
  }

  async saveCampaign(campaign: Campaign): Promise<void> {
    const dbPayload = this.mapToDb(campaign);
    const { error } = await this.client
      .from('campaigns')
      .upsert(dbPayload, { onConflict: 'id' });

    if (error) {
      console.error('SupabaseCampaignRepository saveCampaign error:', error);
      throw new Error(`Failed to save campaign to Supabase: ${error.message}`);
    }
  }

  async saveCampaigns(campaigns: Campaign[]): Promise<void> {
    const payloads = campaigns.map(c => this.mapToDb(c));
    const { error } = await this.client
      .from('campaigns')
      .upsert(payloads, { onConflict: 'id' });

    if (error) {
      console.error('SupabaseCampaignRepository saveCampaigns error:', error);
      throw new Error(`Failed to save campaigns: ${error.message}`);
    }
  }

  private mapToDomain(row: any): Campaign {
    return {
      id: row.id,
      name: row.name,
      status: row.status,
      steps: row.steps || [],
      schedule: row.schedule || {
        timing: { from: '09:00', to: '17:00' },
        days: [1, 2, 3, 4, 5],
        timezone: 'America/New_York',
        dailyLimit: 50,
        strategy: 'office-hours'
      },
      senderAccountIds: row.sender_account_ids || [],
      openTracking: row.open_tracking ?? true,
      clickTracking: row.click_tracking ?? false,
      stats: row.stats || { sent: 0, opened: 0, replied: 0, bounced: 0, opportunities: 0 },
      createdAt: row.created_at || new Date().toISOString(),
      updatedAt: row.updated_at || new Date().toISOString()
    };
  }

  private mapToDb(campaign: Campaign): any {
    return {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      steps: campaign.steps,
      schedule: campaign.schedule,
      sender_account_ids: campaign.senderAccountIds,
      open_tracking: campaign.openTracking,
      click_tracking: campaign.clickTracking,
      stats: campaign.stats,
      updated_at: new Date().toISOString()
    };
  }
}
