import tls from 'tls';
import { v4 as uuidv4 } from 'uuid';
import { SenderAccount } from '@/types';
import { supabase } from '@/core/supabase/client';
import { encryptCredential, decryptCredential } from '@/core/security/crypto';
import { IMailer } from '../mailers/interfaces';
import { SmtpMailer } from '../mailers/SmtpMailer';
import { SimulatedMailer } from '../mailers/SimulatedMailer';
import { SpamDetectorService } from './SpamDetectorService';
import { DnsCheckerService } from './DnsCheckerService';

export type PlacementFolder = 'inbox' | 'promotions' | 'spam';

export interface SeedMailbox {
  id: string;
  workspaceId?: string;
  email: string;
  provider: string;
  imapHost?: string;
  imapPort?: number;
  imapUser?: string;
  imapPass?: string;
  isActive: boolean;
  lastCheckedAt?: string | null;
  createdAt: string;
}

export type PublicSeedMailbox = Omit<SeedMailbox, 'imapPass'> & {
  hasImapPass: boolean;
};

export interface AddSeedMailboxInput {
  id?: string;
  workspaceId?: string;
  email: string;
  provider?: string;
  imapHost?: string;
  imapPort?: number;
  imapUser?: string;
  imapPass?: string;
  isActive?: boolean;
}

export interface SeedProviderPlacement {
  provider: string;
  email: string;
  folder: PlacementFolder;
  latencyMs: number;
  status?: 'delivered' | 'error';
  error?: string;
}

export interface SeedImapCheckContext {
  seed: SeedMailbox;
  token: string;
  seedTestId: string;
  subject: string;
  sender: SenderAccount;
}

export type SeedImapCheckResult = { folder: PlacementFolder; latencyMs?: number } | PlacementFolder;

export type SeedImapChecker =
  | ((ctx: SeedImapCheckContext) => Promise<SeedImapCheckResult>)
  | {
      checkPlacement?: (ctx: SeedImapCheckContext) => Promise<SeedImapCheckResult>;
      checkSeedPlacement?: (ctx: SeedImapCheckContext) => Promise<SeedImapCheckResult>;
    };

export interface PlacementTestOptions {
  mode?: 'heuristic' | 'live_seed';
  workspaceId?: string;
  seedMailboxes?: SeedMailbox[];
  mailers?: {
    smtp?: IMailer;
    simulated?: IMailer;
  };
  seedImapChecker?: SeedImapChecker;
}

export interface PlacementTestReport {
  senderEmail: string;
  subject: string;
  timestamp: string;
  predictedInboxRate: number; // 0 to 100%
  predictedSpamRisk: 'low' | 'medium' | 'high';
  spamScore: number;
  spamIssues: string[];
  dnsHealth: number;
  recommendations: string[];
  mode: 'heuristic' | 'live_seed';
  seedTestId?: string;
  seedToken?: string;
  providerBreakdown?: SeedProviderPlacement[];
  seedInboxRate?: number;
}

interface FallbackSeedStore {
  seeds: SeedMailbox[];
}

function getFallbackSeedStore(): FallbackSeedStore {
  const g = globalThis as unknown as { __misenderSeedMailboxes?: FallbackSeedStore };
  if (!g.__misenderSeedMailboxes) {
    g.__misenderSeedMailboxes = { seeds: [] };
  }
  return g.__misenderSeedMailboxes;
}

