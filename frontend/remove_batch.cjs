const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const envPath = './.env';
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

async function removeBatch() {
  const ref = 'GRN-1781759292847-9f967f';
  
  const { data: b } = await supabase.from('batches').select('id, batch_number').eq('batch_number', ref);
  if (b && b.length > 0) {
      for (const batch of b) {
          // Delete grn_items
          const { error: gErr } = await supabase.from('grn_items').delete().eq('batch_id', batch.id);
          console.log("Deleted grn_items for batch:", batch.id, gErr || 'Success');

          // Delete stock_movements
          const { error: sErr } = await supabase.from('stock_movements').delete().eq('batch_id', batch.id);
          console.log("Deleted stock_movements for batch:", batch.id, sErr || 'Success');

          const { error } = await supabase.from('batches').delete().eq('id', batch.id);
          console.log("Deleted batch:", batch.id, error || 'Success');
      }
  } else {
      console.log("No batch found with number:", ref);
  }

  // Also remove stock_movements if any
  const { data: m1 } = await supabase.from('stock_movements').select('id, reference_type').eq('reference_type', ref);
  if (m1 && m1.length > 0) {
      for (const move of m1) {
          const { error } = await supabase.from('stock_movements').delete().eq('id', move.id);
          console.log("Deleted movement (by reference_type):", move.id, error || 'Success');
      }
  } else {
      console.log("No stock movements found with reference_type:", ref);
  }
}
removeBatch();
