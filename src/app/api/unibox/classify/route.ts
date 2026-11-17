import { NextRequest, NextResponse } from 'next/server';
import { container } from '@/core/container';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { subject, body: emailBody, leadId, leadName, leadEmail, companyName } = body;

    if (!emailBody) {
      return NextResponse.json({ error: 'Email body is required' }, { status: 400 });
    }

    if (leadId && leadEmail) {
      const result = await container.uniboxClassifier.processIncomingReply(
        subject || '',
        emailBody,
        {
          leadId,
          leadName: leadName || leadEmail.split('@')[0],
          leadEmail,
          companyName
        }
      );
      return NextResponse.json(result);
    } else {
      const result = container.uniboxClassifier.classify(subject || '', emailBody, {
        leadName,
        leadEmail,
        companyName
      });
      return NextResponse.json(result);
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Classification error' }, { status: 500 });
  }
}
