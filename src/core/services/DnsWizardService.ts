import { DnsAuditResult } from '@/types';
import { DnsCheckerService } from './DnsCheckerService';

export type EspProvider =
  | 'google_workspace'
  | 'microsoft_365'
  | 'zoho'
  | 'resend'
  | 'amazon_ses'
  | 'mailgun'
  | 'custom';

export type RegistrarId = 'cloudflare' | 'godaddy' | 'namecheap' | 'nic_ar';

export type DmarcPolicy = 'none' | 'quarantine' | 'reject';

export type DnsRecordStatus = 'valid' | 'missing' | 'needs_update';

export interface DnsBlueprintOptions {
  dkimSelector?: string;
  trackingSubdomain?: string;
  dmarcPolicy?: DmarcPolicy;
  dmarcReportEmail?: string;
}

export interface DnsBlueprintRecord {
  id: 'spf' | 'dkim' | 'dmarc' | 'tracking';
  category: 'SPF' | 'DKIM' | 'DMARC' | 'CNAME';
  host: string;
  fqdn: string;
  type: 'TXT' | 'CNAME';
  value: string;
  ttl: number;
  status: DnsRecordStatus;
  currentValue?: string;
  notes: {
    es: string;
    en: string;
  };
}

export interface RegistrarGuide {
  id: RegistrarId;
  name: string;
  supportsApiAutoProvision: boolean;
  hostFormat: {
    es: string;
    en: string;
  };
  importantNotes: {
    es: string;
    en: string;
  };
  steps: {
    es: string[];
    en: string[];
  };
}

export interface DnsBlueprintResult {
  domain: string;
  provider: EspProvider;
  providerLabel: string;
  dkimSelector: string;
  trackingSubdomain: string;
  audit: DnsAuditResult;
  records: DnsBlueprintRecord[];
  registrarGuides: RegistrarGuide[];
  summary: {
    total: number;
    valid: number;
    missing: number;
    needsUpdate: number;
    readyToSend: boolean;
  };
}

export interface CloudflareProvisionInput {
  domain: string;
  provider: EspProvider;
  cloudflareApiToken: string;
  cloudflareZoneId: string;
  trackingSubdomain?: string;
  dmarcPolicy?: DmarcPolicy;
  dmarcReportEmail?: string;
}

export interface CloudflareProvisionedRecord {
  category: 'SPF' | 'DMARC' | 'CNAME';
  type: 'TXT' | 'CNAME';
  host: string;
  fqdn: string;
  value: string;
  ttl: number;
  proxied?: boolean;
  cloudflareRecordId?: string;
}

export interface CloudflareSkippedRecord {
  category: 'SPF' | 'DMARC' | 'CNAME';
  type: 'TXT' | 'CNAME';
  host: string;
  fqdn: string;
  value: string;
  existingValue?: string;
  reason: string;
}

export interface CloudflareProvisionError {
  category: 'SPF' | 'DMARC' | 'CNAME' | 'ZONE';
  type: 'TXT' | 'CNAME' | 'GET';
  host: string;
  fqdn: string;
  reason: string;
  statusCode?: number;
}

export interface CloudflareProvisionResult {
  success: boolean;
  fatalError?: boolean;
  httpStatus?: number;
  domain: string;
  provider: EspProvider;
  zoneId: string;
  provisioned: CloudflareProvisionedRecord[];
  skipped: CloudflareSkippedRecord[];
  errors: CloudflareProvisionError[];
}

interface EspPresetConfig {
  id: EspProvider;
  label: string;
  spfIncludeToken: string;
  spfRecord: string;
  defaultDkimSelector: string;
  dkimType: 'TXT' | 'CNAME';
  dkimTemplate: (selector: string, domain: string) => string;
  dkimNote: { es: string; en: string };
}

const TRACKING_CNAME_TARGET = 'prox.instantly.ai';
const DEFAULT_TTL = 3600;
const DOMAIN_REGEX =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
const LABEL_REGEX =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i;

export const SUPPORTED_ESP_PROVIDERS: readonly EspProvider[] = [
  'google_workspace',
  'microsoft_365',
  'zoho',
  'resend',
  'amazon_ses',
  'mailgun',
  'custom',
] as const;

