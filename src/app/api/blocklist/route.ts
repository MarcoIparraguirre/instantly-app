import { NextRequest, NextResponse } from 'next/server';
import { container } from '@/core/container';

export async function GET() {
  try {
    const list = await container.blocklistRepo.getBlocklist();
    return NextResponse.json(list);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error fetching blocklist' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.value) {
      return NextResponse.json({ error: 'value is required' }, { status: 400 });
    }
    const item = await container.blocklistRepo.addToBlocklist({
      type: body.type || (body.value.includes('@') ? 'email' : 'domain'),
      value: body.value,
      reason: body.reason || 'manual'
    });
    return NextResponse.json(item, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error adding to blocklist' }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 });
    }
    await container.blocklistRepo.removeFromBlocklist(id);
    return NextResponse.json({ success: true, deletedId: id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error removing from blocklist' }, { status: 400 });
  }
}
