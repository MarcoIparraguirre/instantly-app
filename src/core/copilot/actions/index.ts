import { Campaign } from '@/types';
import { ICopilotActionHandler, CopilotActionResult } from '../interfaces';
import { ISpamDetectorService } from '@/core/services/SpamDetectorService';
import { ISpintaxService } from '@/core/services/SpintaxService';

export class ActivateCampaignAction implements ICopilotActionHandler {
  readonly toolName = 'activateCampaign';

  async execute(params: Record<string, any>, campaign: Campaign): Promise<CopilotActionResult> {
    campaign.status = 'active';
    return {
      reply: `Campaign "${campaign.name}" has been successfully **Activated**! 🚀`,
      updatedCampaign: campaign
    };
  }
}

export class PauseCampaignAction implements ICopilotActionHandler {
  readonly toolName = 'pauseCampaign';

  async execute(params: Record<string, any>, campaign: Campaign): Promise<CopilotActionResult> {
    campaign.status = 'paused';
    return {
      reply: `Campaign "${campaign.name}" has been **Paused**. ⏸️`,
      updatedCampaign: campaign
    };
  }
}

export class ApplySpamFixesAction implements ICopilotActionHandler {
  readonly toolName = 'applyCampaignSpamWordFixes';

  constructor(private spamDetector: ISpamDetectorService) {}

  async execute(params: Record<string, any>, campaign: Campaign): Promise<CopilotActionResult> {
    for (const step of campaign.steps) {
      for (const variant of step.variants) {
        variant.subject = this.spamDetector.applyFixes(variant.subject);
        variant.body = this.spamDetector.applyFixes(variant.body);
      }
    }
    return {
      reply: `Spam triggers replaced with high-deliverability alternatives across all email steps! ✅`,
      updatedCampaign: campaign
    };
  }
}

export class ApplySpintaxAction implements ICopilotActionHandler {
  readonly toolName = 'applyCampaignBodySpintax';

  constructor(private spintaxService: ISpintaxService) {}

  async execute(params: Record<string, any>, campaign: Campaign): Promise<CopilotActionResult> {
    const stepIdx = params.stepIndex !== undefined ? params.stepIndex : 0;
    const lang = params.language || 'en';
    if (campaign.steps[stepIdx]) {
      for (const variant of campaign.steps[stepIdx].variants) {
        variant.body = this.spintaxService.generate(variant.body, lang);
      }
    }
    return {
      reply: `Applied spintax variations to Step ${stepIdx + 1} body! 🔀`,
      updatedCampaign: campaign
    };
  }
}

export class RemoveStepAction implements ICopilotActionHandler {
  readonly toolName = 'removeSequenceStep';

  async execute(params: Record<string, any>, campaign: Campaign): Promise<CopilotActionResult> {
    const idx = params.index;
    if (idx >= 0 && idx < campaign.steps.length) {
      campaign.steps.splice(idx, 1);
      campaign.steps.forEach((s, i) => (s.stepNumber = i + 1));
      return {
        reply: `Step ${idx + 1} has been removed. 🗑️`,
        updatedCampaign: campaign
      };
    }
    return {
      reply: `Invalid step index ${idx}.`,
      updatedCampaign: campaign
    };
  }
}

export class ScheduleStrategyAction implements ICopilotActionHandler {
  readonly toolName = 'setCampaignScheduleStrategy';

  async execute(params: Record<string, any>, campaign: Campaign): Promise<CopilotActionResult> {
    campaign.schedule.strategy = params.strategy || 'office-hours';
    if (params.strategy === 'office-hours') {
      campaign.schedule.timing = { from: '09:00', to: '17:00' };
      campaign.schedule.days = [1, 2, 3, 4, 5];
    }
    return {
      reply: `Schedule strategy updated to "${campaign.schedule.strategy}". ⏰`,
      updatedCampaign: campaign
    };
  }
}
