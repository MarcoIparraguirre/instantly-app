import { NextRequest, NextResponse } from 'next/server';
import {
  aiOutreachService,
  normalizeAiLanguage,
} from '@/core/services/AiOutreachService';

export async function POST(req: NextRequest) {
  try {
    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Request body must be a JSON object' }, { status: 400 });
    }

    const emailBody = typeof body.body === 'string' ? body.body.trim() : '';
    if (!emailBody) {
      return NextResponse.json({ error: 'Email body is required' }, { status: 400 });
    }

    const subject = typeof body.subject === 'string' ? body.subject : '';
    const leadName = typeof body.leadName === 'string' ? body.leadName : undefined;
    const companyName = typeof body.companyName === 'string' ? body.companyName : undefined;
    const sentiment = typeof body.sentiment === 'string' ? body.sentiment : undefined;
    const language = normalizeAiLanguage(
      typeof body.language === 'string' ? body.language : undefined
    );

    const result = await aiOutreachService.suggestUniboxReplies({
      subject,
      body: emailBody,
      leadName,
      companyName,
      sentiment,
      language,
    });

    return NextResponse.json({
      success: true,
      provider: result.provider,
      language: result.language,
      drafts: result.drafts,
    });
  } catch (err: unknown) {
    console.error('AI suggest-reply error:', err);
    const message = err instanceof Error ? err.message : 'Failed to generate reply suggestions';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
