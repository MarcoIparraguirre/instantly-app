import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/storage';
import { v4 as uuidv4 } from 'uuid';
import { Campaign } from '@/types';

export async function GET() {
  const campaigns = db.getCampaigns();
  return NextResponse.json(campaigns);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const newCampaign: Campaign = {
    id: uuidv4(),
    name: body.name || 'New Outbound Campaign',
    status: 'draft',
    steps: body.steps || [
      {
        id: uuidv4(),
        stepNumber: 1,
        waitDays: 0,
        variants: [
          {
            id: uuidv4(),
            name: 'Variant A',
            subject: 'Quick question for {{firstName}}',
            body: 'Hi {{firstName}},\n\nWanted to reach out directly regarding {{companyName}}.\n\nBest,\nAlex'
          }
        ]
      }
    ],
    schedule: body.schedule || {
      timing: { from: '09:00', to: '17:00' },
      days: [1, 2, 3, 4, 5],
      timezone: 'America/New_York',
      dailyLimit: 50,
      strategy: 'office-hours'
    },
    senderAccountIds: body.senderAccountIds || [],
    openTracking: true,
    clickTracking: true,
    stats: { sent: 0, opened: 0, replied: 0, bounced: 0, opportunities: 0 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  db.saveCampaign(newCampaign);
  return NextResponse.json(newCampaign, { status: 201 });
}
