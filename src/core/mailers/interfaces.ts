import { SenderAccount } from '@/types';

export interface MailOptions {
  from: string;
  fromName: string;
  to: string;
  subject: string;
  body: string;
}

export interface MailResult {
  success: boolean;
  messageId?: string;
  mode: 'smtp' | 'simulated';
  error?: string;
}

export interface IMailer {
  send(account: SenderAccount, options: MailOptions): Promise<MailResult>;
}
