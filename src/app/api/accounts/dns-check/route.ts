import { NextRequest, NextResponse } from 'next/server';
import { container } from '@/core/container';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const domain = body.domain;
    if (!domain) {
      return NextResponse.json({ error: 'Domain is required' }, { status: 400 });
    }

    const dkimSelector = body.selector || 'google';
    const audit = await container.dnsChecker.auditDomain(domain, dkimSelector);
    return NextResponse.json(audit);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'DNS check failed' }, { status: 500 });
  }
}