function shouldUseSupabase(): boolean {
  const hasEnv = Boolean(
    (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL) &&
      (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  );
  if (hasEnv) return true;

  const clientUrl = (supabase as unknown as { supabaseUrl?: string })?.supabaseUrl;
  const hasFrom = typeof (supabase as unknown as { from?: unknown })?.from === 'function';
  return Boolean(hasFrom && clientUrl && clientUrl !== 'https://placeholder.supabase.co');
}

export function inferSeedProvider(email: string, explicitProvider?: string): string {
  if (explicitProvider && explicitProvider.trim()) {
    return explicitProvider.trim().toLowerCase();
  }
  const domain = (email.split('@')[1] || '').toLowerCase().trim();
  if (domain === 'gmail.com' || domain === 'googlemail.com') return 'google';
  if (
    domain === 'outlook.com' ||
    domain === 'hotmail.com' ||
    domain === 'live.com' ||
    domain === 'msn.com'
  ) {
    return 'microsoft';
  }
  if (domain === 'zoho.com' || domain === 'zohomail.com') return 'zoho';
  if (domain === 'yahoo.com' || domain === 'ymail.com') return 'yahoo';
  if (domain === 'proton.me' || domain === 'protonmail.com') return 'proton';
  return 'smtp';
}

function inferImapHost(provider: string, email: string, explicitHost?: string): string | undefined {
  if (explicitHost && explicitHost.trim()) return explicitHost.trim();
  if (provider === 'google') return 'imap.gmail.com';
  if (provider === 'microsoft') return 'outlook.office365.com';
  if (provider === 'zoho') return 'imap.zoho.com';
  if (provider === 'yahoo') return 'imap.mail.yahoo.com';
  const domain = (email.split('@')[1] || '').toLowerCase().trim();
  return domain ? `imap.${domain}` : undefined;
}

function mapDbRowToSeed(row: Record<string, unknown>): SeedMailbox {
  const email = String(row.email || '').trim().toLowerCase();
  const provider = inferSeedProvider(email, typeof row.provider === 'string' ? row.provider : undefined);
  const rawPass = typeof row.imap_pass === 'string' ? row.imap_pass : '';
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id || 'ws-primary'),
    email,
    provider,
    imapHost: typeof row.imap_host === 'string' && row.imap_host ? row.imap_host : undefined,
    imapPort: Number(row.imap_port) || 993,
    imapUser: typeof row.imap_user === 'string' && row.imap_user ? row.imap_user : email,
    imapPass: rawPass ? decryptCredential(rawPass) : undefined,
    isActive: row.is_active !== undefined ? Boolean(row.is_active) : true,
    lastCheckedAt: typeof row.last_checked_at === 'string' ? row.last_checked_at : null,
    createdAt: String(row.created_at || new Date().toISOString())
  };
}

function mapSeedToDbRow(seed: SeedMailbox): Record<string, unknown> {
  return {
    id: seed.id,
    workspace_id: seed.workspaceId || 'ws-primary',
    email: seed.email,
    provider: seed.provider || 'smtp',
    imap_host: seed.imapHost ?? null,
    imap_port: seed.imapPort ?? 993,
    imap_user: seed.imapUser ?? seed.email,
    imap_pass: seed.imapPass ? encryptCredential(seed.imapPass) : null,
    is_active: seed.isActive !== false,
    last_checked_at: seed.lastCheckedAt ?? null,
    created_at: seed.createdAt
  };
}

function loadEnvSeedMailboxes(): SeedMailbox[] {
  const raw = process.env.SEED_MAILBOXES_JSON;
  if (!raw || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    const items: unknown[] = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && Array.isArray((parsed as { seeds?: unknown[] }).seeds)
        ? (parsed as { seeds: unknown[] }).seeds
        : [];

    const out: SeedMailbox[] = [];
    items.forEach((entry, idx) => {
      if (!entry || typeof entry !== 'object') return;
      const obj = entry as Record<string, unknown>;
      const email = typeof obj.email === 'string' ? obj.email.trim().toLowerCase() : '';
      if (!email || !email.includes('@')) return;
      const provider = inferSeedProvider(
        email,
        typeof obj.provider === 'string' ? obj.provider : undefined
      );
      out.push({
        id: typeof obj.id === 'string' && obj.id.trim() ? obj.id.trim() : `env-seed-${idx + 1}`,
        workspaceId:
          typeof obj.workspaceId === 'string' && obj.workspaceId.trim()
            ? obj.workspaceId.trim()
            : 'global',
        email,
        provider,
        imapHost: inferImapHost(
          provider,
          email,
          typeof obj.imapHost === 'string' ? obj.imapHost : undefined
        ),
        imapPort: Number(obj.imapPort) || 993,
        imapUser: typeof obj.imapUser === 'string' && obj.imapUser ? obj.imapUser : email,
        imapPass: typeof obj.imapPass === 'string' ? obj.imapPass : undefined,
        isActive: obj.isActive !== undefined ? Boolean(obj.isActive) : true,
        lastCheckedAt: null,
        createdAt:
          typeof obj.createdAt === 'string' ? obj.createdAt : new Date().toISOString()
      });
    });
    return out;
  } catch {
    return [];
  }
}

