import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/storage';
import { v4 as uuidv4 } from 'uuid';
import { Lead } from '@/types';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const campaignId = searchParams.get('campaignId') || undefined;
  const leads = db.getLeads(campaignId);
  return NextResponse.json(leads);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  // Can be a single lead or array of leads
  const items = Array.isArray(body) ? body : [body];

  const newLeads: Lead[] = items.map(item => ({
    id: uuidv4(),
    campaignId: item.campaignId || 'campaign-1',
    email: item.email,
    firstName: item.firstName || '',
    lastName: item.lastName || '',
    companyName: item.companyName || '',
    website: item.website || '',
    status: 'pending',
    currentStep: 1,
    customVariables: item.customVariables || {}
  }));

  db.addLeads(newLeads);
  return NextResponse.json(newLeads, { status: 201 });
}
