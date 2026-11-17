import { IWebhookRepository } from '../interfaces/storage';

export interface WebhookPayload {
  event: 'lead.replied' | 'lead.bounced' | 'lead.unsubscribed' | 'lead.opened' | 'email.sent';
  timestamp: string;
  data: Record<string, any>;
}

export class WebhookDispatcherService {
  constructor(private webhookRepo: IWebhookRepository) {}

  async trigger(event: WebhookPayload['event'], data: Record<string, any>): Promise<void> {
    try {
      const webhooks = await this.webhookRepo.getWebhooks();
      const matching = webhooks.filter(
        w => w.isActive && (w.eventTypes.includes(event) || w.eventTypes.includes('*'))
      );

      if (matching.length === 0) return;

      const payload: WebhookPayload = {
        event,
        timestamp: new Date().toISOString(),
        data
      };

      // Fire in parallel without blocking main flow
      await Promise.allSettled(
        matching.map(async w => {
          try {
            const headers: Record<string, string> = {
              'Content-Type': 'application/json',
              'User-Agent': 'MiSender-Webhook-Engine/1.0',
              'X-MiSender-Event': event
            };
            if (w.secret) {
              headers['X-MiSender-Secret'] = w.secret;
            }

            await fetch(w.url, {
              method: 'POST',
              headers,
              body: JSON.stringify(payload),
              signal: AbortSignal.timeout(5000)
            });
          } catch (err: any) {
            console.warn(`Webhook dispatch error for ${w.url}:`, err.message);
          }
        })
      );
    } catch (err: any) {
      console.error('WebhookDispatcherService trigger failed:', err.message);
    }
  }
}