export const ESP_DNS_PRESETS: Record<EspProvider, EspPresetConfig> = {
  google_workspace: {
    id: 'google_workspace',
    label: 'Google Workspace',
    spfIncludeToken: 'include:_spf.google.com',
    spfRecord: 'v=spf1 include:_spf.google.com ~all',
    defaultDkimSelector: 'google',
    dkimType: 'TXT',
    dkimTemplate: () => 'v=DKIM1; k=rsa; p=<YOUR_GOOGLE_WORKSPACE_DKIM_PUBLIC_KEY>',
    dkimNote: {
      es: 'Genera la clave DKIM de 2048 bits en Google Admin Console > Gmail > Autenticar correo.',
      en: 'Generate the 2048-bit DKIM key in Google Admin Console > Gmail > Authenticate email.',
    },
  },
  microsoft_365: {
    id: 'microsoft_365',
    label: 'Microsoft 365',
    spfIncludeToken: 'include:spf.protection.outlook.com',
    spfRecord: 'v=spf1 include:spf.protection.outlook.com -all',
    defaultDkimSelector: 'selector1',
    dkimType: 'CNAME',
    dkimTemplate: (selector, domain) =>
      `${selector}-${domain.replace(/\./g, '-')}._domainkey.<YOUR_TENANT>.onmicrosoft.com`,
    dkimNote: {
      es: 'Habilita DKIM en Microsoft 365 Defender > Email authentication > DKIM y copia el CNAME selector1/selector2.',
      en: 'Enable DKIM in Microsoft 365 Defender > Email authentication > DKIM and copy the selector1/selector2 CNAME.',
    },
  },
  zoho: {
    id: 'zoho',
    label: 'Zoho Mail',
    spfIncludeToken: 'include:zoho.com',
    spfRecord: 'v=spf1 include:zoho.com ~all',
    defaultDkimSelector: 'zmail',
    dkimType: 'TXT',
    dkimTemplate: () => 'v=DKIM1; k=rsa; p=<YOUR_ZOHO_DKIM_PUBLIC_KEY>',
    dkimNote: {
      es: 'Obtén el selector y clave TXT pública en Zoho Mail Admin Console > Domains > Email Configuration > DKIM.',
      en: 'Copy the selector and public TXT key from Zoho Mail Admin Console > Domains > Email Configuration > DKIM.',
    },
  },
  resend: {
    id: 'resend',
    label: 'Resend',
    spfIncludeToken: 'include:amazonses.com',
    spfRecord: 'v=spf1 include:amazonses.com ~all',
    defaultDkimSelector: 'resend',
    dkimType: 'TXT',
    dkimTemplate: () => 'p=<YOUR_RESEND_DKIM_PUBLIC_KEY>',
    dkimNote: {
      es: 'Copia la clave DKIM de Resend Dashboard > Domains > DNS Records (selector resend._domainkey).',
      en: 'Copy the DKIM key from Resend Dashboard > Domains > DNS Records (resend._domainkey selector).',
    },
  },
  amazon_ses: {
    id: 'amazon_ses',
    label: 'Amazon SES',
    spfIncludeToken: 'include:amazonses.com',
    spfRecord: 'v=spf1 include:amazonses.com ~all',
    defaultDkimSelector: 'ses',
    dkimType: 'CNAME',
    dkimTemplate: (selector) => `${selector}.dkim.amazonses.com`,
    dkimNote: {
      es: 'En AWS SES Console > Verified Identities > Easy DKIM, publica los 3 CNAMEs generados por SES.',
      en: 'In AWS SES Console > Verified Identities > Easy DKIM, publish the 3 CNAME tokens generated by SES.',
    },
  },
  mailgun: {
    id: 'mailgun',
    label: 'Mailgun',
    spfIncludeToken: 'include:mailgun.org',
    spfRecord: 'v=spf1 include:mailgun.org ~all',
    defaultDkimSelector: 'smtp',
    dkimType: 'TXT',
    dkimTemplate: () => 'k=rsa; p=<YOUR_MAILGUN_DKIM_PUBLIC_KEY>',
    dkimNote: {
      es: 'Copia el registro TXT de Mailgun > Sending > Domains > Domain Settings > DNS Records.',
      en: 'Copy the TXT record from Mailgun > Sending > Domains > Domain Settings > DNS Records.',
    },
  },
  custom: {
    id: 'custom',
    label: 'Custom SMTP',
    spfIncludeToken: '',
    spfRecord: 'v=spf1 a mx ~all',
    defaultDkimSelector: 'default',
    dkimType: 'TXT',
    dkimTemplate: () => 'v=DKIM1; k=rsa; p=<YOUR_CUSTOM_DKIM_PUBLIC_KEY>',
    dkimNote: {
      es: 'Genera el par de claves RSA 2048-bit en tu servidor SMTP/MTA y publica la clave pública aquí.',
      en: 'Generate a 2048-bit RSA keypair on your SMTP/MTA server and publish the public key here.',
    },
  },
};

