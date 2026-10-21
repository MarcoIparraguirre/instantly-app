import { NextRequest, NextResponse } from 'next/server';
import { container } from '@/core/container';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const campaign = await container.campaignRepo.getCampaignById(id);
  if (!campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
  }
  return NextResponse.json(campaign);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const existing = await container.campaignRepo.getCampaignById(id);
    if (!existing) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    const updated = {
      ...existing,
      ...body,
      id,
      updatedAt: new Date().toISOString()
    };

    await container.campaignRepo.saveCampaign(updated);
    return NextResponse.json(updated);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to update campaign' }, { status: 500 });
  }
}
