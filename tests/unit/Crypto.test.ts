import { describe, it, expect } from 'vitest';
import {
  encryptCredential,
  decryptCredential,
  maskCredential,
  generateTrackingSignature,
  verifyTrackingSignature
} from '@/core/security/crypto';

describe('Crypto Security Utilities (AES-256-GCM)', () => {
  it('encrypts and decrypts secrets symmetrically', () => {
    const rawSecret = 'super-secret-smtp-password-123!';
    const encrypted = encryptCredential(rawSecret);

    expect(encrypted).toMatch(/^enc:v1:[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/);
    expect(encrypted).not.toBe(rawSecret);

    const decrypted = decryptCredential(encrypted);
    expect(decrypted).toBe(rawSecret);
  });

  it('handles empty or blank secrets gracefully', () => {
    expect(encryptCredential('')).toBe('');
    expect(decryptCredential('')).toBe('');
    expect(maskCredential('')).toBe('');
  });

  it('preserves backward compatibility with unencrypted legacy plaintext passwords', () => {
    const legacyPlaintext = 'legacy-cleartext-pass';
    const result = decryptCredential(legacyPlaintext);
    expect(result).toBe(legacyPlaintext);
  });

  it('masks secret for safe presentation in API and UI', () => {
    expect(maskCredential('my-app-password')).toBe('••••••••');
  });

  it('does not re-encrypt an already encrypted string', () => {
    const raw = 'my-token';
    const encrypted = encryptCredential(raw);
    const reEncrypted = encryptCredential(encrypted);
    expect(reEncrypted).toBe(encrypted);
  });

  it('generates and verifies HMAC tracking signatures to prevent open redirects', () => {
    const targetUrl = 'https://trusted-client.com/pricing';
    const leadId = 'lead-456';
    const sig = generateTrackingSignature(targetUrl, leadId);

    expect(sig).toHaveLength(16);
    expect(verifyTrackingSignature(sig, targetUrl, leadId)).toBe(true);

    // Tampered destination or lead ID fails verification
    expect(verifyTrackingSignature(sig, 'https://evil-phishing.com', leadId)).toBe(false);
    expect(verifyTrackingSignature(sig, targetUrl, 'lead-tampered')).toBe(false);
    expect(verifyTrackingSignature('invalid-sig', targetUrl, leadId)).toBe(false);
  });
});
