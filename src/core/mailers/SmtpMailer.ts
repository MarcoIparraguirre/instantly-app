import nodemailer from 'nodemailer';
import { SenderAccount } from '@/types';
import { IMailer, MailOptions, MailResult } from './interfaces';

export class SmtpMailer implements IMailer {
  async send(account: SenderAccount, options: MailOptions): Promise<MailResult> {
    try {
      const transporter = nodemailer.createTransport({
        host: account.smtpHost,
        port: account.smtpPort,
        secure: account.smtpPort === 465,
        auth: {
          user: account.smtpUser,
          pass: account.smtpPass
        }
      });

      const info = await transporter.sendMail({
        from: `"${options.fromName}" <${options.from}>`,
        to: options.to,
        subject: options.subject,
        text: options.body
      });

      return {
        success: true,
        messageId: info.messageId,
        mode: 'smtp'
      };
    } catch (err: any) {
      return {
        success: false,
        mode: 'smtp',
        error: err.message || 'SMTP sending error'
      };
    }
  }
}
