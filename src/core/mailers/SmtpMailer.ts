import nodemailer from 'nodemailer';
import { SenderAccount } from '@/types';
import { IMailer, MailOptions, MailResult } from './interfaces';

export class SmtpMailer implements IMailer {
  private transporters = new Map<string, ReturnType<typeof nodemailer.createTransport>>();

  private getTransporter(account: SenderAccount): ReturnType<typeof nodemailer.createTransport> {
    const key = `${account.smtpHost}:${account.smtpPort}:${account.smtpUser}:${account.smtpPass}`;
    let transporter = this.transporters.get(key);
    if (!transporter) {
      transporter = nodemailer.createTransport({
        pool: true,
        maxConnections: 2,
        maxMessages: 100,
        host: account.smtpHost,
        port: account.smtpPort,
        secure: account.smtpPort === 465,
        auth: {
          user: account.smtpUser,
          pass: account.smtpPass
        }
      });
      this.transporters.set(key, transporter);
    }
    return transporter;
  }

  async send(account: SenderAccount, options: MailOptions): Promise<MailResult> {
    const key = `${account.smtpHost}:${account.smtpPort}:${account.smtpUser}:${account.smtpPass}`;
    try {
      const transporter = this.getTransporter(account);

      const info = await transporter.sendMail({
        from: `"${options.fromName}" <${options.from}>`,
        to: options.to,
        subject: options.subject,
        text: options.body,
        ...(options.html ? { html: options.html } : {})
      });

      return {
        success: true,
        messageId: info.messageId,
        mode: 'smtp'
      };
    } catch (err: any) {
      // Evict pooled transporter on error so next attempt reconnects cleanly
      const cached = this.transporters.get(key);
      if (cached && typeof cached.close === 'function') {
        try {
          cached.close();
        } catch {}
      }
      this.transporters.delete(key);

      return {
        success: false,
        mode: 'smtp',
        error: err.message || 'SMTP sending error'
      };
    }
  }
}
