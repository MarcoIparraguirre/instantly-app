import tls from 'tls';
import { v4 as uuidv4 } from 'uuid';
import { SenderAccount } from '@/types';
import { IAccountRepository, IWarmupRepository } from '../interfaces/storage';
import { IMailer } from '../mailers/interfaces';
import { SpintaxService } from './SpintaxService';
import { PlacementTestService, SeedMailbox } from './PlacementTestService';

export interface WarmupSenderAccount extends SenderAccount {
  warmupRampDay?: number;
  warmup_ramp_day?: number;
  warmupDailyLimit?: number;
  warmup_daily_limit?: number;
  warmupNetworkOptIn?: boolean;
  warmup_network_opt_in?: boolean;
  warmupDeliveries?: number;
  warmupErrors?: number;
  warmupSpamFound?: number;
  warmupRescuedCount?: number;
}

export interface WarmupRoundLog {
  fromEmail: string;
  toEmail: string;
  subject: string;
  status: 'sent' | 'simulated' | 'error';
  messageId?: string;
  inReplyTo?: string;
  references?: string;
  replyStatus?: 'sent' | 'simulated' | 'error' | 'skipped';
  replyMessageId?: string;
  partnerType?: 'workspace' | 'opt_in_pool' | 'seed_mailbox' | 'pool_fallback';
  error?: string;
}

export interface WarmupRoundResult {
  success: boolean;
  roundsExecuted: number;
  repliesExecuted?: number;
  skippedRampLimit?: number;
  rescuedFromSpam?: number;
  logs: WarmupRoundLog[];
}

export interface WarmupRoundOptions {
  workspaceId?: string;
  seedMailboxes?: SeedMailbox[];
  allowPoolFallback?: boolean;
  imapService?: WarmupImapServiceAdapter;
  runSpamRescue?: boolean;
}

export interface WarmupScannedMessage {
  uid?: string;
  subject?: string;
  messageId?: string;
  headers?: string;
}

export interface WarmupSpamRescueResult {
  accountId: string;
  email: string;
  foldersScanned: string[];
  scanned: number;
  foundInSpam: number;
  rescued: number;
  rescuedSubjects: string[];
  errors: string[];
}

