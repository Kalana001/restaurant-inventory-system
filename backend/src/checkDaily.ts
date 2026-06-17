import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../frontend/.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!; 
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkRLS() {
  try {
    const { data: policies, error } = await supabase
      .rpc('exec_sql', { sql: "SELECT * FROM pg_policies WHERE tablename = 'daily_purchases';" });
      
    if (error) {
      console.log('No exec_sql function or error:', error);
      
      // Let's try to query information schema or try an insert
    } else {
      console.log('Policies:', policies);
    }
    
    // Let's test insert using service role
    const { error: insErr } = await supabase.from('daily_purchases').insert({
      date: new Date().toISOString().split('T')[0],
      item_name: 'Test',
      quantity: 1,
      total_cost: 100,
      department: 'KITCHEN',
      created_by: '00000000-0000-0000-0000-000000000000' // FAKE UUID
    });
    console.log('Insert test with fake user id:', insErr);
    
  } catch (err) {
    console.error(err);
  }
}

checkRLS();
