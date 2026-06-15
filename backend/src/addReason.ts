import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../frontend/.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!; 
const supabase = createClient(supabaseUrl, supabaseKey);

async function addReason() {
  try {
    const { data, error } = await supabase
      .from('movement_reasons')
      .insert([{ name: 'Personal Use', type: 'STOCK_OUT' }]);
      
    if (error) console.error('Error adding reason:', error);
    else console.log('Successfully added Personal Use reason!');
  } catch (err) {
    console.error(err);
  }
}

addReason();
