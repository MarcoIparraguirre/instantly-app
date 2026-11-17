import { describe, it, expect, vi } from 'vitest';
import { WebhookDispatcherService } from '@/core/services/WebhookDispatcherService';
import { IWebhookRepository } from '@/core/interfaces/storage';

describe('WebhookDispatcherService (Unit Tests)', () => {
  it('triggers HTTP POST to active matching webhooks', async () => {
    const mockRepo: IWebhookRepository = {
      getWebhooks: vi.fn().mockResolvedValue([
        {
          id: 'wh-1',
          url: 'https://webhook.site/test-endpoint',
          eventTypes: ['lead.replied', 'email.sent'],
          isActive: true,
          createdAt: new Date().toISOString()
        },
        {
          id: 'wh-2',
          url: 'https://webhook.site/inactive',
          eventTypes: ['lead.replied'],
          isActive: false,
          createdAt: new Date().toISOString()
        }
      ]),
      saveWebhook: vi.fn().mockResolvedValue(undefined),
      deleteWebhook: vi.fn().mockResolvedValue(undefined)
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('OK', { status: 200 }));
    const service = new WebhookDispatcherService(mockRepo);

    await service.trigger('lead.replied', { leadEmail: 'lead@test.com' });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://webhook.site/test-endpoint',
      expect.objectContaining({
        method: 'POST'
      })
    );
  });
});