export interface WarmupImapServiceAdapter {
  rescueWarmupMessages?: (
    account: WarmupSenderAccount
  ) => Promise<{
    foldersScanned?: string[];
    scanned?: number;
    foundInSpam?: number;
    rescued?: number;
    rescuedSubjects?: string[];
    errors?: string[];
  }>;
  scanSpamFolder?: (account: WarmupSenderAccount) => Promise<WarmupScannedMessage[]>;
  fetchSpamMessages?: (account: WarmupSenderAccount) => Promise<WarmupScannedMessage[]>;
  moveToInbox?: (account: WarmupSenderAccount, uid: string) => Promise<boolean>;
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

const WARMUP_REPLY_BODIES = [
  '{Thanks|Thank you} for the {update|note}!\n\nEverything looks {solid|aligned} on my side. Let\'s touch base {tomorrow|later this week} to finalize the next steps.\n\nBest,\n{Operations|Partner}',
  '{Got it|Received}, appreciate the {follow-up|quick sync}.\n\nI just reviewed the details and everything makes sense. I\'ll share our notes shortly.\n\nKind regards,\n{Team|Growth}',
  '{Hi|Hello},\n\nThanks for checking in! We\'re all set on our end for the milestone.\n\nBest regards,\n{Sales Ops|Lead}'
];

const WARMUP_SUBJECT_PATTERNS = [
  /^(re:\s*)?(quick question|following up|quick sync) regarding/i,
  /^(re:\s*)?(review requested|document shared):/i,
  /^(re:\s*)?(thank you|appreciate the feedback) on/i,
  /^(re:\s*)?(catching up|checking in):/i
];

export function calculateWarmupRampTarget(rampDay?: number, warmupDailyLimit?: number): number {
  const safeDay = Math.max(1, Math.floor(Number(rampDay) || 1));
  const cap = Number(warmupDailyLimit) > 0 ? Math.floor(Number(warmupDailyLimit)) : 40;
  const scheduled = 5 + (safeDay - 1) * 3;
  return Math.min(scheduled, cap);
}

export function isWarmupMessageMarker(subject: string, messageId?: string, headers?: string): boolean {
  const normSub = (subject || '').trim();
  const normMsgId = (messageId || '').toLowerCase();
  const normHeaders = (headers || '').toLowerCase();

  if (normMsgId.includes('warmup-')) return true;
  if (normHeaders.includes('x-misender-warmup') || normHeaders.includes('warmup-')) return true;
  if (/\[warmup\]/i.test(normSub)) return true;
  return WARMUP_SUBJECT_PATTERNS.some((pattern) => pattern.test(normSub));
}

function isAccountMockOrDemo(account: Partial<SenderAccount>): boolean {
  const host = (account.smtpHost || '').toLowerCase();
  const pass = account.smtpPass || '';
  return (
    !host ||
    !pass ||
    host.includes('ethereal') ||
    pass === 'demo-pass' ||
    pass === 'demo-app-pass'
  );
}

function isNetworkOptInEnabled(account: WarmupSenderAccount): boolean {
  if (account.warmupNetworkOptIn === false) return false;
  if (account.warmup_network_opt_in === false) return false;
  return true;
}

function resolveImapHost(smtpHost?: string): string {
  if (!smtpHost) return 'imap.gmail.com';
  const lower = smtpHost.toLowerCase();
  if (lower.includes('gmail')) return 'imap.gmail.com';
  if (lower.includes('office365') || lower.includes('outlook')) return 'outlook.office365.com';
  return smtpHost.replace(/^smtp\./i, 'imap.');
}

function resolveDomain(email: string): string {
  const parts = (email || '').split('@');
  return (parts[1] || 'misender.app').toLowerCase().trim() || 'misender.app';
}

function getPoolFallbackPartners(): Array<{ id: string; name: string; email: string }> {
  const envPartners = (process.env.WARMUP_POOL_PARTNERS || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.includes('@'));

  if (envPartners.length > 0) {
    return envPartners.map((email, idx) => ({
      id: `pool-env-${idx + 1}`,
      name: `Warmup Pool Partner ${idx + 1}`,
      email
    }));
  }

  return [
    {
      id: 'warmup-pool-fallback-1',
      name: 'MiSender Warmup Pool',
      email: 'warmup-node-1@pool.misender.app'
    }
  ];
}

interface ResolvedPartner {
  account: WarmupSenderAccount;
  partnerType: 'workspace' | 'opt_in_pool' | 'seed_mailbox' | 'pool_fallback';
  canUseSmtp: boolean;
}

export class InternalWarmupService {
  private spintax = new SpintaxService();

  constructor(
    private accountRepo: IAccountRepository,
    private warmupRepo: IWarmupRepository,
    private smtpMailer: IMailer,
    private simulatedMailer: IMailer
  ) {}

  calculateRampTarget(account: WarmupSenderAccount): number {
    const rampDay = account.warmupRampDay ?? account.warmup_ramp_day ?? 1;
    const dailyLimit = account.warmupDailyLimit ?? account.warmup_daily_limit ?? 40;
    return calculateWarmupRampTarget(rampDay, dailyLimit);
  }

