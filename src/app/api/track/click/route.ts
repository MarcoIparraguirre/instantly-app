import { NextRequest, NextResponse } from 'next/server';
import { container } from '@/core/container';

export async function GET(req: NextRequest) {
  const targetUrl = req.nextUrl.searchParams.get('url');
  const leadId = req.nextUrl.searchParams.get('leadId');
  const campaignId = req.nextUrl.searchParams.get('campaignId');

  try {
    if (leadId) {
      const lead = await container.leadRepo.getLeadById(leadId);
      if (lead) {
        // If lead was only sent, reading/clicking also proves they opened the email
        if (lead.status === 'sent') {
          lead.status = 'opened';
          if (lead.customVariables && 'ESTADO' in lead.customVariables) {
            lead.customVariables = { ...lead.customVariables, ESTADO: 'Abierto' };
          }
          await container.leadRepo.updateLead(lead);
        }

        const targetCampId = campaignId || lead.campaignId;
        if (targetCampId) {
          const camp = await container.campaignRepo.getCampaignById(targetCampId);
          if (camp) {
            // Track click in campaign opportunities or stats if needed
            camp.stats.opportunities = (camp.stats.opportunities || 0) + 1;
            await container.campaignRepo.saveCampaign(camp);
          }
        }

        // Dispatch Webhook event
        container.webhookDispatcher.trigger('lead.clicked', {
          leadId: lead.id,
          leadEmail: lead.email,
          campaignId: targetCampId,
          targetUrl
        }).catch(() => {});
      }
    }
  } catch (err) {
    console.error('Click tracking error:', err);
  }

  // Safe redirect
  if (targetUrl && (targetUrl.startsWith('http://') || targetUrl.startsWith('https://'))) {
    return NextResponse.redirect(new URL(targetUrl), 302);
  }

  return NextResponse.redirect(new URL('/', req.url), 302);
}
