import { Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';
import { BadRequestError, NotFoundError, ForbiddenError } from '../utils/errors';
import { convertQuantity } from '../utils/conversion';
import { logAudit } from '../services/audit.service';

export const createStockMovement = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { itemId, batchId, type, quantity, unitId, reasonId } = req.body;

    if (!itemId || !type || !quantity || !unitId || !reasonId) {
      throw new BadRequestError('Item, type, quantity, unit, and reason are required.');
    }

    const userId = req.user?.id || '';
    const userRole = req.user?.role.name || '';

    // 1. Fetch item profile to verify units
    const { data: item, error: itemErr } = await supabase
      .from('inventory_items')
      .select('*')
      .eq('id', itemId)
      .single();

    if (itemErr || !item) {
      throw new NotFoundError('Inventory item not found');
    }

    // 2. Check if batch tracking is required for this item
    if (item.is_batch_tracked && !batchId) {
      throw new BadRequestError('Batch ID is required for batch-tracked items.');
    }

    // 3. Convert quantity to base unit
    const qtyBase = await convertQuantity(Number(quantity), unitId, item.base_unit_id, itemId);
    const costPriceBase = Number(item.cost_price) / Number(item.purchase_to_base_factor);

    // 4. Read system settings for approvals
    const { data: settings } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'REQUIRE_ADJUSTMENT_APPROVAL')
      .single();

    const requireApprovalSetting = settings?.value === 'true';

    // Approvals are required if the setting is true AND the user is a Store Keeper
    let status = 'APPROVED';
    if (type === 'ADJUSTMENT' && requireApprovalSetting && userRole === 'STORE_KEEPER') {
      status = 'PENDING';
    }

    // 5. Call PostgreSQL stored function to insert movement and update stock
    const { data: movementId, error: dbError } = await supabase.rpc(
      'process_stock_movement_transaction',
      {
        p_item_id: itemId,
        p_batch_id: batchId || null,
        p_type: type,
        p_qty_base: qtyBase,
        p_cost_base: costPriceBase,
        p_reason_id: reasonId,
        p_created_by: userId,
        p_status: status,
        p_reference_id: null,
        p_reference_type: 'MANUAL'
      }
    );

    if (dbError) {
      console.error('[STOCK MOVEMENT ERROR]:', dbError);
      throw new BadRequestError(dbError.message || 'Failed to process stock movement');
    }

    // 6. Log Audit Trail
    await logAudit(
      userId,
      `STOCK_${type}_${status}`,
      'stock_movements',
      movementId,
      null,
      { itemId, batchId, type, quantity, unitId, reasonId, qtyBase, status },
      req.ip
    );

    // 7. Create Notification
    if (status === 'PENDING') {
      await supabase.from('notifications').insert({
        title: 'Adjustment Pending Approval',
        message: `A manual stock adjustment for item ${item.name} is waiting for manager approval.`,
        type: 'PENDING_APPROVAL',
        is_read: false
      });
    }

    res.status(201).json({
      status: 'success',
      data: {
        movementId,
        status,
        message: status === 'PENDING' 
          ? 'Stock adjustment submitted for approval' 
          : 'Stock movement logged successfully'
      }
    });
  } catch (error) {
    next(error);
  }
};

export const getPendingMovements = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { data: movements, error } = await supabase
      .from('stock_movements')
      .select(`
        id,
        movement_number,
        type,
        quantity,
        status,
        created_at,
        inventory_items (
          id,
          name,
          sku,
          base_unit:units!inventory_items_base_unit_id_fkey ( abbreviation )
        ),
        batches (
          id,
          batch_number
        ),
        movement_reasons (
          id,
          name
        ),
        profiles!stock_movements_created_by_fkey (
          id,
          username
        )
      `)
      .eq('status', 'PENDING');

    if (error) {
      throw new BadRequestError(error.message || 'Failed to fetch pending adjustments');
    }

    res.status(200).json({
      status: 'success',
      data: { movements }
    });
  } catch (error) {
    next(error);
  }
};

export const approveStockMovement = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { approve } = req.body; // true = APPROVED, false = REJECTED

    if (approve === undefined) {
      throw new BadRequestError('approve parameter (true/false) is required');
    }

    const userId = req.user?.id || '';
    const permissions = req.user?.role.role_permissions.map((rp: any) => rp.permissions?.code) || [];

    if (!permissions.includes('stock:approve')) {
      throw new ForbiddenError('You do not have permission to approve stock adjustments');
    }

    // 1. Fetch pending movement details
    const { data: movement, error: fetchErr } = await supabase
      .from('stock_movements')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchErr || !movement) {
      throw new NotFoundError('Stock movement record not found');
    }

    if (movement.status !== 'PENDING') {
      throw new BadRequestError(`Cannot approve/reject a stock movement that is already ${movement.status}`);
    }

    const targetStatus = approve ? 'APPROVED' : 'REJECTED';

    // 2. Perform database update
    // If approved, we must update the batch balance (similar to process_stock_movement_transaction logic)
    if (approve && movement.batch_id) {
      // Load current batch stock
      const { data: batch, error: batchErr } = await supabase
        .from('batches')
        .select('current_qty, available_qty')
        .eq('id', movement.batch_id)
        .single();

      if (batchErr || !batch) {
        throw new NotFoundError('Selected batch not found');
      }

      if (movement.type === 'STOCK_OUT' || movement.type === 'ADJUSTMENT') {
        if (Number(batch.available_qty) < Number(movement.quantity)) {
          throw new BadRequestError('Insufficient stock in selected batch to finalize adjustment.');
        }

        // Subtract stock
        await supabase
          .from('batches')
          .update({
            current_qty: Number(batch.current_qty) - Number(movement.quantity),
            available_qty: Number(batch.available_qty) - Number(movement.quantity)
          })
          .eq('id', movement.batch_id);
      } else if (movement.type === 'STOCK_IN') {
        // Add stock
        await supabase
          .from('batches')
          .update({
            current_qty: Number(batch.current_qty) + Number(movement.quantity),
            available_qty: Number(batch.available_qty) + Number(movement.quantity)
          })
          .eq('id', movement.batch_id);
      }

      // Deactivate batch if it drops below zero
      const { data: updatedBatch } = await supabase
        .from('batches')
        .select('current_qty')
        .eq('id', movement.batch_id)
        .single();

      if (updatedBatch && Number(updatedBatch.current_qty) <= 0) {
        await supabase
          .from('batches')
          .update({ status: 'OUT_OF_STOCK' })
          .eq('id', movement.batch_id);
      }
    }

    // 3. Update stock movement status
    const { data: updatedMovement, error: updateErr } = await supabase
      .from('stock_movements')
      .update({
        status: targetStatus,
        approved_by: userId,
        approved_at: new Date().toISOString()
      })
      .eq('id', id)
      .select('*')
      .single();

    if (updateErr || !updatedMovement) {
      throw new BadRequestError('Failed to update stock movement');
    }

    // 4. Log Audit Trail
    await logAudit(
      userId,
      `STOCK_ADJUSTMENT_${targetStatus}`,
      'stock_movements',
      id,
      { status: movement.status },
      { status: updatedMovement.status, approved_by: updatedMovement.approved_by, approved_at: updatedMovement.approved_at },
      req.ip
    );

    res.status(200).json({
      status: 'success',
      data: {
        movement: updatedMovement,
        message: `Stock adjustment has been ${targetStatus.toLowerCase()}`
      }
    });
  } catch (error) {
    next(error);
  }
};
