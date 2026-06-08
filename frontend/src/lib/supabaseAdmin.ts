import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const serviceRoleKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  console.warn('Missing VITE_SUPABASE_SERVICE_ROLE_KEY environment variable.');
}

export const supabaseAdmin = createClient(supabaseUrl || '', serviceRoleKey || '', {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  }
});

