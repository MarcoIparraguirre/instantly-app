import crypto from 'crypto';
import dns from 'dns';
import net from 'net';
import { EmailVerificationResult } from '@/types';

export const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com',
  'tempmail.com',
  'temp-mail.org',
  '10minutemail.com',
  'guerrillamail.com',
  'yopmail.com',
  'trashmail.com',
  'sharklasers.com',
  'dispostable.com',
  'getairmail.com',
  'inboxkitten.com',
  'throwawaymail.com',
  'guerrillamail.net',
  'guerrillamail.org',
  'guerrillamail.biz',
  'guerrillamail.de',
  'guerrillamailblock.com',
  'grr.la',
  'pokemail.net',
  'spam4.me',
  'maildrop.cc',
  'mailnesia.com',
  'mintemail.com',
  'mytemp.email',
  'mohmal.com',
  'tempail.com',
  'tempr.email',
  'tempmail.net',
  'tempmail.org',
  'tempmailo.com',
  'temp-mail.io',
  'tempinbox.com',
  '10minutemail.net',
  '10minutemail.org',
  '20minutemail.com',
  '33mail.com',
  'anonbox.net',
  'binkmail.com',
  'bobmail.info',
  'burnermail.io',
  'byom.de',
  'crazymailing.com',
  'deadaddress.com',
  'discard.email',
  'discardmail.com',
  'dodgeit.com',
  'dodgit.com',
  'drdrb.net',
  'dropmail.me',
  'e4ward.com',
  'emailondeck.com',
  'emailsensei.com',
  'fakeinbox.com',
  'fakemailgenerator.com',
  'fastacura.com',
  'filzmail.com',
  'fixmail.tk',
  'fudgerub.com',
  'getnada.com',
  'harakirimail.com',
  'hidemail.de',
  'incognitomail.org',
  'instant-mail.de',
  'jetable.org',
  'junk1e.com',
  'kasmail.com',
  'klzlk.com',
  'kurzepost.de',
  'lifebyfood.com',
  'lookugly.com',
  'mail-temporaire.fr',
  'mailcatch.com',
  'mailexpire.com',
  'mailfreeonline.com',
  'mailin8r.com',
  'mailinator.net',
  'mailinator.org',
  'mailinator2.com',
  'mailismagic.com',
  'mailmate.com',
  'mailmoat.com',
  'mailnator.com',
  'mailsac.com',
  'mailscrap.com',
  'mailshell.com',
  'mailsiphon.com',
  'mailzilla.com',
  'meltmail.com',
  'mierdamail.com',
  'mt2014.com',
  'nada.email',
  'nada.ltd',
  'neomailbox.com',
  'no-spam.ws',
  'nomail.xl.cx',
  'nospam.ze.tc',
  'nospamfor.us',
  'nowmymail.com',
  'objectmail.com',
  'obobbo.com',
  'oneoffemail.com',
  'onewaymail.com',
  'owlpic.com',
  'proxymail.eu',
  'rcpt.at',
  'recode.me',
  'rejectmail.com',
  'rhyta.com',
  'rmqkr.net',
  'rppkn.com',
  'safe-mail.net',
  'safetymail.info',
  'sandelf.de',
  'saynotospams.com',
  'selfdestructingmail.com',
  'sendspamhere.com',
  'shiftmail.com',
  'skeefmail.com',
  'slopsbox.com',
  'smellfear.com',
  'snakemail.com',
  'sneakemail.com',
  'sofort-mail.de',
  'spamavert.com',
  'spambob.net',
  'spambog.com',
  'spambox.us',
  'spamcannon.com',
  'spamcero.com',
  'spamcon.org',
  'spamcorptastic.com',
  'spamcowboy.com',
  'spamday.com',
  'spamex.com',
  'spamfree24.org',
  'spamgourmet.com',
  'spamherelots.com',
  'spamhereplease.com',
  'spamhole.com',
  'spamify.com',
  'spaminator.de',
  'spamkill.info',
  'spaml.com',
  'spammotel.com',
  'spamobox.com',
  'spamspot.com',
  'spamthis.co.uk',
  'superrito.com',
  'suremail.info',
  'teleworm.us',
  'tempemail.net',
  'thankyou2010.com',
  'trash-mail.at',
  'trash-mail.com',
  'trash2009.com',
  'trashemail.de',
  'trashymail.com',
  'tyldd.com',
  'uggsrock.com',
  'wegwerfmail.de',
  'wegwerfmail.net',
  'wegwerfmail.org',
  'wh4f.org',
  'whyspam.me',
  'willselfdestruct.com',
  'wuzup.net',
  'yopmail.fr',
  'yopmail.net',
  'yuurok.com',
  'zehnminutenmail.de',
  'zippymail.info'
]);