export function sanitizeSeedMailbox(seed: SeedMailbox): PublicSeedMailbox {
  const { imapPass, ...rest } = seed;
  return {
    ...rest,
    hasImapPass: Boolean(imapPass)
  };
}

function isDemoAccount(account: SenderAccount): boolean {
  const host = (account.smtpHost || '').toLowerCase();
  const pass = account.smtpPass || '';
  return (
    !host ||
    !pass ||
    host.includes('ethereal') ||
    pass === 'demo-pass' ||
    pass === 'demo-app-pass'
  );
}

function createDemoSeeds(workspaceId?: string): SeedMailbox[] {
  const now = new Date().toISOString();
  const ws = workspaceId || 'ws-primary';
  return [
    {
      id: 'demo-seed-google',
      workspaceId: ws,
      email: 'seed-gmail@demo-seed.misender.app',
      provider: 'google',
      isActive: true,
      createdAt: now
    },
    {
      id: 'demo-seed-microsoft',
      workspaceId: ws,
      email: 'seed-outlook@demo-seed.misender.app',
      provider: 'microsoft',
      isActive: true,
      createdAt: now
    },
    {
      id: 'demo-seed-zoho',
      workspaceId: ws,
      email: 'seed-zoho@demo-seed.misender.app',
      provider: 'zoho',
      isActive: true,
      createdAt: now
    }
  ];
}

export class PlacementTestService {
  constructor(
    private spamDetector: SpamDetectorService = new SpamDetectorService(),
    private dnsChecker: DnsCheckerService = new DnsCheckerService()
  ) {}

  static async getSeedMailboxes(workspaceId?: string): Promise<SeedMailbox[]> {
    let storedSeeds: SeedMailbox[] = [];

    if (shouldUseSupabase()) {
      try {
        const { data, error } = await supabase
          .from('seed_mailboxes')
          .select('*')
          .order('created_at', { ascending: true });

        if (!error && Array.isArray(data)) {
          storedSeeds = data.map((row) => mapDbRowToSeed(row as Record<string, unknown>));
        } else {
          storedSeeds = [...getFallbackSeedStore().seeds];
        }
      } catch {
        storedSeeds = [...getFallbackSeedStore().seeds];
      }
    } else {
      storedSeeds = [...getFallbackSeedStore().seeds];
    }

    const envSeeds = loadEnvSeedMailboxes();
    const mergedByKey = new Map<string, SeedMailbox>();
    for (const s of [...envSeeds, ...storedSeeds]) {
      mergedByKey.set(s.email.toLowerCase(), s);
    }

    const allSeeds = Array.from(mergedByKey.values());
    if (!workspaceId) return allSeeds;

    return allSeeds.filter(
      (s) => !s.workspaceId || s.workspaceId === 'global' || s.workspaceId === workspaceId
    );
  }

