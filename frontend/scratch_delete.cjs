const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const envPath = '../backend/.env';
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

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const ref = 'MAN-1781191562976-9502';
  
  // Find in batches
  const { data: b } = await supabase.from('batches').select('id, batch_number').eq('batch_number', ref);
  if (b && b.length > 0) {
      for (const batch of b) {
          const { error } = await supabase.from('batches').delete().eq('id', batch.id);
          console.log("Deleted batch:", batch.id, error || 'Success');
      }
  }

  // Find in movements by reference_type
  const { data: m1 } = await supabase.from('stock_movements').select('id, reference_type').eq('reference_type', ref);
  if (m1 && m1.length > 0) {
      for (const move of m1) {
          const { error } = await supabase.from('stock_movements').delete().eq('id', move.id);
          console.log("Deleted movement (by reference_type):", move.id, error || 'Success');
      }
  }

  // Check cuttle fish item
  const { data: items } = await supabase.from('inventory_items').select('id, name').ilike('name', '%cuttle%');
  if (items && items.length > 0) {
      for (const item of items) {
          console.log(`Checking movements for ${item.name}...`);
          const { data: moves } = await supabase.from('stock_movements').select('*').eq('item_id', item.id);
          if (moves && moves.length > 0) {
              const wrongMoves = moves.filter(x => x.reference_type === ref);
              for (const w of wrongMoves) {
                  const { error } = await supabase.from('stock_movements').delete().eq('id', w.id);
                  console.log("Deleted wrong movement for cuttle fish:", w.id, error || 'Success');
              }
          }
      }
  }
  
  console.log("Cleanup complete.");
}
run();
