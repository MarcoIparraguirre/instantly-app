import { SenderAccount } from '@/types';

export interface RotatableSenderAccount extends SenderAccount {
  lastUsedAt?: string | number | null;
  pausedReason?: string | null;
}

export type AccountRotationStrategy = 'round-robin' | 'balanced';

export interface AccountRotatorOptions {
  strategy?: AccountRotationStrategy;
}

export interface IAccountRotator {
  getNextAccount(accounts: SenderAccount[]): SenderAccount | null;
  reset(): void;
}

function getRelativeUtilization(account: SenderAccount): number {
  const limit = Math.max(1, Number(account.dailyLimit) || 1);
  const sent = Math.max(0, Number(account.sentToday) || 0);
  return sent / limit;
}

function parseLastUsedTimestamp(account: RotatableSenderAccount): number {
  const raw = account.lastUsedAt;
  if (raw === undefined || raw === null || raw === '') return 0;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function filterAvailableAccounts(accounts: SenderAccount[]): SenderAccount[] {
  return accounts.filter(a => {
    const dailyLimit = Number(a.dailyLimit) || 0;
    const sentToday = Number(a.sentToday) || 0;
    const statusStr = String(a.status || 'active');
    const isDisabled = statusStr === 'error' || statusStr === 'paused';
    return !isDisabled && sentToday < dailyLimit;
  });
}

export class RoundRobinAccountRotator implements IAccountRotator {
  private currentIndex = 0;

  constructor(private options: AccountRotatorOptions = {}) {}

  getNextAccount(accounts: SenderAccount[]): SenderAccount | null {
    if (!accounts || accounts.length === 0) return null;

    // Filter accounts that are active/eligible and have not exceeded their daily limit
    const available = filterAvailableAccounts(accounts);
    if (available.length === 0) return null;

    if (this.options.strategy === 'balanced') {
      return this.selectBalanced(available);
    }

    // Cold-start serverless resilience: when currentIndex === 0 and accounts carry lastUsedAt,
    // start from the least-recently-used mailbox (tie-breaking by lowest relative utilization)
    // so serverless cold starts do not hammer the first mailbox in the array.
    const hasLastUsedMetadata =
      this.currentIndex === 0 &&
      available.some(a => {
        const ts = (a as RotatableSenderAccount).lastUsedAt;
        return ts !== undefined && ts !== null && ts !== '';
      });

    if (hasLastUsedMetadata) {
      let bestIdx = 0;
      let bestTs = parseLastUsedTimestamp(available[0] as RotatableSenderAccount);
      let bestUtil = getRelativeUtilization(available[0]);

      for (let i = 1; i < available.length; i++) {
        const candidate = available[i];
        const ts = parseLastUsedTimestamp(candidate as RotatableSenderAccount);
        const util = getRelativeUtilization(candidate);
        if (ts < bestTs || (ts === bestTs && util < bestUtil - 1e-9)) {
          bestIdx = i;
          bestTs = ts;
          bestUtil = util;
        }
      }

      const selected = available[bestIdx];
      this.currentIndex = bestIdx + 1;
      return selected;
    }

    const selected = available[this.currentIndex % available.length];
    this.currentIndex++;
    return selected;
  }

  /**
   * Selects the available account with lowest relative utilization (sentToday / dailyLimit),
   * breaking ties by oldest lastUsedAt and round-robin order.
   */
  getNextBalancedAccount(accounts: SenderAccount[]): SenderAccount | null {
    if (!accounts || accounts.length === 0) return null;
    const available = filterAvailableAccounts(accounts);
    if (available.length === 0) return null;
    return this.selectBalanced(available);
  }

  private selectBalanced(available: SenderAccount[]): SenderAccount {
    const startIdx = this.currentIndex % available.length;
    let bestIdx = startIdx;
    let best = available[startIdx];
    let bestUtil = getRelativeUtilization(best);
    let bestTs = parseLastUsedTimestamp(best as RotatableSenderAccount);

    for (let offset = 1; offset < available.length; offset++) {
      const candidateIdx = (startIdx + offset) % available.length;
      const candidate = available[candidateIdx];
      const util = getRelativeUtilization(candidate);
      const ts = parseLastUsedTimestamp(candidate as RotatableSenderAccount);

      if (
        util < bestUtil - 1e-9 ||
        (Math.abs(util - bestUtil) <= 1e-9 && ts < bestTs)
      ) {
        bestIdx = candidateIdx;
        best = candidate;
        bestUtil = util;
        bestTs = ts;
      }
    }

    this.currentIndex = bestIdx + 1;
    return best;
  }

  reset(): void {
    this.currentIndex = 0;
  }
}

export class BalancedAccountRotator extends RoundRobinAccountRotator {
  constructor() {
    super({ strategy: 'balanced' });
  }
}
