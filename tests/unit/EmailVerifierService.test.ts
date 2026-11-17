import { describe, it, expect, vi } from 'vitest';
import { EmailVerifierService } from '@/core/services/EmailVerifierService';
import dns from 'dns';

describe('EmailVerifierService (Unit Tests)', () => {
  const service = new EmailVerifierService();

  it('rejects invalid email syntax immediately', async () => {
    const res = await service.verifyEmail('invalid-email-format');
    expect(res.isValid).toBe(false);
    expect(res.syntaxValid).toBe(false);
    expect(res.score).toBe(0);
  });

  it('flags disposable email providers', async () => {
    const res = await service.verifyEmail('test@mailinator.com');
    expect(res.isValid).toBe(false);
    expect(res.isDisposable).toBe(true);
    expect(res.syntaxValid).toBe(true);
  });

  it('verifies valid email with resolved MX records', async () => {
    vi.spyOn(dns.promises, 'resolveMx').mockResolvedValueOnce([
      { exchange: 'mail.google.com', priority: 10 }
    ]);

    const res = await service.verifyEmail('alex@company.com');
    expect(res.isValid).toBe(true);
    expect(res.hasMx).toBe(true);
    expect(res.score).toBeGreaterThanOrEqual(90);
    expect(res.domain).toBe('company.com');
  });

  it('marks domain without MX as invalid', async () => {
    vi.spyOn(dns.promises, 'resolveMx').mockRejectedValueOnce(new Error('queryMx ENOTFOUND'));

    const res = await service.verifyEmail('alex@nonexistent-domain-xyz.com');
    expect(res.isValid).toBe(false);
    expect(res.hasMx).toBe(false);
  });
});
