const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  'https://smcnbhgbnxcfvayrfmht.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNtY25iaGdibnhjZnZheXJmbWh0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDU2NjQ3OCwiZXhwIjoyMDk2MTQyNDc4fQ.CozW9wUQUrcYqJNRibfTvY6wkkKfGx_9OG4BlwEVCI'
);

async function run() {
  const ref = 'MAN-1781191562976-9502';
  
  const { data: move1, error: e1 } = await supabase.from('stock_movements').select('*').eq('reference_type', ref);
  if (e1) console.error("Err 1", e1);
  if (move1 && move1.length > 0) {
      for (const m of move1) {
          console.log("Found movement by ref, deleting:", m.id);
          const { error } = await supabase.from('stock_movements').delete().eq('id', m.id);
          if (error) console.error("Error deleting", error);
      }
  }

  const { data: batch, error: e2 } = await supabase.from('batches').select('*').eq('batch_number', ref);
  if (e2) console.error("Err 2", e2);
  if (batch && batch.length > 0) {
      for (const b of batch) {
          console.log("Found batch by ref, deleting:", b.id);
          const { error } = await supabase.from('batches').delete().eq('id', b.id);
          if (error) console.error("Error deleting batch", error);
      }
  }
  
  // also check item name just in case
  const { data: items, error: e3 } = await supabase.from('inventory_items').select('id, name').ilike('name', '%cuttle%');
  if (items && items.length > 0) {
      for (const item of items) {
          console.log(`Checking movements for ${item.name}...`);
          const { data: moves } = await supabase.from('stock_movements').select('*').eq('item_id', item.id);
          if (moves && moves.length > 0) {
              const wrongMoves = moves.filter(x => x.reference_type === ref);
              for (const w of wrongMoves) {
                  const { error } = await supabase.from('stock_movements').delete().eq('id', w.id);
                  console.log("Deleted wrong movement for cuttle fish:", w.id, error || 'Success');
                  if (w.batch_id) await supabase.from('batches').delete().eq('id', w.batch_id);
              }
          }
      }
  }
}
run();