export function parseEspProvider(value: unknown): EspProvider | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if ((SUPPORTED_ESP_PROVIDERS as readonly string[]).includes(normalized)) {
    return normalized as EspProvider;
  }
  return null;
}

export function normalizeDomain(rawDomain: string): string {
  const cleaned = (rawDomain || '')
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '')
    .replace(/\.+$/, '');

  if (!cleaned || !DOMAIN_REGEX.test(cleaned)) {
    throw new Error(`Invalid domain name: "${rawDomain}"`);
  }
  return cleaned;
}

function sanitizeTrackingSubdomain(raw: string | undefined, cleanDomain: string): string {
  if (!raw || !raw.trim()) return 'track';
  let sub = raw.toLowerCase().trim().replace(/\.+$/, '');
  const suffix = `.${cleanDomain}`;
  if (sub.endsWith(suffix)) {
    sub = sub.slice(0, -suffix.length);
  }
  sub = sub.replace(/^\.+|\.+$/g, '');
  if (!sub || !LABEL_REGEX.test(sub)) {
    throw new Error(`Invalid tracking subdomain: "${raw}"`);
  }
  return sub;
}

function sanitizeDkimSelector(raw: string | undefined, fallback: string): string {
  if (!raw || !raw.trim()) return fallback;
  const cleaned = raw.trim().replace(/\.+$/, '');
  if (!LABEL_REGEX.test(cleaned)) {
    throw new Error(`Invalid DKIM selector: "${raw}"`);
  }
  return cleaned;
}

function normalizeDmarcPolicy(policy?: string): DmarcPolicy {
  if (policy === 'none' || policy === 'quarantine' || policy === 'reject') {
    return policy;
  }
  return 'quarantine';
}

function buildDmarcValue(policy: DmarcPolicy, reportEmail?: string): string {
  const cleanEmail = (reportEmail || '').trim().replace(/^mailto:/i, '').replace(/[\s;]/g, '');
  const ruaPart = cleanEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)
    ? ` rua=mailto:${cleanEmail};`
    : '';
  return `v=DMARC1; p=${policy};${ruaPart} pct=100`;
}

function normalizeCfHost(name: string, domain: string): string {
  const cleaned = (name || '').toLowerCase().trim().replace(/\.+$/, '');
  if (cleaned === '@') return domain;
  return cleaned;
}

