import { describe, it, expect, vi } from 'vitest';
import { InternalWarmupService } from '@/core/services/InternalWarmupService';
import { IAccountRepository, IWarmupRepository } from '@/core/interfaces/storage';
import { IMailer } from '@/core/mailers/interfaces';
import { SenderAccount } from '@/types';

describe('InternalWarmupService (Unit Tests)', () => {
  const accounts: SenderAccount[] = [
    {
      id: 'acc-1',
      name: 'Box 1',
      email: 'box1@domain.com',
      smtpHost: 'smtp.test.com',
      smtpPort: 587,
      smtpUser: 'box1@domain.com',
      smtpPass: 'demo-pass',
      dailyLimit: 50,
      sentToday: 0,
      status: 'active',
      warmupEnabled: true,
      warmupToday: 0,
      warmupTotal: 0
    },
    {
      id: 'acc-2',
      name: 'Box 2',
      email: 'box2@domain.com',
      smtpHost: 'smtp.test.com',
      smtpPort: 587,
      smtpUser: 'box2@domain.com',
      smtpPass: 'demo-pass',
      dailyLimit: 50,
      sentToday: 0,
      status: 'active',
      warmupEnabled: true,
      warmupToday: 0,
      warmupTotal: 0
    }
  ];

  const mockAccountRepo: IAccountRepository = {
    getAccounts: vi.fn().mockResolvedValue(accounts),
    getAccountById: vi.fn(),
    saveAccounts: vi.fn(),
    saveAccount: vi.fn(),
    deleteAccount: vi.fn()
  };

  const mockWarmupRepo: IWarmupRepository = {
    logWarmup: vi.fn().mockResolvedValue({ id: 'log-1', createdAt: '' } as any),
    getWarmupLogs: vi.fn().mockResolvedValue([])
  };

  const mockMailer: IMailer = {
    send: vi.fn().mockResolvedValue({ success: true, mode: 'simulated' })
  };

  it('runs P2P warmup exchanges between active accounts', async () => {
    const service = new InternalWarmupService(
      mockAccountRepo,
      mockWarmupRepo,
      mockMailer,
      mockMailer
    );

    const res = await service.runWarmupRound();
    expect(res.success).toBe(true);
    expect(res.roundsExecuted).toBeGreaterThan(0);
    expect(mockWarmupRepo.logWarmup).toHaveBeenCalled();
  });
});
