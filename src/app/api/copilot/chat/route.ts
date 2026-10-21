import { NextRequest, NextResponse } from 'next/server';
import { container } from '@/core/container';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await container.copilotService.process(body);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('Copilot API error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
