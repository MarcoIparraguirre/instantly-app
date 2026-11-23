import { NextRequest, NextResponse } from 'next/server';
import { container } from '@/core/container';
import { DnsCheckerService } from '@/core/services/DnsCheckerService';
import {
  DnsBlueprintOptions,
  DnsWizardService,
  DmarcPolicy,
  EspProvider,
  parseEspProvider,
} from '@/core/services/DnsWizardService';

function getWizardService(): DnsWizardService {
  const checker = container?.dnsChecker || new DnsCheckerService();
  return new DnsWizardService(checker);
}

function parseDmarcPolicy(raw: unknown): { value?: DmarcPolicy; valid: boolean } {
  if (raw === undefined || raw === null || raw === '') {
    return { value: undefined, valid: true };
  }
  if (raw === 'none' || raw === 'quarantine' || raw === 'reject') {
    return { value: raw, valid: true };
  }
  return { valid: false };
}

function resolveProvider(rawProvider: unknown): { provider?: EspProvider; error?: string } {
  if (rawProvider === undefined || rawProvider === null || rawProvider === '') {
    return { provider: 'google_workspace' };
  }
  const parsed = parseEspProvider(rawProvider);
  if (!parsed) {
    return {
      error:
        'Invalid provider. Expected one of: google_workspace, microsoft_365, zoho, resend, amazon_ses, mailgun, custom',
    };
  }
  return { provider: parsed };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const domain = searchParams.get('domain');
    if (!domain || !domain.trim()) {
      return NextResponse.json(
        { error: 'Query parameter "domain" is required' },
        { status: 400 }
      );
    }

    const { provider, error: providerError } = resolveProvider(searchParams.get('provider'));
    if (providerError || !provider) {
      return NextResponse.json({ error: providerError }, { status: 400 });
    }

    const dmarcPolicyCheck = parseDmarcPolicy(searchParams.get('dmarcPolicy'));
    if (!dmarcPolicyCheck.valid) {
      return NextResponse.json(
        { error: 'Invalid dmarcPolicy. Expected "none", "quarantine", or "reject".' },
        { status: 400 }
      );
    }

    const options: DnsBlueprintOptions = {
      dkimSelector: searchParams.get('dkimSelector') || undefined,
      trackingSubdomain: searchParams.get('trackingSubdomain') || undefined,
      dmarcPolicy: dmarcPolicyCheck.value,
      dmarcReportEmail: searchParams.get('dmarcReportEmail') || undefined,
    };

    const blueprint = await getWizardService().generateDnsBlueprint(domain, provider, options);
    return NextResponse.json(blueprint);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to generate DNS blueprint';
    const isClientError =
      message.startsWith('Invalid ') || message.startsWith('Unsupported ');
    return NextResponse.json({ error: message }, { status: isClientError ? 400 : 500 });
  }
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

    const domain = typeof body.domain === 'string' ? body.domain.trim() : '';
    if (!domain) {
      return NextResponse.json({ error: 'Field "domain" is required' }, { status: 400 });
    }

    const { provider, error: providerError } = resolveProvider(body.provider);
    if (providerError || !provider) {
      return NextResponse.json({ error: providerError }, { status: 400 });
    }

    const rawAction = typeof body.action === 'string' ? body.action.trim() : 'preview';
    if (rawAction !== 'preview' && rawAction !== 'provision_cloudflare') {
      return NextResponse.json(
        { error: 'Invalid action. Expected "preview" or "provision_cloudflare".' },
        { status: 400 }
      );
    }

    const dmarcPolicyCheck = parseDmarcPolicy(body.dmarcPolicy);
    if (!dmarcPolicyCheck.valid) {
      return NextResponse.json(
        { error: 'Invalid dmarcPolicy. Expected "none", "quarantine", or "reject".' },
        { status: 400 }
      );
    }

    const wizard = getWizardService();
    const trackingSubdomain =
      typeof body.trackingSubdomain === 'string' ? body.trackingSubdomain : undefined;
    const dmarcReportEmail =
      typeof body.dmarcReportEmail === 'string' ? body.dmarcReportEmail : undefined;

    if (rawAction === 'preview') {
      const blueprint = await wizard.generateDnsBlueprint(domain, provider, {
        dkimSelector: typeof body.dkimSelector === 'string' ? body.dkimSelector : undefined,
        trackingSubdomain,
        dmarcPolicy: dmarcPolicyCheck.value,
        dmarcReportEmail,
      });
      return NextResponse.json({ action: 'preview', ...blueprint });
    }

    const cloudflareApiToken =
      typeof body.cloudflareApiToken === 'string' ? body.cloudflareApiToken.trim() : '';
    const cloudflareZoneId =
      typeof body.cloudflareZoneId === 'string' ? body.cloudflareZoneId.trim() : '';

    if (!cloudflareApiToken || !cloudflareZoneId) {
      return NextResponse.json(
        {
          error:
            'Both "cloudflareApiToken" and "cloudflareZoneId" are required for provision_cloudflare',
        },
        { status: 400 }
      );
    }

    const result = await wizard.provisionCloudflareDns({
      domain,
      provider,
      cloudflareApiToken,
      cloudflareZoneId,
      trackingSubdomain,
      dmarcPolicy: dmarcPolicyCheck.value,
      dmarcReportEmail,
    });

    if (result.fatalError) {
      return NextResponse.json(
        {
          error: result.errors[0]?.reason || 'Cloudflare DNS auto-provisioning failed',
          action: 'provision_cloudflare',
          ...result,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      action: 'provision_cloudflare',
      ...result,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'DNS wizard request failed';
    const isClientError =
      message.startsWith('Invalid ') ||
      message.startsWith('Unsupported ') ||
      message.includes('is required');
    return NextResponse.json({ error: message }, { status: isClientError ? 400 : 500 });
  }
}
