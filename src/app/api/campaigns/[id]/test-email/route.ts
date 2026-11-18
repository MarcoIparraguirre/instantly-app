import { NextRequest, NextResponse } from 'next/server';
import { container } from '@/core/container';
import { checkRateLimit } from '@/core/security/rateLimiter';

const STRICT_EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';
    
    // Rate limit test emails: maximum 10 sends per 10-minute window per IP
    const rateCheck = checkRateLimit('test-email', clientIp, 10, 10 * 60 * 1000);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded: maximum 10 test emails allowed per 10 minutes. Please try again later.' },
        { status: 429 }
      );
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const rawToEmail = (body.toEmail || '').trim();

    // Prevent CRLF injection and validate strict RFC email format
    if (!rawToEmail || !STRICT_EMAIL_REGEX.test(rawToEmail) || /[\r\n]/.test(rawToEmail)) {
      return NextResponse.json({ error: 'Valid destination email is required (RFC 5322 compliant)' }, { status: 400 });
    }
    const toEmail = rawToEmail.toLowerCase();

    const campaign = await container.campaignRepo.getCampaignById(id);
    if (!campaign) {
      return NextResponse.json({ error: `Campaign ${id} not found` }, { status: 404 });
    }

    const allAccounts = await container.accountRepo.getAccounts();
    const accounts = allAccounts.filter(
      a => campaign.senderAccountIds.length === 0 || campaign.senderAccountIds.includes(a.id)
    );

    const sender = accounts[0] || allAccounts[0];
    if (!sender) {
      return NextResponse.json({ error: 'No sender mailbox configured' }, { status: 400 });
    }

    const step = campaign.steps[0];
    if (!step || step.variants.length === 0) {
      return NextResponse.json({ error: 'Campaign has no steps or variants' }, { status: 400 });
    }

    const variant = step.variants[0];

    const safeFirstName = (body.firstName || 'Marco').replace(/[\r\n]/g, '').slice(0, 50);
    const safeLastName = (body.lastName || '').replace(/[\r\n]/g, '').slice(0, 50);
    const safeCompany = (body.companyName || 'Vectra Systems').replace(/[\r\n]/g, '').slice(0, 100);

    // Mock lead sample for rendering
    const sampleLead = {
      email: toEmail,
      firstName: safeFirstName,
      lastName: safeLastName,
      companyName: safeCompany,
      customVariables: {
        Nombre: safeFirstName,
        Empresa: safeCompany
      }
    };

    const rawSubject = container.templateRenderer.render(variant.subject, sampleLead);
    const finalSubject = `[TEST] ${container.spintaxService.resolve(rawSubject)}`.replace(/[\r\n]/g, ' ');

    const rawBody = container.templateRenderer.render(variant.body, sampleLead);
    const finalBody = container.spintaxService.resolve(rawBody);

    const mailResult = await container.smtpMailer.send(sender, {
      from: sender.email,
      fromName: sender.name,
      to: toEmail,
      subject: finalSubject,
      body: finalBody,
      headers: {
        'X-MiSender-Test': 'true',
        'X-MiSender-Campaign-Id': id
      }
    });

    if (!mailResult.success) {
      return NextResponse.json({ 
        error: mailResult.error || 'Failed to send via SMTP',
        senderEmail: sender.email
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      messageId: mailResult.messageId,
      to: toEmail,
      senderEmail: sender.email,
      subject: finalSubject
    });
  } catch (err: any) {
    console.error('Error in test-email route:', err);
    return NextResponse.json({ error: err.message || 'Error processing test email' }, { status: 500 });
  }
}
