const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const envPath = '.env';
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
      const key = parts[0].trim();
      const val = parts.slice(1).join('=').trim().replace(/['"\r]/g, '');
      env[key] = val;
  }
});
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const mvId = '9224f8df-07a7-48fa-8985-480c632adbbf';
  const batchId = '3f567d7e-c964-455f-b3ba-135914fb0f21';

  await supabase.from('stock_movements').delete().eq('id', mvId);
  console.log("Deleted movement");

  await supabase.from('batches').delete().eq('id', batchId);
  console.log("Deleted batch");

  console.log("Done");
}
run();