  private recomputeAccountHealth(
    account: WarmupSenderAccount,
    outcome: { deliveredDelta: number; errorDelta: number; spamFoundDelta?: number; rescuedDelta?: number }
  ): WarmupSenderAccount {
    const prevTotal = account.warmupTotal || 0;
    const prevHealth = account.healthScore ?? 95;

    // Seed historical deliveries/errors proportionally only for legacy accounts with existing totals
    const priorDeliveries =
      account.warmupDeliveries !== undefined
        ? account.warmupDeliveries
        : prevTotal > 0
          ? Math.round(prevTotal * (Math.max(0, Math.min(100, prevHealth)) / 100))
          : 0;

    const priorErrors =
      account.warmupErrors !== undefined
        ? account.warmupErrors
        : Math.max(0, prevTotal - priorDeliveries);

    const deliveries = Math.max(0, priorDeliveries + outcome.deliveredDelta);
    const errors = Math.max(0, priorErrors + outcome.errorDelta);
    const attempts = deliveries + errors;

    const spamFound = Math.max(0, (account.warmupSpamFound || 0) + (outcome.spamFoundDelta || 0));
    const rescuedCount = Math.max(0, (account.warmupRescuedCount || 0) + (outcome.rescuedDelta || 0));
    const unrescuedSpam = Math.max(0, spamFound - rescuedCount);

    let healthScore = prevHealth;
    let rescueRate = account.warmupRescueRate ?? 100;

    if (attempts > 0) {
      const successRatio = deliveries / attempts;
      healthScore = Math.max(0, Math.min(100, Math.round(successRatio * 1000) / 10));

      const effectiveInbox = Math.max(0, deliveries - unrescuedSpam);
      rescueRate = Math.max(0, Math.min(100, Math.round((effectiveInbox / attempts) * 1000) / 10));
    } else if (spamFound > 0) {
      rescueRate = Math.max(0, Math.min(100, Math.round((rescuedCount / spamFound) * 1000) / 10));
    }

    // Never allow a failed round to inflate scores above previous values
    if (outcome.errorDelta > 0 && outcome.deliveredDelta === 0) {
      healthScore = Math.min(healthScore, prevHealth);
      rescueRate = Math.min(rescueRate, account.warmupRescueRate ?? 100);
    }

    return {
      ...account,
      warmupToday: (account.warmupToday || 0) + outcome.deliveredDelta,
      warmupTotal: prevTotal + outcome.deliveredDelta,
      warmupDeliveries: deliveries,
      warmupErrors: errors,
      warmupSpamFound: spamFound,
      warmupRescuedCount: rescuedCount,
      healthScore,
      warmupRescueRate: rescueRate
    };
  }

