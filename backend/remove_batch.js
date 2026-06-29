const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function removeBatch() {
  const { data, error } = await supabase
    .from('batches')
    .delete()
    .eq('batch_number', 'GRN-1781759292847-9f967f')
    .select();
    
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Deleted:', data);
  }
}
removeBatch();
