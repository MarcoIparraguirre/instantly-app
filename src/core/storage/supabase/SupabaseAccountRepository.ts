import { SupabaseClient } from '@supabase/supabase-js';
import { SenderAccount } from '@/types';
import { IAccountRepository } from '../../interfaces/storage';
import { supabase as defaultClient } from '../../supabase/client';
import { encryptCredential, decryptCredential } from '../../security/crypto';

export class SupabaseAccountRepository implements IAccountRepository {
  private client: SupabaseClient;

  constructor(client: SupabaseClient = defaultClient) {
    this.client = client;
  }

  async getAccounts(workspaceId?: string): Promise<SenderAccount[]> {
    let query = this.client
      .from('sender_accounts')
      .select('*')
      .order('created_at', { ascending: true });

    if (workspaceId) {
      query = query.eq('workspace_id', workspaceId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('SupabaseAccountRepository getAccounts error:', error);
      return [];
    }

    return (data || []).map((row) => this.mapToDomain(row));
  }

  async getAccountById(id: string): Promise<SenderAccount | undefined> {
    const { data, error } = await this.client
      .from('sender_accounts')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error || !data) return undefined;
    return this.mapToDomain(data);
  }

  async saveAccounts(accounts: SenderAccount[]): Promise<void> {
    const payloads = accounts.map((a) => this.mapToDb(a));
    const { error } = await this.client
      .from('sender_accounts')
      .upsert(payloads, { onConflict: 'id' });

    if (error) {
      console.error('SupabaseAccountRepository saveAccounts error:', error);
      throw new Error(`Failed to save accounts: ${error.message}`);
    }
  }

  async saveAccount(account: SenderAccount): Promise<void> {
    let passToStore = account.smtpPass;
    let resolvedWorkspaceId = account.workspaceId;
    if (passToStore === '••••••••' || passToStore === '********') {
      const existing = await this.getAccountById(account.id);
      if (existing) {
        passToStore = existing.smtpPass;
        resolvedWorkspaceId = resolvedWorkspaceId || existing.workspaceId;
      }
    }

    const payload = this.mapToDb({ ...account, workspaceId: resolvedWorkspaceId, smtpPass: passToStore });
    const { error } = await this.client
      .from('sender_accounts')
      .upsert(payload, { onConflict: 'id' });

    if (error) {
      console.error('SupabaseAccountRepository saveAccount error:', error);
      throw new Error(`Failed to save account: ${error.message}`);
    }
  }

  async deleteAccount(id: string): Promise<void> {
    const { error } = await this.client
      .from('sender_accounts')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('SupabaseAccountRepository deleteAccount error:', error);
      throw new Error(`Failed to delete account: ${error.message}`);
    }
  }

  private mapToDomain(row: any): SenderAccount {
    return {
      id: row.id,
      workspaceId: row.workspace_id || 'ws-primary',
      name: row.name,
      email: row.email,
      provider: row.provider || 'smtp',
      smtpHost: row.smtp_host || '',
      smtpPort: row.smtp_port || 587,
      smtpUser: row.smtp_user || row.email,
      smtpPass: decryptCredential(row.smtp_pass || ''),
      dailyLimit: row.daily_limit || 50,
      sentToday: row.sent_today || 0,
      status: row.status || 'active',
      warmupEnabled: row.warmup_enabled ?? true,
      warmupToday: row.warmup_today || 0,
      warmupTotal: row.warmup_total || 0,
      warmupRescueRate: Number(row.warmup_rescue_rate) || 100,
      healthScore: Number(row.health_score) || 95,
      dnsChecks: row.dns_checks || []
    };
  }

  private mapToDb(account: SenderAccount): any {
    return {
      id: account.id,
      workspace_id: account.workspaceId || 'ws-primary',
      name: account.name,
      email: account.email,
      provider: account.provider || 'smtp',
      smtp_host: account.smtpHost,
      smtp_port: account.smtpPort,
      smtp_user: account.smtpUser,
      smtp_pass: encryptCredential(account.smtpPass || ''),
      daily_limit: account.dailyLimit,
      sent_today: account.sentToday || 0,
      status: account.status || 'active',
      warmup_enabled: account.warmupEnabled ?? true,
      warmup_today: account.warmupToday || 0,
      warmup_total: account.warmupTotal || 0,
      warmup_rescue_rate: account.warmupRescueRate || 100,
      health_score: account.healthScore || 95,
      dns_checks: account.dnsChecks || [],
      updated_at: new Date().toISOString()
    };
  }
}
