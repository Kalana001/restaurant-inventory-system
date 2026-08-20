import { withAuth } from '../_lib/withAuth.js';
import { supabaseAdmin, logAudit } from '../_lib/supabase.js';

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { poId, supplierId, invoiceNumber, totalAmount, remarks, items } = req.body;

    if (!supplierId || !totalAmount || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ status: 'error', message: 'Invalid GRN details. Supplier, total amount, and items are required.' });
    }

    const userId = req.user?.id || '';

    let { data: grnId, error: transactionError } = await supabaseAdmin.rpc(
      'process_grn_transaction',
      {
        p_po_id: poId || null,
        p_supplier_id: supplierId,
        p_received_by: userId,
        p_invoice_number: invoiceNumber || null,
        p_total_amount: Number(totalAmount),
        p_remarks: remarks || '',
        p_items: items
      }
    );

    // Auto-heal duplicate sequence if any
    if (transactionError && (transactionError.message.includes('grns_grn_number_key') || transactionError.code === '23505')) {
      await supabaseAdmin.from('grns').insert({
        grn_number: `DUMMY-${Date.now()}`,
        supplier_id: supplierId,
        received_by: userId,
        total_amount: 0,
        remarks: 'System Sequence Auto-Fix'
      });

      const retryResult = await supabaseAdmin.rpc(
        'process_grn_transaction',
        {
          p_po_id: poId || null,
          p_supplier_id: supplierId,
          p_received_by: userId,
          p_invoice_number: invoiceNumber || null,
          p_total_amount: Number(totalAmount),
          p_remarks: remarks || '',
          p_items: items
        }
      );

      if (!retryResult.error && retryResult.data) {
        grnId = retryResult.data;
        transactionError = null;
      }
    }

    if (transactionError || !grnId) {
      console.error('[GRN TRANSACTION ERROR]:', transactionError);
      return res.status(400).json({ status: 'error', message: transactionError?.message || 'Failed to process GRN transaction' });
    }

    // 1. If linked to a PO, synchronize the PO total and item quantities/prices
    if (poId) {
      await supabaseAdmin.from('purchase_orders').update({ total_amount: Number(totalAmount) }).eq('id', poId);

      for (const item of items) {
        const id = item.item_id ?? item.itemId;
        const qty = Number(item.quantity || 0);
        const price = Number(item.cost_price ?? item.costPrice ?? 0);
        const total = qty * price;

        await supabaseAdmin
          .from('purchase_order_items')
          .update({
            quantity: qty,
            cost_price: price,
            total_cost: total
          })
          .eq('po_id', poId)
          .eq('item_id', id);
      }
    }

    // 2. Update global item cost prices (ONLY if quantity and price > 0 so unreceived 0 items don't overwrite catalog)
    for (const item of items) {
      const price = Number(item.cost_price ?? item.costPrice);
      const qty = Number(item.quantity ?? item.quantity);
      const id = item.item_id ?? item.itemId;
      if (price > 0 && qty > 0) {
        await supabaseAdmin.from('inventory_items').update({ cost_price: price }).eq('id', id);
      }
    }

    await logAudit(userId, 'CREATE_GRN', 'grns', grnId, null, { poId, supplierId, invoiceNumber, totalAmount, remarks, items });

    await supabaseAdmin.from('notifications').insert({
      title: 'Goods Received Note Issued',
      message: 'Goods Received Note for supplier has been issued. Stock has been incremented.',
      type: 'LOW_STOCK',
      is_read: false
    });

    return res.status(201).json({ status: 'success', data: { grnId, message: 'GRN created successfully' } });

  } catch (err) {
    console.error('[GRN HANDLER ERROR]:', err);
    return res.status(400).json({ status: 'error', message: err.message || 'Failed to create GRN' });
  }
}

export default withAuth(handler);
