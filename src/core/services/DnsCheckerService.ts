import dns from 'dns';
import { DnsAuditResult } from '@/types';

export class DnsCheckerService {
  async auditDomain(domain: string, dkimSelector: string = 'google'): Promise<DnsAuditResult> {
    const cleanDomain = domain.toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');

    const [spfRes, dmarcRes, dkimRes, mxRes, ctdRes] = await Promise.all([
      this.checkSpf(cleanDomain),
      this.checkDmarc(cleanDomain),
      this.checkDkim(cleanDomain, dkimSelector),
      this.checkMx(cleanDomain),
      this.checkCtd(cleanDomain)
    ]);

    let score = 0;
    if (spfRes.valid) score += 25;
    if (dmarcRes.valid) score += 25;
    if (dkimRes.valid) score += 25;
    if (mxRes.valid) score += 15;
    if (ctdRes.valid) score += 10;

    return {
      domain: cleanDomain,
      spf: spfRes,
      dmarc: dmarcRes,
      dkim: dkimRes,
      mx: mxRes,
      ctd: ctdRes,
      overallHealth: score
    };
  }

  private async checkSpf(domain: string): Promise<{ valid: boolean; record?: string; details: string }> {
    try {
      const records = await dns.promises.resolveTxt(domain);
      const flat = records.map(r => r.join(''));
      const spf = flat.find(r => r.startsWith('v=spf1'));
      if (spf) {
        return { valid: true, record: spf, details: 'Registro SPF detectado y válido en DNS.' };
      }
      return { valid: false, details: 'No se encontró registro TXT con prefijo v=spf1.' };
    } catch (err: any) {
      return { valid: false, details: `Error consultando SPF: ${err.message || 'Sin registros TXT'}` };
    }
  }

  private async checkDmarc(domain: string): Promise<{ valid: boolean; record?: string; details: string }> {
    try {
      const dmarcDomain = `_dmarc.${domain}`;
      const records = await dns.promises.resolveTxt(dmarcDomain);
      const flat = records.map(r => r.join(''));
      const dmarc = flat.find(r => r.startsWith('v=DMARC1'));
      if (dmarc) {
        const isEnforced = dmarc.includes('p=reject') || dmarc.includes('p=quarantine');
        return {
          valid: true,
          record: dmarc,
          details: isEnforced
            ? 'Política DMARC activa y con protección estricta (quarantine/reject).'
            : 'Registro DMARC encontrado pero en modo monitoreo (p=none).'
        };
      }
      return { valid: false, details: `No se encontró registro TXT en ${dmarcDomain}.` };
    } catch (err: any) {
      return { valid: false, details: `Error consultando DMARC: ${err.message || 'Sin registro _dmarc'}` };
    }
  }

  private async checkDkim(domain: string, selector: string): Promise<{ valid: boolean; selector?: string; details: string }> {
    const selectorsToTry = [selector, 'google', 'selector1', 'default', 'k1'];
    for (const sel of selectorsToTry) {
      try {
        const dkimHost = `${sel}._domainkey.${domain}`;
        const records = await dns.promises.resolveTxt(dkimHost);
        const flat = records.map(r => r.join(''));
        const dkim = flat.find(r => r.includes('v=DKIM1') || r.includes('p=') || r.includes('k=rsa'));
        if (dkim) {
          return { valid: true, selector: sel, details: `DKIM activo con selector '${sel}'.` };
        }
      } catch {
        // try next selector
      }
    }
    return { valid: false, details: `No se encontró registro DKIM público en selectores comunes (${selectorsToTry.join(', ')}).` };
  }

  private async checkMx(domain: string): Promise<{ valid: boolean; records: string[]; details: string }> {
    try {
      const mx = await dns.promises.resolveMx(domain);
      if (mx && mx.length > 0) {
        const sorted = mx.sort((a, b) => a.priority - b.priority).map(m => `${m.exchange} (Pri: ${m.priority})`);
        return { valid: true, records: sorted, details: `${mx.length} servidor(es) MX detectados.` };
      }
      return { valid: false, records: [], details: 'No se encontraron servidores MX configurados.' };
    } catch (err: any) {
      return { valid: false, records: [], details: `Error consultando MX: ${err.message || 'Sin registros MX'}` };
    }
  }

  private async checkCtd(domain: string): Promise<{ valid: boolean; details: string }> {
    const candidates = [`track.${domain}`, `inst.${domain}`];
    for (const sub of candidates) {
      try {
        const cnames = await dns.promises.resolveCname(sub);
        if (cnames && cnames.length > 0) {
          return { valid: true, details: `Custom Tracking Domain activo en ${sub} -> ${cnames.join(', ')}` };
        }
      } catch {
        // ignore
      }
    }
    return { valid: false, details: 'No se detectó CNAME para Custom Tracking Domain en track.* o inst.*' };
  }
}
