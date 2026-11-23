import crypto from 'crypto';
import { UserRole, normalizeRole } from '@/types';

export const SESSION_COOKIE_NAME = 'misender_session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

const SCRYPT_PREFIX = 'scrypt:v1:';
const SCRYPT_SALT_BYTES = 16;
const SCRYPT_KEY_LENGTH = 64;
const TOKEN_VERSION = 'v1';
const FALLBACK_DEV_SESSION_SECRET = 'misender-dev-session-secret-change-in-production';

export interface SessionPayload {
  userId: string;
  email: string;
  role: UserRole;
  agencyId?: string;
  workspaceId: string;
  allowedWorkspaceIds: string[];
  exp: number;
}

export interface CreateSessionTokenInput {
  userId: string;
  email: string;
  role: UserRole | string;
  agencyId?: string;
  workspaceId: string;
  allowedWorkspaceIds: string[];
  exp?: number;
}

function getSessionSecret(): string {
  return (
    process.env.SESSION_SECRET ||
    process.env.ENCRYPTION_KEY ||
    FALLBACK_DEV_SESSION_SECRET
  );
}

function safeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Checks whether a stored access code is already hashed in `scrypt:v1:<salt_hex>:<hash_hex>` format.
 */
export function isHashedAccessCode(stored?: string | null): boolean {
  if (!stored || typeof stored !== 'string') return false;
  return /^scrypt:v1:[0-9a-f]{32}:[0-9a-f]{64,}$/i.test(stored.trim());
}

/**
 * Hashes a plaintext password/access code using crypto.scryptSync with a 16-byte random salt.
 * Output format: `scrypt:v1:<salt_hex>:<hash_hex>`
 */
export function hashAccessCode(plain: string): string {
  if (!plain) return '';
  const salt = crypto.randomBytes(SCRYPT_SALT_BYTES);
  const derived = crypto.scryptSync(plain, salt, SCRYPT_KEY_LENGTH);
  return `${SCRYPT_PREFIX}${salt.toString('hex')}:${derived.toString('hex')}`;
}

/**
 * Verifies a plaintext password/access code against a stored `scrypt:v1:...` hash
 * using timingSafeEqual, with backward-compatible constant-time comparison for
 * legacy unmigrated plaintext rows.
 */
export function verifyAccessCode(plain: string, stored?: string | null): boolean {
  if (!plain || !stored || typeof stored !== 'string') return false;

  if (stored.startsWith(SCRYPT_PREFIX)) {
    const parts = stored.slice(SCRYPT_PREFIX.length).split(':');
    if (parts.length !== 2) return false;

    const [saltHex, hashHex] = parts;
    if (!/^[0-9a-f]+$/i.test(saltHex) || !/^[0-9a-f]+$/i.test(hashHex)) {
      return false;
    }

    try {
      const saltBuf = Buffer.from(saltHex, 'hex');
      const expectedBuf = Buffer.from(hashHex, 'hex');
      if (saltBuf.length === 0 || expectedBuf.length === 0) return false;

      const derived = crypto.scryptSync(plain, saltBuf, expectedBuf.length);
      if (derived.length !== expectedBuf.length) return false;
      return crypto.timingSafeEqual(derived, expectedBuf);
    } catch {
      return false;
    }
  }

  // Backward-compatible constant-time comparison for legacy plaintext rows
  return safeStringEqual(plain, stored);
}

/**
 * Signs a session payload into a compact HMAC-SHA256 token: `v1.<b64url_payload>.<b64url_sig>`.
 */
export function createSessionToken(input: CreateSessionTokenInput): string {
  const workspaceId =
    typeof input.workspaceId === 'string' && input.workspaceId.trim()
      ? input.workspaceId.trim()
      : 'ws-founder';

  const allowedSet = new Set<string>([workspaceId]);
  if (Array.isArray(input.allowedWorkspaceIds)) {
    for (const id of input.allowedWorkspaceIds) {
      if (typeof id === 'string' && id.trim()) {
        allowedSet.add(id.trim());
      }
    }
  }

  const exp =
    typeof input.exp === 'number' && Number.isFinite(input.exp)
      ? input.exp
      : Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS;

  const payload: SessionPayload = {
    userId: String(input.userId),
    email: String(input.email).trim().toLowerCase(),
    role: normalizeRole(input.role),
    ...(input.agencyId ? { agencyId: String(input.agencyId) } : {}),
    workspaceId,
    allowedWorkspaceIds: Array.from(allowedSet),
    exp,
  };

  const b64Payload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signingInput = `${TOKEN_VERSION}.${b64Payload}`;
  const sig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(signingInput, 'utf8')
    .digest('base64url');

  return `${signingInput}.${sig}`;
}

/**
 * Verifies an HMAC-SHA256 signed `v1.<b64url_payload>.<b64url_sig>` session token.
 * Returns the decoded SessionPayload or `null` if missing, malformed, tampered, or expired.
 */
export function verifySessionToken(token?: string | null): SessionPayload | null {
  if (!token || typeof token !== 'string') return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [version, b64Payload, b64Sig] = parts;
  if (version !== TOKEN_VERSION || !b64Payload || !b64Sig) return null;

  try {
    const signingInput = `${version}.${b64Payload}`;
    const expectedSig = crypto
      .createHmac('sha256', getSessionSecret())
      .update(signingInput, 'utf8')
      .digest('base64url');

    if (!safeStringEqual(b64Sig, expectedSig)) {
      return null;
    }

    const decodedRaw = Buffer.from(b64Payload, 'base64url').toString('utf8');
    const parsed = JSON.parse(decodedRaw) as Partial<SessionPayload>;

    if (
      !parsed ||
      typeof parsed.userId !== 'string' ||
      !parsed.userId ||
      typeof parsed.email !== 'string' ||
      !parsed.email ||
      typeof parsed.workspaceId !== 'string' ||
      !Array.isArray(parsed.allowedWorkspaceIds) ||
      typeof parsed.exp !== 'number' ||
      !Number.isFinite(parsed.exp)
    ) {
      return null;
    }

    // Support both Unix epoch seconds (standard) and milliseconds if passed
    const now = parsed.exp > 1e11 ? Date.now() : Math.floor(Date.now() / 1000);
    if (now >= parsed.exp) {
      return null;
    }

    return {
      userId: parsed.userId,
      email: parsed.email.trim().toLowerCase(),
      role: normalizeRole(parsed.role),
      ...(typeof parsed.agencyId === 'string' && parsed.agencyId ? { agencyId: parsed.agencyId } : {}),
      workspaceId: parsed.workspaceId,
      allowedWorkspaceIds: parsed.allowedWorkspaceIds.filter(
        (id): id is string => typeof id === 'string' && id.trim().length > 0
      ),
      exp: parsed.exp,
    };
  } catch {
    return null;
  }
}

export function isProductionSessionSecretConfigured(): boolean {
  const sessionSecret = (process.env.SESSION_SECRET || '').trim();
  const encryptionKey = (process.env.ENCRYPTION_KEY || '').trim();
  return Boolean(
    (sessionSecret && sessionSecret !== FALLBACK_DEV_SESSION_SECRET) ||
      (encryptionKey && encryptionKey !== 'misender-secret-key-must-be-changed-in-production-32b')
  );
}
