import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/core/supabase/client';

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*, roles:role_id(name, description)')
      .eq('id', 'admin-default')
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({
        id: 'admin-default',
        fullName: 'Marco Iparraguirre',
        email: 'marcos@vectrasystems.com.ar',
        company: 'Vectra Systems',
        roleId: 'super_admin',
        roleName: 'Super Admin'
      });
    }

    return NextResponse.json({
      id: data.id,
      fullName: data.full_name,
      email: data.email,
      company: data.company,
      roleId: data.role_id,
      roleName: (data as any).roles?.name || data.role_id
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { fullName, email, company, roleId } = body;

    const { data, error } = await supabase
      .from('user_profiles')
      .upsert({
        id: 'admin-default',
        full_name: fullName,
        email,
        company,
        role_id: roleId,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Error saving user profile to Supabase:', error);
      throw error;
    }

    return NextResponse.json({
      id: data.id,
      fullName: data.full_name,
      email: data.email,
      company: data.company,
      roleId: data.role_id
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
