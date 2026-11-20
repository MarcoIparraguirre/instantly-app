import { Deal } from '@/types';
import { IDealRepository } from '../interfaces/storage';
import { IJsonStorageDriver } from './JsonDriver';
import { initialDeals } from './mockData';

export class DealRepository implements IDealRepository {
  private key = 'deals';

  constructor(private driver: IJsonStorageDriver) {}

  async getDeals(workspaceId?: string): Promise<Deal[]> {
    const deals = this.driver.read<Deal[]>(this.key, initialDeals);
    return workspaceId
      ? deals.filter(d => (d.workspaceId || 'ws-primary') === workspaceId)
      : deals;
  }

  async getDealById(id: string): Promise<Deal | undefined> {
    const deals = await this.getDeals();
    return deals.find(d => d.id === id);
  }

  async saveDeal(deal: Deal): Promise<void> {
    const deals = await this.getDeals();
    const idx = deals.findIndex(d => d.id === deal.id);
    if (idx >= 0) {
      deals[idx] = {
        ...deal,
        workspaceId: deal.workspaceId || deals[idx].workspaceId || 'ws-primary'
      };
    } else {
      deals.unshift({
        ...deal,
        workspaceId: deal.workspaceId || 'ws-primary'
      });
    }
    this.driver.write(this.key, deals);
  }

  async updateDeal(deal: Deal): Promise<void> {
    await this.saveDeal(deal);
  }

  async deleteDeal(id: string): Promise<void> {
    const deals = await this.getDeals();
    const filtered = deals.filter(d => d.id !== id);
    this.driver.write(this.key, filtered);
  }
}
