import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { container } from '@/core/container';
import { encryptCredential, maskCredential } from '@/core/security/crypto';
import { DnsCheckerService } from '@/core/services/DnsCheckerService';
import { checkAccountQuota } from '@/core/services/WorkspaceQuotaService';
import { DnsAuditResult, DnsCheckItem, SenderAccount } from '@/types';

export type BulkImportProvider =
  | 'google_workspace'
  | 'microsoft_365'
  | 'zoho'
  | 'amazon_ses'
  | 'resend'
  | 'postmark'
  | 'mailgun';

export interface BulkImportPreset {
  id: BulkImportProvider;
  name: string;
  senderProvider: 'google' | 'microsoft' | 'smtp';
  smtpHost: string;
  smtpPort: number;
  alternativeSmtpPorts: number[];
  imapHost: string | null;
  imapPort: number | null;
  dkimSelector: string;
  spfExpected: string;
  mxExpected: string;
  tlsNotes: string;
  authHint: string;
}

export const BULK_IMPORT_PRESETS: Record<BulkImportProvider, BulkImportPreset> = {
  google_workspace: {
    id: 'google_workspace',
    name: 'Google Workspace / Gmail',
    senderProvider: 'google',
    smtpHost: 'smtp.gmail.com',
    smtpPort: 587,
    alternativeSmtpPorts: [465],
    imapHost: 'imap.gmail.com',
    imapPort: 993,
    dkimSelector: 'google',
    spfExpected: 'v=spf1 include:_spf.google.com ~all',
    mxExpected: 'ASPMX.L.GOOGLE.COM',
    tlsNotes: 'STARTTLS on port 587 (recommended) or implicit SSL/TLS on port 465.',
    authHint:
      'Enable 2-Step Verification and generate a 16-character App Password in Google Account Security, or connect via Google OAuth 2.0.',
  },
  microsoft_365: {
    id: 'microsoft_365',
    name: 'Microsoft 365 / Outlook',
    senderProvider: 'microsoft',
    smtpHost: 'smtp.office365.com',
    smtpPort: 587,
    alternativeSmtpPorts: [],
    imapHost: 'outlook.office365.com',
    imapPort: 993,
    dkimSelector: 'selector1',
    spfExpected: 'v=spf1 include:spf.protection.outlook.com -all',
    mxExpected: 'mail.protection.outlook.com',
    tlsNotes: 'STARTTLS strictly required on port 587.',
    authHint:
      'Enable "Authenticated SMTP" per mailbox in Microsoft 365 Admin Center and use an App Password or OAuth 2.0 (if Security Defaults / MFA is active).',
  },
  zoho: {
    id: 'zoho',
    name: 'Zoho Mail',
    senderProvider: 'smtp',
    smtpHost: 'smtp.zoho.com',
    smtpPort: 465,
    alternativeSmtpPorts: [587],
    imapHost: 'imap.zoho.com',
    imapPort: 993,
    dkimSelector: 'zmail',
    spfExpected: 'v=spf1 include:zoho.com ~all',
    mxExpected: 'mx.zoho.com',
    tlsNotes: 'Implicit SSL/TLS on port 465 or STARTTLS on port 587 (use smtp.zoho.eu for EU accounts).',
    authHint:
      'Generate an Application-Specific Password under Zoho Accounts > Security > App Passwords when TFA is enabled.',
  },
  amazon_ses: {
    id: 'amazon_ses',
    name: 'Amazon SES',
    senderProvider: 'smtp',
    smtpHost: 'email-smtp.us-east-1.amazonaws.com',
    smtpPort: 587,
    alternativeSmtpPorts: [465, 2587],
    imapHost: null,
    imapPort: null,
    dkimSelector: 'ses',
    spfExpected: 'v=spf1 include:amazonses.com ~all',
    mxExpected: 'inbound-smtp.us-east-1.amazonaws.com',
    tlsNotes: 'STARTTLS on port 587 or 2587, or TLS Wrapper on port 465 (match your AWS region endpoint).',
    authHint:
      'Use IAM SMTP credentials generated in Amazon SES Console > SMTP Settings (not your AWS Console login or IAM access key directly).',
  },
  resend: {
    id: 'resend',
    name: 'Resend',
    senderProvider: 'smtp',
    smtpHost: 'smtp.resend.com',
    smtpPort: 465,
    alternativeSmtpPorts: [587, 2465, 2587],
    imapHost: null,
    imapPort: null,
    dkimSelector: 'resend',
    spfExpected: 'v=spf1 include:amazonses.com ~all',
    mxExpected: 'feedback-smtp.us-east-1.amazonses.com',
    tlsNotes: 'Implicit TLS on port 465/2465 or STARTTLS on port 587/2587.',
    authHint:
      'Set SMTP username to "resend" and use a Resend API Key (re_...) with sending permissions as the SMTP password.',
  },
  postmark: {
    id: 'postmark',
    name: 'Postmark',
    senderProvider: 'smtp',
    smtpHost: 'smtp.postmarkapp.com',
    smtpPort: 587,
    alternativeSmtpPorts: [2525],
    imapHost: null,
    imapPort: null,
    dkimSelector: 'pm',
    spfExpected: 'v=spf1 a mx include:spf.mtasv.net ~all',
    mxExpected: 'inbound.postmarkapp.com',
    tlsNotes: 'STARTTLS on port 587 or 2525.',
    authHint:
      'Use your Postmark Server API Token as both the SMTP username and password, and verify your Sender Signature / domain.',
  },
  mailgun: {
    id: 'mailgun',
    name: 'Mailgun',
    senderProvider: 'smtp',
    smtpHost: 'smtp.mailgun.org',
    smtpPort: 587,
    alternativeSmtpPorts: [465, 2525],
    imapHost: null,
    imapPort: null,
    dkimSelector: 'smtp',
    spfExpected: 'v=spf1 include:mailgun.org ~all',
    mxExpected: 'mxa.mailgun.org',
    tlsNotes: 'STARTTLS on port 587/2525 or SSL/TLS on port 465 (use smtp.eu.mailgun.org for EU domains).',
    authHint:
      'Create per-domain SMTP credentials under Mailgun Sending > Domains > SMTP credentials (e.g. postmaster@yourdomain.com).',
  },
};

