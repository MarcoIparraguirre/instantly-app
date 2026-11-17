import { NextRequest, NextResponse } from 'next/server';
import { container } from '@/core/container';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const accountId = body.accountId;
    const subject = body.subject || 'Quick sync regarding next week';
    const emailBody = body.body || 'Hi there, wanted to follow up on our discussion.';

    const accounts = await container.accountRepo.getAccounts();
    const sender = accountId ? accounts.find(a => a.id === accountId) : accounts[0];

    if (!sender) {
      return NextResponse.json({ error: 'No sender account found' }, { status: 400 });
    }

    const report = await container.placementTester.runPlacementTest(sender, subject, emailBody);
    return NextResponse.json(report);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error running placement test' }, { status: 500 });
  }
}
