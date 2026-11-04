import { NextRequest, NextResponse } from 'next/server';
import { container } from '@/core/container';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const toEmail = (body.toEmail || '').trim();

    if (!toEmail) {
      return NextResponse.json({ error: 'Destination email is required' }, { status: 400 });
    }

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

    // Mock lead sample for rendering
    const sampleLead = {
      email: toEmail,
      firstName: body.firstName || 'Marco',
      lastName: body.lastName || '',
      companyName: body.companyName || 'Vectra Systems',
      customVariables: {
        Nombre: body.firstName || 'Marco',
        Empresa: body.companyName || 'Vectra Systems'
      }
    };

    const rawSubject = container.templateRenderer.render(variant.subject, sampleLead);
    const finalSubject = `[TEST] ${container.spintaxService.resolve(rawSubject)}`;

    const rawBody = container.templateRenderer.render(variant.body, sampleLead);
    const finalBody = container.spintaxService.resolve(rawBody);

    const mailResult = await container.smtpMailer.send(sender, {
      from: sender.email,
      fromName: sender.name,
      to: toEmail,
      subject: finalSubject,
      body: finalBody
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
