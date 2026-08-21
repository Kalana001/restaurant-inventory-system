import { withAuth } from '../_lib/withAuth.js';
import { supabaseAdmin, logAudit } from '../_lib/supabase.js';

async function handler(req, res) {
  if (req.method !== 'DELETE' && req.method !== 'POST') {
    return res.status(405).json({ status: 'error', message: 'Method Not Allowed' });
  }

  try {
    const { poId, id } = req.body || {};
    const targetPoId = poId || id || req.query.poId || req.query.id;

    if (!targetPoId) {
      return res.status(400).json({ status: 'error', message: 'Purchase Order ID is required.' });
    }

    const userId = req.user?.id || '';

    // 1. Fetch PO and all related entities
    const { data: po, error: poErr } = await supabaseAdmin
      .from('purchase_orders')
      .select(`
        *,
        suppliers (*),
        purchase_order_items (*, inventory_items ( name, sku )),
        supplier_payments (*),
        grns (
          id, grn_number, total_amount,
          grn_items (
            id, quantity, cost_price, batch_id, item_id,
            inventory_items ( name, sku ),
            batches (*)
          )
        )
      `)
      .eq('id', targetPoId)
      .single();

    if (poErr || !po) {
      return res.status(404).json({ status: 'error', message: 'Purchase order not found.' });
    }

    // 2. Financial Safety Check: Block deletion if payments exist
    const hasPayments = (po.supplier_payments && po.supplier_payments.length > 0) || Number(po.paid_amount || 0) > 0;
    if (hasPayments) {
      const paidAmt = Number(po.paid_amount || 0).toFixed(2);
      return res.status(400).json({
        status: 'error',
        message: `Cannot delete purchase order ${po.po_number} because payments totaling LKR ${paidAmt} have been recorded against it. Please delete or reverse the payment in Supplier Payments first.`
      });
    }

    // 3. Stock Safety Check: If GRN received, check if stock was already consumed
    if (po.grns && po.grns.length > 0) {
      for (const grn of po.grns) {
        if (!grn.grn_items) continue;
        for (const gi of grn.grn_items) {
          if (!gi.batch_id) continue;
          const { data: batch } = await supabaseAdmin
            .from('batches')
            .select('*')
            .eq('id', gi.batch_id)
            .single();

          if (batch) {
            const avail = Number(batch.available_qty || 0);
            const reqQty = Number(gi.quantity || 0);
            if (avail < reqQty) {
              const itemName = gi.inventory_items?.name || 'Item';
              return res.status(400).json({
                status: 'error',
                message: `Cannot delete purchase order ${po.po_number} because ${reqQty} units of "${itemName}" were received, but only ${avail} units remain available in batch ${batch.batch_number} (stock has already been consumed by kitchen stock outs).`
              });
            }
          }
        }
      }
    }

    // 4. Perform GRN, Stock & Batch Reversals
    if (po.grns && po.grns.length > 0) {
      for (const grn of po.grns) {
        // Delete stock movements linked to this GRN
        await supabaseAdmin
          .from('stock_movements')
          .delete()
          .eq('reference_id', grn.id)
          .eq('reference_type', 'GRN');

        // Deduct/clean batches
        if (grn.grn_items) {
          for (const gi of grn.grn_items) {
            if (!gi.batch_id) continue;
            const { data: batch } = await supabaseAdmin
              .from('batches')
              .select('*')
              .eq('id', gi.batch_id)
              .single();

            if (batch) {
              const qty = Number(gi.quantity || 0);
              const newCur = Math.max(0, Number(batch.current_qty || 0) - qty);
              const newAvail = Math.max(0, Number(batch.available_qty || 0) - qty);

              if (newCur === 0) {
                // Delete empty batch
                await supabaseAdmin.from('batches').delete().eq('id', gi.batch_id);
              } else {
                await supabaseAdmin
                  .from('batches')
                  .update({
                    current_qty: newCur,
                    available_qty: newAvail,
                    status: newAvail === 0 ? 'OUT_OF_STOCK' : 'ACTIVE'
                  })
                  .eq('id', gi.batch_id);
              }
            }
          }
        }

        // Delete GRN items & GRN record
        await supabaseAdmin.from('grn_items').delete().eq('grn_id', grn.id);
        await supabaseAdmin.from('grns').delete().eq('id', grn.id);
      }

      // Revert supplier outstanding balance for unpaid portion of this PO
      const unpaidAmount = Math.max(0, Number(po.total_amount || 0) - Number(po.paid_amount || 0));
      if (unpaidAmount > 0 && po.supplier_id) {
        const { data: sup } = await supabaseAdmin
          .from('suppliers')
          .select('outstanding_balance')
          .eq('id', po.supplier_id)
          .single();

        if (sup) {
          const newSupBalance = Math.max(0, Number(sup.outstanding_balance || 0) - unpaidAmount);
          await supabaseAdmin
            .from('suppliers')
            .update({ outstanding_balance: newSupBalance })
            .eq('id', po.supplier_id);
        }
      }
    }

    // 5. Delete PO items & PO header
    await supabaseAdmin.from('purchase_order_items').delete().eq('po_id', po.id);
    await supabaseAdmin.from('purchase_orders').delete().eq('id', po.id);

    // 6. Log Audit Trail
    await logAudit(
      userId,
      'DELETE_PURCHASE_ORDER',
      'purchase_orders',
      po.id,
      {
        po_number: po.po_number,
        supplier_id: po.supplier_id,
        supplier_name: po.suppliers?.name,
        total_amount: po.total_amount,
        status: po.status,
        item_count: po.purchase_order_items?.length || 0
      },
      null,
      req.headers['x-forwarded-for'] || req.socket?.remoteAddress
    );

    return res.status(200).json({
      status: 'success',
      message: `Purchase order ${po.po_number} and all associated records were deleted successfully.`
    });

  } catch (err) {
    console.error('[DELETE PURCHASE ORDER ERROR]:', err);
    return res.status(500).json({ status: 'error', message: err.message || 'Failed to delete purchase order' });
  }
}

export default withAuth(handler);
