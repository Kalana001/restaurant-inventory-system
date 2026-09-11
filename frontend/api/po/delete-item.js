import { withAuth } from '../_lib/withAuth.js';
import { supabaseAdmin, logAudit } from '../_lib/supabase.js';

async function handler(req, res) {
  if (req.method !== 'DELETE' && req.method !== 'POST') {
    return res.status(405).json({ status: 'error', message: 'Method Not Allowed' });
  }

  try {
    const { poId, poItemId } = req.body || {};
    const targetPoId = poId || req.query.poId;
    const targetItemId = poItemId || req.query.poItemId;

    if (!targetPoId || !targetItemId) {
      return res.status(400).json({ status: 'error', message: 'Purchase Order ID and PO Item ID are required.' });
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
            id, quantity, cost_price, total_cost, batch_id, item_id,
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

    const targetItem = (po.purchase_order_items || []).find(i => i.id === targetItemId);
    if (!targetItem) {
      return res.status(404).json({ status: 'error', message: 'Item line not found in this purchase order.' });
    }

    // Safety: Prevent deleting the only item line (advise deleting the whole PO instead)
    if (po.purchase_order_items.length <= 1) {
      return res.status(400).json({
        status: 'error',
        message: 'This is the only item in the purchase order. Please use "Delete PO" to delete the entire order.'
      });
    }

    const itemName = targetItem.inventory_items?.name || 'Item';
    const lineCost = Number(targetItem.total_cost || (Number(targetItem.quantity || 0) * Number(targetItem.cost_price || 0)) || 0);

    // 2. If GRNs exist for this PO, perform stock consumption check
    const matchingGrnItems = [];
    if (po.grns && po.grns.length > 0) {
      for (const grn of po.grns) {
        if (!grn.grn_items) continue;
        for (const gi of grn.grn_items) {
          if (gi.item_id === targetItem.item_id) {
            matchingGrnItems.push({ grn, gi });

            if (gi.batch_id) {
              const { data: batch, error: bErr } = await supabaseAdmin
                .from('batches')
                .select('*')
                .eq('id', gi.batch_id)
                .single();

              if (batch) {
                const avail = Number(batch.available_qty || 0);
                const reqQty = Number(gi.quantity || 0);
                if (avail < reqQty) {
                  return res.status(400).json({
                    status: 'error',
                    message: `Cannot remove "${itemName}" because ${reqQty} units were received into stock, but only ${avail} units remain available in batch ${batch.batch_number} (stock has already been consumed by kitchen stock outs).`
                  });
                }
              }
            }
          }
        }
      }
    }

    // 3. Perform GRN, Stock & Batch Reversals for this specific item
    if (matchingGrnItems.length > 0) {
      for (const { grn, gi } of matchingGrnItems) {
        let shouldDeleteBatch = false;
        let newCurrentQty = 0;
        let newAvailQty = 0;

        if (gi.batch_id) {
          const { data: batch } = await supabaseAdmin
            .from('batches')
            .select('*')
            .eq('id', gi.batch_id)
            .single();

          if (batch) {
            const qty = Number(gi.quantity || 0);
            newCurrentQty = Math.max(0, Number(batch.current_qty || 0) - qty);
            newAvailQty = Math.max(0, Number(batch.available_qty || 0) - qty);
            if (newCurrentQty === 0) {
              shouldDeleteBatch = true;
            }
          }
        }

        // A. Delete stock movements for this item and GRN
        await supabaseAdmin
          .from('stock_movements')
          .delete()
          .eq('reference_id', grn.id)
          .eq('reference_type', 'GRN')
          .eq('item_id', gi.item_id);

        if (shouldDeleteBatch && gi.batch_id) {
          await supabaseAdmin
            .from('stock_movements')
            .delete()
            .eq('batch_id', gi.batch_id);
        }

        // B. Delete GRN item record (clears foreign key constraint on batches)
        const { error: giDelErr } = await supabaseAdmin
          .from('grn_items')
          .delete()
          .eq('id', gi.id);
        if (giDelErr) throw giDelErr;

        // C. Delete or update the batch
        if (gi.batch_id) {
          if (shouldDeleteBatch) {
            const { error: bDelErr } = await supabaseAdmin
              .from('batches')
              .delete()
              .eq('id', gi.batch_id);
            if (bDelErr) throw bDelErr;
          } else {
            const { error: bUpdErr } = await supabaseAdmin
              .from('batches')
              .update({
                current_qty: newCurrentQty,
                available_qty: newAvailQty,
                status: newAvailQty === 0 ? 'OUT_OF_STOCK' : 'ACTIVE'
              })
              .eq('id', gi.batch_id);
            if (bUpdErr) throw bUpdErr;
          }
        }

        // D. Update GRN Total
        const newGrnTotal = Math.max(0, Number(grn.total_amount || 0) - Number(gi.total_cost || 0));
        const { error: grnUpdErr } = await supabaseAdmin
          .from('grns')
          .update({ total_amount: newGrnTotal })
          .eq('id', grn.id);
        if (grnUpdErr) throw grnUpdErr;
      }

      // Revert Supplier Outstanding Balance by this item's cost
      if (lineCost > 0 && po.supplier_id) {
        const { data: sup } = await supabaseAdmin
          .from('suppliers')
          .select('outstanding_balance')
          .eq('id', po.supplier_id)
          .single();

        if (sup) {
          const newSupBalance = Math.max(0, Number(sup.outstanding_balance || 0) - lineCost);
          await supabaseAdmin
            .from('suppliers')
            .update({ outstanding_balance: newSupBalance })
            .eq('id', po.supplier_id);
        }
      }
    }

    // 4. Delete the PO item row
    const { error: poItemDelErr } = await supabaseAdmin
      .from('purchase_order_items')
      .delete()
      .eq('id', targetItemId);
    if (poItemDelErr) throw poItemDelErr;

    // 5. Recalculate PO total amount
    const remainingItems = (po.purchase_order_items || []).filter(i => i.id !== targetItemId);
    const rawTotal = remainingItems.reduce((acc, curr) => acc + Number(curr.total_cost || (Number(curr.quantity || 0) * Number(curr.cost_price || 0))), 0);
    const newPoTotal = Math.max(0, rawTotal - Number(po.discount_amount || 0));

    const { error: poUpdErr } = await supabaseAdmin
      .from('purchase_orders')
      .update({ total_amount: newPoTotal })
      .eq('id', targetPoId);
    if (poUpdErr) throw poUpdErr;

    // 6. Log Audit Trail
    await logAudit(
      userId,
      'DELETE_PURCHASE_ORDER_ITEM',
      'purchase_orders',
      targetPoId,
      {
        po_number: po.po_number,
        supplier_name: po.suppliers?.name,
        removed_item: {
          item_id: targetItem.item_id,
          item_name: itemName,
          quantity: targetItem.quantity,
          cost_price: targetItem.cost_price,
          total_cost: lineCost
        },
        old_po_total: po.total_amount,
        new_po_total: newPoTotal
      },
      null,
      req.headers['x-forwarded-for'] || req.socket?.remoteAddress
    );

    return res.status(200).json({
      status: 'success',
      message: `Item "${itemName}" removed from PO ${po.po_number} successfully.`,
      newTotal: newPoTotal
    });

  } catch (err) {
    console.error('[DELETE PO ITEM ERROR]:', err);
    return res.status(500).json({ status: 'error', message: err.message || 'Failed to delete purchase order item' });
  }
}

export default withAuth(handler);
