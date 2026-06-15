import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../frontend/.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!; 
const supabase = createClient(supabaseUrl, supabaseKey);

async function deletePO() {
  try {
    const poNumber = 'PO-20260613-6033';
    
    const { data: po } = await supabase
      .from('purchase_orders')
      .select('*')
      .eq('po_number', poNumber)
      .single();
      
    if (!po) return;
    
    // Delete from grns first
    const { error: grnErr } = await supabase
      .from('grns')
      .delete()
      .eq('po_id', po.id);
    if (!grnErr) console.log('Deleted GRNs');
    else console.error('GRN Delete Err:', grnErr);
    
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
