import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const serviceRoleKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

// Lazy singleton — only created when first used, and only if env vars are present
let _adminClient: SupabaseClient | null = null;

export const getSupabaseAdmin = (): SupabaseClient | null => {
  if (!supabaseUrl || !serviceRoleKey) {
    console.warn(
      'VITE_SUPABASE_SERVICE_ROLE_KEY is not configured. ' +
      'Admin operations (create user, reset password) will not work. ' +
      'Add this variable to your Vercel environment settings.'
    );
    return null;
  }
  if (!_adminClient) {
    _adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return _adminClient;
};

