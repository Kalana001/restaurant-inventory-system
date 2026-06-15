import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../frontend/.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!; 
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkGRNs() {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // Get all GRNs created today
    const { data: grns, error } = await supabase
      .from('grns')
      .select('grn_number, created_at');
      
    if (error) throw error;
    
    const todaysGrns = grns.filter(g => g.created_at.startsWith(today));
    
    console.log(`Total GRNs today (COUNT(*)): ${todaysGrns.length}`);
    todaysGrns.forEach(g => console.log(g.grn_number));
    
  } catch (err) {
    console.error(err);
  }
}

checkGRNs();
