import { SupabaseClient } from '@supabase/supabase-js';
import { Deal } from '@/types';
import { IDealRepository } from '../../interfaces/storage';
import { supabase as defaultClient } from '../../supabase/client';

export class SupabaseDealRepository implements IDealRepository {
  private client: SupabaseClient;

  constructor(client: SupabaseClient = defaultClient) {
    this.client = client;
  }

  async getDeals(): Promise<Deal[]> {
    const { data, error } = await this.client
      .from('deals')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('SupabaseDealRepository getDeals error:', error);
      return [];
    }

    return (data || []).map(this.mapToDomain);
  }

  async getDealById(id: string): Promise<Deal | undefined> {
    const { data, error } = await this.client
      .from('deals')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error || !data) return undefined;
    return this.mapToDomain(data);
  }

  async saveDeal(deal: Deal): Promise<void> {
    const dbPayload = this.mapToDb(deal);
    const { error } = await this.client
      .from('deals')
      .upsert(dbPayload, { onConflict: 'id' });

    if (error) {
      console.error('SupabaseDealRepository saveDeal error:', error);
      throw new Error(`Failed to save deal to Supabase: ${error.message}`);
    }
  }

  async updateDeal(deal: Deal): Promise<void> {
    await this.saveDeal(deal);
  }

  async deleteDeal(id: string): Promise<void> {
    const { error } = await this.client.from('deals').delete().eq('id', id);
    if (error) {
      console.error('SupabaseDealRepository deleteDeal error:', error);
      throw new Error(`Failed to delete deal from Supabase: ${error.message}`);
    }
  }

  private mapToDomain(row: any): Deal {
    return {
      id: row.id,
      leadId: row.lead_id || '',
      contactName: row.contact_name,
      contactEmail: row.contact_email,
      companyName: row.company_name || '',
      title: row.title,
      stage: row.stage || 'positive',
      value: Number(row.value) || 0,
      daysInactive: row.days_inactive || 0,
      createdAt: row.created_at || new Date().toISOString()
    };
  }

  private mapToDb(deal: Deal): any {
    return {
      id: deal.id,
      lead_id: deal.leadId,
      contact_name: deal.contactName,
      contact_email: deal.contactEmail,
      company_name: deal.companyName,
      title: deal.title,
      stage: deal.stage,
      value: deal.value,
      days_inactive: deal.daysInactive,
      updated_at: new Date().toISOString()
    };
  }
}
