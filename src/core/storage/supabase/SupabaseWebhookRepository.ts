import { SupabaseClient } from '@supabase/supabase-js';
import { WebhookItem } from '@/types';
import { IWebhookRepository } from '../../interfaces/storage';
import { supabase as defaultClient } from '../../supabase/client';

export class SupabaseWebhookRepository implements IWebhookRepository {
  private client: SupabaseClient;

  constructor(client: SupabaseClient = defaultClient) {
    this.client = client;
  }

  async getWebhooks(): Promise<WebhookItem[]> {
    const { data, error } = await this.client
      .from('webhooks')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('SupabaseWebhookRepository getWebhooks error:', error);
      return [];
    }

    return (data || []).map(this.mapToDomain);
  }

  async saveWebhook(webhook: WebhookItem): Promise<void> {
    const { error } = await this.client.from('webhooks').upsert({
      id: webhook.id,
      workspace_id: webhook.workspaceId || 'ws-primary',
      url: webhook.url,
      event_types: webhook.eventTypes,
      is_active: webhook.isActive,
      secret: webhook.secret || null,
      created_at: webhook.createdAt || new Date().toISOString()
    }, { onConflict: 'id' });

    if (error) {
      console.error('SupabaseWebhookRepository saveWebhook error:', error);
      throw new Error(`Failed to save webhook: ${error.message}`);
    }
  }

  async deleteWebhook(id: string): Promise<void> {
    const { error } = await this.client.from('webhooks').delete().eq('id', id);
    if (error) {
      console.error('SupabaseWebhookRepository deleteWebhook error:', error);
      throw new Error(`Failed to delete webhook: ${error.message}`);
    }
  }

  private mapToDomain(row: any): WebhookItem {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      url: row.url,
      eventTypes: row.event_types || [],
      isActive: Boolean(row.is_active),
      secret: row.secret,
      createdAt: row.created_at || new Date().toISOString()
    };
  }
}
