import dns from 'dns';
import { EmailVerificationResult } from '@/types';

const DISPOSABLE_DOMAINS = new Set([
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
  'throwawaymail.com'
]);

export class EmailVerifierService {
  private emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  private mxCache = new Map<string, { hasMx: boolean; records: string[]; error?: string }>();

  async verifyEmail(email: string): Promise<EmailVerificationResult> {
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
        reason: 'Formato o sintaxis de correo electrónico inválida.'
      };
    }

    const [, domain] = norm.split('@');

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
        } catch (dnsErr: any) {
          cached = { hasMx: false, records: [], error: dnsErr.message || 'Dominio no existe' };
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
          reason: cached.error
            ? `Fallo de resolución DNS para el dominio ${domain}: ${cached.error}`
            : `El dominio ${domain} no posee servidores de correo (MX) configurados.`
        };
      }

      return {
        email: norm,
        isValid: true,
        score: 95,
        syntaxValid: true,
        domain,
        hasMx: true,
        mxRecords: cached.records,
        isDisposable: false,
        reason: 'Correo con sintaxis válida y servidores MX activos y verificados.'
      };
    } catch (err: any) {
      return {
        email: norm,
        isValid: false,
        score: 20,
        syntaxValid: true,
        domain,
        hasMx: false,
        isDisposable: false,
        reason: `Fallo de resolución DNS para el dominio ${domain}: ${err.message || 'Dominio no existe'}`
      };
    }
  }

  /**
   * Performs batch verification using bounded concurrency to prevent DNS socket exhaustion (SEC-12)
   */
  async verifyBatch(emails: string[], concurrency: number = 10): Promise<EmailVerificationResult[]> {
    const results: EmailVerificationResult[] = [];
    for (let i = 0; i < emails.length; i += concurrency) {
      const chunk = emails.slice(i, i + concurrency);
      const chunkResults = await Promise.all(chunk.map(e => this.verifyEmail(e)));
      results.push(...chunkResults);
    }
    return results;
  }
}
