import { NextResponse } from 'next/server';
import { supabase } from '@/core/supabase/client';

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('roles')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching roles from Supabase:', error);
      // Fallback predefined roles
      return NextResponse.json([
        { id: 'super_admin', name: 'Super Admin', description: 'Control total de la plataforma, bases de datos y envíos masivos.' },
        { id: 'admin', name: 'Administrador', description: 'Gestión de campañas, casillas SMTP y carga de prospectos.' },
        { id: 'campaign_manager', name: 'Gestor de Campañas', description: 'Creación y redacción de secuencias, plantillas e IA.' },
        { id: 'viewer', name: 'Solo Lectura', description: 'Acceso a tableros de analíticas y monitoreo de aperturas.' }
      ]);
    }

    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
