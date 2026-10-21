import { container } from '@/core/container';
import { Campaign, Lead, SenderAccount, CopilotMessage } from '@/types';

// Backward-compatible façade delegating to the SOLID container repositories
export const db = {
  getCampaigns: async (): Promise<Campaign[]> => await container.campaignRepo.getCampaigns(),
  saveCampaigns: async (campaigns: Campaign[]): Promise<void> => await container.campaignRepo.saveCampaigns(campaigns),
  getCampaignById: async (id: string): Promise<Campaign | undefined> => await container.campaignRepo.getCampaignById(id),
  saveCampaign: async (campaign: Campaign): Promise<void> => await container.campaignRepo.saveCampaign(campaign),

  getLeads: async (campaignId?: string): Promise<Lead[]> => await container.leadRepo.getLeads(campaignId),
  saveLeads: async (leads: Lead[]): Promise<void> => await container.leadRepo.saveLeads(leads),
  addLeads: async (newLeads: Lead[]): Promise<void> => await container.leadRepo.addLeads(newLeads),
  updateLead: async (lead: Lead): Promise<void> => await container.leadRepo.updateLead(lead),

  getAccounts: async (): Promise<SenderAccount[]> => await container.accountRepo.getAccounts(),
  saveAccounts: async (accounts: SenderAccount[]): Promise<void> => await container.accountRepo.saveAccounts(accounts),
  saveAccount: async (account: SenderAccount): Promise<void> => await container.accountRepo.saveAccount(account),

  getCopilotMessages: async (): Promise<CopilotMessage[]> => await container.copilotRepo.getMessages(),
  saveCopilotMessages: async (messages: CopilotMessage[]): Promise<void> => await container.copilotRepo.saveMessages(messages),
  addCopilotMessage: async (msg: CopilotMessage): Promise<void> => await container.copilotRepo.addMessage(msg)
};
