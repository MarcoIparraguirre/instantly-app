import { describe, it, expect, vi } from 'vitest';
import { SupabaseCampaignRepository } from '@/core/storage/supabase/SupabaseCampaignRepository';
import { SupabaseLeadRepository } from '@/core/storage/supabase/SupabaseLeadRepository';
import { SupabaseAccountRepository } from '@/core/storage/supabase/SupabaseAccountRepository';
import { Campaign, Lead, SenderAccount } from '@/types';

describe('Supabase Repositories (SOLID Storage Layer)', () => {
  it('SupabaseCampaignRepository maps DB rows to domain models and back correctly', async () => {
    const mockDbRow = {
      id: 'camp-123',
      name: 'Q4 Enterprise Outbound',
      status: 'active',
      steps: [{ id: 's-1', stepNumber: 1, waitDays: 0, variants: [] }],
      schedule: { timing: { from: '09:00', to: '17:00' }, days: [1, 2, 3], timezone: 'UTC', dailyLimit: 40, strategy: 'office-hours' },
      sender_account_ids: ['acc-1'],
      open_tracking: true,
      click_tracking: false,
      stats: { sent: 15, opened: 5, replied: 2, bounced: 0, opportunities: 1 },
      created_at: '2026-10-21T00:00:00.000Z',
      updated_at: '2026-10-21T01:00:00.000Z'
    };

    const mockClient: any = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [mockDbRow], error: null }),
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: mockDbRow, error: null })
          })
        }),
        upsert: vi.fn().mockResolvedValue({ error: null })
      })
    };

    const repo = new SupabaseCampaignRepository(mockClient);
    const campaigns = await repo.getCampaigns();
    expect(campaigns.length).toBe(1);
    expect(campaigns[0].id).toBe('camp-123');
    expect(campaigns[0].senderAccountIds).toEqual(['acc-1']);
    expect(campaigns[0].stats.sent).toBe(15);

    const single = await repo.getCampaignById('camp-123');
    expect(single?.name).toBe('Q4 Enterprise Outbound');

    await repo.saveCampaign(campaigns[0]);
    expect(mockClient.from).toHaveBeenCalledWith('campaigns');
  });

  it('SupabaseLeadRepository preserves dynamic Google Sheets customVariables into jsonb', async () => {
    const mockLeadRow = {
      id: 'lead-99',
      campaign_id: 'camp-123',
      email: 'founder@scaleup.io',
      first_name: 'Mateo',
      last_name: 'Silveira',
      company_name: 'ScaleUp IO',
      website: 'https://scaleup.io',
      status: 'pending',
      current_step: 1,
      custom_variables: {
        Cargo: 'Chief Revenue Officer',
        Ciudad: 'Montevideo',
        Desafio: 'Escalabilidad'
      }
    };

    const mockClient: any = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [mockLeadRow], error: null })
          })
        }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null })
        })
      })
    };

    const repo = new SupabaseLeadRepository(mockClient);
    const leads = await repo.getLeads('camp-123');
    expect(leads.length).toBe(1);
    expect(leads[0].customVariables?.Cargo).toBe('Chief Revenue Officer');
    expect(leads[0].customVariables?.Ciudad).toBe('Montevideo');
    expect(leads[0].companyName).toBe('ScaleUp IO');

    const leadToSave: Lead = {
      id: 'lead-100',
      campaignId: 'camp-123',
      email: 'ceo@tech.com',
      firstName: 'Ana',
      lastName: 'Gomez',
      companyName: 'Tech',
      status: 'pending',
      currentStep: 1,
      customVariables: { Rol: 'CEO', Empleados: '50-100' }
    };

    await repo.addLeads([leadToSave]);
    expect(mockClient.from).toHaveBeenCalledWith('leads');
  });

  it('SupabaseAccountRepository maps deliverability health and warmup fields correctly', async () => {
    const mockAccountRow = {
      id: 'acc-google-1',
      name: 'Google Workspace Primary',
      email: 'outbound@misender.app',
      provider: 'google',
      smtp_host: 'smtp.gmail.com',
      smtp_port: 587,
      smtp_user: 'outbound@misender.app',
      smtp_pass: '16-char-app-pass',
      daily_limit: 45,
      sent_today: 10,
      status: 'active',
      warmup_enabled: true,
      warmup_today: 15,
      warmup_total: 320,
      warmup_rescue_rate: 98.4,
      health_score: 97,
      dns_checks: [
        { type: 'SPF', valid: true, description: 'Valid SPF' }
      ]
    };

    const mockClient: any = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [mockAccountRow], error: null })
        }),
        upsert: vi.fn().mockResolvedValue({ error: null }),
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null })
        })
      })
    };

    const repo = new SupabaseAccountRepository(mockClient);
    const accounts = await repo.getAccounts();
    expect(accounts.length).toBe(1);
    expect(accounts[0].healthScore).toBe(97);
    expect(accounts[0].warmupEnabled).toBe(true);
    expect(accounts[0].dnsChecks?.[0]?.type).toBe('SPF');
    expect(accounts[0].provider).toBe('google');
  });
});
