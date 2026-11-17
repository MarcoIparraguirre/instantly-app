import { WebhookItem } from '@/types';
import { IWebhookRepository } from '../interfaces/storage';
import { IJsonStorageDriver } from './JsonDriver';

export class WebhookRepository implements IWebhookRepository {
  private key = 'webhooks';

  constructor(private driver: IJsonStorageDriver) {}

  async getWebhooks(): Promise<WebhookItem[]> {
    return this.driver.read<WebhookItem[]>(this.key, []);
  }

  async saveWebhook(webhook: WebhookItem): Promise<void> {
    const list = await this.getWebhooks();
    const idx = list.findIndex(w => w.id === webhook.id);
    if (idx >= 0) {
      list[idx] = webhook;
    } else {
      list.push(webhook);
    }
    this.driver.write(this.key, list);
  }

  async deleteWebhook(id: string): Promise<void> {
    const list = await this.getWebhooks();
    const filtered = list.filter(w => w.id !== id);
    this.driver.write(this.key, filtered);
  }
}
