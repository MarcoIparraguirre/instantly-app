import { NextResponse } from 'next/server';
import { container } from '@/core/container';

export async function POST() {
  try {
    const result = await container.warmupService.runWarmupRound();
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error running warmup round' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const logs = await container.warmupRepo.getWarmupLogs(50);
    return NextResponse.json(logs);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error fetching warmup logs' }, { status: 500 });
  }
}
