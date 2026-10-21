import { Workspace, B2BLead, EmailThread, Deal, SenderAccount } from '@/types';

export const initialWorkspaces: Workspace[] = [
  { id: 'ws-primary', name: 'Espacio Principal', clientName: 'Vectra Systems', credits: 2500 }
];

export const initialB2BLeads: B2BLead[] = [];

export const initialEmailAccountsWithWarmup: SenderAccount[] = [];

export const initialUniboxThreads: EmailThread[] = [];

export const initialDeals: Deal[] = [];
