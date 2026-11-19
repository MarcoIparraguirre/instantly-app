import { NextRequest, NextResponse } from 'next/server';
import { container } from '@/core/container';
import { v4 as uuidv4 } from 'uuid';
import { Deal } from '@/types';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get('workspaceId') || undefined;
    const deals = await container.dealRepo.getDeals(workspaceId);
    return NextResponse.json(deals);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error fetching deals' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const deal: Deal = {
      id: body.id || `deal-${uuidv4()}`,
      workspaceId: body.workspaceId || 'ws-primary',
      leadId: body.leadId || '',
      contactName: body.contactName,
      contactEmail: body.contactEmail,
      companyName: body.companyName || '',
      title: body.title || `${body.companyName || body.contactName} Deal`,
      value: Number(body.value) || 0,
      stage: body.stage || 'positive',
      daysInactive: 0,
      createdAt: new Date().toISOString()
    };

    await container.dealRepo.saveDeal(deal);
    return NextResponse.json(deal, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error creating deal' }, { status: 400 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.id) {
      return NextResponse.json({ error: 'Deal id is required' }, { status: 400 });
    }
    let resolvedWorkspaceId = body.workspaceId;
    if (!resolvedWorkspaceId && typeof container.dealRepo.getDealById === 'function') {
      const existing = await container.dealRepo.getDealById(body.id);
      resolvedWorkspaceId = existing?.workspaceId;
    }
    const dealToUpdate: Deal = {
      ...body,
      workspaceId: resolvedWorkspaceId || 'ws-primary'
    };
    await container.dealRepo.updateDeal(dealToUpdate);
    return NextResponse.json({ success: true, deal: dealToUpdate });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error updating deal' }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    }
    await container.dealRepo.deleteDeal(id);
    return NextResponse.json({ success: true, deletedId: id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error deleting deal' }, { status: 400 });
  }
}
