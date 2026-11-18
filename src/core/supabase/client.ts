import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  '';
const schema = process.env.SUPABASE_SCHEMA || 'misender';

let clientInstance: SupabaseClient<any, any, any> | null = null;

export function getSupabaseClient(): SupabaseClient<any, any, any> {
  if (clientInstance) return clientInstance;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('⚠️ Supabase credentials not found in environment variables. Falling back to placeholder client.');
    }
    return createClient('https://placeholder.supabase.co', 'placeholder-key', {
      db: { schema }
    });
  }

  clientInstance = createClient(url, key, {
    db: {
      schema
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  return clientInstance;
}

export const supabase = new Proxy({} as SupabaseClient<any, any, any>, {
  get(_target, prop) {
    const client = getSupabaseClient();
    const val = (client as any)[prop];
    return typeof val === 'function' ? val.bind(client) : val;
  }
});
