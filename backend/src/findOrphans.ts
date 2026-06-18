import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../frontend/.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!; 
const supabase = createClient(supabaseUrl, supabaseKey);

async function findOrphans() {
  try {
    // 1. Find the PO
    const poNumber = 'PO-20260612-4743';
    // wait, the PO was deleted yesterday!
    // So the PO is gone.
    // How can we find the GRN id?
    // Maybe we can search stock_movements from June 12th or June 17th?
    const { data: movements } = await supabase
      .from('stock_movements')
      .select('*, batches(*)')
      .eq('reference_type', 'GRN')
      .order('created_at', { ascending: false })
      .limit(50);
      
    console.log(`Found ${movements?.length} recent GRN stock movements.`);
    
    // Check if any GRN is missing from the grns table
    if (movements && movements.length > 0) {
      const grnIds = [...new Set(movements.map(m => m.reference_id).filter(id => id != null))];
      
      const { data: grns } = await supabase
        .from('grns')
        .select('id, po_id')
        .in('id', grnIds);
        
      const existingGrnIds = new Set(grns?.map(g => g.id));
      
      const orphanedGrnIds = grnIds.filter(id => !existingGrnIds.has(id));
      console.log('Orphaned GRN IDs in stock_movements:', orphanedGrnIds);
      
      for (const orphanedId of orphanedGrnIds) {
        const orphanedMovements = movements.filter(m => m.reference_id === orphanedId);
        console.log(`\nMovements for Orphaned GRN ${orphanedId}:`);
        orphanedMovements.forEach(m => {
          console.log(`  Movement ${m.movement_number} - Batch ${m.batch_id} - Qty ${m.quantity} - Cost ${m.cost_price}`);
          console.log(`  Batch info: ${JSON.stringify(m.batches)}`);
        });
      }
    }
    
  } catch (err) {
    console.error(err);
  }
}

findOrphans();
