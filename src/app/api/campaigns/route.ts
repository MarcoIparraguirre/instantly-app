import { NextRequest, NextResponse } from 'next/server';
import { container } from '@/core/container';
import { v4 as uuidv4 } from 'uuid';
import { Campaign } from '@/types';

export async function GET() {
  const campaigns = await container.campaignRepo.getCampaigns();
  return NextResponse.json(campaigns);
}

export async function POST(req: NextRequest) {
  try {
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

    await container.campaignRepo.saveCampaign(newCampaign);
    return NextResponse.json(newCampaign, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to create campaign' }, { status: 500 });
  }
}
