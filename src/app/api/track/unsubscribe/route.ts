import { NextRequest, NextResponse } from 'next/server';
import { container } from '@/core/container';
import { checkRateLimit } from '@/core/security/rateLimiter';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export async function GET(req: NextRequest) {
  return handleUnsubscribe(req);
}

export async function POST(req: NextRequest) {
  return handleUnsubscribe(req);
}

async function handleUnsubscribe(req: NextRequest) {
  try {
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';
    const rateCheck = checkRateLimit('track-unsub', clientIp, 30, 60 * 1000);
    if (!rateCheck.allowed) {
      return new NextResponse('Too Many Requests', { status: 429 });
    }

    const { searchParams } = new URL(req.url);
    const leadId = searchParams.get('leadId');
    const campaignId = searchParams.get('campaignId');

    let emailToBlock = '';

    if (leadId) {
      const lead = await container.leadRepo.getLeadById(leadId);
      if (lead) {
        lead.status = 'unsubscribed';
        if (lead.customVariables) {
          if ('ESTADO' in lead.customVariables) {
            lead.customVariables = { ...lead.customVariables, ESTADO: 'Desuscrito' };
          } else if ('Estado' in lead.customVariables) {
            lead.customVariables = { ...lead.customVariables, Estado: 'Desuscrito' };
          }
        }
        await container.leadRepo.updateLead(lead);
        emailToBlock = lead.email;
      }
    }

    if (emailToBlock) {
      await container.blocklistRepo.addToBlocklist({
        type: 'email',
        value: emailToBlock,
        reason: 'unsubscribed'
      });

      // Fire webhook
      container.webhookDispatcher.trigger('lead.unsubscribed', {
        leadId,
        campaignId,
        email: emailToBlock
      }).catch(() => {});
    }

    const safeEmailDisplay = emailToBlock
      ? escapeHtml(emailToBlock)
      : 'ha sido removido';

    const html = `
      <!DOCTYPE html>
      <html lang="es">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Desuscripción Confirmada</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background-color: #f8fafc; color: #1e293b; }
            .card { background: white; border-radius: 12px; padding: 40px; max-width: 460px; text-align: center; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; }
            .icon { width: 56px; height: 56px; margin: 0 auto 16px; border-radius: 50%; background: #dcfce7; color: #16a34a; display: flex; align-items: center; justify-content: center; font-size: 28px; }
            h1 { font-size: 20px; font-weight: 600; margin: 0 0 8px; color: #0f172a; }
            p { font-size: 14px; line-height: 1.5; color: #64748b; margin: 0; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="icon">✓</div>
            <h1>Desuscripción Confirmada</h1>
            <p>Tu correo <strong>${safeEmailDisplay}</strong> de nuestra lista de envíos. No recibirás más comunicaciones de esta campaña.</p>
          </div>
        </body>
      </html>
    `;

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'X-Content-Type-Options': 'nosniff'
      }
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error processing unsubscribe' }, { status: 500 });
  }
}
