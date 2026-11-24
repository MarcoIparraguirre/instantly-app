import { NextRequest, NextResponse } from 'next/server';
import { container } from '@/core/container';
import { checkAndConsumeVerificationCredits } from '@/core/services/WorkspaceQuotaService';

const MAX_VERIFY_BATCH = 100;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { searchParams } = new URL(req.url);
    const workspaceId =
      (typeof body?.workspaceId === 'string' && body.workspaceId.trim()) ||
      searchParams.get('workspaceId')?.trim() ||
      req.headers.get('x-workspace-id')?.trim() ||
      undefined;

    if (Array.isArray(body.emails)) {
      if (body.emails.length > MAX_VERIFY_BATCH) {
        return NextResponse.json(
          { error: `Maximum ${MAX_VERIFY_BATCH} emails can be verified per request.` },
          { status: 400 }
        );
      }

      const creditCheck = await checkAndConsumeVerificationCredits(workspaceId, body.emails.length);
      if (!creditCheck.allowed) {
        return NextResponse.json(creditCheck, { status: creditCheck.status });
      }

      const results = await container.emailVerifier.verifyBatch(body.emails);
      return NextResponse.json(results);
    }

    if (body.email) {
      const creditCheck = await checkAndConsumeVerificationCredits(workspaceId, 1);
      if (!creditCheck.allowed) {
        return NextResponse.json(creditCheck, { status: creditCheck.status });
      }

      const result = await container.emailVerifier.verifyEmail(body.email);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Please provide email or emails array' }, { status: 400 });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Verification error' },
      { status: 500 }
    );
  }
}