function normalizeTxtContent(content: string): string {
  return (content || '')
    .trim()
    .replace(/^"+|"+$/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function buildRegistrarGuides(
  domain: string,
  providerLabel: string,
  trackingSubdomain: string,
  dkimSelector: string
): RegistrarGuide[] {
  return [
    {
      id: 'cloudflare',
      name: 'Cloudflare',
      supportsApiAutoProvision: true,
      hostFormat: {
        es: 'Usa "@" para la raíz del dominio, "_dmarc" para DMARC y solo el subdominio (ej. "' + trackingSubdomain + '") para el tracking.',
        en: 'Use "@" for the root domain, "_dmarc" for DMARC, and only the subdomain (e.g. "' + trackingSubdomain + '") for tracking.',
      },
      importantNotes: {
        es: 'CRÍTICO: En el registro CNAME de tracking (' + trackingSubdomain + '.' + domain + '), desactiva el proxy naranja de Cloudflare y déjalo en "Solo DNS" (nube gris).',
        en: 'CRITICAL: On the tracking CNAME record (' + trackingSubdomain + '.' + domain + '), disable Cloudflare orange proxy and keep it set to "DNS Only" (gray cloud).',
      },
      steps: {
        es: [
          `Inicia sesión en Cloudflare y selecciona la zona ${domain}.`,
          'Ve a DNS > Records y haz clic en "Add record".',
          `Crea o actualiza los registros TXT de SPF (@) y DMARC (_dmarc) para ${providerLabel}.`,
          `Agrega el registro CNAME "${trackingSubdomain}" apuntando a ${TRACKING_CNAME_TARGET} con Proxy status en "DNS only" (nube gris).`,
          `Publica la clave DKIM en "${dkimSelector}._domainkey" o utiliza la provisión automática en 1 clic con tu API Token.`,
        ],
        en: [
          `Log in to Cloudflare and select the ${domain} zone.`,
          'Navigate to DNS > Records and click "Add record".',
          `Create or update the SPF (@) and DMARC (_dmarc) TXT records for ${providerLabel}.`,
          `Add the CNAME record "${trackingSubdomain}" pointing to ${TRACKING_CNAME_TARGET} with Proxy status set to "DNS only" (gray cloud).`,
          `Publish the DKIM record at "${dkimSelector}._domainkey" or run 1-click auto-provisioning with your API Token.`,
        ],
      },
    },
    {
      id: 'godaddy',
      name: 'GoDaddy',
      supportsApiAutoProvision: false,
      hostFormat: {
        es: 'En el campo "Nombre / Name", usa "@" para el dominio raíz y no repitas ".' + domain + '" en los subdominios.',
        en: 'In the "Name" field, use "@" for the root domain and do not append ".' + domain + '" to subdomains.',
      },
      importantNotes: {
        es: 'Pega el valor TXT sin comillas adicionales. Si ya existe otro registro TXT que empiece con v=spf1, fusiónalos en un único registro.',
        en: 'Paste TXT values without extra surrounding quotes. If another v=spf1 TXT record already exists, merge them into a single SPF record.',
      },
      steps: {
        es: [
          `Abre GoDaddy Domain Portfolio, selecciona ${domain} y entra en DNS > DNS Records.`,
          'Haz clic en "Add New Record" y selecciona tipo TXT con Nombre "@" para el registro SPF.',
          `Agrega un registro TXT con Nombre "_dmarc" para la política DMARC.`,
          `Agrega un registro CNAME con Nombre "${trackingSubdomain}" y Valor "${TRACKING_CNAME_TARGET}" con TTL de 1 Hour.`,
          `Crea el registro DKIM en "${dkimSelector}._domainkey" según el valor generado por ${providerLabel}.`,
        ],
        en: [
          `Open GoDaddy Domain Portfolio, select ${domain}, and go to DNS > DNS Records.`,
          'Click "Add New Record", choose type TXT with Name "@" for your SPF record.',
          'Add a TXT record with Name "_dmarc" for your DMARC policy.',
          `Add a CNAME record with Name "${trackingSubdomain}" and Value "${TRACKING_CNAME_TARGET}" with TTL set to 1 Hour.`,
          `Create the DKIM record at "${dkimSelector}._domainkey" using the value generated by ${providerLabel}.`,
        ],
      },
    },
    {
      id: 'namecheap',
      name: 'Namecheap',
      supportsApiAutoProvision: false,
      hostFormat: {
        es: 'En "Host", escribe "@", "_dmarc", "' + dkimSelector + '._domainkey" o "' + trackingSubdomain + '". Namecheap agrega ".' + domain + '" automáticamente.',
        en: 'In "Host", enter "@", "_dmarc", "' + dkimSelector + '._domainkey", or "' + trackingSubdomain + '". Namecheap appends ".' + domain + '" automatically.',
      },
      importantNotes: {
        es: 'Asegúrate de usar "BasicDNS" o "PremiumDNS" en Namecheap; si tus Nameservers apuntan a Cloudflare u otro proveedor, edita los registros allí.',
        en: 'Ensure Nameservers are set to Namecheap BasicDNS/PremiumDNS; if delegated to Cloudflare or another host, manage records there instead.',
      },
      steps: {
        es: [
          `Ingresa a Namecheap > Domain List > Manage junto a ${domain}.`,
          'Abre la pestaña "Advanced DNS" y presiona "Add New Record".',
          'Selecciona "TXT Record" con Host "@" y pega el valor SPF (TTL Automatic).',
          `Crea otro "TXT Record" con Host "_dmarc" y el registro DKIM en "${dkimSelector}._domainkey".`,
          `Agrega un "CNAME Record" con Host "${trackingSubdomain}" y Target "${TRACKING_CNAME_TARGET}".`,
        ],
        en: [
          `Go to Namecheap > Domain List > Manage next to ${domain}.`,
          'Open the "Advanced DNS" tab and click "Add New Record".',
          'Select "TXT Record" with Host "@" and paste the SPF value (TTL Automatic).',
          `Create another "TXT Record" with Host "_dmarc" and the DKIM record at "${dkimSelector}._domainkey".`,
          `Add a "CNAME Record" with Host "${trackingSubdomain}" and Target "${TRACKING_CNAME_TARGET}".`,
        ],
      },
    },
    {
      id: 'nic_ar',
      name: 'NIC.ar',
      supportsApiAutoProvision: false,
      hostFormat: {
        es: 'NIC.ar gestiona la delegación de Nameservers (.ar / .com.ar). Los registros TXT/CNAME se cargan en el DNS delegado (o en la zona directa si usás DNS propio).',
        en: 'NIC.ar manages Nameserver delegation (.ar / .com.ar). Publish TXT/CNAME records in your delegated DNS host (or directly in your zone file).',
      },
      importantNotes: {
        es: 'Recomendado para dominios .com.ar / .ar: delegá los NS en NIC.ar (Trámites a Distancia) hacia Cloudflare para habilitar auto-provisión DNS en 1 clic. La propagación en .ar puede demorar de 1 a 24 horas.',
        en: 'Recommended for .com.ar / .ar domains: delegate Nameservers in NIC.ar (via Trámites a Distancia) to Cloudflare to enable 1-click auto-provisioning. Propagation for .ar zones takes 1–24 hours.',
      },
      steps: {
        es: [
          `Ingresa a NIC.ar mediante Trámites a Distancia (TAD) con tu CUIT/Clave Fiscal y selecciona ${domain}.`,
          'Si aún no tienes DNS externo, ve a "Delegar" y apunta los Nameservers (NS) a Cloudflare o tu servidor DNS autorizado.',
          `En el panel DNS delegado (o editor de zona vinculado a ${domain}), crea los registros TXT de SPF (@ o ${domain}.) y DMARC (_dmarc).`,
          `Publica el registro DKIM (${dkimSelector}._domainkey) y el CNAME de tracking (${trackingSubdomain} -> ${TRACKING_CNAME_TARGET}).`,
          'Guarda los cambios en NIC.ar / DNS y vuelve aquí para ejecutar la auditoría DNS luego de la propagación.',
        ],
        en: [
          `Sign in to NIC.ar via Trámites a Distancia (TAD) and select ${domain}.`,
          'If you do not have an external DNS zone yet, open "Delegar" and point your Nameservers (NS) to Cloudflare or your authoritative DNS host.',
          `In your delegated DNS panel for ${domain}, create the SPF (@ or ${domain}.) and DMARC (_dmarc) TXT records.`,
          `Publish the DKIM record (${dkimSelector}._domainkey) and tracking CNAME (${trackingSubdomain} -> ${TRACKING_CNAME_TARGET}).`,
          'Save changes and re-run the DNS audit here once .ar propagation completes.',
        ],
      },
    },
  ];
}

export class DnsWizardService {
  constructor(private dnsChecker: DnsCheckerService = new DnsCheckerService()) {}

  async generateDnsBlueprint(
    domain: string,
    provider: EspProvider = 'google_workspace',
    options: DnsBlueprintOptions = {}
  ): Promise<DnsBlueprintResult> {
    const cleanDomain = normalizeDomain(domain);
    const preset = ESP_DNS_PRESETS[provider];
    if (!preset) {
      throw new Error(`Unsupported ESP provider: "${provider}"`);
    }

    const dkimSelector = sanitizeDkimSelector(options.dkimSelector, preset.defaultDkimSelector);
    const trackingSubdomain = sanitizeTrackingSubdomain(options.trackingSubdomain, cleanDomain);
    const dmarcPolicy = normalizeDmarcPolicy(options.dmarcPolicy);
    const dmarcValue = buildDmarcValue(dmarcPolicy, options.dmarcReportEmail);

    const audit = await this.dnsChecker.auditDomain(cleanDomain, dkimSelector);

    // Determine SPF status
    let spfStatus: DnsRecordStatus = 'missing';
    if (audit.spf.valid && audit.spf.record) {
      if (provider === 'custom' || audit.spf.record.toLowerCase().includes(preset.spfIncludeToken)) {
        spfStatus = 'valid';
      } else {
        spfStatus = 'needs_update';
      }
    }

    // Determine DKIM status
    let dkimStatus: DnsRecordStatus = 'missing';
    if (audit.dkim.valid) {
      if (
        options.dkimSelector &&
        audit.dkim.selector &&
        audit.dkim.selector.toLowerCase() !== dkimSelector.toLowerCase()
      ) {
        dkimStatus = 'needs_update';
      } else {
        dkimStatus = 'valid';
      }
    }

    // Determine DMARC status
    let dmarcStatus: DnsRecordStatus = 'missing';
    if (audit.dmarc.valid && audit.dmarc.record) {
      const lowerDmarc = audit.dmarc.record.toLowerCase();
      const policyMatches = lowerDmarc.includes(`p=${dmarcPolicy}`);
      const reportMatches =
        !options.dmarcReportEmail ||
        lowerDmarc.includes(options.dmarcReportEmail.trim().toLowerCase());
      dmarcStatus = policyMatches && reportMatches ? 'valid' : 'needs_update';
    }

    // Determine Tracking CNAME status
    let trackingStatus: DnsRecordStatus = 'missing';
    if (audit.ctd.valid) {
      const detailsLower = (audit.ctd.details || '').toLowerCase();
      const targetMatch = detailsLower.match(/->\s*(.+)$/);
      const hasDifferentTarget =
        targetMatch && !targetMatch[1].includes(TRACKING_CNAME_TARGET);
      const hasDifferentSubdomain =
        trackingSubdomain !== 'track' &&
        detailsLower.includes('en ') &&
        !detailsLower.includes(`${trackingSubdomain}.${cleanDomain}`);
      trackingStatus = hasDifferentTarget || hasDifferentSubdomain ? 'needs_update' : 'valid';
    }

    const records: DnsBlueprintRecord[] = [
      {
        id: 'spf',
        category: 'SPF',
        host: '@',
        fqdn: cleanDomain,
        type: 'TXT',
        value: preset.spfRecord,
        ttl: DEFAULT_TTL,
        status: spfStatus,
        currentValue: audit.spf.record,
        notes: {
          es:
            spfStatus === 'needs_update'
              ? `Ya existe un SPF (${audit.spf.record}). Combínalo incluyendo "${preset.spfIncludeToken}" sin duplicar registros v=spf1.`
              : `Autoriza los servidores de ${preset.label} para enviar correos en nombre de ${cleanDomain}.`,
          en:
            spfStatus === 'needs_update'
              ? `An SPF record already exists (${audit.spf.record}). Merge "${preset.spfIncludeToken}" into it rather than creating a second v=spf1 record.`
              : `Authorizes ${preset.label} mail servers to send on behalf of ${cleanDomain}.`,
        },
      },
      {
        id: 'dkim',
        category: 'DKIM',
        host: `${dkimSelector}._domainkey`,
        fqdn: `${dkimSelector}._domainkey.${cleanDomain}`,
        type: preset.dkimType,
        value: preset.dkimTemplate(dkimSelector, cleanDomain),
        ttl: DEFAULT_TTL,
        status: dkimStatus,
        currentValue: audit.dkim.selector ? `Selector active: ${audit.dkim.selector}` : undefined,
        notes: preset.dkimNote,
      },
      {
        id: 'dmarc',
        category: 'DMARC',
        host: '_dmarc',
        fqdn: `_dmarc.${cleanDomain}`,
        type: 'TXT',
        value: dmarcValue,
        ttl: DEFAULT_TTL,
        status: dmarcStatus,
        currentValue: audit.dmarc.record,
        notes: {
          es: `Define la política de alineación y reportes DMARC (${dmarcPolicy}) para proteger la reputación de ${cleanDomain}.`,
          en: `Sets the DMARC alignment & enforcement policy (${dmarcPolicy}) to protect ${cleanDomain} domain reputation.`,
        },
      },
      {
        id: 'tracking',
        category: 'CNAME',
        host: trackingSubdomain,
        fqdn: `${trackingSubdomain}.${cleanDomain}`,
        type: 'CNAME',
        value: TRACKING_CNAME_TARGET,
        ttl: DEFAULT_TTL,
        status: trackingStatus,
        currentValue: audit.ctd.valid ? audit.ctd.details : undefined,
        notes: {
          es: 'Dominio personalizado de tracking (CTD) para aperturas y clics con mejor entregabilidad.',
          en: 'Custom Tracking Domain (CTD) for open and click tracking with higher inbox placement.',
        },
      },
    ];

    const valid = records.filter((r) => r.status === 'valid').length;
    const missing = records.filter((r) => r.status === 'missing').length;
    const needsUpdate = records.filter((r) => r.status === 'needs_update').length;

    return {
      domain: cleanDomain,
      provider,
      providerLabel: preset.label,
      dkimSelector,
      trackingSubdomain,
      audit,
      records,
      registrarGuides: buildRegistrarGuides(
        cleanDomain,
        preset.label,
        trackingSubdomain,
        dkimSelector
      ),
      summary: {
        total: records.length,
        valid,
        missing,
        needsUpdate,
        readyToSend: spfStatus === 'valid' && dkimStatus === 'valid' && dmarcStatus === 'valid',
      },
    };
  }

  async provisionCloudflareDns(
    input: CloudflareProvisionInput
  ): Promise<CloudflareProvisionResult> {
    const cleanDomain = normalizeDomain(input.domain);
    const preset = ESP_DNS_PRESETS[input.provider];
    if (!preset) {
      throw new Error(`Unsupported ESP provider: "${input.provider}"`);
    }

    const token = (input.cloudflareApiToken || '').trim();
    const zoneId = (input.cloudflareZoneId || '').trim();
    if (!token) {
      throw new Error('Cloudflare API token is required');
    }
    if (!zoneId || !/^[a-zA-Z0-9_-]+$/.test(zoneId)) {
      throw new Error('Valid Cloudflare Zone ID is required');
    }

    const trackingSubdomain = sanitizeTrackingSubdomain(input.trackingSubdomain, cleanDomain);
    const dmarcPolicy = normalizeDmarcPolicy(input.dmarcPolicy);
    const dmarcValue = buildDmarcValue(dmarcPolicy, input.dmarcReportEmail);

    const recordsEndpoint = `https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(zoneId)}/dns_records`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    const provisioned: CloudflareProvisionedRecord[] = [];
    const skipped: CloudflareSkippedRecord[] = [];
    const errors: CloudflareProvisionError[] = [];

    interface CfRecord {
      id?: string;
      type?: string;
      name?: string;
      content?: string;
    }

    let existingRecords: CfRecord[] = [];
    try {
      const listRes = await fetch(recordsEndpoint, { method: 'GET', headers });
      const listData = (await listRes.json().catch(() => ({}))) as {
        success?: boolean;
        errors?: Array<{ message?: string }>;
        result?: CfRecord[];
      };

      if (!listRes.ok || listData.success === false) {
        const msg =
          listData.errors?.map((e) => e.message).filter(Boolean).join('; ') ||
          `Cloudflare API returned HTTP ${listRes.status}`;
        errors.push({
          category: 'ZONE',
          type: 'GET',
          host: '@',
          fqdn: cleanDomain,
          reason: msg,
          statusCode: listRes.status,
        });
        return {
          success: false,
          fatalError: true,
          httpStatus: listRes.status,
          domain: cleanDomain,
          provider: input.provider,
          zoneId,
          provisioned,
          skipped,
          errors,
        };
      }

      existingRecords = Array.isArray(listData.result) ? listData.result : [];
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to query Cloudflare DNS records';
      errors.push({
        category: 'ZONE',
        type: 'GET',
        host: '@',
        fqdn: cleanDomain,
        reason: msg,
      });
      return {
        success: false,
        fatalError: true,
        httpStatus: 502,
        domain: cleanDomain,
        provider: input.provider,
        zoneId,
        provisioned,
        skipped,
        errors,
      };
    }

    const targets: Array<{
      category: 'SPF' | 'DMARC' | 'CNAME';
      type: 'TXT' | 'CNAME';
      host: string;
      fqdn: string;
      value: string;
      ttl: number;
      proxied?: boolean;
      findDuplicate: (rec: CfRecord) => string | null;
    }> = [
      {
        category: 'SPF',
        type: 'TXT',
        host: '@',
        fqdn: cleanDomain,
        value: preset.spfRecord,
        ttl: DEFAULT_TTL,
        findDuplicate: (rec) => {
          if ((rec.type || '').toUpperCase() !== 'TXT') return null;
          if (normalizeCfHost(rec.name || '', cleanDomain) !== cleanDomain) return null;
          const normContent = normalizeTxtContent(rec.content || '');
          if (!normContent.startsWith('v=spf1')) return null;
          if (
            normContent === normalizeTxtContent(preset.spfRecord) ||
            (preset.spfIncludeToken && normContent.includes(preset.spfIncludeToken.toLowerCase()))
          ) {
            return `SPF record already exists for ${cleanDomain}`;
          }
          return preset.spfIncludeToken
            ? `Existing SPF record found on ${cleanDomain}; merge "${preset.spfIncludeToken}" manually to avoid duplicate v=spf1 records`
            : `Existing SPF record already exists on ${cleanDomain}; update it manually rather than creating a duplicate v=spf1 record`;
        },
      },
      {
        category: 'DMARC',
        type: 'TXT',
        host: '_dmarc',
        fqdn: `_dmarc.${cleanDomain}`,
        value: dmarcValue,
        ttl: DEFAULT_TTL,
        findDuplicate: (rec) => {
          if ((rec.type || '').toUpperCase() !== 'TXT') return null;
          if (normalizeCfHost(rec.name || '', cleanDomain) !== `_dmarc.${cleanDomain}`) {
            return null;
          }
          const normContent = normalizeTxtContent(rec.content || '');
          if (normContent.startsWith('v=dmarc1')) {
            return `DMARC record already exists at _dmarc.${cleanDomain}`;
          }
          return null;
        },
      },
      {
        category: 'CNAME',
        type: 'CNAME',
        host: trackingSubdomain,
        fqdn: `${trackingSubdomain}.${cleanDomain}`,
        value: TRACKING_CNAME_TARGET,
        ttl: DEFAULT_TTL,
        proxied: false,
        findDuplicate: (rec) => {
          const recType = (rec.type || '').toUpperCase();
          if (recType !== 'CNAME' && recType !== 'A' && recType !== 'AAAA') return null;
          if (
            normalizeCfHost(rec.name || '', cleanDomain) !==
            `${trackingSubdomain}.${cleanDomain}`
          ) {
            return null;
          }
          return `${recType} record already exists at ${trackingSubdomain}.${cleanDomain}`;
        },
      },
    ];

    for (const target of targets) {
      let duplicateReason: string | null = null;
      let existingValue: string | undefined;

      for (const existing of existingRecords) {
        const reason = target.findDuplicate(existing);
        if (reason) {
          duplicateReason = reason;
          existingValue = existing.content;
          break;
        }
      }

      if (duplicateReason) {
        skipped.push({
          category: target.category,
          type: target.type,
          host: target.host,
          fqdn: target.fqdn,
          value: target.value,
          existingValue,
          reason: duplicateReason,
        });
        continue;
      }

      try {
        const createRes = await fetch(recordsEndpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            type: target.type,
            name: target.fqdn,
            content: target.value,
            ttl: target.ttl,
            ...(target.proxied !== undefined ? { proxied: target.proxied } : {}),
          }),
        });

        const createData = (await createRes.json().catch(() => ({}))) as {
          success?: boolean;
          errors?: Array<{ message?: string }>;
          result?: { id?: string };
        };

        if (!createRes.ok || createData.success === false) {
          const msg =
            createData.errors?.map((e) => e.message).filter(Boolean).join('; ') ||
            `Cloudflare POST returned HTTP ${createRes.status}`;
          errors.push({
            category: target.category,
            type: target.type,
            host: target.host,
            fqdn: target.fqdn,
            reason: msg,
            statusCode: createRes.status,
          });
          continue;
        }

        provisioned.push({
          category: target.category,
          type: target.type,
          host: target.host,
          fqdn: target.fqdn,
          value: target.value,
          ttl: target.ttl,
          ...(target.proxied !== undefined ? { proxied: target.proxied } : {}),
          cloudflareRecordId: createData.result?.id,
        });
      } catch (err: unknown) {
        errors.push({
          category: target.category,
          type: target.type,
          host: target.host,
          fqdn: target.fqdn,
          reason: err instanceof Error ? err.message : 'Failed to create Cloudflare DNS record',
        });
      }
    }

    return {
      success: errors.length === 0,
      domain: cleanDomain,
      provider: input.provider,
      zoneId,
      provisioned,
      skipped,
      errors,
    };
  }
}
