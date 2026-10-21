import { container } from '@/core/container';
import { Campaign, Lead, SenderAccount, CopilotMessage } from '@/types';

// Backward-compatible façade delegating to the SOLID container repositories
export const db = {
  getCampaigns: (): Campaign[] => container.campaignRepo.getCampaigns(),
  saveCampaigns: (campaigns: Campaign[]): void => container.campaignRepo.saveCampaigns(campaigns),
  getCampaignById: (id: string): Campaign | undefined => container.campaignRepo.getCampaignById(id),
  saveCampaign: (campaign: Campaign): void => container.campaignRepo.saveCampaign(campaign),

  getLeads: (campaignId?: string): Lead[] => container.leadRepo.getLeads(campaignId),
  saveLeads: (leads: Lead[]): void => container.leadRepo.saveLeads(leads),
  addLeads: (newLeads: Lead[]): void => container.leadRepo.addLeads(newLeads),
  updateLead: (lead: Lead): void => container.leadRepo.updateLead(lead),

  getAccounts: (): SenderAccount[] => container.accountRepo.getAccounts(),
  saveAccounts: (accounts: SenderAccount[]): void => container.accountRepo.saveAccounts(accounts),
  saveAccount: (account: SenderAccount): void => container.accountRepo.saveAccount(account),

  getCopilotMessages: (): CopilotMessage[] => container.copilotRepo.getMessages(),
  saveCopilotMessages: (messages: CopilotMessage[]): void => container.copilotRepo.saveMessages(messages),
  addCopilotMessage: (msg: CopilotMessage): void => container.copilotRepo.addMessage(msg)
};
