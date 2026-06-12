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

  console.log("Fixing PO Items...");

  const { data: poItemData, error: poItemErr } = await supabase
    .from('purchase_order_items')
    .update({ item_id: coconutOilId })
    .eq('po_id', poId)
    .eq('item_id', vegeOilId)
    .select();
    
  console.log("Updated purchase_order_items:", poItemData?.length);
  if (poItemErr) console.error("Error po_items:", poItemErr);
}

fix().catch(console.error);