  private async resolvePartner(
    sender: WarmupSenderAccount,
    uncappedSenders: WarmupSenderAccount[],
    allGlobalAccounts: WarmupSenderAccount[],
    seedMailboxes: SeedMailbox[],
    allowPoolFallback: boolean
  ): Promise<ResolvedPartner | null> {
    const senderWs = sender.workspaceId || 'ws-primary';
    const senderEmail = sender.email.toLowerCase().trim();

    // 1. Same-workspace uncapped warmup accounts first
    const sameWsUncapped = uncappedSenders.filter(
      (a) =>
        a.id !== sender.id &&
        a.email.toLowerCase().trim() !== senderEmail &&
        (a.workspaceId || 'ws-primary') === senderWs
    );
    if (sameWsUncapped.length > 0) {
      const senderIdx = uncappedSenders.findIndex((a) => a.id === sender.id);
      const partner = sameWsUncapped[(Math.max(0, senderIdx) + 1) % sameWsUncapped.length];
      return {
        account: partner,
        partnerType: 'workspace',
        canUseSmtp: !isAccountMockOrDemo(partner)
      };
    }

    // 2. Global Opt-In Multi-Tenant Pool & Seed Mailboxes (only if sender opted in)
    if (!isNetworkOptInEnabled(sender)) {
      return null;
    }

    const optInPoolCandidates = allGlobalAccounts.filter(
      (a) =>
        a.id !== sender.id &&
        a.email.toLowerCase().trim() !== senderEmail &&
        (a.status === 'active' || !a.status) &&
        a.warmupEnabled !== false &&
        isNetworkOptInEnabled(a) &&
        (a.warmupToday || 0) < this.calculateRampTarget(a)
    );

    if (optInPoolCandidates.length > 0) {
      const partner = optInPoolCandidates[Math.floor(Math.random() * optInPoolCandidates.length)];
      return {
        account: partner,
        partnerType: 'opt_in_pool',
        canUseSmtp: !isAccountMockOrDemo(partner)
      };
    }

    // 3. Active seed mailboxes
    const activeSeeds = seedMailboxes.filter(
      (s) => s.isActive !== false && s.email.toLowerCase().trim() !== senderEmail
    );
    if (activeSeeds.length > 0) {
      const seed = activeSeeds[Math.floor(Math.random() * activeSeeds.length)];
      const seedAccount: WarmupSenderAccount = {
        id: seed.id,
        workspaceId: seed.workspaceId || 'global',
        name: `Seed ${seed.provider || 'Inbox'}`,
        email: seed.email,
        provider: seed.provider === 'google' || seed.provider === 'microsoft' ? seed.provider : 'smtp',
        smtpHost: '',
        smtpPort: 587,
        smtpUser: seed.email,
        smtpPass: '',
        dailyLimit: 100,
        sentToday: 0,
        status: 'active',
        warmupEnabled: true
      };
      return {
        account: seedAccount,
        partnerType: 'seed_mailbox',
        canUseSmtp: false
      };
    }

    // 4. Pool partner fallback for single-mailbox workspaces
    if (allowPoolFallback) {
      const fallbacks = getPoolFallbackPartners().filter(
        (p) => p.email.toLowerCase().trim() !== senderEmail
      );
      if (fallbacks.length > 0) {
        const chosen = fallbacks[0];
        const fallbackAccount: WarmupSenderAccount = {
          id: chosen.id,
          workspaceId: 'global-pool',
          name: chosen.name,
          email: chosen.email,
          provider: 'smtp',
          smtpHost: '',
          smtpPort: 587,
          smtpUser: chosen.email,
          smtpPass: '',
          dailyLimit: 200,
          sentToday: 0,
          status: 'active',
          warmupEnabled: true
        };
        return {
          account: fallbackAccount,
          partnerType: 'pool_fallback',
          canUseSmtp: false
        };
      }
    }

    return null;
  }

