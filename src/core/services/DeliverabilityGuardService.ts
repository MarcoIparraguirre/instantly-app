import { DnsAuditResult, SenderAccount } from '@/types';
import { IAccountRepository } from '../interfaces/storage';
import { WebhookDispatcherService } from './WebhookDispatcherService';

export interface GuardedSenderAccount extends SenderAccount {
  bounceCount?: number;
  totalSent?: number;
  pausedReason?: string | null;
  lastUsedAt?: string | null;
}

export interface AccountHealthMetrics {
  sent?: number;
  bounced?: number;
  dnsAudit?: DnsAuditResult;
}

export interface AccountHealthEvaluation {
  healthy: boolean;
  shouldPause: boolean;
  bounceRate: number;
  reason?: string;
}

export interface WorkspaceDeliverabilitySummary {
  checked: number;
  paused: number;
  healthyAccounts: number;
  remainingDailyCapacity: number;
  pausedAccounts?: Array<{
    id: string;
    email: string;
    reason: string;
    bounceRate: number;
  }>;
}

export interface IDeliverabilityDnsChecker {
  auditDomain(domain: string, dkimSelector?: string): Promise<DnsAuditResult>;
}

export interface IDeliverabilityWebhookDispatcher {
  trigger(
    event: 'account.paused',
    data: Record<string, unknown>,
    workspaceId?: string
  ): Promise<void>;
}

const BOUNCE_RATE_PAUSE_THRESHOLD = 0.04;
const MIN_SENT_SAMPLE_FOR_BOUNCE_PAUSE = 10;

export class DeliverabilityGuardService {
  constructor(
    private accountRepo?: IAccountRepository,
    private dnsChecker?: IDeliverabilityDnsChecker,
    private webhookDispatcher?: WebhookDispatcherService | IDeliverabilityWebhookDispatcher
  ) {}

  /**
   * Evaluates a single sender account's deliverability health based on bounce metrics and optional DNS audit.
   * Triggers pause recommendation if (sent >= 10 && bounceRate >= 0.04) or critical DNS failure (SPF/DKIM invalid).
   */
  evaluateAccountHealth(
    account: GuardedSenderAccount,
    metrics?: AccountHealthMetrics
  ): AccountHealthEvaluation {
    const sent =
      metrics?.sent !== undefined
        ? Math.max(0, Number(metrics.sent) || 0)
        : Math.max(0, Number(account.totalSent ?? account.sentToday ?? 0) || 0);

    const bounced =
      metrics?.bounced !== undefined
        ? Math.max(0, Number(metrics.bounced) || 0)
        : Math.max(0, Number(account.bounceCount ?? 0) || 0);

    const bounceRate = sent > 0 ? bounced / sent : 0;
    const reasons: string[] = [];

    if (sent >= MIN_SENT_SAMPLE_FOR_BOUNCE_PAUSE && bounceRate >= BOUNCE_RATE_PAUSE_THRESHOLD) {
      reasons.push(
        `Bounce rate ${(bounceRate * 100).toFixed(1)}% (${bounced}/${sent}) exceeded ${(BOUNCE_RATE_PAUSE_THRESHOLD * 100).toFixed(0)}% threshold`
      );
    }

    const dnsAudit = metrics?.dnsAudit;
    if (dnsAudit) {
      if (dnsAudit.spf?.valid === false) {
        reasons.push('Critical DNS failure: SPF record invalid or missing');
      }
      if (dnsAudit.dkim?.valid === false) {
        reasons.push('Critical DNS failure: DKIM record invalid or missing');
      }
    }

    if (reasons.length > 0) {
      return {
        healthy: false,
        shouldPause: true,
        bounceRate,
        reason: reasons.join('; '),
      };
    }

    return {
      healthy: true,
      shouldPause: false,
      bounceRate,
    };
  }

  /**
   * Evaluates all sender accounts in a workspace, pauses unhealthy accounts via `accountRepo`,
   * dispatches `account.paused` webhooks, and returns a capacity & health summary.
   */
  async enforceWorkspaceDeliverability(
    workspaceId?: string
  ): Promise<WorkspaceDeliverabilitySummary> {
    if (!this.accountRepo) {
      return {
        checked: 0,
        paused: 0,
        healthyAccounts: 0,
        remainingDailyCapacity: 0,
        pausedAccounts: [],
      };
    }

    const accounts = await Promise.resolve(this.accountRepo.getAccounts(workspaceId));
    const dnsCache = new Map<string, DnsAuditResult | undefined>();

    let checked = 0;
    let paused = 0;
    let healthyAccounts = 0;
    let remainingDailyCapacity = 0;
    const pausedAccounts: Array<{
      id: string;
      email: string;
      reason: string;
      bounceRate: number;
    }> = [];

    for (const rawAccount of accounts) {
      const account = rawAccount as GuardedSenderAccount;
      checked++;

      let dnsAudit: DnsAuditResult | undefined;
      if (this.dnsChecker && account.email.includes('@')) {
        const domain = account.email.split('@')[1]?.toLowerCase().trim();
        if (domain) {
          if (!dnsCache.has(domain)) {
            try {
              const audit = await this.dnsChecker.auditDomain(domain);
              dnsCache.set(domain, audit);
            } catch {
              dnsCache.set(domain, undefined);
            }
          }
          dnsAudit = dnsCache.get(domain);
        }
      }

      const evaluation = this.evaluateAccountHealth(account, { dnsAudit });
      const statusStr = String(account.status || 'active');
      const isAlreadyPaused = statusStr === 'error' || statusStr === 'paused';

      if (evaluation.shouldPause) {
        if (!isAlreadyPaused) {
          const pausedReason = evaluation.reason || 'Deliverability guard auto-pause';
          const updatedAccount: GuardedSenderAccount = {
            ...account,
            status: 'error',
            pausedReason,
          };

          await Promise.resolve(this.accountRepo.saveAccount(updatedAccount));
          paused++;
          pausedAccounts.push({
            id: account.id,
            email: account.email,
            reason: pausedReason,
            bounceRate: evaluation.bounceRate,
          });

          await this.dispatchAccountPausedWebhook(account, pausedReason, evaluation.bounceRate, workspaceId);
        }
        continue;
      }

      if (!isAlreadyPaused) {
        healthyAccounts++;
        const remaining = Math.max(0, (Number(account.dailyLimit) || 0) - (Number(account.sentToday) || 0));
        remainingDailyCapacity += remaining;
      }
    }

    return {
      checked,
      paused,
      healthyAccounts,
      remainingDailyCapacity,
      pausedAccounts,
    };
  }

  private async dispatchAccountPausedWebhook(
    account: GuardedSenderAccount,
    reason: string,
    bounceRate: number,
    workspaceId?: string
  ): Promise<void> {
    if (!this.webhookDispatcher) return;
    try {
      const triggerFn = this.webhookDispatcher.trigger as (
        event: string,
        data: Record<string, unknown>,
        workspaceId?: string
      ) => Promise<void>;
      const targetWorkspaceId = account.workspaceId || workspaceId;
      await triggerFn.call(
        this.webhookDispatcher,
        'account.paused',
        {
          accountId: account.id,
          email: account.email,
          workspaceId: targetWorkspaceId || 'ws-primary',
          reason,
          bounceRate,
          pausedAt: new Date().toISOString(),
        },
        targetWorkspaceId
      );
    } catch {
      // Never allow webhook delivery errors to interrupt deliverability enforcement
    }
  }
}
