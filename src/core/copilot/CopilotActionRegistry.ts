import { Campaign } from '@/types';
import { ICopilotActionHandler, CopilotActionResult } from './interfaces';

export class CopilotActionRegistry {
  private handlers = new Map<string, ICopilotActionHandler>();

  register(handler: ICopilotActionHandler): this {
    this.handlers.set(handler.toolName, handler);
    return this;
  }

  get(toolName: string): ICopilotActionHandler | undefined {
    return this.handlers.get(toolName);
  }

  has(toolName: string): boolean {
    return this.handlers.has(toolName);
  }

  async execute(
    toolName: string,
    parameters: Record<string, any>,
    campaign: Campaign
  ): Promise<CopilotActionResult> {
    const handler = this.get(toolName);
    if (!handler) {
      throw new Error(`No action handler registered for tool "${toolName}"`);
    }
    return handler.execute(parameters, campaign);
  }
}