  async runWarmupRound(options?: WarmupRoundOptions): Promise<WarmupRoundResult> {
    const scopedAccounts = (await Promise.resolve(
      this.accountRepo.getAccounts(options?.workspaceId)
    )) as WarmupSenderAccount[];

    const allGlobalAccounts = options?.workspaceId
      ? ((await Promise.resolve(this.accountRepo.getAccounts())) as WarmupSenderAccount[])
      : scopedAccounts;

    const activeWarmupAccounts = scopedAccounts.filter(
      (a) => (a.status === 'active' || !a.status) && a.warmupEnabled !== false
    );

    if (activeWarmupAccounts.length === 0) {
      return {
        success: false,
        roundsExecuted: 0,
        repliesExecuted: 0,
        skippedRampLimit: 0,
        rescuedFromSpam: 0,
        logs: [
          {
            fromEmail: 'N/A',
            toEmail: 'N/A',
            subject: 'Warmup P2P',
            status: 'error',
            error:
              'Se requieren al menos 2 casillas con warmup habilitado en el workspace para intercambio P2P.'
          }
        ]
      };
    }

    const eligibleSenders: WarmupSenderAccount[] = [];
    let skippedRampLimit = 0;

    for (const acc of activeWarmupAccounts) {
      const rampTarget = this.calculateRampTarget(acc);
      if ((acc.warmupToday || 0) >= rampTarget) {
        skippedRampLimit++;
      } else {
        eligibleSenders.push(acc);
      }
    }

    if (eligibleSenders.length === 0) {
      return {
        success: false,
        roundsExecuted: 0,
        repliesExecuted: 0,
        skippedRampLimit,
        rescuedFromSpam: 0,
        logs: [
          {
            fromEmail: 'N/A',
            toEmail: 'N/A',
            subject: 'Warmup Ramp-Up',
            status: 'error',
            error:
              'Todas las casillas activas alcanzaron su límite diario de ramp-up por hoy.'
          }
        ]
      };
    }

    const seedMailboxes =
      options?.seedMailboxes ??
      (await PlacementTestService.getSeedMailboxes(options?.workspaceId).catch(() => []));

    const allowPoolFallback = options?.allowPoolFallback !== false;

    const logs: WarmupRoundLog[] = [];
    let roundsExecuted = 0;
    let repliesExecuted = 0;
    let rescuedFromSpam = 0;

    const shuffled = [...eligibleSenders].sort(() => 0.5 - Math.random());

    for (const sender of shuffled) {
      const partnerInfo = await this.resolvePartner(
        sender,
        eligibleSenders,
        allGlobalAccounts,
        seedMailboxes,
        allowPoolFallback
      );

      if (!partnerInfo) {
        logs.push({
          fromEmail: sender.email,
          toEmail: 'N/A',
          subject: 'Warmup P2P',
          status: 'error',
          error:
            'Se requieren al menos 2 casillas con warmup habilitado en el workspace (o activar el pool opt-in) para intercambio P2P.'
        });
        continue;
      }

      const partner = partnerInfo.account;
      const rawSub = WARMUP_SUBJECTS[Math.floor(Math.random() * WARMUP_SUBJECTS.length)];
      const rawBody = WARMUP_BODIES[Math.floor(Math.random() * WARMUP_BODIES.length)];
      const subject = this.spintax.resolve(rawSub).replace(/\[warmup\]/gi, '').trim();
      const body = this.spintax.resolve(rawBody);

      const senderDomain = resolveDomain(sender.email);
      const initialMessageId = `<warmup-${uuidv4()}@${senderDomain}>`;

      // Real SMTP only if sender has real credentials AND partner is not a synthetic fallback in production
      const useSimulatedForSender =
        isAccountMockOrDemo(sender) ||
        (partnerInfo.partnerType === 'pool_fallback' && !process.env.VITEST && !process.env.WARMUP_POOL_PARTNERS);
      const senderMailer = useSimulatedForSender ? this.simulatedMailer : this.smtpMailer;

      try {
        const sendRes = await senderMailer.send(sender, {
          from: sender.email,
          fromName: sender.name,
          to: partner.email,
          subject,
          body,
          messageId: initialMessageId,
          headers: {
            'X-MiSender-Ref': initialMessageId
          }
        });

        const status: WarmupRoundLog['status'] = sendRes.success
          ? sendRes.mode === 'simulated'
            ? 'simulated'
            : 'sent'
          : 'error';

        await this.warmupRepo.logWarmup({
          fromAccountId: sender.id,
          toAccountId: partner.id,
          subject,
          status: status === 'error' ? 'failed' : 'sent'
        });

        const updatedSender = this.recomputeAccountHealth(sender, {
          deliveredDelta: sendRes.success ? 1 : 0,
          errorDelta: sendRes.success ? 0 : 1
        });
        await Promise.resolve(this.accountRepo.saveAccount(updatedSender));

        if (!sendRes.success) {
          logs.push({
            fromEmail: sender.email,
            toEmail: partner.email,
            subject,
            status: 'error',
            messageId: initialMessageId,
            partnerType: partnerInfo.partnerType,
            error: sendRes.error || 'Warmup send failed'
          });
          continue;
        }

        roundsExecuted++;

        // Execute paired bidirectional reverse reply with In-Reply-To & References headers
        const replySubject = /^re:\s*/i.test(subject) ? subject : `Re: ${subject}`;
        const replyBody = this.spintax.resolve(
          WARMUP_REPLY_BODIES[Math.floor(Math.random() * WARMUP_REPLY_BODIES.length)]
        );
        const partnerDomain = resolveDomain(partner.email);
        const replyMessageId = `<warmup-reply-${uuidv4()}@${partnerDomain}>`;

        const replyMailer = partnerInfo.canUseSmtp ? this.smtpMailer : this.simulatedMailer;
        let replyStatus: WarmupRoundLog['replyStatus'] = 'skipped';

        try {
          const replyRes = await replyMailer.send(partner, {
            from: partner.email,
            fromName: partner.name,
            to: sender.email,
            subject: replySubject,
            body: replyBody,
            messageId: replyMessageId,
            inReplyTo: initialMessageId,
            references: initialMessageId,
            headers: {
              'X-MiSender-Ref': replyMessageId
            }
          });

          replyStatus = replyRes.success
            ? replyRes.mode === 'simulated'
              ? 'simulated'
              : 'sent'
            : 'error';

          await this.warmupRepo.logWarmup({
            fromAccountId: partner.id,
            toAccountId: sender.id,
            subject: replySubject,
            status: replyRes.success ? 'replied' : 'failed'
          });

          if (replyRes.success) {
            repliesExecuted++;
          }
        } catch {
          replyStatus = 'error';
          await this.warmupRepo.logWarmup({
            fromAccountId: partner.id,
            toAccountId: sender.id,
            subject: replySubject,
            status: 'failed'
          });
        }

        if (options?.runSpamRescue) {
          const rescueRes = await this.rescueWarmupSpam(updatedSender, options.imapService);
          rescuedFromSpam += rescueRes.rescued;
        }

        logs.push({
          fromEmail: sender.email,
          toEmail: partner.email,
          subject,
          status,
          messageId: initialMessageId,
          inReplyTo: initialMessageId,
          references: initialMessageId,
          replyStatus,
          replyMessageId,
          partnerType: partnerInfo.partnerType
        });
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Warmup error';
        const failedSender = this.recomputeAccountHealth(sender, {
          deliveredDelta: 0,
          errorDelta: 1
        });
        await Promise.resolve(this.accountRepo.saveAccount(failedSender));
        await this.warmupRepo.logWarmup({
          fromAccountId: sender.id,
          toAccountId: partner.id,
          subject,
          status: 'failed'
        });

        logs.push({
          fromEmail: sender.email,
          toEmail: partner.email,
          subject,
          status: 'error',
          messageId: initialMessageId,
          partnerType: partnerInfo.partnerType,
          error: errorMessage
        });
      }
    }

    return {
      success: roundsExecuted > 0,
      roundsExecuted,
      repliesExecuted,
      skippedRampLimit,
      rescuedFromSpam,
      logs
    };
  }

