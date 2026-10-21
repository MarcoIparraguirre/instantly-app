import { Campaign, Lead, SenderAccount, CopilotMessage } from '@/types';

// Interface Segregation Principle (ISP): Split Read and Write interfaces
// Compatible with both asynchronous (Supabase, PostgreSQL) and synchronous (JSON, memory) drivers
export interface ICampaignReader {
  getCampaigns(): Promise<Campaign[]> | Campaign[];
  getCampaignById(id: string): Promise<Campaign | undefined> | (Campaign | undefined);
}

export interface ICampaignWriter {
  saveCampaigns(campaigns: Campaign[]): Promise<void> | void;
  saveCampaign(campaign: Campaign): Promise<void> | void;
  deleteCampaign?(id: string): Promise<void> | void;
}

export interface ICampaignRepository extends ICampaignReader, ICampaignWriter {}

export interface ILeadReader {
  getLeads(campaignId?: string): Promise<Lead[]> | Lead[];
  getLeadById(id: string): Promise<Lead | undefined> | (Lead | undefined);
}

export interface ILeadWriter {
  saveLeads(leads: Lead[]): Promise<void> | void;
  addLeads(newLeads: Lead[]): Promise<void> | void;
  updateLead(lead: Lead): Promise<void> | void;
  deleteLeads(campaignId?: string): Promise<void> | void;
}

export interface ILeadRepository extends ILeadReader, ILeadWriter {}

export interface IAccountReader {
  getAccounts(): Promise<SenderAccount[]> | SenderAccount[];
  getAccountById(id: string): Promise<SenderAccount | undefined> | (SenderAccount | undefined);
}

export interface IAccountWriter {
  saveAccounts(accounts: SenderAccount[]): Promise<void> | void;
  saveAccount(account: SenderAccount): Promise<void> | void;
  deleteAccount(id: string): Promise<void> | void;
}

export interface IAccountRepository extends IAccountReader, IAccountWriter {}

export interface ICopilotRepository {
  getMessages(): Promise<CopilotMessage[]> | CopilotMessage[];
  saveMessages(messages: CopilotMessage[]): Promise<void> | void;
  addMessage(message: CopilotMessage): Promise<void> | void;
}
