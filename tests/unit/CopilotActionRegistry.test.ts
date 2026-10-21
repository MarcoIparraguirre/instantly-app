import { describe, it, expect } from 'vitest';
import { CopilotActionRegistry } from '@/core/copilot/CopilotActionRegistry';
import { ICopilotActionHandler, CopilotActionResult } from '@/core/copilot/interfaces';
import { Campaign } from '@/types';

class CustomTestDiscountAction implements ICopilotActionHandler {
  readonly toolName = 'applyDiscountNotice';

  async execute(parameters: Record<string, any>, campaign: Campaign): Promise<CopilotActionResult> {
    const discount = parameters.discountPercent || 20;
    campaign.name = `${campaign.name} [${discount}% OFF]`;
    return {
      reply: `Applied ${discount}% discount notice to campaign!`,
      updatedCampaign: campaign
    };
  }
}

describe('CopilotActionRegistry (OCP Unit Tests)', () => {
  const dummyCampaign: Campaign = {
    id: 'camp-1',
    name: 'SaaS Outreach',
    status: 'draft',
    steps: [],
    schedule: { timing: { from: '09:00', to: '17:00' }, days: [1, 2], timezone: 'UTC', dailyLimit: 50, strategy: 'office-hours' },
    senderAccountIds: [],
    openTracking: true,
    clickTracking: true,
    stats: { sent: 0, opened: 0, replied: 0, bounced: 0, opportunities: 0 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  it('allows registering new custom actions without modifying registry code (OCP)', async () => {
    const registry = new CopilotActionRegistry();
    expect(registry.has('applyDiscountNotice')).toBe(false);

    registry.register(new CustomTestDiscountAction());
    expect(registry.has('applyDiscountNotice')).toBe(true);

    const result = await registry.execute('applyDiscountNotice', { discountPercent: 30 }, { ...dummyCampaign });
    expect(result.reply).toBe('Applied 30% discount notice to campaign!');
    expect(result.updatedCampaign.name).toBe('SaaS Outreach [30% OFF]');
  });

  it('throws an informative error when executing an unregistered action', async () => {
    const registry = new CopilotActionRegistry();
    await expect(
      registry.execute('nonExistentTool', {}, dummyCampaign)
    ).rejects.toThrow('No action handler registered for tool "nonExistentTool"');
  });
});
