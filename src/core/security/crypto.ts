import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV recommended for AES-GCM
const PREFIX = 'enc:v1:';

function getEncryptionKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY || 'misender-secret-key-must-be-changed-in-production-32b';
  // Derive a consistent 256-bit (32 bytes) key using SHA-256
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypts a string using AES-256-GCM.
 * Output format: enc:v1:<iv_hex>:<authTag_hex>:<ciphertext_hex>
 */
export function encryptCredential(plainText: string): string {
  if (!plainText) return '';
  if (plainText.startsWith(PREFIX)) return plainText; // already encrypted

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);

  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag().toString('hex');
  return `${PREFIX}${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts a string previously encrypted with encryptCredential.
 * If the input is not encrypted (does not start with enc:v1:), returns input as-is for backward compatibility.
 */
export function decryptCredential(cipherText: string): string {
  if (!cipherText) return '';
  if (!cipherText.startsWith(PREFIX)) {
    return cipherText; // plaintext backward compatibility
  }

  try {
    const parts = cipherText.slice(PREFIX.length).split(':');
    if (parts.length !== 3) {
      return cipherText;
    }

    const [ivHex, authTagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('Decryption failed for credential, returning empty string for safety');
    return '';
  }
}

/**
 * Masks a sensitive string for safe client-side presentation (e.g. '••••••••')
 */
export function maskCredential(secret: string): string {
  if (!secret) return '';
  return '••••••••';
}

/**
 * Generates an HMAC-SHA256 signature for click tracking URLs to prevent Open Redirects.
 */
export function generateTrackingSignature(targetUrl: string, leadId?: string): string {
  const secret = process.env.TRACKING_SECRET || process.env.ENCRYPTION_KEY || 'misender-tracking-secret-2026';
  const payload = `${targetUrl}:${leadId || ''}`;
  return crypto.createHmac('sha256', secret).update(payload).digest('hex').slice(0, 16);
}

/**
 * Validates an HMAC signature against the target URL and lead ID.
 */
export function verifyTrackingSignature(signature: string, targetUrl: string, leadId?: string): boolean {
  if (!signature || !targetUrl) return false;
  const expected = generateTrackingSignature(targetUrl, leadId);
  if (signature.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(signature, 'utf8'), Buffer.from(expected, 'utf8'));
  } catch {
    return false;
  }
}