const MAX_BULK_MAILBOXES = 100;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface RawMailboxInput {
  email?: unknown;
  name?: unknown;
  smtpPass?: unknown;
  smtpHost?: unknown;
  smtpPort?: unknown;
  smtpUser?: unknown;
  dailyLimit?: unknown;
  provider?: unknown;
  warmupEnabled?: unknown;
}

interface BulkImportErrorItem {
  row: number;
  email: string;
  reason: string;
}

function parseBulkProvider(raw: unknown): BulkImportProvider | null {
  if (typeof raw !== 'string') return null;
  const normalized = raw.trim().toLowerCase();
  if (normalized in BULK_IMPORT_PRESETS) {
    return normalized as BulkImportProvider;
  }
  return null;
}

function inferProviderFromEmail(email: string): BulkImportProvider | null {
  const domain = email.split('@')[1]?.toLowerCase() || '';
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    return 'google_workspace';
  }
  if (
    domain === 'outlook.com' ||
    domain === 'hotmail.com' ||
    domain === 'live.com' ||
    domain === 'msn.com'
  ) {
    return 'microsoft_365';
  }
  if (domain === 'zoho.com' || domain === 'zohomail.com') {
    return 'zoho';
  }
  return null;
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

function normalizeHeaderKey(header: string): string {
  return header.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseCsvToMailboxes(csvText: string): RawMailboxInput[] {
  const cleaned = csvText.replace(/^\uFEFF/, '');
  const lines = cleaned
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return [];

  const firstCells = parseCsvLine(lines[0]);
  const normalizedFirst = firstCells.map(normalizeHeaderKey);
  const headerKeywords = new Set([
    'email',
    'name',
    'smtppass',
    'smtphost',
    'smtpport',
    'dailylimit',
    'smtpuser',
    'provider',
  ]);
  const hasHeader = normalizedFirst.some((cell) => headerKeywords.has(cell));

  if (!hasHeader) {
    return lines.map((line) => {
      const [email, name, smtpPass, smtpHost, smtpPort, dailyLimit] = parseCsvLine(line);
      return { email, name, smtpPass, smtpHost, smtpPort, dailyLimit };
    });
  }

  const colIndex = new Map<string, number>();
  normalizedFirst.forEach((key, idx) => {
    if (key) colIndex.set(key, idx);
  });

  const getCell = (cells: string[], ...aliases: string[]): string | undefined => {
    for (const alias of aliases) {
      const idx = colIndex.get(alias);
      if (idx !== undefined && idx < cells.length) {
        return cells[idx];
      }
    }
    return undefined;
  };

  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    return {
      email: getCell(cells, 'email', 'mail', 'address'),
      name: getCell(cells, 'name', 'displayname', 'sendername'),
      smtpPass: getCell(cells, 'smtppass', 'password', 'pass', 'apppassword'),
      smtpHost: getCell(cells, 'smtphost', 'host'),
      smtpPort: getCell(cells, 'smtpport', 'port'),
      smtpUser: getCell(cells, 'smtpuser', 'user', 'username'),
      dailyLimit: getCell(cells, 'dailylimit', 'limit'),
      provider: getCell(cells, 'provider', 'esp'),
    };
  });
}

