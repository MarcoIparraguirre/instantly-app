import { SupabaseClient } from '@supabase/supabase-js';
import { Lead } from '@/types';
import { ILeadRepository } from '../../interfaces/storage';
import { supabase as defaultClient } from '../../supabase/client';

export class SupabaseLeadRepository implements ILeadRepository {
  private client: SupabaseClient;

  constructor(client: SupabaseClient = defaultClient) {
    this.client = client;
  }

  async getLeads(campaignId?: string): Promise<Lead[]> {
    let query = this.client.from('leads').select('*').order('created_at', { ascending: false });

    if (campaignId) {
      query = query.eq('campaign_id', campaignId);
    }

    const { data, error } = await query;
    if (error) {
      console.error('SupabaseLeadRepository getLeads error:', error);
      return [];
    }

    return (data || []).map(this.mapToDomain);
  }

  async getLeadById(id: string): Promise<Lead | undefined> {
    const { data, error } = await this.client
      .from('leads')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error || !data) return undefined;
    return this.mapToDomain(data);
  }

  async saveLeads(leads: Lead[]): Promise<void> {
    const payloads = leads.map(l => this.mapToDb(l));
    const { error } = await this.client
      .from('leads')
      .upsert(payloads, { onConflict: 'id' });

    if (error) {
      console.error('SupabaseLeadRepository saveLeads error:', error);
      throw new Error(`Failed to save leads to Supabase: ${error.message}`);
    }
  }

  async addLeads(newLeads: Lead[]): Promise<void> {
    if (newLeads.length === 0) return;
    const payloads = newLeads.map(l => this.mapToDb(l));

    const { error } = await this.client
      .from('leads')
      .upsert(payloads, { onConflict: 'id' });

    if (error) {
      console.error('SupabaseLeadRepository addLeads error:', error);
      throw new Error(`Failed to add leads to Supabase: ${error.message}`);
    }
  }

  async updateLead(lead: Lead): Promise<void> {
    const payload = this.mapToDb(lead);
    const { error } = await this.client
      .from('leads')
      .update(payload)
      .eq('id', lead.id);

    if (error) {
      console.error('SupabaseLeadRepository updateLead error:', error);
      throw new Error(`Failed to update lead: ${error.message}`);
    }
  }

  async deleteLeads(campaignId?: string): Promise<void> {
    let query = this.client.from('leads').delete();
    if (campaignId) {
      query = query.eq('campaign_id', campaignId);
    } else {
      query = query.neq('id', 'non-existing-never-empty');
    }

    const { error } = await query;
    if (error) {
      console.error('SupabaseLeadRepository deleteLeads error:', error);
      throw new Error(`Failed to delete leads: ${error.message}`);
    }
  }

  private mapToDomain(row: any): Lead {
    return {
      id: row.id,
      campaignId: row.campaign_id,
      email: row.email,
      firstName: row.first_name || '',
      lastName: row.last_name || '',
      companyName: row.company_name || '',
      website: row.website || '',
      status: row.status || 'pending',
      currentStep: row.current_step || 1,
      lastContactedAt: row.last_contacted_at,
      customVariables: row.custom_variables || {}
    };
  }

  private mapToDb(lead: Lead): any {
    return {
      id: lead.id,
      campaign_id: lead.campaignId,
      email: lead.email,
      first_name: lead.firstName || '',
      last_name: lead.lastName || '',
      company_name: lead.companyName || '',
      website: lead.website || '',
      status: lead.status || 'pending',
      current_step: lead.currentStep || 1,
      last_contacted_at: lead.lastContactedAt || null,
      custom_variables: lead.customVariables || {},
      updated_at: new Date().toISOString()
    };
  }
}
