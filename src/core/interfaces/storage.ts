import { Campaign, Lead, SenderAccount, CopilotMessage } from '@/types';

// Interface Segregation Principle (ISP): Split Read and Write interfaces
export interface ICampaignReader {
  getCampaigns(): Campaign[];
  getCampaignById(id: string): Campaign | undefined;
}

export interface ICampaignWriter {
  saveCampaigns(campaigns: Campaign[]): void;
  saveCampaign(campaign: Campaign): void;
}

export interface ICampaignRepository extends ICampaignReader, ICampaignWriter {}

export interface ILeadReader {
  getLeads(campaignId?: string): Lead[];
  getLeadById(id: string): Lead | undefined;
}

export interface ILeadWriter {
  saveLeads(leads: Lead[]): void;
  addLeads(newLeads: Lead[]): void;
  updateLead(lead: Lead): void;
}

export interface ILeadRepository extends ILeadReader, ILeadWriter {}

export interface IAccountReader {
  getAccounts(): SenderAccount[];
  getAccountById(id: string): SenderAccount | undefined;
}

export interface IAccountWriter {
  saveAccounts(accounts: SenderAccount[]): void;
  saveAccount(account: SenderAccount): void;
}

export interface IAccountRepository extends IAccountReader, IAccountWriter {}

export interface ICopilotRepository {
  getMessages(): CopilotMessage[];
  saveMessages(messages: CopilotMessage[]): void;
  addMessage(message: CopilotMessage): void;
}
