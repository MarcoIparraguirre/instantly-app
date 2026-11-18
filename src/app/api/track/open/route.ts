import { NextRequest, NextResponse } from 'next/server';
import { container } from '@/core/container';
import { checkRateLimit } from '@/core/security/rateLimiter';

// 1x1 transparent GIF
const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

export async function GET(req: NextRequest) {
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';
  const rateCheck = checkRateLimit('track-open', clientIp, 180, 60 * 1000);
  
  if (!rateCheck.allowed) {
    return new NextResponse(TRANSPARENT_GIF, {
      status: 200,
      headers: {
        'Content-Type': 'image/gif',
        'Cache-Control': 'no-store, no-cache, must-revalidate'
      }
    });
  }

  const leadId = req.nextUrl.searchParams.get('leadId');
  const campaignId = req.nextUrl.searchParams.get('campaignId');

  try {
    if (leadId) {
      const lead = await container.leadRepo.getLeadById(leadId);
      if (lead && lead.status === 'sent') {
        lead.status = 'opened';
        if (lead.customVariables && 'ESTADO' in lead.customVariables) {
          lead.customVariables = { ...lead.customVariables, ESTADO: 'Abierto' };
        }
        await container.leadRepo.updateLead(lead);

        const targetCampId = campaignId || lead.campaignId;
        if (targetCampId) {
          const camp = await container.campaignRepo.getCampaignById(targetCampId);
          if (camp) {
            camp.stats.opened = (camp.stats.opened || 0) + 1;
            await container.campaignRepo.saveCampaign(camp);
          }
        }
      }
    }
  } catch (err) {
    console.error('Open tracking error:', err);
  }

  return new NextResponse(TRANSPARENT_GIF, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      Pragma: 'no-cache',
      Expires: '0'
    }
  });
}
