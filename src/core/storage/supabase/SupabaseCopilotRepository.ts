import { SupabaseClient } from '@supabase/supabase-js';
import { CopilotMessage } from '@/types';
import { ICopilotRepository } from '../../interfaces/storage';
import { supabase as defaultClient } from '../../supabase/client';

export class SupabaseCopilotRepository implements ICopilotRepository {
  private client: SupabaseClient;

  constructor(client: SupabaseClient = defaultClient) {
    this.client = client;
  }

  async getMessages(): Promise<CopilotMessage[]> {
    const { data, error } = await this.client
      .from('copilot_messages')
      .select('*')
      .order('timestamp', { ascending: true });

    if (error) {
      console.error('SupabaseCopilotRepository getMessages error:', error);
      return [];
    }

    return (data || []).map(this.mapToDomain);
  }

  async saveMessages(messages: CopilotMessage[]): Promise<void> {
    const payloads = messages.map(m => this.mapToDb(m));
    const { error } = await this.client
      .from('copilot_messages')
      .upsert(payloads, { onConflict: 'id' });

    if (error) {
      console.error('SupabaseCopilotRepository saveMessages error:', error);
      throw new Error(`Failed to save messages: ${error.message}`);
    }
  }

  async addMessage(message: CopilotMessage): Promise<void> {
    const payload = this.mapToDb(message);
    const { error } = await this.client
      .from('copilot_messages')
      .insert(payload);

    if (error) {
      console.error('SupabaseCopilotRepository addMessage error:', error);
      throw new Error(`Failed to add message: ${error.message}`);
    }
  }

  private mapToDomain(row: any): CopilotMessage {
    return {
      id: row.id,
      role: row.role,
      content: row.content,
      timestamp: row.timestamp,
      approval: row.approval,
      toolResults: row.tool_results
    };
  }

  private mapToDb(msg: CopilotMessage): any {
    return {
      id: msg.id,
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp,
      approval: msg.approval || null,
      tool_results: msg.toolResults || null
    };
  }
}
