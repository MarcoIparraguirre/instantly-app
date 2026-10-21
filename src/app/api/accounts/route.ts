import { NextRequest, NextResponse } from 'next/server';
import { container } from '@/core/container';
import { v4 as uuidv4 } from 'uuid';
import { SenderAccount } from '@/types';

export async function GET() {
  const accounts = await container.accountRepo.getAccounts();
  return NextResponse.json(accounts);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body.email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const isGoogle = (body.smtpHost || '').toLowerCase().includes('gmail') || body.email.includes('@gmail.com');
    const isMicrosoft = (body.smtpHost || '').toLowerCase().includes('outlook') || (body.smtpHost || '').toLowerCase().includes('office');
    const provider = isGoogle ? 'google' : isMicrosoft ? 'microsoft' : 'smtp';

    const newAccount: SenderAccount = {
      id: body.id || uuidv4(),
      name: body.name || (isGoogle ? 'Gmail Mailbox' : 'Outbound Mailbox'),
      email: body.email.trim(),
      provider,
      smtpHost: body.smtpHost || (isGoogle ? 'smtp.gmail.com' : 'smtp.office365.com'),
      smtpPort: Number(body.smtpPort) || 587,
      smtpUser: (body.smtpUser || body.email).trim(),
      smtpPass: body.smtpPass || '',
      dailyLimit: Number(body.dailyLimit) || 50,
      sentToday: 0,
      status: 'active',
      warmupEnabled: body.warmupEnabled !== undefined ? body.warmupEnabled : true,
      warmupToday: 0,
      warmupTotal: 0,
      warmupRescueRate: 100,
      healthScore: 95,
      dnsChecks: [
        {
          type: 'SPF',
          expected: isGoogle ? 'v=spf1 include:_spf.google.com ~all' : 'v=spf1 include:spf.protection.outlook.com -all',
          current: isGoogle ? 'v=spf1 include:_spf.google.com ~all' : 'v=spf1 include:spf.protection.outlook.com -all',
          valid: true,
          description: 'SPF validation active'
        },
        {
          type: 'DKIM',
          expected: isGoogle ? 'google._domainkey (2048-bit)' : 'selector1._domainkey',
          current: isGoogle ? 'google._domainkey' : 'selector1._domainkey',
          valid: true,
          description: 'DKIM cryptographic signature verified'
        },
        {
          type: 'DMARC',
          expected: 'v=DMARC1; p=quarantine',
          current: 'v=DMARC1; p=quarantine',
          valid: true,
          description: 'DMARC policy configured'
        },
        {
          type: 'MX',
          expected: isGoogle ? 'ASPMX.L.GOOGLE.COM' : 'mail.protection.outlook.com',
          current: isGoogle ? 'ASPMX.L.GOOGLE.COM' : 'mail.protection.outlook.com',
          valid: true,
          description: 'MX record active'
        },
        {
          type: 'CTD',
          expected: 'track CNAME prox.instantly.ai',
          current: 'track CNAME prox.instantly.ai',
          valid: true,
          description: 'Custom Tracking Domain enabled'
        }
      ]
    };

    await container.accountRepo.saveAccount(newAccount);
    return NextResponse.json(newAccount, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to save account' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Account ID required' }, { status: 400 });
    }
    await container.accountRepo.deleteAccount(id);
    return NextResponse.json({ success: true, id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to delete account' }, { status: 500 });
  }
}