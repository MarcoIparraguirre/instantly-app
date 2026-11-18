import { describe, it, expect } from 'vitest';
import { isPrivateIp, validateWebhookUrl } from '@/core/security/ssrfValidator';

describe('SSRF Validator (Webhook Security)', () => {
  it('correctly identifies private, loopback, and metadata IP addresses', () => {
    // Loopback
    expect(isPrivateIp('127.0.0.1')).toBe(true);
    expect(isPrivateIp('127.0.1.5')).toBe(true);
    expect(isPrivateIp('::1')).toBe(true);

    // Cloud Metadata (AWS/GCP/Azure)
    expect(isPrivateIp('169.254.169.254')).toBe(true);
    expect(isPrivateIp('169.254.1.1')).toBe(true);

    // Private Class A, B, C
    expect(isPrivateIp('10.0.0.1')).toBe(true);
    expect(isPrivateIp('172.16.0.1')).toBe(true);
    expect(isPrivateIp('172.31.255.255')).toBe(true);
    expect(isPrivateIp('192.168.1.1')).toBe(true);

    // Public IPs should not be marked private
    expect(isPrivateIp('8.8.8.8')).toBe(false);
    expect(isPrivateIp('1.1.1.1')).toBe(false);
    expect(isPrivateIp('142.250.190.46')).toBe(false);
  });

  it('rejects webhooks with unencrypted HTTP in production mode', async () => {
    const res = await validateWebhookUrl('http://api.mysite.com/hook', false);
    expect(res.valid).toBe(false);
    expect(res.reason).toContain('HTTPS');
  });

  it('rejects webhooks targeting localhost or private IPs directly', async () => {
    const resLocal = await validateWebhookUrl('https://localhost:3000/hook');
    expect(resLocal.valid).toBe(false);

    const resMeta = await validateWebhookUrl('https://169.254.169.254/latest/meta-data/');
    expect(resMeta.valid).toBe(false);

    const resPrivate = await validateWebhookUrl('https://192.168.1.100/webhook');
    expect(resPrivate.valid).toBe(false);
  });
});
