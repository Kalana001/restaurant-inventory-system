import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  // Try inserting a dummy record to see if table exists
  const { error: checkError } = await sb.from('supplier_payments').select('id').limit(1);
  
  if (!checkError) {
    console.log('supplier_payments table already exists!');
    return;
  }
  
  console.log('Table does not exist, creating via Supabase REST...');
  console.log('Error was:', checkError.message);
  
  // Use the management API to run SQL
  const response = await fetch(`${process.env.VITE_SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'apikey': process.env.VITE_SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${process.env.VITE_SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      sql: `CREATE TABLE IF NOT EXISTS supplier_payments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
        amount DECIMAL(12,2) NOT NULL,
        payment_method VARCHAR(50) NOT NULL DEFAULT 'By Restaurant',
        notes TEXT,
        paid_by UUID REFERENCES profiles(id),
        created_at TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL
      );`
    })
  });
  const text = await response.text();
  console.log('Response:', response.status, text);
}

run().catch(console.error);
