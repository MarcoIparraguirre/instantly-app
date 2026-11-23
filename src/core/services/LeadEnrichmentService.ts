import { validateWebhookUrl } from '@/core/security/ssrfValidator';
import {
  EmailVerifierService,
  EmailVerifyOptions,
  EnrichedEmailVerificationResult
} from '@/core/services/EmailVerifierService';

export type EnrichmentSource =
  | 'website_scrape'
  | 'email_permutator'
  | 'apollo'
  | 'hunter'
  | 'input';

export type EmailPermutationPattern =
  | 'first.last'
  | 'first'
  | 'flast'
  | 'first_last'
  | 'last';

export interface LeadEnrichmentInput {
  domain?: string;
  website?: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  title?: string;
  email?: string;
  apolloApiKey?: string;
  hunterApiKey?: string;
  smtpProbe?: boolean;
  externalVerify?: boolean;
  verifyTimeoutMs?: number;
  scrapeTimeoutMs?: number;
  exhaustProviders?: boolean;
}

export interface EnrichedLeadContact {
  email: string;
  firstName: string;
  lastName: string;
  companyName: string;
  title: string;
  website: string;
  confidence: number;
  source: EnrichmentSource;
  verified: boolean;
  verificationScore: number;
  isCatchAll?: boolean;
  isRoleBased?: boolean;
  linkedinUrl?: string;
  phone?: string;
}

export interface DomainIntelligenceResult {
  domain: string;
  url: string;
  ssrfAllowed: boolean;
  ssrfReason?: string;
  scrapeStatus: 'ok' | 'blocked' | 'failed' | 'skipped';
  error?: string;
  title?: string;
  description?: string;
  siteName?: string;
  detectedEmails: string[];
  linkedinUrls: string[];
  linkedinCompanyUrl?: string;
  socialSignals: Record<string, string[]>;
  techSignals: string[];
  detectedPhones: string[];
}

export interface EmailPermutationCandidate {
  email: string;
  pattern: EmailPermutationPattern;
  rank: number;
  verification: EnrichedEmailVerificationResult;
}

export interface LeadEnrichmentResult {
  domain: string;
  website: string;
  companyName: string;
  domainIntel: DomainIntelligenceResult;
  permutations: EmailPermutationCandidate[];
  bestMatch: EnrichedLeadContact | null;
  leads: EnrichedLeadContact[];
  waterfall: {
    layer1Status: 'completed' | 'blocked' | 'partial';
    apolloStatus: 'success' | 'no_results' | 'error' | 'not_configured' | 'skipped';
    hunterStatus: 'success' | 'no_results' | 'error' | 'not_configured' | 'skipped';
    errors: string[];
  };
}

const MAX_HTML_BYTES = 512 * 1024;
const IGNORED_EMAIL_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'svg',
  'webp',
  'ico',
  'css',
  'js',
  'mjs',
  'woff',
  'woff2',
  'ttf',
  'eot',
  'pdf',
  'mp4',
  'webm',
  'map'
]);

const VALID_PUBLIC_DOMAIN_REGEX =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

