import { EmailThread } from '@/types';
import { IThreadRepository } from '../interfaces/storage';
import { IJsonStorageDriver } from './JsonDriver';
import { initialUniboxThreads } from './mockData';

export class ThreadRepository implements IThreadRepository {
  private key = 'unibox_threads';

  constructor(private driver: IJsonStorageDriver) {}

  async getThreads(): Promise<EmailThread[]> {
    return this.driver.read<EmailThread[]>(this.key, initialUniboxThreads);
  }

  async saveThreads(threads: EmailThread[]): Promise<void> {
    this.driver.write(this.key, threads);
  }

  async upsertThread(thread: EmailThread): Promise<void> {
    const threads = await this.getThreads();
    const idx = threads.findIndex(t => t.id === thread.id || t.leadEmail.toLowerCase() === thread.leadEmail.toLowerCase());
    if (idx >= 0) {
      threads[idx] = thread;
    } else {
      threads.unshift(thread);
    }
    this.driver.write(this.key, threads);
  }
}
