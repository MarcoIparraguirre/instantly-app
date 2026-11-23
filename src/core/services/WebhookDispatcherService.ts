import crypto from 'crypto';
import { IWebhookRepository } from '../interfaces/storage';
import { validateWebhookUrl } from '../security/ssrfValidator';

export type WebhookEventType =
  | 'lead.replied'
  | 'lead.interested'
  | 'lead.bounced'
  | 'lead.unsubscribed'
  | 'lead.opened'
  | 'lead.clicked'
  | 'email.sent'
  | 'account.paused'
  | 'campaign.completed'
  | 'deal.created';

export interface WebhookPayload {
  event: WebhookEventType;
  timestamp: string;
  workspaceId?: string;
  data: Record<string, unknown>;
}

export function createHmacSignature(bodyStr: string, secret: string): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(bodyStr).digest('hex');
}

async function postWithSingleRetry(
  url: string,
  headers: Record<string, string>,
  bodyStr: string
): Promise<Response | undefined> {
  const sendOnce = () =>
    fetch(url, {
      method: 'POST',
      headers,
      body: bodyStr,
      signal: AbortSignal.timeout(5000)
    });

  let lastError: unknown;
  try {
    const res = await sendOnce();
    if (!res || res.status < 500) {
      return res;
    }
  } catch (err) {
    lastError = err;
  }

  // Short backoff before single retry on HTTP >= 500 or network/timeout error
  if (!process.env.VITEST) {
    await new Promise(resolve => setTimeout(resolve, 350));
  }

  try {
    return await sendOnce();
  } catch (retryErr) {
    throw retryErr ?? lastError;
  }
}

export class WebhookDispatcherService {
  constructor(private webhookRepo: IWebhookRepository) {}

  async trigger(
    event: WebhookPayload['event'],
    data: Record<string, unknown>,
    workspaceId?: string
  ): Promise<void> {
    try {
      const webhooks = await this.webhookRepo.getWebhooks();
      const matching = webhooks.filter(w => {
        if (!w.isActive) return false;
        if (!(w.eventTypes.includes(event) || w.eventTypes.includes('*'))) return false;
        if (workspaceId && w.workspaceId && w.workspaceId !== workspaceId) return false;
        return true;
      });

      if (matching.length === 0) return;

      const timestamp = new Date().toISOString();
      const payload: WebhookPayload = {
        event,
        timestamp,
        ...(workspaceId ? { workspaceId } : {}),
        data
      };
      const bodyStr = JSON.stringify(payload);

      // Fire in parallel without blocking main flow
      await Promise.allSettled(
        matching.map(async w => {
          try {
            // SSRF Defense: validate target URL destination
            const validation = await validateWebhookUrl(w.url, true);
            if (!validation.valid) {
              console.warn(`SSRF Block: Webhook ${w.url} suppressed (${validation.reason})`);
              return;
            }

            const headers: Record<string, string> = {
              'Content-Type': 'application/json',
              'User-Agent': 'MiSender-Webhook-Engine/1.0',
              'X-MiSender-Event': event,
              'X-MiSender-Timestamp': timestamp
            };
            if (w.secret) {
              headers['X-MiSender-Signature'] = createHmacSignature(bodyStr, w.secret);
              headers['X-MiSender-Secret'] = w.secret;
            }

            await postWithSingleRetry(w.url, headers, bodyStr);
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`Webhook dispatch error for ${w.url}:`, msg);
          }
        })
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('WebhookDispatcherService trigger failed:', msg);
    }
  }
}
