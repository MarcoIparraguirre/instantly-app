import { SupabaseClient } from '@supabase/supabase-js';
import { EmailThread } from '@/types';
import { IThreadRepository } from '../../interfaces/storage';
import { supabase as defaultClient } from '../../supabase/client';
import { initialUniboxThreads } from '../mockData';

export class SupabaseThreadRepository implements IThreadRepository {
  private client: SupabaseClient;

  constructor(client: SupabaseClient = defaultClient) {
    this.client = client;
  }

  async getThreads(workspaceId?: string): Promise<EmailThread[]> {
    let query = this.client
      .from('email_threads')
      .select('*')
      .order('updated_at', { ascending: false });

    if (workspaceId) {
      query = query.eq('workspace_id', workspaceId);
    }

    const { data, error } = await query;

    if (error || !data || data.length === 0) {
      if (error) console.error('SupabaseThreadRepository getThreads error:', error);
      if (!workspaceId || workspaceId === 'ws-primary') {
        return initialUniboxThreads;
      }
      return [];
    }

    return data.map(this.mapToDomain);
  }

  async saveThreads(threads: EmailThread[]): Promise<void> {
    if (!threads || threads.length === 0) return;
    const rows = threads.map(this.mapToDb);
    const { error } = await this.client
      .from('email_threads')
      .upsert(rows, { onConflict: 'id' });

    if (error) {
      console.error('SupabaseThreadRepository saveThreads error:', error);
      throw new Error(`Failed to save threads: ${error.message}`);
    }
  }

  async upsertThread(thread: EmailThread): Promise<void> {
    const row = this.mapToDb(thread);
    const { error } = await this.client
      .from('email_threads')
      .upsert(row, { onConflict: 'id' });

    if (error) {
      console.error('SupabaseThreadRepository upsertThread error:', error);
      throw new Error(`Failed to upsert thread: ${error.message}`);
    }
  }

  private mapToDomain(row: any): EmailThread {
    return {
      id: row.id,
      workspaceId: row.workspace_id || 'ws-primary',
      campaignId: row.campaign_id || '',
      leadId: row.lead_id || '',
      leadEmail: row.lead_email,
      leadName: row.lead_name || row.lead_email,
      companyName: row.company_name || '',
      unread: Boolean(row.unread),
      sentiment: (row.sentiment || row.ai_sentiment || 'neutral') as any,
      lastMessageSnippet: row.last_message_snippet || '',
      lastActivityAt: row.last_activity_at || row.updated_at || new Date().toISOString(),
      senderAccountId: row.sender_account_id || '',
      messages: Array.isArray(row.messages) ? row.messages : []
    };
  }

  private mapToDb(domain: EmailThread): any {
    return {
      id: domain.id,
      workspace_id: domain.workspaceId || 'ws-primary',
      campaign_id: domain.campaignId,
      lead_id: domain.leadId,
      lead_email: domain.leadEmail,
      lead_name: domain.leadName,
      company_name: domain.companyName,
      unread: domain.unread,
      sentiment: domain.sentiment,
      ai_sentiment: domain.sentiment,
      last_message_snippet: domain.lastMessageSnippet || '',
      last_activity_at: domain.lastActivityAt || new Date().toISOString(),
      sender_account_id: domain.senderAccountId || '',
      messages: domain.messages || [],
      updated_at: new Date().toISOString()
    };
  }
}
