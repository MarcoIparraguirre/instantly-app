import { container } from '@/core/container';

export interface DispatchLog {
  timestamp: string;
  leadEmail: string;
  senderEmail: string;
  subject: string;
  stepNumber: number;
  status: 'sent' | 'simulated' | 'error';
  error?: string;
}

export interface CampaignRunResult {
  campaignId: string;
  totalPending: number;
  processed: number;
  sentCount: number;
  logs: DispatchLog[];
}

export async function executeCampaignStep(
  campaignId: string,
  options?: { simulationOnly?: boolean }
): Promise<CampaignRunResult> {
  return container.dispatcher.dispatchStep(campaignId, options);
}
