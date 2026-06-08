import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
// Using the service role key provided by the user to safely manage auth
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNtY25iaGdibnhjZnZheXJmbWh0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDU2NjQ3OCwiZXhwIjoyMDk2MTQyNDc4fQ.CozW9wUQUrcYqJNRibfTvY6wkkKfGx_9OG4BlwEVCII';

export const supabaseAdmin = createClient(supabaseUrl || '', serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  }
});
