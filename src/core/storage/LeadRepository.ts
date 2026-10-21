import { Lead } from '@/types';
import { ILeadRepository } from '../interfaces/storage';
import { IJsonStorageDriver } from './JsonDriver';

export const initialLeadsSeed: Lead[] = [
  {
    id: 'lead-1',
    campaignId: 'campaign-1',
    email: 'lead.john@targetco.com',
    firstName: 'John',
    lastName: 'Doe',
    companyName: 'TargetCo',
    status: 'pending',
    currentStep: 1
  },
  {
    id: 'lead-2',
    campaignId: 'campaign-1',
    email: 'sarah.miller@acmecorp.io',
    firstName: 'Sarah',
    lastName: 'Miller',
    companyName: 'Acme Corp',
    status: 'pending',
    currentStep: 1
  }
];

export class LeadRepository implements ILeadRepository {
  private driver: IJsonStorageDriver;
  private filename = 'leads.json';

  constructor(driver: IJsonStorageDriver) {
    this.driver = driver;
  }

  getLeads(campaignId?: string): Lead[] {
    const leads = this.driver.read<Lead[]>(this.filename, initialLeadsSeed);
    return campaignId ? leads.filter(l => l.campaignId === campaignId) : leads;
  }

  getLeadById(id: string): Lead | undefined {
    const leads = this.getLeads();
    return leads.find(l => l.id === id);
  }

  saveLeads(leads: Lead[]): void {
    this.driver.write(this.filename, leads);
  }

  addLeads(newLeads: Lead[]): void {
    const existing = this.getLeads();
    this.saveLeads([...existing, ...newLeads]);
  }

  updateLead(lead: Lead): void {
    const existing = this.getLeads();
    const idx = existing.findIndex(l => l.id === lead.id);
    if (idx >= 0) {
      existing[idx] = lead;
      this.saveLeads(existing);
    }
  }

  deleteLeads(campaignId?: string): void {
    const existing = this.getLeads();
    const remaining = campaignId ? existing.filter(l => l.campaignId !== campaignId) : [];
    this.saveLeads(remaining);
  }
}
