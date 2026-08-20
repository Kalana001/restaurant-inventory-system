import { withAuth } from '../_lib/withAuth.js';
import { supabaseAdmin, logAudit } from '../_lib/supabase.js';
import { convertQuantity } from '../_lib/conversion.js';

async function handler(req, res) {
  const userId = req.user?.id || '';

  // GET: Fetch pending movements
  if (req.method === 'GET') {
    try {
      const { data, error } = await supabaseAdmin
        .from('stock_movements')
        .select(`
          id, movement_number, type, quantity, cost_price, created_at, status, reference_type,
          inventory_items ( id, name, sku ),
          movement_reasons ( name ),
          batches ( id, batch_number ),
          profiles:created_by ( username )
        `)
        .eq('status', 'PENDING')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return res.status(200).json({ status: 'success', data: { movements: data || [] } });
    } catch (err) {
      console.error('[GET PENDING ERROR]:', err);
      return res.status(400).json({ status: 'error', message: err.message || 'Failed to fetch pending movements' });
    }
  }

  // POST: Create Stock Movement (Single or Bulk)
  if (req.method === 'POST') {
    try {
      const { itemId, batchId, type, quantity, unitId, reasonId, price, receiptNumber, date, items } = req.body;

      // Support bulk submission
      const entries = Array.isArray(items) && items.length > 0 ? items : [{ itemId, batchId, type, quantity, unitId, reasonId, price, receiptNumber, date }];

      const results = [];

      for (const entry of entries) {
        const eItemId = entry.itemId;
        const eType = entry.type;
        const eQuantity = entry.quantity;
        const eUnitId = entry.unitId;
        const eReasonId = entry.reasonId;
        const eBatchId = entry.batchId;
        const ePrice = entry.price;
        const eReceipt = entry.receiptNumber || receiptNumber || 'MANUAL';
        const eDate = entry.date || date;

        if (!eItemId || !eType || !eQuantity || !eUnitId || !eReasonId) {
          throw new Error('Item, type, quantity, unit, and reason are required.');
        }

        const { data: item, error: itemErr } = await supabaseAdmin
          .from('inventory_items')
          .select('*')
          .eq('id', eItemId)
          .single();

        if (itemErr || !item) throw new Error('Inventory item not found');

        if (eType !== 'STOCK_IN' && item.is_batch_tracked && !eBatchId) {
          throw new Error(`${item.name}: batch-tracked item requires a batch selection.`);
        }

        const qtyBase = await convertQuantity(Number(eQuantity), eUnitId, item.base_unit_id, eItemId);
        const customPrice = ePrice !== undefined && ePrice !== '' ? Number(ePrice) : Number(item.cost_price);
        const costPriceBase = customPrice / Number(item.purchase_to_base_factor || 1);

        let finalBatchId = eBatchId;
        if (eType === 'STOCK_IN') {
          const batchNumber = `MAN-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
          const { data: newBatch, error: batchErr } = await supabaseAdmin
            .from('batches')
            .insert({
              batch_number: batchNumber,
              item_id: eItemId,
              supplier_id: item.supplier_id || null,
              received_date: eDate ? new Date(eDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
              current_qty: 0,
              available_qty: 0,
              status: 'ACTIVE'
            })
            .select('id')
            .single();

          if (batchErr || !newBatch) throw new Error(batchErr?.message || 'Failed to create batch for manual Stock In.');
          finalBatchId = newBatch.id;
        }

        // Check system settings for approvals
        const { data: settings } = await supabaseAdmin
          .from('system_settings')
          .select('value')
          .eq('key', 'REQUIRE_ADJUSTMENT_APPROVAL')
          .single();

        let status = 'APPROVED';
        if (eType === 'ADJUSTMENT' && settings?.value === 'true') {
          const { data: profile } = await supabaseAdmin.from('profiles').select('roles(name)').eq('id', userId).single();
          if (profile?.roles?.name === 'STORE_KEEPER') status = 'PENDING';
        }

        let { data: movementId, error: dbError } = await supabaseAdmin.rpc(
          'process_stock_movement_transaction',
          {
            p_item_id: eItemId,
            p_batch_id: finalBatchId || null,
            p_type: eType,
            p_qty_base: qtyBase,
            p_cost_base: costPriceBase,
            p_reason_id: eReasonId,
            p_created_by: userId,
            p_status: status,
            p_reference_id: null,
            p_reference_type: eReceipt
          }
        );

        // Sequence auto-heal if duplicate movement_number
        if (dbError && (dbError.message.includes('stock_movements_movement_number_key') || dbError.code === '23505')) {
          await supabaseAdmin.from('stock_movements').insert({
            movement_number: `DUMMY-${Date.now()}`,
            item_id: eItemId,
            type: 'ADJUSTMENT',
            quantity: 0,
            cost_price: 0,
            reason_id: eReasonId,
            created_by: userId,
            status: 'APPROVED'
          });

          const retry = await supabaseAdmin.rpc('process_stock_movement_transaction', {
            p_item_id: eItemId,
            p_batch_id: finalBatchId || null,
            p_type: eType,
            p_qty_base: qtyBase,
            p_cost_base: costPriceBase,
            p_reason_id: eReasonId,
            p_created_by: userId,
            p_status: status,
            p_reference_id: null,
            p_reference_type: eReceipt
          });

          if (!retry.error && retry.data) {
            movementId = retry.data;
            dbError = null;
          }
        }

        if (dbError) throw new Error(dbError.message || 'Failed to process stock movement');

        if (eDate && movementId) {
          const isoDate = `${eDate}T12:00:00.000Z`;
          await supabaseAdmin.from('stock_movements').update({ created_at: isoDate }).eq('id', movementId);
        }

        if (eType === 'STOCK_IN' && ePrice !== undefined && ePrice !== '') {
          await supabaseAdmin.from('inventory_items').update({ cost_price: Number(ePrice) }).eq('id', eItemId);
        }

        await logAudit(userId, `STOCK_${eType}_${status}`, 'stock_movements', movementId, null, {
          itemId: eItemId, batchId: finalBatchId, type: eType, quantity: eQuantity, qtyBase, reasonId: eReasonId, status
        }, req.headers['x-forwarded-for'] || req.socket?.remoteAddress);

        results.push(movementId);
      }

      return res.status(201).json({
        status: 'success',
        data: { movementId: results[0], movementIds: results, message: 'Stock movement(s) processed successfully' }
      });

    } catch (err) {
      console.error('[STOCK MOVEMENT ERROR]:', err);
      return res.status(400).json({ status: 'error', message: err.message || 'Failed to process stock movement' });
    }
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}

export default withAuth(handler);
