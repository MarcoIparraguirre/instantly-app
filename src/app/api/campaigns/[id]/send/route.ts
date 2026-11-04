import { NextRequest, NextResponse } from 'next/server';
import { executeCampaignStep } from '@/lib/emailEngine';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const simulationOnly = body.simulationOnly ?? false;
    const batchSize = typeof body.batchSize === 'number' ? body.batchSize : undefined;
    const respectSchedule = body.respectSchedule ?? false;
    const origin = new URL(req.url).origin;

    const result = await executeCampaignStep(id, {
      simulationOnly,
      batchSize,
      respectSchedule,
      baseUrl: process.env.NEXT_PUBLIC_APP_URL || origin
    });
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error executing campaign send' }, { status: 400 });
  }
}
