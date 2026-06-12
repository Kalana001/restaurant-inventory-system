import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: './.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: tbls, error } = await supabase.from('purchase_order_items').select('*').limit(1);
  console.log("po items tbl err:", error);
  
  const vegeOilId = 'de318d13-1c54-4a53-8dd7-98d919b93d4b';
  const { data: item } = await supabase.from('inventory_items').select('*').eq('id', vegeOilId).single();
  console.log("Vege Item full:", item);
}

check().catch(console.error);