const TECH_SIGNATURES: Array<{ name: string; pattern: RegExp }> = [
  { name: 'Next.js', pattern: /\/_next\/|__NEXT_DATA__/i },
  { name: 'React', pattern: /data-reactroot|react-dom/i },
  { name: 'Shopify', pattern: /cdn\.shopify\.com|Shopify\.theme/i },
  { name: 'WordPress', pattern: /\/wp-content\/|\/wp-includes\//i },
  { name: 'Webflow', pattern: /assets\.website-files\.com|data-wf-site|webflow\.com/i },
  { name: 'HubSpot', pattern: /js\.hs-scripts\.com|hsforms\.net|hbspt\.forms/i },
  { name: 'Intercom', pattern: /widget\.intercom\.io|intercomSettings/i },
  { name: 'Segment', pattern: /cdn\.segment\.com|analytics\.load\(/i },
  { name: 'Google Tag Manager', pattern: /googletagmanager\.com\/gtm\.js/i },
  { name: 'Google Analytics', pattern: /google-analytics\.com|gtag\(/i },
  { name: 'Stripe', pattern: /js\.stripe\.com/i },
  { name: 'Cloudflare', pattern: /challenges\.cloudflare\.com|cdnjs\.cloudflare\.com/i },
  { name: 'Vercel', pattern: /_vercel\/insights|vercel-insights/i }
];

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeNameToken(raw?: string): string {
  if (!raw) return '';
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function extractMetaContent(html: string, attrName: 'name' | 'property', attrValue: string): string | undefined {
  const escaped = attrValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patternA = new RegExp(
    `<meta[^>]*${attrName}\\s*=\\s*["']${escaped}["'][^>]*content\\s*=\\s*["']([^"']*)["'][^>]*>`,
    'i'
  );
  const patternB = new RegExp(
    `<meta[^>]*content\\s*=\\s*["']([^"']*)["'][^>]*${attrName}\\s*=\\s*["']${escaped}["'][^>]*>`,
    'i'
  );
  const match = html.match(patternA) || html.match(patternB);
  return match?.[1] ? decodeHtmlEntities(match[1]) : undefined;
}

function uniqueStrings(items: string[]): string[] {
  return Array.from(new Set(items.filter(Boolean)));
}

function capitalizeCompanyFromDomain(domain: string): string {
  if (!domain) return '';
  const base = domain.split('.')[0] || domain;
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : '';
}

function resolveTargetUrlAndDomain(input: LeadEnrichmentInput): {
  domain: string;
  targetUrl: string;
} {
  const rawWebsite = (input.website || '').trim();
  const rawDomain = (input.domain || '').trim();
  const rawEmail = (input.email || '').trim();

  const candidate = rawWebsite || rawDomain;
  if (candidate) {
    const withProtocol = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(candidate)
      ? candidate
      : `https://${candidate}`;

    try {
      const parsed = new URL(withProtocol);
      const hostname = parsed.hostname.toLowerCase();
      const cleanDomain =
        rawDomain && !rawDomain.includes('://')
          ? rawDomain.replace(/^www\./i, '').split('/')[0].toLowerCase()
          : hostname.replace(/^www\./i, '');
      return {
        domain: cleanDomain,
        targetUrl: withProtocol
      };
    } catch {
      const cleanDomain = candidate
        .replace(/^https?:\/\//i, '')
        .replace(/^www\./i, '')
        .split('/')[0]
        .toLowerCase();
      return {
        domain: cleanDomain,
        targetUrl: withProtocol
      };
    }
  }

  if (rawEmail.includes('@')) {
    const emailDomain = rawEmail.split('@')[1].trim().toLowerCase();
    return {
      domain: emailDomain,
      targetUrl: emailDomain ? `https://${emailDomain}` : ''
    };
  }

  return { domain: '', targetUrl: '' };
}

export function extractHtmlIntelligence(
  html: string,
  domain: string,
  url: string
): Omit<DomainIntelligenceResult, 'ssrfAllowed' | 'ssrfReason' | 'scrapeStatus' | 'error'> {
  const clipped = html.slice(0, MAX_HTML_BYTES);

  const titleMatch = clipped.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title =
    (titleMatch?.[1] ? decodeHtmlEntities(titleMatch[1]) : undefined) ||
    extractMetaContent(clipped, 'property', 'og:title');

  const description =
    extractMetaContent(clipped, 'name', 'description') ||
    extractMetaContent(clipped, 'property', 'og:description');

  const siteName = extractMetaContent(clipped, 'property', 'og:site_name');

  const emailMatches = clipped.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
  const detectedEmails = uniqueStrings(
    emailMatches
      .map(e => e.toLowerCase().trim())
      .filter(e => {
        const tld = e.split('.').pop() || '';
        if (IGNORED_EMAIL_EXTENSIONS.has(tld)) return false;
        if (e.includes('sentry.io') && /^[a-f0-9]{16,}@/i.test(e)) return false;
        return e.length <= 120;
      })
  );

  const linkedinMatches =
    clipped.match(/https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/(?:company|in)\/[a-zA-Z0-9._%-]+\/?/gi) || [];
  const linkedinUrls = uniqueStrings(
    linkedinMatches.map(u => u.replace(/^http:\/\//i, 'https://').replace(/\/+$/, ''))
  );
  const linkedinCompanyUrl = linkedinUrls.find(u => u.toLowerCase().includes('/company/'));

  const socialSignals: Record<string, string[]> = {};
  if (linkedinUrls.length > 0) {
    socialSignals.linkedin = linkedinUrls;
  }

  const socialExtractors: Array<{ key: string; regex: RegExp; ignore?: RegExp }> = [
    {
      key: 'twitter',
      regex: /https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/[a-zA-Z0-9_]{1,30}/gi,
      ignore: /\/(?:intent|share|home|search)(?:$|\W)/i
    },
    {
      key: 'github',
      regex: /https?:\/\/(?:www\.)?github\.com\/[a-zA-Z0-9_.-]+/gi
    },
    {
      key: 'instagram',
      regex: /https?:\/\/(?:www\.)?instagram\.com\/[a-zA-Z0-9_.]+/gi
    },
    {
      key: 'facebook',
      regex: /https?:\/\/(?:www\.)?facebook\.com\/[a-zA-Z0-9_.-]+/gi
    },
    {
      key: 'youtube',
      regex: /https?:\/\/(?:www\.)?youtube\.com\/(?:@|channel\/|c\/)[a-zA-Z0-9_.-]+/gi
    },
    {
      key: 'whatsapp',
      regex: /https?:\/\/(?:wa\.me|api\.whatsapp\.com)\/[a-zA-Z0-9_?=&+%-]+/gi
    }
  ];

  for (const extractor of socialExtractors) {
    const raw = clipped.match(extractor.regex) || [];
    const cleaned = uniqueStrings(
      raw.filter(link => !(extractor.ignore && extractor.ignore.test(link)))
    );
    if (cleaned.length > 0) {
      socialSignals[extractor.key] = cleaned;
    }
  }

  const techSignals = TECH_SIGNATURES.filter(sig => sig.pattern.test(clipped)).map(sig => sig.name);

  const phoneMatches = [...clipped.matchAll(/href\s*=\s*["']tel:([^"']+)["']/gi)].map(m =>
    m[1].replace(/[^\d+()-.\s]/g, '').trim()
  );
  const detectedPhones = uniqueStrings(phoneMatches.filter(p => p.replace(/\D/g, '').length >= 7));

  return {
    domain,
    url,
    title,
    description,
    siteName,
    detectedEmails,
    linkedinUrls,
    linkedinCompanyUrl,
    socialSignals,
    techSignals,
    detectedPhones
  };
}

export function generateEmailPermutations(
  firstName: string,
  lastName: string,
  domain: string
): Array<{ email: string; pattern: EmailPermutationPattern; rank: number }> {
  const first = normalizeNameToken(firstName);
  const last = normalizeNameToken(lastName);
  const cleanDomain = domain.trim().toLowerCase().replace(/^www\./i, '');

  if (!first || !last || !VALID_PUBLIC_DOMAIN_REGEX.test(cleanDomain)) {
    return [];
  }

  const rawCandidates: Array<{ email: string; pattern: EmailPermutationPattern }> = [
    { email: `${first}.${last}@${cleanDomain}`, pattern: 'first.last' },
    { email: `${first}@${cleanDomain}`, pattern: 'first' },
    { email: `${first[0]}${last}@${cleanDomain}`, pattern: 'flast' },
    { email: `${first}_${last}@${cleanDomain}`, pattern: 'first_last' },
    { email: `${last}@${cleanDomain}`, pattern: 'last' }
  ];

  const seen = new Set<string>();
  const ranked: Array<{ email: string; pattern: EmailPermutationPattern; rank: number }> = [];
  for (const item of rawCandidates) {
    if (!seen.has(item.email)) {
      seen.add(item.email);
      ranked.push({
        email: item.email,
        pattern: item.pattern,
        rank: ranked.length + 1
      });
    }
  }
  return ranked;
}

export class LeadEnrichmentService {
  private emailVerifier: EmailVerifierService;

  constructor(emailVerifier?: EmailVerifierService) {
    this.emailVerifier = emailVerifier || new EmailVerifierService();
  }

  static async enrich(input: LeadEnrichmentInput): Promise<LeadEnrichmentResult> {
    return new LeadEnrichmentService().enrich(input);
  }

  async enrich(input: LeadEnrichmentInput): Promise<LeadEnrichmentResult> {
    const { domain, targetUrl } = resolveTargetUrlAndDomain(input);
    const errors: string[] = [];

    // 1. Layer 1a: In-House Domain Intelligence (SSRF-guarded)
    const domainIntel = await this.scrapeDomainIntelligence(
      domain,
      targetUrl,
      input.scrapeTimeoutMs ?? 5000
    );
    if (domainIntel.error) {
      errors.push(domainIntel.error);
    }

    const derivedCompanyName =
      input.companyName?.trim() ||
      domainIntel.siteName ||
      (domainIntel.title ? domainIntel.title.split(/[|\-–—]/)[0].trim() : '') ||
      capitalizeCompanyFromDomain(domain);

    const normalizedWebsite =
      input.website?.trim() || (domainIntel.ssrfAllowed && targetUrl ? targetUrl : domain ? `https://${domain}` : '');

    const verifyOptions: EmailVerifyOptions = {
      smtpProbe: input.smtpProbe,
      externalVerify: input.externalVerify,
      timeoutMs: input.verifyTimeoutMs
    };

    const contactMap = new Map<string, EnrichedLeadContact>();
    const upsertContact = (candidate: EnrichedLeadContact) => {
      const key = candidate.email.trim().toLowerCase();
      if (!key) return;
      const existing = contactMap.get(key);
      if (!existing) {
        contactMap.set(key, { ...candidate, email: key });
        return;
      }

      // Merge richer metadata while preserving verification truth
      const preferNewSource =
        (candidate.source === 'apollo' || candidate.source === 'hunter') &&
        (existing.source === 'email_permutator' || existing.source === 'website_scrape');

      contactMap.set(key, {
        ...existing,
        firstName: existing.firstName || candidate.firstName,
        lastName: existing.lastName || candidate.lastName,
        companyName: existing.companyName || candidate.companyName,
        title: existing.title || candidate.title,
        website: existing.website || candidate.website,
        linkedinUrl: existing.linkedinUrl || candidate.linkedinUrl,
        phone: existing.phone || candidate.phone,
        verified: existing.verified || candidate.verified,
        verificationScore: Math.max(existing.verificationScore, candidate.verificationScore),
        confidence: Math.max(existing.confidence, candidate.confidence),
        isCatchAll: existing.isCatchAll ?? candidate.isCatchAll,
        isRoleBased: existing.isRoleBased ?? candidate.isRoleBased,
        source: preferNewSource ? candidate.source : existing.source
      });
    };

    // Verify scraped emails from Layer 1a
    if (domainIntel.detectedEmails.length > 0) {
      const scrapedBatch = domainIntel.detectedEmails.slice(0, 10);
      const scrapedVerifications = await this.emailVerifier.verifyBatch(scrapedBatch, 5, verifyOptions);
      for (const ver of scrapedVerifications) {
        upsertContact({
          email: ver.email,
          firstName: '',
          lastName: '',
          companyName: derivedCompanyName,
          title: '',
          website: normalizedWebsite,
          confidence: ver.isValid ? Math.min(85, ver.score) : 20,
          source: 'website_scrape',
          verified: ver.isValid,
          verificationScore: ver.score,
          isCatchAll: ver.isCatchAll,
          isRoleBased: ver.isRoleBased,
          linkedinUrl: domainIntel.linkedinCompanyUrl,
          phone: domainIntel.detectedPhones[0]
        });
      }
    }

    // 2. Layer 1b: Verified Email Permutator
    const permutations: EmailPermutationCandidate[] = [];
    const firstName = (input.firstName || '').trim();
    const lastName = (input.lastName || '').trim();

    if (firstName && lastName && domain && domainIntel.ssrfAllowed !== false) {
      const candidates = generateEmailPermutations(firstName, lastName, domain);
      if (candidates.length > 0) {
        const verifications = await this.emailVerifier.verifyBatch(
          candidates.map(c => c.email),
          5,
          verifyOptions
        );

        candidates.forEach((cand, idx) => {
          const verification = verifications[idx];
          permutations.push({
            email: cand.email,
            pattern: cand.pattern,
            rank: cand.rank,
            verification
          });

          if (verification.isValid) {
            let confidence = Math.max(55, 88 - (cand.rank - 1) * 6);
            if (verification.smtpVerified && !verification.isCatchAll) {
              confidence = Math.max(confidence, 96 - (cand.rank - 1) * 2);
            } else if (verification.isCatchAll) {
              confidence = Math.max(45, 70 - (cand.rank - 1) * 4);
            }

            upsertContact({
              email: cand.email,
              firstName,
              lastName,
              companyName: derivedCompanyName,
              title: input.title?.trim() || '',
              website: normalizedWebsite,
              confidence,
              source: 'email_permutator',
              verified: true,
              verificationScore: verification.score,
              isCatchAll: verification.isCatchAll,
              isRoleBased: verification.isRoleBased,
              linkedinUrl: domainIntel.linkedinUrls.find(u => u.includes('/in/')) || domainIntel.linkedinCompanyUrl
            });
          }
        });
      }
    }

    // Also verify explicit input email if provided
    if (input.email?.trim()) {
      const ver = await this.emailVerifier.verifyEmail(input.email.trim(), verifyOptions);
      if (ver.syntaxValid) {
        upsertContact({
          email: ver.email,
          firstName,
          lastName,
          companyName: derivedCompanyName,
          title: input.title?.trim() || '',
          website: normalizedWebsite,
          confidence: ver.isValid ? ver.score : 20,
          source: 'input',
          verified: ver.isValid,
          verificationScore: ver.score,
          isCatchAll: ver.isCatchAll,
          isRoleBased: ver.isRoleBased
        });
      }
    }

    const layer1Status: LeadEnrichmentResult['waterfall']['layer1Status'] =
      domainIntel.scrapeStatus === 'blocked'
        ? 'blocked'
        : domainIntel.scrapeStatus === 'failed'
          ? 'partial'
          : 'completed';

    // 3. Layer 2: BYOK External Providers (Apollo.io -> Hunter.io waterfall)
    const apolloKey = input.apolloApiKey?.trim() || process.env.APOLLO_API_KEY?.trim() || '';
    const hunterKey = input.hunterApiKey?.trim() || process.env.HUNTER_API_KEY?.trim() || '';

    let apolloStatus: LeadEnrichmentResult['waterfall']['apolloStatus'] = apolloKey
      ? 'no_results'
      : 'not_configured';
    let hunterStatus: LeadEnrichmentResult['waterfall']['hunterStatus'] = hunterKey
      ? 'no_results'
      : 'not_configured';

    let externalContactsFound = 0;

    if (apolloKey && domainIntel.ssrfAllowed !== false && (domain || derivedCompanyName)) {
      const apolloRes = await this.queryApollo({
        apiKey: apolloKey,
        domain,
        companyName: derivedCompanyName,
        firstName,
        lastName,
        email: input.email?.trim(),
        website: normalizedWebsite
      });

      apolloStatus = apolloRes.status;
      if (apolloRes.error) {
        errors.push(apolloRes.error);
      }

      if (apolloRes.contacts.length > 0) {
        const verifiedApollo = await this.verifyExternalContacts(apolloRes.contacts, verifyOptions);
        for (const c of verifiedApollo) {
          upsertContact(c);
          externalContactsFound++;
        }
      }
    } else if (apolloKey && domainIntel.ssrfAllowed === false) {
      apolloStatus = 'skipped';
    }

    const shouldRunHunter =
      Boolean(hunterKey) &&
      domainIntel.ssrfAllowed !== false &&
      Boolean(domain) &&
      (externalContactsFound === 0 || input.exhaustProviders === true);

    if (hunterKey && !shouldRunHunter) {
      hunterStatus = 'skipped';
    } else if (shouldRunHunter) {
      const hunterRes = await this.queryHunter({
        apiKey: hunterKey,
        domain,
        companyName: derivedCompanyName,
        firstName,
        lastName,
        website: normalizedWebsite
      });

      hunterStatus = hunterRes.status;
      if (hunterRes.error) {
        errors.push(hunterRes.error);
      }

      if (hunterRes.contacts.length > 0) {
        const verifiedHunter = await this.verifyExternalContacts(hunterRes.contacts, verifyOptions);
        for (const c of verifiedHunter) {
          upsertContact(c);
        }
      }
    }

    const leads = Array.from(contactMap.values()).sort((a, b) => {
      if (a.verified !== b.verified) return a.verified ? -1 : 1;
      if (b.confidence !== a.confidence) return b.confidence - a.confidence;
      return b.verificationScore - a.verificationScore;
    });

    return {
      domain,
      website: normalizedWebsite,
      companyName: derivedCompanyName,
      domainIntel,
      permutations,
      bestMatch: leads[0] || null,
      leads,
      waterfall: {
        layer1Status,
        apolloStatus,
        hunterStatus,
        errors
      }
    };
  }

  private async scrapeDomainIntelligence(
    domain: string,
    targetUrl: string,
    timeoutMs: number
  ): Promise<DomainIntelligenceResult> {
    if (!targetUrl) {
      return {
        domain,
        url: '',
        ssrfAllowed: true,
        scrapeStatus: 'skipped',
        detectedEmails: [],
        linkedinUrls: [],
        socialSignals: {},
        techSignals: [],
        detectedPhones: []
      };
    }

    const validation = await validateWebhookUrl(targetUrl, false);
    if (!validation.valid) {
      return {
        domain,
        url: targetUrl,
        ssrfAllowed: false,
        ssrfReason: validation.reason,
        scrapeStatus: 'blocked',
        error: `SSRF Block: ${validation.reason}`,
        detectedEmails: [],
        linkedinUrls: [],
        socialSignals: {},
        techSignals: [],
        detectedPhones: []
      };
    }

    try {
      let currentUrl = targetUrl;
      let res: Response | undefined;

      for (let hop = 0; hop < 3; hop++) {
        const signal =
          typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
            ? AbortSignal.timeout(timeoutMs)
            : undefined;

        res = await fetch(currentUrl, {
          method: 'GET',
          headers: {
            'User-Agent': 'MiSender-Enricher/1.0 (+https://misender.app)',
            Accept: 'text/html,application/xhtml+xml'
          },
          redirect: 'manual',
          signal
        });

        if (res.status >= 300 && res.status < 400) {
          const location = res.headers?.get?.('location');
          if (!location) break;
          const nextUrl = new URL(location, currentUrl).toString();
          const redirectCheck = await validateWebhookUrl(nextUrl, false);
          if (!redirectCheck.valid) {
            return {
              domain,
              url: nextUrl,
              ssrfAllowed: false,
              ssrfReason: redirectCheck.reason,
              scrapeStatus: 'blocked',
              error: `SSRF Block on redirect: ${redirectCheck.reason}`,
              detectedEmails: [],
              linkedinUrls: [],
              socialSignals: {},
              techSignals: [],
              detectedPhones: []
            };
          }
          currentUrl = nextUrl;
          continue;
        }
        break;
      }

      if (!res || !res.ok) {
        return {
          domain,
          url: currentUrl,
          ssrfAllowed: true,
          scrapeStatus: 'failed',
          error: `Website fetch returned HTTP ${res?.status ?? 'unknown'}`,
          detectedEmails: [],
          linkedinUrls: [],
          socialSignals: {},
          techSignals: [],
          detectedPhones: []
        };
      }

      const html = await res.text();
      const intel = extractHtmlIntelligence(html, domain, currentUrl);
      return {
        ...intel,
        ssrfAllowed: true,
        scrapeStatus: 'ok'
      };
    } catch (err: unknown) {
      return {
        domain,
        url: targetUrl,
        ssrfAllowed: true,
        scrapeStatus: 'failed',
        error: err instanceof Error ? err.message : 'Network error scraping website',
        detectedEmails: [],
        linkedinUrls: [],
        socialSignals: {},
        techSignals: [],
        detectedPhones: []
      };
    }
  }

  private async verifyExternalContacts(
    contacts: EnrichedLeadContact[],
    verifyOptions: EmailVerifyOptions
  ): Promise<EnrichedLeadContact[]> {
    const emails = contacts.map(c => c.email);
    const verifications = await this.emailVerifier.verifyBatch(emails, 5, verifyOptions);
    return contacts.map((contact, idx) => {
      const ver = verifications[idx];
      if (!ver) return contact;
      return {
        ...contact,
        verified: ver.syntaxValid ? ver.isValid : contact.verified,
        verificationScore: ver.score,
        isCatchAll: ver.isCatchAll,
        isRoleBased: ver.isRoleBased
      };
    });
  }

  private async queryApollo(params: {
    apiKey: string;
    domain: string;
    companyName: string;
    firstName: string;
    lastName: string;
    email?: string;
    website: string;
  }): Promise<{
    status: 'success' | 'no_results' | 'error';
    contacts: EnrichedLeadContact[];
    error?: string;
  }> {
    const isPersonMatch = Boolean((params.firstName && params.lastName) || params.email);
    const endpoint = isPersonMatch
      ? 'https://api.apollo.io/api/v1/people/match'
      : 'https://api.apollo.io/api/v1/mixed_people/search';

    const validation = await validateWebhookUrl(endpoint, false);
    if (!validation.valid) {
      return { status: 'error', contacts: [], error: `SSRF Block (Apollo): ${validation.reason}` };
    }

    try {
      const payload = isPersonMatch
        ? {
            first_name: params.firstName || undefined,
            last_name: params.lastName || undefined,
            domain: params.domain || undefined,
            organization_name: params.companyName || undefined,
            email: params.email || undefined,
            reveal_personal_emails: false
          }
        : {
            q_organization_domains: params.domain ? [params.domain] : undefined,
            q_organization_name: params.companyName || undefined,
            per_page: 10
          };

      const signal =
        typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
          ? AbortSignal.timeout(6000)
          : undefined;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': params.apiKey,
          'Cache-Control': 'no-cache'
        },
        body: JSON.stringify(payload),
        signal
      });

      if (!res.ok) {
        return {
          status: 'error',
          contacts: [],
          error: `Apollo API returned HTTP ${res.status}`
        };
      }

      const data = (await res.json()) as {
        person?: ApolloPersonRecord | null;
        people?: ApolloPersonRecord[];
        contacts?: ApolloPersonRecord[];
      };

      const rawList: ApolloPersonRecord[] = [];
      if (data.person) rawList.push(data.person);
      if (Array.isArray(data.people)) rawList.push(...data.people);
      if (Array.isArray(data.contacts)) rawList.push(...data.contacts);

      const contacts: EnrichedLeadContact[] = [];
      for (const p of rawList) {
        const email = typeof p.email === 'string' ? p.email.trim().toLowerCase() : '';
        if (!email || !email.includes('@')) continue;

        const emailStatus = String(p.email_status || '').toLowerCase();
        const confidence =
          emailStatus === 'verified' ? 95 : emailStatus === 'likely to engage' ? 85 : 80;

        contacts.push({
          email,
          firstName: String(p.first_name || params.firstName || ''),
          lastName: String(p.last_name || params.lastName || ''),
          companyName: String(p.organization?.name || p.organization_name || params.companyName || ''),
          title: String(p.title || ''),
          website: String(p.organization?.website_url || params.website || ''),
          confidence,
          source: 'apollo',
          verified: emailStatus === 'verified',
          verificationScore: confidence,
          linkedinUrl: typeof p.linkedin_url === 'string' ? p.linkedin_url : undefined
        });
      }

      return {
        status: contacts.length > 0 ? 'success' : 'no_results',
        contacts
      };
    } catch (err: unknown) {
      return {
        status: 'error',
        contacts: [],
        error: `Apollo request failed: ${err instanceof Error ? err.message : 'Unknown error'}`
      };
    }
  }

  private async queryHunter(params: {
    apiKey: string;
    domain: string;
    companyName: string;
    firstName: string;
    lastName: string;
    website: string;
  }): Promise<{
    status: 'success' | 'no_results' | 'error';
    contacts: EnrichedLeadContact[];
    error?: string;
  }> {
    const isEmailFinder = Boolean(params.firstName && params.lastName && params.domain);
    const endpoint = isEmailFinder
      ? `https://api.hunter.io/v2/email-finder?domain=${encodeURIComponent(params.domain)}&first_name=${encodeURIComponent(params.firstName)}&last_name=${encodeURIComponent(params.lastName)}&api_key=${encodeURIComponent(params.apiKey)}`
      : `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(params.domain)}&api_key=${encodeURIComponent(params.apiKey)}`;

    const validation = await validateWebhookUrl(endpoint, false);
    if (!validation.valid) {
      return { status: 'error', contacts: [], error: `SSRF Block (Hunter): ${validation.reason}` };
    }

    try {
      const signal =
        typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
          ? AbortSignal.timeout(6000)
          : undefined;

      const res = await fetch(endpoint, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal
      });

      if (!res.ok) {
        return {
          status: 'error',
          contacts: [],
          error: `Hunter API returned HTTP ${res.status}`
        };
      }

      const payload = (await res.json()) as {
        data?: {
          email?: string;
          score?: number;
          first_name?: string;
          last_name?: string;
          position?: string;
          company?: string;
          organization?: string;
          linkedin?: string;
          linkedin_url?: string;
          verification?: { status?: string };
          emails?: Array<{
            value?: string;
            confidence?: number;
            first_name?: string;
            last_name?: string;
            position?: string;
            linkedin?: string;
            verification?: { status?: string };
          }>;
        };
      };

      const contacts: EnrichedLeadContact[] = [];
      const data = payload?.data;

      if (data?.email) {
        const score = typeof data.score === 'number' ? data.score : 80;
        const verStatus = String(data.verification?.status || '').toLowerCase();
        contacts.push({
          email: data.email.trim().toLowerCase(),
          firstName: String(data.first_name || params.firstName || ''),
          lastName: String(data.last_name || params.lastName || ''),
          companyName: String(data.company || data.organization || params.companyName || ''),
          title: String(data.position || ''),
          website: params.website,
          confidence: score,
          source: 'hunter',
          verified: verStatus === 'valid' || score >= 70,
          verificationScore: score,
          linkedinUrl: data.linkedin || data.linkedin_url
        });
      }

      if (Array.isArray(data?.emails)) {
        for (const item of data.emails) {
          const email = typeof item.value === 'string' ? item.value.trim().toLowerCase() : '';
          if (!email || !email.includes('@')) continue;
          const conf = typeof item.confidence === 'number' ? item.confidence : 75;
          const verStatus = String(item.verification?.status || '').toLowerCase();
          contacts.push({
            email,
            firstName: String(item.first_name || ''),
            lastName: String(item.last_name || ''),
            companyName: String(data.organization || params.companyName || ''),
            title: String(item.position || ''),
            website: params.website,
            confidence: conf,
            source: 'hunter',
            verified: verStatus === 'valid' || conf >= 70,
            verificationScore: conf,
            linkedinUrl: item.linkedin
          });
        }
      }

      return {
        status: contacts.length > 0 ? 'success' : 'no_results',
        contacts
      };
    } catch (err: unknown) {
      return {
        status: 'error',
        contacts: [],
        error: `Hunter request failed: ${err instanceof Error ? err.message : 'Unknown error'}`
      };
    }
  }
}

interface ApolloPersonRecord {
  email?: string;
  email_status?: string;
  first_name?: string;
  last_name?: string;
  title?: string;
  linkedin_url?: string;
  organization_name?: string;
  organization?: {
    name?: string;
    website_url?: string;
  };
}
