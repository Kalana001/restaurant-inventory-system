import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://smcnbhgbnxcfvayrfmht.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNtY25iaGdibnhjZnZheXJmbWh0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDU2NjQ3OCwiZXhwIjoyMDk2MTQyNDc4fQ.CozW9wUQUrcYqJNRibfTvY6wkkKfGx_9OG4BlwEVCII';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase.rpc('execute_sql', { query: 'SELECT 1;' });
  console.log('execute_sql:', { data, error });
  
  const { data: d2, error: e2 } = await supabase.rpc('exec', { sql: 'SELECT 1;' });
  console.log('exec:', { data: d2, error: e2 });
}
run();
