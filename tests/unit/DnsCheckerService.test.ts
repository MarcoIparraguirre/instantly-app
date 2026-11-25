import { describe, it, expect, vi } from 'vitest';
import { DnsCheckerService } from '@/core/services/DnsCheckerService';
import dns from 'dns';

describe('DnsCheckerService (Unit Tests)', () => {
  const service = new DnsCheckerService();

  it('audits domain DNS records successfully when SPF and DMARC are present', async () => {
    vi.spyOn(dns.promises, 'resolveTxt').mockImplementation(async (host: string) => {
      if (host.startsWith('_dmarc.')) {
        return [['v=DMARC1; p=quarantine; pct=100']];
      }
      if (host.includes('_domainkey.')) {
        return [['v=DKIM1; k=rsa; p=MIGfMA0GCS...']];
      }
      return [['v=spf1 include:_spf.google.com ~all']];
    });

    vi.spyOn(dns.promises, 'resolveMx').mockResolvedValue([
      { exchange: 'aspmx.l.google.com', priority: 1 }
    ]);

    vi.spyOn(dns.promises, 'resolveCname').mockResolvedValue(['track.misender.app']);

    const audit = await service.auditDomain('testdomain.com', 'google');
    expect(audit.domain).toBe('testdomain.com');
    expect(audit.spf.valid).toBe(true);
    expect(audit.dmarc.valid).toBe(true);
    expect(audit.dkim.valid).toBe(true);
    expect(audit.mx.valid).toBe(true);
    expect(audit.ctd.valid).toBe(true);
    expect(audit.overallHealth).toBe(100);
  });

  it('handles missing records gracefully and drops health score', async () => {
    vi.spyOn(dns.promises, 'resolveTxt').mockRejectedValue(new Error('ENOTFOUND'));
    vi.spyOn(dns.promises, 'resolveMx').mockRejectedValue(new Error('ENOTFOUND'));
    vi.spyOn(dns.promises, 'resolveCname').mockRejectedValue(new Error('ENOTFOUND'));

    const audit = await service.auditDomain('unconfigured-domain.com');
    expect(audit.spf.valid).toBe(false);
    expect(audit.dmarc.valid).toBe(false);
    expect(audit.overallHealth).toBe(0);
  });
});
