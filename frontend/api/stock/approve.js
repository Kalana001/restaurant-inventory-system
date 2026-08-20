import { withAuth } from '../_lib/withAuth.js';
import { supabaseAdmin, logAudit } from '../_lib/supabase.js';

async function handler(req, res) {
  if (req.method !== 'PATCH' && req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { id, movementId, approve } = req.body;
    const targetId = id || movementId || req.query.id;

    if (!targetId || typeof approve !== 'boolean') {
      return res.status(400).json({ status: 'error', message: 'Movement ID and approve boolean are required.' });
    }

    const userId = req.user?.id || '';

    const { data: movement, error: fetchErr } = await supabaseAdmin
      .from('stock_movements')
      .select('*')
      .eq('id', targetId)
      .single();

    if (fetchErr || !movement) return res.status(404).json({ status: 'error', message: 'Stock movement not found' });
    if (movement.status !== 'PENDING') return res.status(400).json({ status: 'error', message: `Movement is already ${movement.status}` });

    const newStatus = approve ? 'APPROVED' : 'REJECTED';

    if (approve && movement.batch_id) {
      const { data: batch, error: batchErr } = await supabaseAdmin
        .from('batches')
        .select('*')
        .eq('id', movement.batch_id)
        .single();

      if (batchErr || !batch) return res.status(404).json({ status: 'error', message: 'Batch not found for pending movement' });

      if (movement.type === 'STOCK_OUT' || movement.type === 'ADJUSTMENT') {
        if (Number(batch.available_qty) < Number(movement.quantity)) {
          return res.status(400).json({ status: 'error', message: `Insufficient stock. Available: ${batch.available_qty}, Required: ${movement.quantity}` });
        }
        await supabaseAdmin.from('batches').update({
          current_qty: Number(batch.current_qty) - Number(movement.quantity),
          available_qty: Number(batch.available_qty) - Number(movement.quantity)
        }).eq('id', movement.batch_id);
      } else if (movement.type === 'STOCK_IN') {
        await supabaseAdmin.from('batches').update({
          current_qty: Number(batch.current_qty) + Number(movement.quantity),
          available_qty: Number(batch.available_qty) + Number(movement.quantity)
        }).eq('id', movement.batch_id);
      }
    }

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('stock_movements')
      .update({ status: newStatus, approved_by: userId, approved_at: new Date().toISOString() })
      .eq('id', targetId)
      .select('*')
      .single();

    if (updateErr) throw updateErr;

    await logAudit(userId, `STOCK_MOVEMENT_${newStatus}`, 'stock_movements', targetId, { status: 'PENDING' }, { status: newStatus });

    return res.status(200).json({ status: 'success', data: { movement: updated } });

  } catch (err) {
    console.error('[STOCK APPROVE ERROR]:', err);
    return res.status(400).json({ status: 'error', message: err.message || 'Failed to update stock adjustment' });
  }
}

export default withAuth(handler);
