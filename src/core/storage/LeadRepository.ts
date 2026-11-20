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

  getLeads(campaignId?: string, workspaceId?: string): Lead[] {
    let leads = this.driver.read<Lead[]>(this.filename, initialLeadsSeed);
    if (campaignId) {
      leads = leads.filter(l => l.campaignId === campaignId);
    }
    if (workspaceId) {
      leads = leads.filter(l => (l.workspaceId || 'ws-primary') === workspaceId);
    }
    return leads;
  }

  getLeadById(id: string): Lead | undefined {
    const leads = this.getLeads();
    return leads.find(l => l.id === id);
  }

  saveLeads(leads: Lead[]): void {
    const normalized = leads.map(l => ({
      ...l,
      workspaceId: l.workspaceId || 'ws-primary'
    }));
    this.driver.write(this.filename, normalized);
  }

  addLeads(newLeads: Lead[]): void {
    const existing = this.getLeads();
    const map = new Map(existing.map(l => [l.id, l]));
    for (const lead of newLeads) {
      const prev = map.get(lead.id);
      map.set(lead.id, {
        ...lead,
        workspaceId: lead.workspaceId || prev?.workspaceId || 'ws-primary'
      });
    }
    this.saveLeads(Array.from(map.values()));
  }

  updateLead(lead: Lead): void {
    const existing = this.getLeads();
    const idx = existing.findIndex(l => l.id === lead.id);
    if (idx >= 0) {
      existing[idx] = {
        ...lead,
        workspaceId: lead.workspaceId || existing[idx].workspaceId || 'ws-primary'
      };
      this.saveLeads(existing);
    }
  }

  deleteLeads(campaignId?: string): void {
    const existing = this.getLeads();
    const remaining = campaignId ? existing.filter(l => l.campaignId !== campaignId) : [];
    this.saveLeads(remaining);
  }
}
