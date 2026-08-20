import { withAuth } from '../_lib/withAuth.js';
import { supabaseAdmin, logAudit } from '../_lib/supabase.js';

async function handler(req, res) {
  if (req.method !== 'PATCH' && req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { id, poId, lines, grandTotal } = req.body;
    const targetPoId = id || poId || req.query.id;

    if (!targetPoId) return res.status(400).json({ status: 'error', message: 'Purchase Order ID is required.' });

    const { data: po, error: fetchErr } = await supabaseAdmin
      .from('purchase_orders')
      .select('*')
      .eq('id', targetPoId)
      .single();

    if (fetchErr || !po) return res.status(404).json({ status: 'error', message: 'Purchase Order not found' });

    const oldTotal = Number(po.total_amount || 0);
    const newTotal = Number(grandTotal || 0);
    const difference = newTotal - oldTotal;

    await supabaseAdmin.from('purchase_orders').update({ total_amount: newTotal }).eq('id', targetPoId);

    if (difference !== 0) {
      const { data: supData } = await supabaseAdmin.from('suppliers').select('outstanding_balance').eq('id', po.supplier_id).single();
      if (supData) {
        const newBalance = Number(supData.outstanding_balance || 0) + difference;
        await supabaseAdmin.from('suppliers').update({ outstanding_balance: newBalance }).eq('id', po.supplier_id);
      }
    }

    if (Array.isArray(lines)) {
      for (const line of lines) {
        const costPrice = Number(line.new_cost_price || 0);
        const totalCost = costPrice * Number(line.quantity || 0);

        await supabaseAdmin.from('purchase_order_items')
          .update({ cost_price: costPrice, total_cost: totalCost })
          .eq('id', line.id);

        const { data: grns } = await supabaseAdmin.from('grns').select('id').eq('po_id', targetPoId);
        if (grns && grns.length > 0) {
          for (const grn of grns) {
            const { data: stockIns } = await supabaseAdmin.from('stock_movements')
              .select('id, batch_id')
              .eq('reference_type', 'GRN')
              .eq('reference_id', grn.id)
              .eq('item_id', line.item_id)
              .eq('type', 'STOCK_IN');

            if (stockIns && stockIns.length > 0) {
              for (const stockIn of stockIns) {
                await supabaseAdmin.from('stock_movements').update({ cost_price: costPrice }).eq('id', stockIn.id);
                if (stockIn.batch_id) {
                  await supabaseAdmin.from('stock_movements').update({ cost_price: costPrice }).eq('batch_id', stockIn.batch_id);
                }
              }
            }
          }
        }

        await supabaseAdmin.from('inventory_items').update({ cost_price: costPrice }).eq('id', line.item_id);
      }
    }

    await logAudit(req.user?.id, 'DEEP_PRICE_CORRECTION', 'purchase_orders', targetPoId, { oldTotal }, { newTotal, difference });

    return res.status(200).json({ status: 'success', message: 'Deep Price Correction applied successfully' });

  } catch (err) {
    console.error('[PRICE CORRECTION ERROR]:', err);
    return res.status(400).json({ status: 'error', message: err.message || 'Failed to apply price correction' });
  }
}

export default withAuth(handler);