  static async addSeedMailbox(input: AddSeedMailboxInput): Promise<SeedMailbox> {
    const email = (input.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      throw new Error('Valid seed mailbox email is required');
    }

    const provider = inferSeedProvider(email, input.provider);
    const seed: SeedMailbox = {
      id: input.id?.trim() || `seed-${uuidv4()}`,
      workspaceId: input.workspaceId?.trim() || 'ws-primary',
      email,
      provider,
      imapHost: inferImapHost(provider, email, input.imapHost),
      imapPort: Number(input.imapPort) || 993,
      imapUser: input.imapUser?.trim() || email,
      imapPass: input.imapPass || undefined,
      isActive: input.isActive !== undefined ? Boolean(input.isActive) : true,
      lastCheckedAt: null,
      createdAt: new Date().toISOString()
    };

    const store = getFallbackSeedStore();
    const existingIdx = store.seeds.findIndex(
      (s) => s.id === seed.id || (s.email === seed.email && s.workspaceId === seed.workspaceId)
    );
    if (existingIdx >= 0) {
      store.seeds[existingIdx] = seed;
    } else {
      store.seeds.push(seed);
    }

    if (shouldUseSupabase()) {
      try {
        await supabase
          .from('seed_mailboxes')
          .upsert(mapSeedToDbRow(seed), { onConflict: 'id' });
      } catch {
        // Fallback store already updated
      }
    }

    return seed;
  }

  static async removeSeedMailbox(id: string): Promise<boolean> {
    const targetId = (id || '').trim();
    if (!targetId) return false;

    const store = getFallbackSeedStore();
    const beforeCount = store.seeds.length;
    store.seeds = store.seeds.filter((s) => s.id !== targetId);
    let removed = store.seeds.length < beforeCount;

    if (shouldUseSupabase()) {
      try {
        const { error, data } = await supabase
          .from('seed_mailboxes')
          .delete()
          .eq('id', targetId)
          .select('id');
        if (!error && Array.isArray(data) && data.length > 0) {
          removed = true;
        }
      } catch {
        // Keep fallback result
      }
    }

    return removed;
  }

  async getSeedMailboxes(workspaceId?: string): Promise<SeedMailbox[]> {
    return PlacementTestService.getSeedMailboxes(workspaceId);
  }

  async addSeedMailbox(input: AddSeedMailboxInput): Promise<SeedMailbox> {
    return PlacementTestService.addSeedMailbox(input);
  }

  async removeSeedMailbox(id: string): Promise<boolean> {
    return PlacementTestService.removeSeedMailbox(id);
  }

