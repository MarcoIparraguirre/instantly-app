import { NextRequest, NextResponse } from 'next/server';
import { container } from '@/core/container';
import { v4 as uuidv4 } from 'uuid';
import { WebhookItem } from '@/types';
import { validateWebhookUrl } from '@/core/security/ssrfValidator';

export async function GET() {
  try {
    const list = await container.webhookRepo.getWebhooks();
    return NextResponse.json(list);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error fetching webhooks' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.url) {
      return NextResponse.json({ error: 'Webhook url is required' }, { status: 400 });
    }

    const validation = await validateWebhookUrl(body.url, true);
    if (!validation.valid) {
      return NextResponse.json({ error: `Security Error: ${validation.reason}` }, { status: 400 });
    }

    const webhook: WebhookItem = {
      id: body.id || `wh-${uuidv4()}`,
      workspaceId: body.workspaceId || 'ws-primary',
      url: body.url,
      eventTypes: Array.isArray(body.eventTypes) && body.eventTypes.length > 0
        ? body.eventTypes
        : ['lead.replied', 'lead.bounced', 'lead.unsubscribed', 'email.sent'],
      isActive: body.isActive !== false,
      secret: body.secret,
      createdAt: new Date().toISOString()
    };

    await container.webhookRepo.saveWebhook(webhook);
    return NextResponse.json(webhook, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error saving webhook' }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Missing webhook id' }, { status: 400 });
    }
    await container.webhookRepo.deleteWebhook(id);
    return NextResponse.json({ success: true, deletedId: id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error deleting webhook' }, { status: 400 });
  }
}
