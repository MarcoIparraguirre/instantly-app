import { Lead } from '@/types';

export interface ITemplateRenderer {
  render(template: string, lead: Partial<Lead>): string;
}

export class TemplateRenderer implements ITemplateRenderer {
  render(template: string, lead: Partial<Lead>): string {
    if (!template) return '';

    let res = template;

    // Standard fields & Spanish aliases
    res = res.replace(/\{\{(firstName|nombre|primerNombre|primer_nombre)\}\}/gi, lead.firstName || 'there');
    res = res.replace(/\{\{(lastName|apellido)\}\}/gi, lead.lastName || '');
    res = res.replace(/\{\{(companyName|empresa|compania|compañía|organizacion|organización)\}\}/gi, lead.companyName || 'your company');
    res = res.replace(/\{\{(email|correo|mail)\}\}/gi, lead.email || '');
    if (lead.website) {
      res = res.replace(/\{\{(website|sitio|web)\}\}/gi, lead.website);
    }

    // Dynamic custom variables from Google Sheets / CSV (e.g. {{Cargo}}, {{Ciudad}}, {{Telefono}})
    if (lead.customVariables) {
      for (const [key, val] of Object.entries(lead.customVariables)) {
        if (typeof val === 'string' || typeof val === 'number') {
          const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const reg = new RegExp(`\\{\\{${escaped}\\}\\}`, 'gi');
          res = res.replace(reg, String(val));
        }
      }
    }

    // Clean remaining unresolved tags
    res = res.replace(/\{\{[^}]+\}\}/g, '');
    return res;
  }
}
