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

  getAccounts(): SenderAccount[] {
    return this.driver.read<SenderAccount[]>(this.filename, initialAccountsSeed);
  }

  getAccountById(id: string): SenderAccount | undefined {
    const accounts = this.getAccounts();
    return accounts.find(a => a.id === id);
  }

  saveAccounts(accounts: SenderAccount[]): void {
    this.driver.write(this.filename, accounts);
  }

  saveAccount(account: SenderAccount): void {
    const existing = this.getAccounts();
    const idx = existing.findIndex(a => a.id === account.id);
    if (idx >= 0) {
      existing[idx] = account;
    } else {
      existing.push(account);
    }
    this.saveAccounts(existing);
  }

  deleteAccount(id: string): void {
    const existing = this.getAccounts();
    const filtered = existing.filter(a => a.id !== id);
    this.saveAccounts(filtered);
  }
}