  async runPlacementTest(
    sender: SenderAccount,
    subject: string,
    body: string,
    options?: PlacementTestOptions
  ): Promise<PlacementTestReport> {
    const domain = sender.email.split('@')[1] || '';
    const spamMatches = this.spamDetector.check(`${subject} ${body}`);
    const dnsResult = domain ? await this.dnsChecker.auditDomain(domain) : null;

    const dnsScore = dnsResult ? dnsResult.overallHealth : 70;
    const spamPenalty = Math.min(60, spamMatches.length * 15);

    const predictedInboxRate = Math.max(
      10,
      Math.min(100, Math.round(dnsScore * 0.6 + (100 - spamPenalty) * 0.4))
    );

    let risk: 'low' | 'medium' | 'high' = 'low';
    if (predictedInboxRate < 50) risk = 'high';
    else if (predictedInboxRate < 75) risk = 'medium';

    const spamIssues = spamMatches.map((m) => m.word);
    const recommendations: string[] = [];
    if (spamIssues.length > 0) {
      recommendations.push(
        `Reduce palabras detonantes de spam encontradas: ${spamIssues.slice(0, 3).join(', ')}.`
      );
    }
    if (dnsResult && !dnsResult.dmarc.valid) {
      recommendations.push('Configura tu registro DMARC en DNS con política quarantine o reject.');
    }
    if (dnsResult && !dnsResult.spf.valid) {
      recommendations.push('Verifica que tu registro SPF incluya la IP/servidor de tu proveedor SMTP.');
    }
    if (body.includes('http://')) {
      recommendations.push('Reemplaza todos los enlaces no seguros (http://) por HTTPS.');
    }

    const mode: 'heuristic' | 'live_seed' = options?.mode === 'live_seed' ? 'live_seed' : 'heuristic';

    if (mode === 'heuristic') {
      if (recommendations.length === 0) {
        recommendations.push(
          'Excelente configuración técnica. Tus correos tienen una probabilidad óptima de aterrizar en Inbox.'
        );
      }

      return {
        senderEmail: sender.email,
        subject,
        timestamp: new Date().toISOString(),
        predictedInboxRate,
        predictedSpamRisk: risk,
        spamScore: spamMatches.length,
        spamIssues,
        dnsHealth: dnsScore,
        recommendations,
        mode: 'heuristic'
      };
    }

    // Live Seed Placement Test
    const shortId = uuidv4().split('-')[0].toUpperCase();
    const seedTestId = `seed-${shortId.toLowerCase()}`;
    const seedToken = `[MS-SEED-${shortId}]`;
    const taggedSubject = `${subject} ${seedToken}`.trim();
    const taggedBody = `${body}\n\nSeed Verification Token: ${seedToken}`;

    const configuredSeeds = options?.seedMailboxes
      ? options.seedMailboxes.filter((s) => s.isActive !== false)
      : (await this.getSeedMailboxes(options?.workspaceId ?? sender.workspaceId)).filter(
          (s) => s.isActive !== false
        );

    const demoSender = isDemoAccount(sender);
    const targetSeeds =
      configuredSeeds.length > 0
        ? configuredSeeds
        : demoSender
          ? createDemoSeeds(options?.workspaceId ?? sender.workspaceId)
          : [];

    if (targetSeeds.length === 0) {
      recommendations.push(
        'No hay casillas semilla configuradas. Agrega casillas semilla para ejecutar una prueba live_seed real.'
      );
      return {
        senderEmail: sender.email,
        subject,
        timestamp: new Date().toISOString(),
        predictedInboxRate,
        predictedSpamRisk: risk,
        spamScore: spamMatches.length,
        spamIssues,
        dnsHealth: dnsScore,
        recommendations,
        mode: 'live_seed',
        seedTestId,
        seedToken,
        providerBreakdown: [],
        seedInboxRate: 0
      };
    }

    const smtpMailer = options?.mailers?.smtp || new SmtpMailer();
    const simulatedMailer = options?.mailers?.simulated || new SimulatedMailer();
    const activeMailer = demoSender ? simulatedMailer : smtpMailer;

    const providerBreakdown: SeedProviderPlacement[] = [];
    const checkedSeedIds: string[] = [];

    for (const seed of targetSeeds) {
      const start = Date.now();
      try {
        const sendRes = await activeMailer.send(sender, {
          from: sender.email,
          fromName: sender.name,
          to: seed.email,
          subject: taggedSubject,
          body: taggedBody,
          messageId: `<${seedTestId}-${seed.id}@${domain || 'misender.app'}>`
        });

        if (!sendRes.success) {
          providerBreakdown.push({
            provider: seed.provider,
            email: seed.email,
            folder: 'spam',
            latencyMs: Math.max(1, Date.now() - start),
            status: 'error',
            error: sendRes.error || 'Failed to deliver seed test message'
          });
          continue;
        }

        const inspection = await this.inspectSeedFolder(
          {
            seed,
            token: seedToken,
            seedTestId,
            subject: taggedSubject,
            sender
          },
          {
            demoSender,
            predictedInboxRate,
            spamCount: spamMatches.length,
            hasInsecureLinks: body.includes('http://'),
            spfValid: dnsResult?.spf.valid ?? true,
            dmarcValid: dnsResult?.dmarc.valid ?? true,
            seedImapChecker: options?.seedImapChecker
          }
        );

        providerBreakdown.push({
          provider: seed.provider,
          email: seed.email,
          folder: inspection.folder,
          latencyMs: inspection.latencyMs ?? Math.max(1, Date.now() - start),
          status: 'delivered'
        });
        checkedSeedIds.push(seed.id);
      } catch (err: unknown) {
        providerBreakdown.push({
          provider: seed.provider,
          email: seed.email,
          folder: 'spam',
          latencyMs: Math.max(1, Date.now() - start),
          status: 'error',
          error: err instanceof Error ? err.message : 'Seed dispatch error'
        });
      }
    }

    await this.markSeedsChecked(checkedSeedIds);

    const inboxHits = providerBreakdown.filter((p) => p.folder === 'inbox').length;
    const seedInboxRate =
      providerBreakdown.length > 0 ? Math.round((inboxHits / providerBreakdown.length) * 100) : 0;

    const spamProviders = providerBreakdown.filter((p) => p.folder === 'spam').map((p) => p.provider);
    const promoProviders = providerBreakdown
      .filter((p) => p.folder === 'promotions')
      .map((p) => p.provider);

    if (spamProviders.length > 0) {
      recommendations.push(
        `Alerta live_seed: correos cayeron en Spam en ${Array.from(new Set(spamProviders)).join(', ')}. Revisa SPF/DKIM/DMARC y contenido.`
      );
    }
    if (promoProviders.length > 0) {
      recommendations.push(
        `Clasificado en Promociones en ${Array.from(new Set(promoProviders)).join(', ')}. Reduce enlaces o palabras comerciales.`
      );
    }
    if (recommendations.length === 0) {
      recommendations.push(
        'Excelente configuración técnica. Todas las casillas semilla aterrizaron en Inbox.'
      );
    }

    return {
      senderEmail: sender.email,
      subject,
      timestamp: new Date().toISOString(),
      predictedInboxRate,
      predictedSpamRisk: risk,
      spamScore: spamMatches.length,
      spamIssues,
      dnsHealth: dnsScore,
      recommendations,
      mode: 'live_seed',
      seedTestId,
      seedToken,
      providerBreakdown,
      seedInboxRate
    };
  }

