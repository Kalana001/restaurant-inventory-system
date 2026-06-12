import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: './.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function fix() {
  const vegeOilId = 'de318d13-1c54-4a53-8dd7-98d919b93d4b';
  const coconutOilId = 'e4a96326-80a0-471f-8d50-01e72cd585ae';
  const poId = '8478f913-968f-482e-8bec-19c525f10c27';
  const grnItemId = '0a8253f2-69cb-4e9e-88ea-f4448c094336';
  const batchId = '324e1310-6c91-4d05-8311-cc9611219e05';
  const quantityToMove = 20.295;

  console.log("Starting correction...");

  // 1. Update po_items
  const { data: poItemData, error: poItemErr } = await supabase
    .from('po_items')
    .update({ item_id: coconutOilId })
    .eq('po_id', poId)
    .eq('item_id', vegeOilId)
    .select();
  console.log("Updated po_items:", poItemData?.length);
  if (poItemErr) console.error("Error po_items:", poItemErr);

  // 2. Update grn_items
  const { data: grnItemData, error: grnItemErr } = await supabase
    .from('grn_items')
    .update({ item_id: coconutOilId })
    .eq('id', grnItemId)
    .select();
  console.log("Updated grn_items:", grnItemData?.length);
  if (grnItemErr) console.error("Error grn_items:", grnItemErr);

  // 3. Update batches
  const { data: batchData, error: batchErr } = await supabase
    .from('batches')
    .update({ item_id: coconutOilId })
    .eq('id', batchId)
    .select();
  console.log("Updated batches:", batchData?.length);
  if (batchErr) console.error("Error batches:", batchErr);

  // 4. Update stock_movements
  const { data: moveData, error: moveErr } = await supabase
    .from('stock_movements')
    .update({ item_id: coconutOilId })
    .eq('batch_id', batchId)
    .select();
  console.log("Updated stock_movements:", moveData?.length);
  if (moveErr) console.error("Error stock_movements:", moveErr);

  // 5. Update inventory_items totals
  // Get current totals
  const { data: vege } = await supabase.from('inventory_items').select('total_quantity').eq('id', vegeOilId).single();
  const { data: coco } = await supabase.from('inventory_items').select('total_quantity').eq('id', coconutOilId).single();

  const newVegeTotal = Number(vege.total_quantity) - quantityToMove;
  const newCocoTotal = Number(coco.total_quantity) + quantityToMove;

  const { error: vErr } = await supabase.from('inventory_items').update({ total_quantity: newVegeTotal }).eq('id', vegeOilId);
  const { error: cErr } = await supabase.from('inventory_items').update({ total_quantity: newCocoTotal }).eq('id', coconutOilId);
  
  if (vErr) console.error("Error updating Vege Oil total:", vErr);
  else console.log(`Updated Vege Oil total from ${vege.total_quantity} to ${newVegeTotal}`);

  if (cErr) console.error("Error updating Coco Oil total:", cErr);
  else console.log(`Updated Coco Oil total from ${coco.total_quantity} to ${newCocoTotal}`);

  console.log("Correction complete!");
}

fix().catch(console.error);
