import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/storage';
import { v4 as uuidv4 } from 'uuid';
import { SenderAccount } from '@/types';

export async function GET() {
  const accounts = db.getAccounts();
  return NextResponse.json(accounts);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const newAccount: SenderAccount = {
    id: uuidv4(),
    name: body.name || 'New Sender Mailbox',
    email: body.email,
    smtpHost: body.smtpHost || 'smtp.gmail.com',
    smtpPort: Number(body.smtpPort) || 587,
    smtpUser: body.smtpUser || body.email,
    smtpPass: body.smtpPass || '',
    dailyLimit: Number(body.dailyLimit) || 50,
    sentToday: 0,
    status: 'active'
  };

  db.saveAccount(newAccount);
  return NextResponse.json(newAccount, { status: 201 });
}