  private async inspectSeedFolder(
    ctx: SeedImapCheckContext,
    signals: {
      demoSender: boolean;
      predictedInboxRate: number;
      spamCount: number;
      hasInsecureLinks: boolean;
      spfValid: boolean;
      dmarcValid: boolean;
      seedImapChecker?: SeedImapChecker;
    }
  ): Promise<{ folder: PlacementFolder; latencyMs?: number }> {
    if (signals.seedImapChecker) {
      const res =
        typeof signals.seedImapChecker === 'function'
          ? await signals.seedImapChecker(ctx)
          : typeof signals.seedImapChecker.checkSeedPlacement === 'function'
            ? await signals.seedImapChecker.checkSeedPlacement(ctx)
            : typeof signals.seedImapChecker.checkPlacement === 'function'
              ? await signals.seedImapChecker.checkPlacement(ctx)
              : 'inbox';

      if (typeof res === 'string') {
        return { folder: res };
      }
      return { folder: res.folder, latencyMs: res.latencyMs };
    }

    const { seed } = ctx;
    if (
      !signals.demoSender &&
      !process.env.VITEST &&
      seed.imapHost &&
      seed.imapUser &&
      seed.imapPass
    ) {
      const start = Date.now();
      const folder = await this.probeRealSeedImapFolder(seed, ctx.token);
      if (folder) {
        return { folder, latencyMs: Math.max(1, Date.now() - start) };
      }
    }

    // Deterministic heuristic fallback for demo seeds / IMAP-less seeds
    if (
      signals.spamCount >= 2 ||
      (!signals.spfValid && !signals.dmarcValid) ||
      signals.predictedInboxRate < 55
    ) {
      return { folder: 'spam' };
    }

    if (
      (seed.provider === 'google' || seed.provider === 'microsoft') &&
      (signals.spamCount === 1 || signals.hasInsecureLinks || signals.predictedInboxRate < 80)
    ) {
      return { folder: 'promotions' };
    }

    return { folder: 'inbox' };
  }

