import { Workspace, EmailThread, Deal, SenderAccount } from '@/types';

export const initialWorkspaces: Workspace[] = [
  { id: 'ws-primary', name: 'Espacio Principal', clientName: 'Vectra Systems', credits: 2500 }
];

export const initialEmailAccountsWithWarmup: SenderAccount[] = [];

export const initialUniboxThreads: EmailThread[] = [];

export const initialDeals: Deal[] = [];
