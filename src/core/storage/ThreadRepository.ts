import { EmailThread } from '@/types';
import { IThreadRepository } from '../interfaces/storage';
import { IJsonStorageDriver } from './JsonDriver';
import { initialUniboxThreads } from './mockData';

export class ThreadRepository implements IThreadRepository {
  private key = 'unibox_threads';

  constructor(private driver: IJsonStorageDriver) {}

  async getThreads(workspaceId?: string): Promise<EmailThread[]> {
    const threads = this.driver.read<EmailThread[]>(this.key, initialUniboxThreads);
    return workspaceId
      ? threads.filter(t => (t.workspaceId || 'ws-primary') === workspaceId)
      : threads;
  }

  async saveThreads(threads: EmailThread[]): Promise<void> {
    const normalized = threads.map(t => ({
      ...t,
      workspaceId: t.workspaceId || 'ws-primary'
    }));
    this.driver.write(this.key, normalized);
  }

  async upsertThread(thread: EmailThread): Promise<void> {
    const threads = await this.getThreads();
    const targetWorkspaceId = thread.workspaceId || 'ws-primary';
    const idx = threads.findIndex(
      t =>
        t.id === thread.id ||
        (t.leadEmail.toLowerCase() === thread.leadEmail.toLowerCase() &&
          (t.workspaceId || 'ws-primary') === targetWorkspaceId)
    );
    if (idx >= 0) {
      threads[idx] = {
        ...thread,
        workspaceId: thread.workspaceId || threads[idx].workspaceId || 'ws-primary'
      };
    } else {
      threads.unshift({
        ...thread,
        workspaceId: targetWorkspaceId
      });
    }
    this.driver.write(this.key, threads);
  }
}
