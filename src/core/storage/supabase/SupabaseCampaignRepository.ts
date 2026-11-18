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

  async deleteCampaign(id: string): Promise<void> {
    const { error } = await this.client
      .from('campaigns')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('SupabaseCampaignRepository deleteCampaign error:', error);
      throw new Error(`Failed to delete campaign: ${error.message}`);
    }
  }

  private mapToDomain(row: any): Campaign {
    const openTracking = row.open_tracking ?? row.options?.openTracking ?? true;
    const clickTracking = row.click_tracking ?? row.options?.clickTracking ?? false;
    const rawOptions = row.options && typeof row.options === 'object' ? row.options : {};

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
      openTracking,
      clickTracking,
      options: {
        stopOnReply: rawOptions.stopOnReply ?? true,
        stopOnDomainReply: rawOptions.stopOnDomainReply ?? false,
        plainTextMode: rawOptions.plainTextMode ?? false,
        openTracking: rawOptions.openTracking ?? openTracking,
        clickTracking: rawOptions.clickTracking ?? clickTracking,
      },
      stats: row.stats || { sent: 0, opened: 0, replied: 0, bounced: 0, opportunities: 0 },
      createdAt: row.created_at || new Date().toISOString(),
      updatedAt: row.updated_at || new Date().toISOString()
    };
  }

  private mapToDb(campaign: Campaign): any {
    const openTracking = campaign.openTracking ?? campaign.options?.openTracking ?? true;
    const clickTracking = campaign.clickTracking ?? campaign.options?.clickTracking ?? false;
    const options = {
      stopOnReply: campaign.options?.stopOnReply ?? true,
      stopOnDomainReply: campaign.options?.stopOnDomainReply ?? false,
      plainTextMode: campaign.options?.plainTextMode ?? false,
      openTracking: campaign.options?.openTracking ?? openTracking,
      clickTracking: campaign.options?.clickTracking ?? clickTracking,
    };

    return {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      steps: campaign.steps,
      schedule: campaign.schedule,
      sender_account_ids: campaign.senderAccountIds,
      open_tracking: openTracking,
      click_tracking: clickTracking,
      options,
      stats: campaign.stats,
      updated_at: new Date().toISOString()
    };
  }
}
