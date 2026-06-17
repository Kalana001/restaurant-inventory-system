import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../frontend/.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!; 
const supabase = createClient(supabaseUrl, supabaseKey);

async function deletePO() {
  try {
    const poNumber = 'PO-20260612-4743';
    
    const { data: po } = await supabase
      .from('purchase_orders')
      .select('*')
      .eq('po_number', poNumber)
      .single();
      
    if (!po) {
      console.log('PO not found!');
      return;
    }
    
    // Find associated GRN
    const { data: grn } = await supabase.from('grns').select('id').eq('po_id', po.id).single();

    if (grn) {
      // Find batches for this GRN
      const { data: batches } = await supabase.from('batches').select('id').eq('grn_id', grn.id);
      
      if (batches && batches.length > 0) {
        const batchIds = batches.map(b => b.id);
        // Delete stock_movements for these batches
        const { error: smErr } = await supabase.from('stock_movements').delete().in('batch_id', batchIds);
        if (smErr) console.error('Failed to delete stock_movements:', smErr);
        else console.log('Deleted stock_movements');
      }

      // Delete from grns
      const { error: grnErr } = await supabase
        .from('grns')
        .delete()
        .eq('id', grn.id);
      if (!grnErr) console.log('Deleted GRNs (and cascading batches/items)');
      else console.error('GRN Delete Err:', grnErr);
    }
    
    // Delete PO lines
    const { error: lineErr } = await supabase
      .from('po_lines')
      .delete()
      .eq('po_id', po.id);
    if (!lineErr) console.log('Deleted PO lines');
    
    // Delete PO
    const { error: finalErr } = await supabase
      .from('purchase_orders')
      .delete()
      .eq('id', po.id);
    if (!finalErr) console.log('Deleted PO successfully!');
    else console.error('Failed to delete PO:', finalErr);
    
  } catch (err) {
    console.error(err);
  }
}

deletePO();
