import { SenderAccount } from '@/types';
import { IAccountRepository } from '../interfaces/storage';
import { IJsonStorageDriver } from './JsonDriver';
import { initialEmailAccountsWithWarmup } from './mockData';

export const initialAccountsSeed: SenderAccount[] = initialEmailAccountsWithWarmup;

export class AccountRepository implements IAccountRepository {
  private driver: IJsonStorageDriver;
  private filename = 'accounts.json';

  constructor(driver: IJsonStorageDriver) {
    this.driver = driver;
  }

  getAccounts(workspaceId?: string): SenderAccount[] {
    const accounts = this.driver.read<SenderAccount[]>(this.filename, initialAccountsSeed);
    return workspaceId
      ? accounts.filter(a => (a.workspaceId || 'ws-primary') === workspaceId)
      : accounts;
  }

  getAccountById(id: string): SenderAccount | undefined {
    const accounts = this.getAccounts();
    return accounts.find(a => a.id === id);
  }

  saveAccounts(accounts: SenderAccount[]): void {
    const normalized = accounts.map(a => ({
      ...a,
      workspaceId: a.workspaceId || 'ws-primary'
    }));
    this.driver.write(this.filename, normalized);
  }

  saveAccount(account: SenderAccount): void {
    const existing = this.getAccounts();
    const idx = existing.findIndex(a => a.id === account.id);
    const toSave = { ...account };
    if (idx >= 0) {
      if (toSave.smtpPass === '••••••••' || toSave.smtpPass === '********') {
        toSave.smtpPass = existing[idx].smtpPass;
      }
      toSave.workspaceId = toSave.workspaceId || existing[idx].workspaceId || 'ws-primary';
      existing[idx] = toSave;
    } else {
      toSave.workspaceId = toSave.workspaceId || 'ws-primary';
      existing.push(toSave);
    }
    this.saveAccounts(existing);
  }

  deleteAccount(id: string): void {
    const existing = this.getAccounts();
    const filtered = existing.filter(a => a.id !== id);
    this.saveAccounts(filtered);
  }
}
