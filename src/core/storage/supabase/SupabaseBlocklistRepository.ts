import { SupabaseClient } from '@supabase/supabase-js';
import { BlocklistItem } from '@/types';
import { IBlocklistRepository } from '../../interfaces/storage';
import { supabase as defaultClient } from '../../supabase/client';
import { v4 as uuidv4 } from 'uuid';

export class SupabaseBlocklistRepository implements IBlocklistRepository {
  private client: SupabaseClient;

  constructor(client: SupabaseClient = defaultClient) {
    this.client = client;
  }

  async getBlocklist(): Promise<BlocklistItem[]> {
    const { data, error } = await this.client
      .from('blocklist')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('SupabaseBlocklistRepository getBlocklist error:', error);
      return [];
    }

    return (data || []).map(this.mapToDomain);
  }

  async isBlocked(email: string): Promise<boolean> {
    if (!email) return false;
    const normEmail = email.toLowerCase().trim();
    const domain = normEmail.split('@')[1];

    const valuesToCheck = [normEmail];
    if (domain) valuesToCheck.push(domain);

    const { data, error } = await this.client
      .from('blocklist')
      .select('id')
      .in('value', valuesToCheck)
      .limit(1);

    if (error) {
      console.error('SupabaseBlocklistRepository isBlocked error:', error);
      return false;
    }

    return Boolean(data && data.length > 0);
  }

  async addToBlocklist(item: Omit<BlocklistItem, 'id' | 'createdAt'>): Promise<BlocklistItem> {
    const id = uuidv4();
    const normalizedValue = item.value.toLowerCase().trim();
    const createdAt = new Date().toISOString();

    const { error } = await this.client.from('blocklist').upsert({
      id,
      workspace_id: item.workspaceId || 'ws-primary',
      type: item.type,
      value: normalizedValue,
      reason: item.reason || 'manual',
      created_at: createdAt
    }, { onConflict: 'id' });

    if (error) {
      console.error('SupabaseBlocklistRepository addToBlocklist error:', error);
      throw new Error(`Failed to add to blocklist: ${error.message}`);
    }

    return {
      id,
      workspaceId: item.workspaceId || 'ws-primary',
      type: item.type,
      value: normalizedValue,
      reason: item.reason,
      createdAt
    };
  }

  async removeFromBlocklist(id: string): Promise<void> {
    const { error } = await this.client.from('blocklist').delete().eq('id', id);
    if (error) {
      console.error('SupabaseBlocklistRepository removeFromBlocklist error:', error);
      throw new Error(`Failed to remove from blocklist: ${error.message}`);
    }
  }

  private mapToDomain(row: any): BlocklistItem {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      type: row.type || 'email',
      value: row.value,
      reason: row.reason || 'manual',
      createdAt: row.created_at || new Date().toISOString()
    };
  }
}