  async rescueWarmupSpam(
    account: WarmupSenderAccount,
    imapService?: WarmupImapServiceAdapter
  ): Promise<WarmupSpamRescueResult> {
    const result: WarmupSpamRescueResult = {
      accountId: account.id,
      email: account.email,
      foldersScanned: [],
      scanned: 0,
      foundInSpam: 0,
      rescued: 0,
      rescuedSubjects: [],
      errors: []
    };

    try {
      if (imapService) {
        if (typeof imapService.rescueWarmupMessages === 'function') {
          const customRes = await imapService.rescueWarmupMessages(account);
          result.foldersScanned = customRes.foldersScanned || ['Spam', 'Junk'];
          result.scanned = customRes.scanned || 0;
          result.foundInSpam = customRes.foundInSpam || 0;
          result.rescued = customRes.rescued || 0;
          result.rescuedSubjects = customRes.rescuedSubjects || [];
          result.errors = customRes.errors || [];
        } else {
          const fetcher = imapService.scanSpamFolder || imapService.fetchSpamMessages;
          if (typeof fetcher === 'function') {
            result.foldersScanned = ['Spam', 'Junk'];
            const messages = await fetcher(account);
            result.scanned = messages.length;
            for (const msg of messages) {
              const subject = msg.subject || '';
              if (isWarmupMessageMarker(subject, msg.messageId, msg.headers)) {
                result.foundInSpam++;
                let moved = true;
                if (typeof imapService.moveToInbox === 'function' && msg.uid) {
                  moved = await imapService.moveToInbox(account, msg.uid);
                }
                if (moved) {
                  result.rescued++;
                  if (subject) result.rescuedSubjects.push(subject);
                }
              }
            }
          }
        }
      } else if (!isAccountMockOrDemo(account) && !process.env.VITEST) {
        const imapHost = resolveImapHost(account.smtpHost);
        const imapUser = account.smtpUser || account.email;
        const imapRes = await this.scanAndRescueImapSpam(imapHost, imapUser, account.smtpPass);
        result.foldersScanned = imapRes.foldersScanned;
        result.scanned = imapRes.scanned;
        result.foundInSpam = imapRes.foundInSpam;
        result.rescued = imapRes.rescued;
        result.rescuedSubjects = imapRes.rescuedSubjects;
        result.errors = imapRes.errors;
      }
    } catch (err: unknown) {
      result.errors.push(err instanceof Error ? err.message : 'IMAP rescue error');
    }

    if (result.foundInSpam > 0 || result.rescued > 0) {
      const updated = this.recomputeAccountHealth(account, {
        deliveredDelta: 0,
        errorDelta: 0,
        spamFoundDelta: result.foundInSpam,
        rescuedDelta: result.rescued
      });
      await Promise.resolve(this.accountRepo.saveAccount(updated));
    }

    return result;
  }

