const fs = require('fs');
const path = require('path');
const p = path.join('c:', 'Users', 'User', 'Downloads', 'restaurant-inventory-system', 'frontend', 'src', 'pages', 'Inventory.tsx');
let lines = fs.readFileSync(p, 'utf8').split('\n');

const startIndex = lines.findIndex(l => l.includes('// 1. Create the batch'));
const endIndex = lines.findIndex(l => l.includes('reference_type: \'OPENING_STOCK\','));

if (startIndex !== -1 && endIndex !== -1) {
  lines.splice(startIndex, endIndex - startIndex + 3,
    '            const { error: rpcErr } = await supabase.rpc(\'process_opening_stock\', {',
    '              p_item_id: savedItemId,',
    '              p_supplier_id: supplierId || null,',
    '              p_qty: qty,',
    '              p_cost_price: Number(costPrice) || 0,',
    '              p_batch_number: batchNo,',
    '              p_expiry_date: openingExpiryDate || null,',
    '              p_created_by: user?.id',
    '            });',
    '',
    '            if (rpcErr) throw rpcErr;'
  );
  fs.writeFileSync(p, lines.join('\n'));
  console.log('patched');
} else {
  console.log('not found', startIndex, endIndex);
}
