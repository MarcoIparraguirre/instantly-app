import { BlocklistItem } from '@/types';
import { IBlocklistRepository } from '../interfaces/storage';
import { IJsonStorageDriver } from './JsonDriver';
import { v4 as uuidv4 } from 'uuid';

export class BlocklistRepository implements IBlocklistRepository {
  private key = 'blocklist';

  constructor(private driver: IJsonStorageDriver) {}

  async getBlocklist(): Promise<BlocklistItem[]> {
    return this.driver.read<BlocklistItem[]>(this.key, []);
  }

  async isBlocked(email: string): Promise<boolean> {
    if (!email) return false;
    const norm = email.toLowerCase().trim();
    const domain = norm.split('@')[1];
    const items = await this.getBlocklist();
    return items.some(item => {
      const val = item.value.toLowerCase().trim();
      return val === norm || val === domain;
    });
  }

  async addToBlocklist(item: Omit<BlocklistItem, 'id' | 'createdAt'>): Promise<BlocklistItem> {
    const items = await this.getBlocklist();
    const newItem: BlocklistItem = {
      id: uuidv4(),
      workspaceId: item.workspaceId || 'ws-primary',
      type: item.type,
      value: item.value.toLowerCase().trim(),
      reason: item.reason || 'manual',
      createdAt: new Date().toISOString()
    };
    items.unshift(newItem);
    this.driver.write(this.key, items);
    return newItem;
  }

  async removeFromBlocklist(id: string): Promise<void> {
    const items = await this.getBlocklist();
    const filtered = items.filter(i => i.id !== id);
    this.driver.write(this.key, filtered);
  }
}
