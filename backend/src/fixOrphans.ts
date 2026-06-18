import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../frontend/.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!; 
const supabase = createClient(supabaseUrl, supabaseKey);

async function fixOrphans() {
  try {
    const { data: movements } = await supabase
      .from('stock_movements')
      .select('id, batch_id, reference_id, quantity')
      .eq('reference_type', 'GRN');
      
    if (!movements) return;
    
    const grnIds = movements.map(m => m.reference_id).filter(id => id);
    // unique
    const uniqueGrnIds = grnIds.filter((v, i, a) => a.indexOf(v) === i);
    
    const { data: grns } = await supabase
      .from('grns')
      .select('id')
      .in('id', uniqueGrnIds);
      
    const existingIds = (grns || []).map(g => g.id);
    
    const orphanedGrnIds = uniqueGrnIds.filter(id => !existingIds.includes(id));
    console.log('Orphaned GRN IDs:', orphanedGrnIds);
    
    let orphanedBatchIds = [];
    
    for (const orphanedId of orphanedGrnIds) {
      const orphanedMovements = movements.filter(m => m.reference_id === orphanedId);
      console.log(`\nDeleting movements for Orphaned GRN ${orphanedId}...`);
      
      for (const m of orphanedMovements) {
        if (m.batch_id) orphanedBatchIds.push(m.batch_id);
        // Delete movement
        await supabase.from('stock_movements').delete().eq('id', m.id);
      }
    }
    
    // unique batch ids
    orphanedBatchIds = orphanedBatchIds.filter((v, i, a) => a.indexOf(v) === i);
    
    for (const batchId of orphanedBatchIds) {
      const { data: otherMoves } = await supabase.from('stock_movements').select('id').eq('batch_id', batchId);
      if (!otherMoves || otherMoves.length === 0) {
        console.log(`Deleting orphaned batch ${batchId}`);
        await supabase.from('batches').delete().eq('id', batchId);
      } else {
        console.log(`Batch ${batchId} has OTHER movements, manually check!`);
      }
    }
    console.log('Done!');
  } catch (err) {
    console.error(err);
  }
}

fixOrphans();