function buildDnsChecksFromAudit(
  audit: DnsAuditResult | null,
  preset: BulkImportPreset | null
): { dnsChecks: DnsCheckItem[]; healthScore: number } {
  if (!audit) {
    return { dnsChecks: [], healthScore: 0 };
  }

  return {
    healthScore: typeof audit.overallHealth === 'number' ? audit.overallHealth : 0,
    dnsChecks: [
      {
        type: 'SPF',
        valid: Boolean(audit.spf?.valid),
        expected: preset?.spfExpected || 'v=spf1 a mx ~all',
        current: audit.spf?.record || 'Not detected',
        description: audit.spf?.details || 'SPF audit result',
      },
      {
        type: 'DKIM',
        valid: Boolean(audit.dkim?.valid),
        expected: preset ? `${preset.dkimSelector}._domainkey` : 'default._domainkey',
        current: audit.dkim?.selector ? `Selector: ${audit.dkim.selector}` : 'Not detected',
        description: audit.dkim?.details || 'DKIM audit result',
      },
      {
        type: 'DMARC',
        valid: Boolean(audit.dmarc?.valid),
        expected: 'v=DMARC1; p=quarantine',
        current: audit.dmarc?.record || 'Not detected',
        description: audit.dmarc?.details || 'DMARC audit result',
      },
      {
        type: 'MX',
        valid: Boolean(audit.mx?.valid),
        expected: preset?.mxExpected || 'MX record configured',
        current: audit.mx?.records?.join(', ') || 'No MX',
        description: audit.mx?.details || 'MX audit result',
      },
      {
        type: 'CTD',
        valid: Boolean(audit.ctd?.valid),
        expected: 'track CNAME track.misender.app',
        current: audit.ctd?.valid ? 'Active' : 'Inactive',
        description: audit.ctd?.details || 'CTD audit result',
      },
    ],
  };
}

async function runSafeDomainAudit(
  domain: string,
  dkimSelector: string
): Promise<DnsAuditResult | null> {
  try {
    const checker = (container?.dnsChecker || new DnsCheckerService()) as {
      auditDomain?: (d: string, sel?: string) => Promise<DnsAuditResult>;
    };
    if (typeof checker?.auditDomain !== 'function') return null;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), 4000);
    });

    const result = await Promise.race([
      checker.auditDomain(domain, dkimSelector),
      timeoutPromise,
    ]);
    if (timer) clearTimeout(timer);
    return result;
  } catch {
    return null;
  }
}