  private async scanAndRescueImapSpam(
    host: string,
    user: string,
    pass: string
  ): Promise<Omit<WarmupSpamRescueResult, 'accountId' | 'email'>> {
    const foldersToTry = ['[Gmail]/Spam', 'Junk', 'Spam'];
    const foldersScanned: string[] = [];
    const rescuedSubjects: string[] = [];
    const errors: string[] = [];
    let scanned = 0;
    let foundInSpam = 0;
    let rescued = 0;

    for (const folder of foldersToTry) {
      try {
        const folderRes = await this.rescueSingleImapFolder(host, user, pass, folder);
        if (folderRes.selected) {
          foldersScanned.push(folder);
          scanned += folderRes.scanned;
          foundInSpam += folderRes.foundInSpam;
          rescued += folderRes.rescued;
          rescuedSubjects.push(...folderRes.rescuedSubjects);
        }
      } catch (err: unknown) {
        errors.push(`${folder}: ${err instanceof Error ? err.message : 'IMAP error'}`);
      }
    }

    return { foldersScanned, scanned, foundInSpam, rescued, rescuedSubjects, errors };
  }

  private rescueSingleImapFolder(
    host: string,
    user: string,
    pass: string,
    folder: string
  ): Promise<{
    selected: boolean;
    scanned: number;
    foundInSpam: number;
    rescued: number;
    rescuedSubjects: string[];
  }> {
    return new Promise((resolve, reject) => {
      let buffer = '';
      let step: 'greeting' | 'login' | 'select' | 'fetch' | 'copy' | 'store' | 'expunge' | 'done' =
        'greeting';
      let existsCount = 0;
      let matchingUids: string[] = [];
      let foundSubjects: string[] = [];
      let scannedCount = 0;

      const socket = tls.connect(
        {
          host,
          port: 993,
          servername: host,
          rejectUnauthorized: process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0',
          minVersion: 'TLSv1.2'
        },
        () => {}
      );
      socket.setEncoding('utf8');

      const finish = (selected: boolean, rescuedCount: number) => {
        clearTimeout(timeout);
        try {
          socket.write('Z9 LOGOUT\r\n');
          socket.end();
        } catch {}
        resolve({
          selected,
          scanned: scannedCount,
          foundInSpam: matchingUids.length,
          rescued: rescuedCount,
          rescuedSubjects: foundSubjects
        });
      };

      const timeout = setTimeout(() => {
        try {
          socket.destroy();
        } catch {}
        finish(foldersSelected(), 0);
      }, 6500);

      const foldersSelected = () => step !== 'greeting' && step !== 'login' && step !== 'select';

      socket.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      socket.on('data', (chunk: string) => {
        buffer += chunk;

        if (step === 'greeting' && buffer.includes('* OK')) {
          step = 'login';
          buffer = '';
          const safeUser = user.replace(/[\r\n"]/g, '').trim();
          const safePass = pass.replace(/[\r\n]/g, '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
          socket.write(`A1 LOGIN "${safeUser}" "${safePass}"\r\n`);
        } else if (step === 'login') {
          if (buffer.includes('A1 OK')) {
            step = 'select';
            buffer = '';
            const safeFolder = folder.replace(/[\r\n"]/g, '');
            socket.write(`A2 SELECT "${safeFolder}"\r\n`);
          } else if (buffer.includes('A1 NO') || buffer.includes('A1 BAD')) {
            clearTimeout(timeout);
            socket.destroy();
            reject(new Error('Autenticación IMAP rechazada'));
          }
        } else if (step === 'select') {
          const existsMatch = buffer.match(/\*\s+(\d+)\s+EXISTS/);
          if (existsMatch) existsCount = parseInt(existsMatch[1], 10);

          if (buffer.includes('A2 OK')) {
            if (existsCount === 0) {
              step = 'done';
              finish(true, 0);
              return;
            }
            step = 'fetch';
            buffer = '';
            const startSeq = Math.max(1, existsCount - 24);
            socket.write(
              `A3 FETCH ${startSeq}:${existsCount} (UID BODY.PEEK[HEADER.FIELDS (SUBJECT MESSAGE-ID X-MISENDER-REF)])\r\n`
            );
          } else if (buffer.includes('A2 NO') || buffer.includes('A2 BAD')) {
            step = 'done';
            finish(false, 0);
          }
        } else if (step === 'fetch') {
          if (buffer.includes('A3 OK') || buffer.includes('A3 NO') || buffer.includes('A3 BAD')) {
            const blocks = buffer.split(/\*\s+\d+\s+FETCH\s+\(/i).slice(1);
            scannedCount = blocks.length;
            const uids: string[] = [];
            const subjects: string[] = [];
            for (const block of blocks) {
              const uidMatch = block.match(/UID\s+(\d+)/i);
              const subMatch = block.match(/^Subject:\s*(.+)$/im);
              const msgIdMatch = block.match(/^Message-ID:\s*(.+)$/im);
              const sub = (subMatch?.[1] || '').trim();
              const msgId = (msgIdMatch?.[1] || '').trim();
              if (uidMatch?.[1] && isWarmupMessageMarker(sub, msgId, block)) {
                uids.push(uidMatch[1]);
                if (sub) subjects.push(sub);
              }
            }
            matchingUids = uids;
            foundSubjects = subjects;

            if (matchingUids.length === 0) {
              step = 'done';
              finish(true, 0);
              return;
            }

            step = 'copy';
            buffer = '';
            socket.write(`A4 UID COPY ${matchingUids.join(',')} "INBOX"\r\n`);
          }
        } else if (step === 'copy') {
          if (buffer.includes('A4 OK')) {
            step = 'store';
            buffer = '';
            socket.write(`A5 UID STORE ${matchingUids.join(',')} +FLAGS (\\Deleted)\r\n`);
          } else if (buffer.includes('A4 NO') || buffer.includes('A4 BAD')) {
            step = 'done';
            finish(true, 0);
          }
        } else if (step === 'store') {
          if (buffer.includes('A5 OK') || buffer.includes('A5 NO') || buffer.includes('A5 BAD')) {
            step = 'expunge';
            buffer = '';
            socket.write('A6 EXPUNGE\r\n');
          }
        } else if (step === 'expunge') {
          if (buffer.includes('A6 OK') || buffer.includes('A6 NO') || buffer.includes('A6 BAD')) {
            step = 'done';
            finish(true, matchingUids.length);
          }
        }
      });
    });
  }
}
