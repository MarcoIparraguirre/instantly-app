import { IAccountRepository, IWarmupRepository } from '../interfaces/storage';
import { IMailer } from '../mailers/interfaces';
import { SpintaxService } from './SpintaxService';

export interface WarmupRoundResult {
  success: boolean;
  roundsExecuted: number;
  logs: {
    fromEmail: string;
    toEmail: string;
    subject: string;
    status: 'sent' | 'simulated' | 'error';
    error?: string;
  }[];
}

const WARMUP_SUBJECTS = [
  '{Quick question|Following up|Quick sync} regarding {the project milestone|our meeting notes|Q4 roadmap}',
  '{Review requested|Document shared}: {Internal summary|Draft strategy|Updated timeline}',
  '{Thank you|Appreciate the feedback} on {yesterday\'s discussion|the proposal preview}',
  '{Catching up|Checking in}: {Are you available tomorrow?|Did you get a chance to review?}'
];

const WARMUP_BODIES = [
  '{Hi|Hello|Hey},\n\nJust checking in on the progress for our upcoming deadline. Let me know if you need any additional details from my end.\n\nBest,\n{Team|Operations}',
  '{Good morning|Good afternoon},\n\nI reviewed the recent updates and everything looks aligned with the plan. Let me know if we should hop on a 5-minute call.\n\nBest regards,\n{Growth Team|Outbound Lead}',
  '{Hi there|Hello},\n\nThanks for sending over the summary. I will review it thoroughly and get back to you by tomorrow afternoon.\n\nKind regards,\n{Sales Ops|Partner}'
];

export class InternalWarmupService {
  private spintax = new SpintaxService();

  constructor(
    private accountRepo: IAccountRepository,
    private warmupRepo: IWarmupRepository,
    private smtpMailer: IMailer,
    private simulatedMailer: IMailer
  ) {}

  async runWarmupRound(): Promise<WarmupRoundResult> {
    const allAccounts = await this.accountRepo.getAccounts();
    const activeWarmupAccounts = allAccounts.filter(
      a => (a.status === 'active' || !a.status) && a.warmupEnabled !== false
    );

    if (activeWarmupAccounts.length < 2) {
      return {
        success: false,
        roundsExecuted: 0,
        logs: [
          {
            fromEmail: 'N/A',
            toEmail: 'N/A',
            subject: 'Warmup P2P',
            status: 'error',
            error: 'Se requieren al menos 2 casillas con warmup habilitado en el workspace para intercambio P2P.'
          }
        ]
      };
    }

    const logs: WarmupRoundResult['logs'] = [];
    let roundsExecuted = 0;

    // Shuffle and pair accounts
    const shuffled = [...activeWarmupAccounts].sort(() => 0.5 - Math.random());

    for (let i = 0; i < shuffled.length; i++) {
      const sender = shuffled[i];
      const recipient = shuffled[(i + 1) % shuffled.length];

      if (sender.id === recipient.id) continue;

      const rawSub = WARMUP_SUBJECTS[Math.floor(Math.random() * WARMUP_SUBJECTS.length)];
      const rawBody = WARMUP_BODIES[Math.floor(Math.random() * WARMUP_BODIES.length)];
      const subject = this.spintax.resolve(rawSub);
      const body = this.spintax.resolve(rawBody);

      const isMock =
        sender.smtpHost.includes('ethereal') ||
        sender.smtpPass === 'demo-pass' ||
        sender.smtpPass === 'demo-app-pass';

      const mailer = isMock ? this.simulatedMailer : this.smtpMailer;

      try {
        const sendRes = await mailer.send(sender, {
          from: sender.email,
          fromName: sender.name,
          to: recipient.email,
          subject,
          body
        });

        const status = sendRes.success
          ? (sendRes.mode === 'simulated' ? 'simulated' : 'sent')
          : 'error';

        await this.warmupRepo.logWarmup({
          fromAccountId: sender.id,
          toAccountId: recipient.id,
          subject,
          status: status === 'error' ? 'failed' : 'sent'
        });

        // Update sender stats
        sender.warmupToday = (sender.warmupToday || 0) + 1;
        sender.warmupTotal = (sender.warmupTotal || 0) + 1;
        sender.healthScore = Math.min(100, Math.max(90, (sender.healthScore || 95) + 0.2));
        sender.warmupRescueRate = Math.min(100, (sender.warmupRescueRate || 98) + 0.1);
        await this.accountRepo.saveAccount(sender);

        logs.push({
          fromEmail: sender.email,
          toEmail: recipient.email,
          subject,
          status,
          error: sendRes.error
        });

        if (sendRes.success) roundsExecuted++;
      } catch (err: any) {
        logs.push({
          fromEmail: sender.email,
          toEmail: recipient.email,
          subject,
          status: 'error',
          error: err.message
        });
      }
    }

    return {
      success: roundsExecuted > 0,
      roundsExecuted,
      logs
    };
  }
}
