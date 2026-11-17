import { NextRequest, NextResponse } from 'next/server';
import { container } from '@/core/container';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (Array.isArray(body.emails)) {
      const results = await container.emailVerifier.verifyBatch(body.emails);
      return NextResponse.json(results);
    }

    if (body.email) {
      const result = await container.emailVerifier.verifyEmail(body.email);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Please provide email or emails array' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Verification error' }, { status: 500 });
  }
}
