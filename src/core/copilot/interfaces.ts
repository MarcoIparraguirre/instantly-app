import { Campaign } from '@/types';

export interface CopilotActionResult {
  reply: string;
  updatedCampaign: Campaign;
}

export interface ICopilotActionHandler {
  readonly toolName: string;
  execute(parameters: Record<string, any>, campaign: Campaign): Promise<CopilotActionResult>;
}
