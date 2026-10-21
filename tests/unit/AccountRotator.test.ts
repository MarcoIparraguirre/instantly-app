import { describe, it, expect } from 'vitest';
import { RoundRobinAccountRotator } from '@/core/services/AccountRotator';
import { SenderAccount } from '@/types';

describe('RoundRobinAccountRotator (Unit Tests)', () => {
  const accounts: SenderAccount[] = [
    {
      id: 'acc-1',
      name: 'Mailbox 1',
      email: 'box1@domain.com',
      smtpHost: 'smtp.domain.com',
      smtpPort: 587,
      smtpUser: 'box1@domain.com',
      smtpPass: 'pass',
      dailyLimit: 50,
      sentToday: 10,
      status: 'active'
    },
    {
      id: 'acc-2',
      name: 'Mailbox 2',
      email: 'box2@domain.com',
      smtpHost: 'smtp.domain.com',
      smtpPort: 587,
      smtpUser: 'box2@domain.com',
      smtpPass: 'pass',
      dailyLimit: 50,
      sentToday: 5,
      status: 'active'
    }
  ];

  it('rotates across accounts in round-robin fashion', () => {
    const rotator = new RoundRobinAccountRotator();

    const first = rotator.getNextAccount(accounts);
    const second = rotator.getNextAccount(accounts);
    const third = rotator.getNextAccount(accounts);

    expect(first?.id).toBe('acc-1');
    expect(second?.id).toBe('acc-2');
    expect(third?.id).toBe('acc-1');
  });

  it('bypasses accounts that have reached their daily limit', () => {
    const rotator = new RoundRobinAccountRotator();
    const accountsWithMaxed: SenderAccount[] = [
      {
        ...accounts[0],
        sentToday: 50, // maxed out
        dailyLimit: 50
      },
      {
        ...accounts[1],
        sentToday: 20, // available
        dailyLimit: 50
      }
    ];

    const pick1 = rotator.getNextAccount(accountsWithMaxed);
    const pick2 = rotator.getNextAccount(accountsWithMaxed);

    expect(pick1?.id).toBe('acc-2');
    expect(pick2?.id).toBe('acc-2');
  });

  it('returns null when account list is empty', () => {
    const rotator = new RoundRobinAccountRotator();
    expect(rotator.getNextAccount([])).toBeNull();
  });
});