export const ROLE_BASED_PREFIXES = new Set([
  'info',
  'admin',
  'support',
  'sales',
  'contact',
  'billing',
  'noreply',
  'security',
  'help',
  'office',
  'team',
  'hello'
]);

export interface EmailVerifyOptions {
  smtpProbe?: boolean;
  externalVerify?: boolean;
  timeoutMs?: number;
}

export interface EnrichedEmailVerificationResult extends EmailVerificationResult {
  isRoleBased?: boolean;
  isCatchAll?: boolean;
  smtpVerified?: boolean;
}

export interface SmtpProbeResult {
  smtpVerified: boolean;
  isCatchAll: boolean;
  rejected?: boolean;
  inconclusive?: boolean;
  error?: string;
}

interface ExternalVerifierApiOutcome {
  isValid?: boolean;
  isDisposable?: boolean;
  isRoleBased?: boolean;
  isCatchAll?: boolean;
  smtpVerified?: boolean;
  score?: number;
  reason?: string;
}

export class EmailVerifierService {
  private emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  private mxCache = new Map<string, { hasMx: boolean; records: string[]; error?: string }>();

  async verifyEmail(
    email: string,
    options?: EmailVerifyOptions
  ): Promise<EnrichedEmailVerificationResult> {
    const norm = (email || '').trim().toLowerCase();

    // 1. Syntax Check
    if (!norm || !this.emailRegex.test(norm)) {
      return {
        email: norm,
        isValid: false,
        score: 0,
        syntaxValid: false,
        domain: '',
        hasMx: false,
        isDisposable: false,
        isRoleBased: false,
        reason: 'Formato o sintaxis de correo electrónico inválida.'
      };
    }

    const [localPart, domain] = norm.split('@');
    const baseLocal = localPart.split('+')[0];
    const isRoleBased = ROLE_BASED_PREFIXES.has(localPart) || ROLE_BASED_PREFIXES.has(baseLocal);

    // 2. Disposable Email Check
    if (DISPOSABLE_DOMAINS.has(domain)) {
      return {
        email: norm,
        isValid: false,
        score: 15,
        syntaxValid: true,
        domain,
        hasMx: false,
        isDisposable: true,
        isRoleBased,
        reason: 'Dominio de correo temporal o desechable detectado.'
      };
    }

    // 3. DNS MX Check (with cache)
    try {
      let cached = this.mxCache.get(domain);
      if (!cached) {
        try {
          const mx = await dns.promises.resolveMx(domain);
          if (mx && mx.length > 0) {
            const sorted = mx.sort((a, b) => a.priority - b.priority).map(m => m.exchange);
            cached = { hasMx: true, records: sorted };
          } else {
            cached = { hasMx: false, records: [] };
          }
        } catch (dnsErr: unknown) {
          const errMessage = dnsErr instanceof Error ? dnsErr.message : 'Dominio no existe';
          cached = { hasMx: false, records: [], error: errMessage };
        }
        this.mxCache.set(domain, cached);
      }

      if (!cached.hasMx) {
        return {
          email: norm,
          isValid: false,
          score: cached.error ? 20 : 30,
          syntaxValid: true,
          domain,
          hasMx: false,
          isDisposable: false,
          isRoleBased,
          reason: cached.error
            ? `Fallo de resolución DNS para el dominio ${domain}: ${cached.error}`
            : `El dominio ${domain} no posee servidores de correo (MX) configurados.`
        };
      }

      let isValid = true;
      let score = isRoleBased ? 75 : 95;
      let isCatchAll: boolean | undefined;
      let smtpVerified: boolean | undefined;
      let reason = isRoleBased
        ? 'Correo basado en rol (prefijo genérico) con registros MX activos.'
        : 'Correo con sintaxis válida y servidores MX activos y verificados.';

      // 4. Optional External Verifier API (5th layer - BYOK)
      const apiKey = process.env.EMAIL_VERIFIER_API_KEY?.trim();
      if (apiKey && options?.externalVerify !== false) {
        const apiOutcome = await this.queryExternalVerifier(norm, apiKey, options?.timeoutMs ?? 3000);
        if (apiOutcome) {
          if (apiOutcome.isDisposable) {
            return {
              email: norm,
              isValid: false,
              score: 15,
              syntaxValid: true,
              domain,
              hasMx: true,
              mxRecords: cached.records,
              isDisposable: true,
              isRoleBased: apiOutcome.isRoleBased ?? isRoleBased,
              isCatchAll: apiOutcome.isCatchAll,
              smtpVerified: apiOutcome.smtpVerified ?? false,
              reason: apiOutcome.reason || 'Dominio desechable reportado por verificador externo.'
            };
          }
          if (apiOutcome.isCatchAll !== undefined) isCatchAll = apiOutcome.isCatchAll;
          if (apiOutcome.smtpVerified !== undefined) smtpVerified = apiOutcome.smtpVerified;
          if (apiOutcome.isValid !== undefined) isValid = apiOutcome.isValid;
          if (typeof apiOutcome.score === 'number') score = apiOutcome.score;
          else if (!isValid) score = 25;
          else if (isCatchAll) score = Math.min(score, 70);
          if (apiOutcome.reason) reason = apiOutcome.reason;

          return {
            email: norm,
            isValid,
            score,
            syntaxValid: true,
            domain,
            hasMx: true,
            mxRecords: cached.records,
            isDisposable: false,
            isRoleBased: apiOutcome.isRoleBased ?? isRoleBased,
            isCatchAll,
            smtpVerified,
            reason
          };
        }
      }

      // 5. Optional SMTP RCPT TO + Catch-All Probe (opt-in via options.smtpProbe or ENABLE_SMTP_PROBE=true)
      const shouldRunSmtpProbe =
        options?.smtpProbe === true || process.env.ENABLE_SMTP_PROBE === 'true';

      if (shouldRunSmtpProbe && cached.records.length > 0) {
        const probe = await this.probeSmtpAndCatchAll(
          norm,
          cached.records[0],
          options?.timeoutMs ?? 3000
        );
        smtpVerified = probe.smtpVerified;
        isCatchAll = probe.isCatchAll;

        if (probe.rejected) {
          isValid = false;
          score = 25;
          reason = 'La casilla fue rechazada por el servidor SMTP (usuario inexistente).';
        } else if (probe.isCatchAll) {
          isValid = true;
          score = isRoleBased ? 60 : 70;
          reason = 'El dominio acepta cualquier dirección (catch-all); entregabilidad moderada.';
        } else if (probe.smtpVerified) {
          isValid = true;
          score = isRoleBased ? 80 : 98;
          reason = isRoleBased
            ? 'Casilla basada en rol verificada por SMTP.'
            : 'Casilla verificada directamente mediante protocolo SMTP (MX + RCPT TO).';
        }
      }

      return {
        email: norm,
        isValid,
        score,
        syntaxValid: true,
        domain,
        hasMx: true,
        mxRecords: cached.records,
        isDisposable: false,
        isRoleBased,
        isCatchAll,
        smtpVerified,
        reason
      };
    } catch (err: unknown) {
      const errMessage = err instanceof Error ? err.message : 'Dominio no existe';
      return {
        email: norm,
        isValid: false,
        score: 20,
        syntaxValid: true,
        domain,
        hasMx: false,
        isDisposable: false,
        isRoleBased,
        reason: `Fallo de resolución DNS para el dominio ${domain}: ${errMessage}`
      };
    }
  }

