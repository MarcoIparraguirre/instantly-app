import { WarmupLog } from '@/types';
import { IWarmupRepository } from '../interfaces/storage';
import { IJsonStorageDriver } from './JsonDriver';
import { v4 as uuidv4 } from 'uuid';

export class WarmupRepository implements IWarmupRepository {
  private key = 'warmup_logs';

  constructor(private driver: IJsonStorageDriver) {}

  async logWarmup(log: Omit<WarmupLog, 'id' | 'createdAt'>): Promise<WarmupLog> {
    const logs = await this.getWarmupLogs(500);
    const item: WarmupLog = {
      id: uuidv4(),
      fromAccountId: log.fromAccountId,
      toAccountId: log.toAccountId,
      subject: log.subject,
      status: log.status,
      createdAt: new Date().toISOString()
    };
    logs.unshift(item);
    this.driver.write(this.key, logs.slice(0, 100));
    return item;
  }

  async getWarmupLogs(limit: number = 50): Promise<WarmupLog[]> {
    const list = this.driver.read<WarmupLog[]>(this.key, []);
    return list.slice(0, limit);
  }
}
