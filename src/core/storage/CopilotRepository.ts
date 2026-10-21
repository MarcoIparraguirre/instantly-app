import { CopilotMessage } from '@/types';
import { ICopilotRepository } from '../interfaces/storage';
import { IJsonStorageDriver } from './JsonDriver';

export class CopilotRepository implements ICopilotRepository {
  private driver: IJsonStorageDriver;
  private filename = 'copilot_messages.json';

  constructor(driver: IJsonStorageDriver) {
    this.driver = driver;
  }

  getMessages(): CopilotMessage[] {
    return this.driver.read<CopilotMessage[]>(this.filename, []);
  }

  saveMessages(messages: CopilotMessage[]): void {
    this.driver.write(this.filename, messages);
  }

  addMessage(message: CopilotMessage): void {
    const existing = this.getMessages();
    existing.push(message);
    this.saveMessages(existing);
  }
}