  /**
   * Probes an MX server via SMTP RCPT TO for the target email and a random probe address
   * to detect mailbox existence and catch-all domain behavior.
   */
  async probeSmtpAndCatchAll(
    email: string,
    mxHost: string,
    timeoutMs: number = 3000
  ): Promise<SmtpProbeResult> {
    const [, domain] = (email || '').trim().toLowerCase().split('@');
    if (!domain || !mxHost) {
      return { smtpVerified: false, isCatchAll: false, inconclusive: true, error: 'Missing domain or MX host' };
    }

    const randomProbeEmail = `catchall-probe-${crypto.randomBytes(6).toString('hex')}@${domain}`;

    return new Promise<SmtpProbeResult>(resolve => {
      const socket = new net.Socket();
      let settled = false;
      let stage: 'greeting' | 'ehlo' | 'mail_from' | 'rcpt_target' | 'rcpt_catchall' | 'done' = 'greeting';
      let buffer = '';
      let targetVerified = false;
      let targetRejected = false;
      let isCatchAll = false;

      const finish = (result: SmtpProbeResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(hardTimer);
        socket.removeAllListeners();
        try {
          socket.destroy();
        } catch {
          // ignore cleanup errors
        }
        resolve(result);
      };

      const hardTimer = setTimeout(() => {
        finish({
          smtpVerified: false,
          isCatchAll: false,
          inconclusive: true,
          error: `SMTP probe timed out after ${timeoutMs}ms`
        });
      }, timeoutMs);

      const handleSmtpCode = (code: number) => {
        if (stage === 'greeting') {
          if (code >= 200 && code < 300) {
            stage = 'ehlo';
            socket.write('EHLO misender.local\r\n');
          } else {
            finish({ smtpVerified: false, isCatchAll: false, inconclusive: true, error: `SMTP greeting rejected (${code})` });
          }
          return;
        }

        if (stage === 'ehlo') {
          if (code >= 200 && code < 300) {
            stage = 'mail_from';
            socket.write('MAIL FROM:<verify@misender.local>\r\n');
          } else {
            finish({ smtpVerified: false, isCatchAll: false, inconclusive: true, error: `SMTP EHLO rejected (${code})` });
          }
          return;
        }

        if (stage === 'mail_from') {
          if (code >= 200 && code < 300) {
            stage = 'rcpt_target';
            socket.write(`RCPT TO:<${email}>\r\n`);
          } else {
            finish({ smtpVerified: false, isCatchAll: false, inconclusive: true, error: `SMTP MAIL FROM rejected (${code})` });
          }
          return;
        }

        if (stage === 'rcpt_target') {
          if (code >= 200 && code < 300) {
            targetVerified = true;
          } else if (code >= 500) {
            targetRejected = true;
          }
          stage = 'rcpt_catchall';
          socket.write(`RCPT TO:<${randomProbeEmail}>\r\n`);
          return;
        }

        if (stage === 'rcpt_catchall') {
          isCatchAll = code >= 200 && code < 300;
          stage = 'done';
          try {
            socket.write('QUIT\r\n');
          } catch {
            // ignore write errors on close
          }
          finish({
            smtpVerified: targetVerified,
            isCatchAll,
            rejected: targetRejected,
            inconclusive: !targetVerified && !targetRejected
          });
        }
      };

      socket.setTimeout(timeoutMs);

      socket.on('timeout', () => {
        finish({
          smtpVerified: false,
          isCatchAll: false,
          inconclusive: true,
          error: `SMTP socket timeout (${timeoutMs}ms)`
        });
      });

      socket.on('error', err => {
        finish({
          smtpVerified: false,
          isCatchAll: false,
          inconclusive: true,
          error: err.message || 'SMTP connection error'
        });
      });

      socket.on('close', () => {
        finish({
          smtpVerified: targetVerified,
          isCatchAll,
          rejected: targetRejected,
          inconclusive: !targetVerified && !targetRejected
        });
      });

      socket.on('data', chunk => {
        buffer += chunk.toString('utf8');
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const match = line.match(/^(\d{3})([ -])/);
          if (match && match[2] === ' ') {
            const code = parseInt(match[1], 10);
            handleSmtpCode(code);
            if (settled) break;
          }
        }
      });

      socket.connect(25, mxHost);
    });
  }

  private async queryExternalVerifier(
    email: string,
    apiKey: string,
    timeoutMs: number
  ): Promise<ExternalVerifierApiOutcome | null> {
    try {
      const baseUrl =
        process.env.EMAIL_VERIFIER_API_URL?.trim() ||
        'https://emailvalidation.abstractapi.com/v1/';
      const separator = baseUrl.includes('?') ? '&' : '?';
      const url = `${baseUrl}${separator}api_key=${encodeURIComponent(apiKey)}&email=${encodeURIComponent(email)}`;

      const signal =
        typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
          ? AbortSignal.timeout(timeoutMs)
          : undefined;

      const res = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal
      });

      if (!res.ok) return null;

      interface ExternalVerifierApiPayload {
        status?: string;
        deliverability?: string;
        result?: string;
        isDisposable?: boolean;
        disposable?: boolean;
        is_disposable_email?: { value?: boolean };
        isRoleBased?: boolean;
        role?: boolean;
        is_role_email?: { value?: boolean };
        isCatchAll?: boolean;
        is_catchall?: boolean;
        is_catchall_email?: { value?: boolean };
        smtpVerified?: boolean;
        smtp_check?: boolean;
        is_smtp_valid?: { value?: boolean };
        isValid?: boolean;
        valid?: boolean;
        score?: number;
        quality_score?: number;
        reason?: string;
      }

      const data = (await res.json()) as ExternalVerifierApiPayload;
      const statusRaw = String(data.status || data.deliverability || data.result || '').toLowerCase();

      const isDisposable = Boolean(
        data.isDisposable ?? data.disposable ?? data.is_disposable_email?.value ?? statusRaw === 'disposable'
      );
      const isRoleBased =
        data.isRoleBased ?? data.role ?? data.is_role_email?.value ?? undefined;
      const isCatchAll =
        data.isCatchAll ??
        data.is_catchall ??
        data.is_catchall_email?.value ??
        (statusRaw === 'catch-all' || statusRaw === 'accept_all' ? true : undefined);
      const smtpVerified =
        data.smtpVerified ?? data.smtp_check ?? data.is_smtp_valid?.value ?? undefined;

      let isValid: boolean | undefined;
      if (typeof data.isValid === 'boolean') {
        isValid = data.isValid;
      } else if (typeof data.valid === 'boolean') {
        isValid = data.valid;
      } else if (statusRaw) {
        if (['valid', 'deliverable', 'catch-all', 'accept_all'].includes(statusRaw)) {
          isValid = true;
        } else if (['invalid', 'undeliverable', 'disposable', 'do_not_mail'].includes(statusRaw)) {
          isValid = false;
        }
      }

      const numericScore =
        typeof data.score === 'number'
          ? data.score
          : typeof data.quality_score === 'number'
            ? Math.round(data.quality_score <= 1 ? data.quality_score * 100 : data.quality_score)
            : undefined;

      return {
        isValid,
        isDisposable,
        isRoleBased: typeof isRoleBased === 'boolean' ? isRoleBased : undefined,
        isCatchAll: typeof isCatchAll === 'boolean' ? isCatchAll : undefined,
        smtpVerified: typeof smtpVerified === 'boolean' ? smtpVerified : undefined,
        score: numericScore,
        reason: typeof data.reason === 'string' ? data.reason : undefined
      };
    } catch {
      return null;
    }
  }

  /**
   * Performs batch verification using bounded concurrency (max 10 concurrent calls)
   * to prevent DNS/SMTP socket exhaustion (SEC-12).
   */
  async verifyBatch(
    emails: string[],
    concurrency: number = 10,
    options?: EmailVerifyOptions
  ): Promise<EnrichedEmailVerificationResult[]> {
    const effectiveConcurrency = Math.max(1, Math.min(10, Math.floor(concurrency || 10)));
    const results: EnrichedEmailVerificationResult[] = [];

    for (let i = 0; i < emails.length; i += effectiveConcurrency) {
      const chunk = emails.slice(i, i + effectiveConcurrency);
      const chunkResults = await Promise.all(chunk.map(e => this.verifyEmail(e, options)));
      results.push(...chunkResults);
    }

    return results;
  }
}
