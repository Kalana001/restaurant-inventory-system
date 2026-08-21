import { withAuth } from '../_lib/withAuth.js';
import { supabaseAdmin, logAudit } from '../_lib/supabase.js';

async function handler(req, res) {
  if (req.method !== 'DELETE' && req.method !== 'POST') {
    return res.status(405).json({ status: 'error', message: 'Method Not Allowed' });
  }

  try {
    const { movementId, id, receiptNumber } = req.body || {};
    const targetMovementId = movementId || id || req.query.movementId || req.query.id;
    const targetReceiptNumber = receiptNumber || req.query.receiptNumber;

    if (!targetMovementId && !targetReceiptNumber) {
      return res.status(400).json({ status: 'error', message: 'Movement ID or Receipt Number is required.' });
    }

    const userId = req.user?.id || '';

    // 1. Fetch the movement(s) to delete
    let movements = [];
    if (targetMovementId) {
      const { data, error } = await supabaseAdmin
        .from('stock_movements')
        .select('*, inventory_items(name, sku, base_unit:units!inventory_items_base_unit_id_fkey(abbreviation)), batches(*)')
        .eq('id', targetMovementId);

      if (error) throw error;
      movements = data || [];
    } else if (targetReceiptNumber) {
      const { data, error } = await supabaseAdmin
        .from('stock_movements')
        .select('*, inventory_items(name, sku, base_unit:units!inventory_items_base_unit_id_fkey(abbreviation)), batches(*)')
        .eq('reference_type', targetReceiptNumber);

      if (error) throw error;
      movements = data || [];
    }

    if (movements.length === 0) {
      return res.status(404).json({ status: 'error', message: 'No matching stock movements found.' });
    }

    // 2. Safety Check: GRN-based movements cannot be deleted from Adjustments
    const grnMove = movements.find(m => m.reference_type === 'GRN');
    if (grnMove) {
      return res.status(400).json({
        status: 'error',
        message: 'Cannot delete stock entries created from Goods Received Notes (GRN). Please manage POs and GRNs from the Purchase Orders page.'
      });
    }

    // 3. Safety Check: Check if any receipt is linked to a JAT Settlement
    const receiptNums = [...new Set(movements.map(m => m.reference_type).filter(Boolean))];
    if (receiptNums.length > 0) {
      const { data: settlements } = await supabaseAdmin
        .from('jat_settlements')
        .select('id, notes, settlement_number')
        .neq('status', 'BOUNCED');

      if (settlements && settlements.length > 0) {
        for (const s of settlements) {
          if (!s.notes) continue;
          for (const rNum of receiptNums) {
            if (s.notes.includes(rNum)) {
              return res.status(400).json({
                status: 'error',
                message: `Cannot delete stock movement(s) under receipt ${rNum} because a JAT settlement payment (${s.settlement_number}) is recorded for it. Please adjust the settlement first.`
              });
            }
          }
        }
      }
    }

    // 4. Safety Check for STOCK_IN: Verify sufficient stock is available to subtract
    for (const m of movements) {
      if (m.type === 'STOCK_IN' && m.status === 'APPROVED' && m.batch_id) {
        const batch = m.batches;
        if (batch) {
          const avail = Number(batch.available_qty || 0);
          const reqQty = Number(m.quantity || 0);
          if (avail < reqQty) {
            const itemName = m.inventory_items?.name || 'Item';
            return res.status(400).json({
              status: 'error',
              message: `Cannot delete Stock In for "${itemName}". ${reqQty} units were stocked in, but only ${avail} units remain available in batch ${batch.batch_number} (stock has already been consumed by subsequent stock outs).`
            });
          }
        }
      }
    }

    // 5. Perform Stock Reversals & Deletion
    const deletedMovements = [];

    for (const m of movements) {
      const itemName = m.inventory_items?.name || 'Item';
      const qty = Number(m.quantity || 0);

      // Revert batch stock if movement was APPROVED
      if (m.status === 'APPROVED' && m.batch_id) {
        const { data: currentBatch } = await supabaseAdmin
          .from('batches')
          .select('*')
          .eq('id', m.batch_id)
          .single();

        if (currentBatch) {
          if (m.type === 'STOCK_OUT' || m.type === 'ADJUSTMENT') {
            // Restore stock back into batch
            const newCur = Number(currentBatch.current_qty || 0) + qty;
            const newAvail = Number(currentBatch.available_qty || 0) + qty;
            const newStatus = newAvail > 0 ? 'ACTIVE' : currentBatch.status;

            await supabaseAdmin
              .from('batches')
              .update({
                current_qty: newCur,
                available_qty: newAvail,
                status: newStatus
              })
              .eq('id', m.batch_id);

          } else if (m.type === 'STOCK_IN') {
            // Deduct stock from batch
            const newCur = Math.max(0, Number(currentBatch.current_qty || 0) - qty);
            const newAvail = Math.max(0, Number(currentBatch.available_qty || 0) - qty);
            const newStatus = newAvail === 0 ? 'OUT_OF_STOCK' : 'ACTIVE';

            await supabaseAdmin
              .from('batches')
              .update({
                current_qty: newCur,
                available_qty: newAvail,
                status: newStatus
              })
              .eq('id', m.batch_id);

            // If manual batch created solely for this stock-in and now empty, delete it
            if (currentBatch.batch_number.startsWith('MAN-') && newCur === 0) {
              await supabaseAdmin.from('batches').delete().eq('id', m.batch_id);
            }
          }
        }
      }

      // Delete the movement record
      await supabaseAdmin.from('stock_movements').delete().eq('id', m.id);

      // Log Audit Trail
      await logAudit(
        userId,
        `DELETE_STOCK_${m.type}`,
        'stock_movements',
        m.id,
        {
          movement_number: m.movement_number,
          item_name: itemName,
          type: m.type,
          quantity: qty,
          batch_id: m.batch_id,
          reference_type: m.reference_type
        },
        null,
        req.headers['x-forwarded-for'] || req.socket?.remoteAddress
      );

      deletedMovements.push({
        id: m.id,
        movement_number: m.movement_number,
        item_name: itemName,
        quantity: qty
      });
    }

    return res.status(200).json({
      status: 'success',
      message: `Successfully deleted ${movements.length} stock movement(s) and updated inventory balances.`,
      data: { deletedMovements }
    });

  } catch (err) {
    console.error('[DELETE STOCK MOVEMENT ERROR]:', err);
    return res.status(500).json({ status: 'error', message: err.message || 'Failed to delete stock movement' });
  }
}

export default withAuth(handler);
