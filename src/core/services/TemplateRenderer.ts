import { Lead } from '@/types';

export interface ITemplateRenderer {
  render(template: string, lead: Partial<Lead>): string;
}

export class TemplateRenderer implements ITemplateRenderer {
  render(template: string, lead: Partial<Lead>): string {
    if (!template) return '';

    let res = template;
    res = res.replace(/\{\{firstName\}\}/gi, lead.firstName || 'there');
    res = res.replace(/\{\{lastName\}\}/gi, lead.lastName || '');
    res = res.replace(/\{\{companyName\}\}/gi, lead.companyName || 'your company');
    res = res.replace(/\{\{email\}\}/gi, lead.email || '');

    if (lead.customVariables) {
      for (const [key, val] of Object.entries(lead.customVariables)) {
        if (typeof val === 'string' || typeof val === 'number') {
          const reg = new RegExp(`\\{\\{${key}\\}\\}`, 'gi');
          res = res.replace(reg, String(val));
        }
      }
    }

    // Clean remaining unresolved tags
    res = res.replace(/\{\{[^}]+\}\}/g, '');
    return res;
  }
}
