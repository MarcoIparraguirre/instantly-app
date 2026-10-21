import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jxkfkcvosfjitrrknwrp.supabase.co';
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp4a2ZrY3Zvc2ZqaXRycmtud3JwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3Mjg5NTQsImV4cCI6MjEwMjMwNDk1NH0.OW8y7DnwQAyYqdA091_I1Tz8wh-HbOaVA8kuZ-XbJak';
const schema = process.env.SUPABASE_SCHEMA || 'misender';

export function getSupabaseClient(): SupabaseClient<any, any, any> {
  return createClient(supabaseUrl, supabaseKey, {
    db: {
      schema
    }
  });
}

export const supabase = getSupabaseClient();