export async function GET() {
  return NextResponse.json({
    providers: Object.values(BULK_IMPORT_PRESETS),
    presetsByProvider: BULK_IMPORT_PRESETS,
  });
}

export async function POST(req: NextRequest) {
  try {
    let body: Record<string, unknown>;
    try {
      const parsed = await req.json();
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
      }
      body = parsed as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const workspaceId =
      typeof body.workspaceId === 'string' && body.workspaceId.trim()
        ? body.workspaceId.trim()
        : 'ws-primary';

    let topLevelPreset: BulkImportPreset | null = null;
    if (body.provider !== undefined && body.provider !== null && body.provider !== '') {
      const parsedProvider = parseBulkProvider(body.provider);
      if (!parsedProvider) {
        return NextResponse.json(
          {
            error:
              'Invalid provider. Expected one of: google_workspace, microsoft_365, zoho, amazon_ses, resend, postmark, mailgun',
          },
          { status: 400 }
        );
      }
      topLevelPreset = BULK_IMPORT_PRESETS[parsedProvider];
    }

    let rawRows: RawMailboxInput[] = [];
    if (typeof body.csvText === 'string' && body.csvText.trim()) {
      rawRows = parseCsvToMailboxes(body.csvText);
    } else if (Array.isArray(body.accounts)) {
      rawRows = body.accounts as RawMailboxInput[];
    }

    if (rawRows.length === 0) {
      return NextResponse.json(
        { error: 'Provide non-empty "csvText" or "accounts" array to import mailboxes' },
        { status: 400 }
      );
    }

    if (rawRows.length > MAX_BULK_MAILBOXES) {
      return NextResponse.json(
        { error: `Bulk import is limited to ${MAX_BULK_MAILBOXES} mailboxes per request` },
        { status: 400 }
      );
    }

    const shouldRunDnsAudit = body.runDnsAudit !== false;

    const existingEmails = new Set<string>();
    try {
      const existingAccounts = await container.accountRepo.getAccounts(workspaceId);
      for (const acc of existingAccounts) {
        if (acc.email) {
          existingEmails.add(acc.email.toLowerCase().trim());
        }
      }
    } catch {
      // Ignore repo read failure and proceed with batch dedup
    }

    const previewSeen = new Set<string>();
    let incomingNewAccounts = 0;
    for (const row of rawRows) {
      const candidateEmail = typeof row?.email === 'string' ? row.email.trim().toLowerCase() : '';
      if (!candidateEmail || !EMAIL_REGEX.test(candidateEmail)) continue;
      if (previewSeen.has(candidateEmail) || existingEmails.has(candidateEmail)) continue;
      previewSeen.add(candidateEmail);
      incomingNewAccounts++;
    }

    if (incomingNewAccounts > 0) {
      const quota = await checkAccountQuota(workspaceId, incomingNewAccounts);
      if (!quota.allowed) {
        return NextResponse.json(quota, { status: quota.status });
      }
    }

    const seenInBatch = new Set<string>();
    const domainAuditCache = new Map<
      string,
      { healthScore: number; dnsChecks: DnsCheckItem[] }
    >();

    const errors: BulkImportErrorItem[] = [];
    const safeAccounts: SenderAccount[] = [];
    let skippedCount = 0;

    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];
      const rowNum = i + 1;
      const rawEmail = typeof row?.email === 'string' ? row.email.trim().toLowerCase() : '';

      if (!rawEmail || !EMAIL_REGEX.test(rawEmail)) {
        skippedCount++;
        errors.push({
          row: rowNum,
          email: rawEmail,
          reason: 'Invalid or missing email address',
        });
        continue;
      }

      if (seenInBatch.has(rawEmail) || existingEmails.has(rawEmail)) {
        skippedCount++;
        errors.push({
          row: rowNum,
          email: rawEmail,
          reason: existingEmails.has(rawEmail)
            ? 'Mailbox already exists in workspace'
            : 'Duplicate email address in import payload',
        });
        continue;
      }

      const rowProviderParsed = row.provider ? parseBulkProvider(row.provider) : null;
      const inferredProvider = inferProviderFromEmail(rawEmail);
      const effectivePreset: BulkImportPreset | null =
        (rowProviderParsed ? BULK_IMPORT_PRESETS[rowProviderParsed] : null) ||
        topLevelPreset ||
        (inferredProvider ? BULK_IMPORT_PRESETS[inferredProvider] : null);

      const domain = rawEmail.split('@')[1];
      const explicitHost =
        typeof row.smtpHost === 'string' && row.smtpHost.trim()
          ? row.smtpHost.trim()
          : undefined;
      const resolvedHost =
        explicitHost || effectivePreset?.smtpHost || `smtp.${domain}`;

      const parsedPort = Number(row.smtpPort);
      const resolvedPort =
        Number.isFinite(parsedPort) && parsedPort > 0 && parsedPort <= 65535
          ? parsedPort
          : effectivePreset?.smtpPort || 587;

      const parsedLimit = Number(row.dailyLimit);
      const resolvedLimit =
        Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.floor(parsedLimit) : 50;

      const rawPass = typeof row.smtpPass === 'string' ? row.smtpPass : '';
      const encryptedPass = rawPass ? encryptCredential(rawPass) : '';

      const smtpUser =
        typeof row.smtpUser === 'string' && row.smtpUser.trim()
          ? row.smtpUser.trim()
          : effectivePreset?.id === 'resend'
            ? 'resend'
            : rawEmail;

      const displayName =
        typeof row.name === 'string' && row.name.trim()
          ? row.name.trim()
          : effectivePreset
            ? `${effectivePreset.name} (${rawEmail.split('@')[0]})`
            : rawEmail.split('@')[0];

      let dnsData: { healthScore: number; dnsChecks: DnsCheckItem[] } = {
        healthScore: 0,
        dnsChecks: [],
      };

      if (shouldRunDnsAudit) {
        const cached = domainAuditCache.get(domain);
        if (cached) {
          dnsData = cached;
        } else {
          const dkimSelector = effectivePreset?.dkimSelector || 'google';
          const audit = await runSafeDomainAudit(domain, dkimSelector);
          dnsData = buildDnsChecksFromAudit(audit, effectivePreset);
          domainAuditCache.set(domain, dnsData);
        }
      }

      const senderProvider: SenderAccount['provider'] =
        effectivePreset?.senderProvider ||
        (resolvedHost.toLowerCase().includes('gmail')
          ? 'google'
          : resolvedHost.toLowerCase().includes('office365') ||
              resolvedHost.toLowerCase().includes('outlook')
            ? 'microsoft'
            : 'smtp');

      const accountToSave: SenderAccount = {
        id: uuidv4(),
        workspaceId,
        name: displayName,
        email: rawEmail,
        provider: senderProvider,
        smtpHost: resolvedHost,
        smtpPort: resolvedPort,
        smtpUser,
        smtpPass: encryptedPass,
        dailyLimit: resolvedLimit,
        sentToday: 0,
        status: 'active',
        warmupEnabled:
          row.warmupEnabled !== undefined ? Boolean(row.warmupEnabled) : true,
        warmupToday: 0,
        warmupTotal: 0,
        warmupRescueRate: 100,
        healthScore: dnsData.healthScore,
        dnsChecks: dnsData.dnsChecks,
      };

      await container.accountRepo.saveAccount(accountToSave);
      seenInBatch.add(rawEmail);

      safeAccounts.push({
        ...accountToSave,
        smtpPass: maskCredential(accountToSave.smtpPass),
      });
    }

    return NextResponse.json(
      {
        importedCount: safeAccounts.length,
        skippedCount,
        errors,
        accounts: safeAccounts,
      },
      { status: safeAccounts.length > 0 ? 201 : 200 }
    );
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Bulk mailbox import failed' },
      { status: 500 }
    );
  }
}