  private async probeRealSeedImapFolder(
    seed: SeedMailbox,
    token: string
  ): Promise<PlacementFolder | null> {
    if (!seed.imapHost || !seed.imapUser || !seed.imapPass) return null;

    const folderCandidates: Array<{ name: string; bucket: PlacementFolder }> = [
      { name: 'INBOX', bucket: 'inbox' },
      { name: '[Gmail]/Promotions', bucket: 'promotions' },
      { name: 'Promotions', bucket: 'promotions' },
      { name: '[Gmail]/Spam', bucket: 'spam' },
      { name: 'Junk', bucket: 'spam' },
      { name: 'Spam', bucket: 'spam' }
    ];

    for (const candidate of folderCandidates) {
      try {
        const found = await this.searchImapFolderForToken(
          seed.imapHost,
          seed.imapPort || 993,
          seed.imapUser,
          seed.imapPass,
          candidate.name,
          token
        );
        if (found) return candidate.bucket;
      } catch {
        // Continue checking remaining folders
      }
    }

    return null;
  }

  private searchImapFolderForToken(
    host: string,
    port: number,
    user: string,
    pass: string,
    folder: string,
    token: string
  ): Promise<boolean> {
    return new Promise((resolve, reject) => {
      let buffer = '';
      let step: 'greeting' | 'login' | 'select' | 'search' | 'done' = 'greeting';

      const socket = tls.connect(
        {
          host,
          port,
          servername: host,
          rejectUnauthorized: process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0',
          minVersion: 'TLSv1.2'
        },
        () => {}
      );
      socket.setEncoding('utf8');

      const finish = (found: boolean) => {
        clearTimeout(timeout);
        try {
          socket.write('A9 LOGOUT\r\n');
          socket.end();
        } catch {}
        resolve(found);
      };

      const timeout = setTimeout(() => {
        try {
          socket.destroy();
        } catch {}
        resolve(false);
      }, 4500);

      socket.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      socket.on('data', (chunk: string) => {
        buffer += chunk;

        if (step === 'greeting' && buffer.includes('* OK')) {
          step = 'login';
          buffer = '';
          const safeUser = user.replace(/[\r\n"]/g, '').trim();
          const safePass = pass.replace(/[\r\n]/g, '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
          socket.write(`A1 LOGIN "${safeUser}" "${safePass}"\r\n`);
        } else if (step === 'login') {
          if (buffer.includes('A1 OK')) {
            step = 'select';
            buffer = '';
            socket.write(`A2 SELECT "${folder.replace(/[\r\n"]/g, '')}"\r\n`);
          } else if (buffer.includes('A1 NO') || buffer.includes('A1 BAD')) {
            clearTimeout(timeout);
            socket.destroy();
            reject(new Error('Seed IMAP login rejected'));
          }
        } else if (step === 'select') {
          if (buffer.includes('A2 OK')) {
            step = 'search';
            buffer = '';
            const safeToken = token.replace(/[\r\n"]/g, '');
            socket.write(`A3 SEARCH SUBJECT "${safeToken}"\r\n`);
          } else if (buffer.includes('A2 NO') || buffer.includes('A2 BAD')) {
            step = 'done';
            finish(false);
          }
        } else if (step === 'search') {
          if (buffer.includes('A3 OK') || buffer.includes('A3 NO') || buffer.includes('A3 BAD')) {
            const searchMatch = buffer.match(/^\*\s+SEARCH\s+([0-9 ]+)/im);
            const hasMatches = Boolean(searchMatch && searchMatch[1].trim().length > 0);
            step = 'done';
            finish(hasMatches);
          }
        }
      });
    });
  }

  private async markSeedsChecked(seedIds: string[]): Promise<void> {
    if (seedIds.length === 0) return;
    const now = new Date().toISOString();
    const idSet = new Set(seedIds);
    const store = getFallbackSeedStore();
    for (const seed of store.seeds) {
      if (idSet.has(seed.id)) {
        seed.lastCheckedAt = now;
      }
    }

    if (shouldUseSupabase()) {
      try {
        await supabase
          .from('seed_mailboxes')
          .update({ last_checked_at: now })
          .in('id', seedIds);
      } catch {
        // Ignore DB timestamp update failure
      }
    }
  }
}
