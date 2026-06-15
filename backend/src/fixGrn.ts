import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../frontend/.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!; 
const supabase = createClient(supabaseUrl, supabaseKey);

async function fixGrnSequence() {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // Get all GRNs created today
    const { data: grns, error } = await supabase
      .from('grns')
      .select('*')
      .order('created_at', { ascending: false });
      
    if (error) throw error;
    
    const todaysGrns = grns.filter(g => g.created_at.startsWith(today));
    console.log(`Current GRN Count for today: ${todaysGrns.length}`);
    
    if (todaysGrns.length > 0) {
      const template = todaysGrns[0];
      
      const { data: insertData, error: insertErr } = await supabase
        .from('grns')
        .insert([{
          grn_number: 'GRN-DUMMY-1',
          supplier_id: template.supplier_id,
          received_by: template.received_by,
          total_amount: 0,
          remarks: 'System Sequence Fix (Safe to ignore)'
        }]);
        
      if (insertErr) console.error('Error inserting dummy GRN:', insertErr);
      else console.log('Successfully inserted dummy GRN to fix sequence!');
      
      // Let's verify the count now
      const { count } = await supabase
        .from('grns')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', `${today}T00:00:00.000Z`);
      console.log(`New total GRN count for today: ${count}`);
    }
  } catch (err) {
    console.error(err);
  }
}

fixGrnSequence();
