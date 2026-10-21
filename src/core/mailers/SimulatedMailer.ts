import { SenderAccount } from '@/types';
import { IMailer, MailOptions, MailResult } from './interfaces';

export class SimulatedMailer implements IMailer {
  async send(account: SenderAccount, options: MailOptions): Promise<MailResult> {
    // Simulated delivery with no external network call
    return {
      success: true,
      messageId: `sim-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      mode: 'simulated'
    };
  }
}
