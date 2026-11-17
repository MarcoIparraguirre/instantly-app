import { describe, it, expect } from 'vitest';
import { BlocklistRepository } from '@/core/storage/BlocklistRepository';
import { IJsonStorageDriver } from '@/core/storage/JsonDriver';

describe('BlocklistRepository (Unit Tests)', () => {
  const store: Record<string, any> = {};
  const mockDriver: IJsonStorageDriver = {
    read: <T>(key: string, defaultValue: T): T => store[key] !== undefined ? store[key] : defaultValue,
    write: <T>(key: string, data: T): void => { store[key] = data; }
  };

  const repo = new BlocklistRepository(mockDriver);

  it('adds emails and checks isBlocked accurately', async () => {
    await repo.addToBlocklist({
      type: 'email',
      value: 'spammy@target.com',
      reason: 'manual'
    });

    expect(await repo.isBlocked('spammy@target.com')).toBe(true);
    expect(await repo.isBlocked('SPAMMY@TARGET.COM')).toBe(true);
    expect(await repo.isBlocked('valid@target.com')).toBe(false);
  });

  it('blocks entire domain when domain rule is added', async () => {
    await repo.addToBlocklist({
      type: 'domain',
      value: 'baddomain.com',
      reason: 'spam_complaint'
    });

    expect(await repo.isBlocked('anyone@baddomain.com')).toBe(true);
    expect(await repo.isBlocked('ceo@baddomain.com')).toBe(true);
    expect(await repo.isBlocked('ceo@otherdomain.com')).toBe(false);
  });
});
