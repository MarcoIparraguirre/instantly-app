import { SenderAccount } from '@/types';

export interface IAccountRotator {
  getNextAccount(accounts: SenderAccount[]): SenderAccount | null;
  reset(): void;
}

export class RoundRobinAccountRotator implements IAccountRotator {
  private currentIndex = 0;

  getNextAccount(accounts: SenderAccount[]): SenderAccount | null {
    if (!accounts || accounts.length === 0) return null;

    // Filter accounts that have not exceeded their daily limit
    const available = accounts.filter(a => (a.sentToday || 0) < a.dailyLimit);
    if (available.length === 0) return null;

    const selected = available[this.currentIndex % available.length];
    this.currentIndex++;
    return selected;
  }

  reset(): void {
    this.currentIndex = 0;
  }
}
