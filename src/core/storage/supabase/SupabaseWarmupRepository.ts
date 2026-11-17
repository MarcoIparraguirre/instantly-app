import { SupabaseClient } from '@supabase/supabase-js';
import { WarmupLog } from '@/types';
import { IWarmupRepository } from '../../interfaces/storage';
import { supabase as defaultClient } from '../../supabase/client';
import { v4 as uuidv4 } from 'uuid';

export class SupabaseWarmupRepository implements IWarmupRepository {
  private client: SupabaseClient;

  constructor(client: SupabaseClient = defaultClient) {
    this.client = client;
  }

  async logWarmup(log: Omit<WarmupLog, 'id' | 'createdAt'>): Promise<WarmupLog> {
    const id = uuidv4();
    const createdAt = new Date().toISOString();

    const { error } = await this.client.from('warmup_logs').insert({
      id,
      from_account_id: log.fromAccountId,
      to_account_id: log.toAccountId,
      subject: log.subject,
      status: log.status || 'sent',
      created_at: createdAt
    });

    if (error) {
      console.error('SupabaseWarmupRepository logWarmup error:', error);
    }

    return {
      id,
      fromAccountId: log.fromAccountId,
      toAccountId: log.toAccountId,
      subject: log.subject,
      status: log.status,
      createdAt
    };
  }

  async getWarmupLogs(limit: number = 50): Promise<WarmupLog[]> {
    const { data, error } = await this.client
      .from('warmup_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('SupabaseWarmupRepository getWarmupLogs error:', error);
      return [];
    }

    return (data || []).map(row => ({
      id: row.id,
      fromAccountId: row.from_account_id,
      toAccountId: row.to_account_id,
      subject: row.subject,
      status: row.status,
      createdAt: row.created_at
    }));
  }
}
