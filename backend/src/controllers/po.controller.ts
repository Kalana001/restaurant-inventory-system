import { Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';
import { BadRequestError, NotFoundError, ForbiddenError } from '../utils/errors';
import { logAudit } from '../services/audit.service';

export const updatePOStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { status, remarks } = req.body;

    if (!['APPROVED', 'REJECTED', 'CANCELLED'].includes(status)) {
      throw new BadRequestError('Invalid PO status transition');
    }

    const userId = req.user?.id || '';
    const userRole = req.user?.role.name || '';
    
    // Check permissions
    const permissions = req.user?.role.role_permissions.map((rp: any) => rp.permissions?.code) || [];

    // Fetch original PO
    const { data: po, error: fetchErr } = await supabase
      .from('purchase_orders')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchErr || !po) {
      throw new NotFoundError('Purchase Order not found');
    }

    // Status transition validation
    if (po.status !== 'PENDING') {
      throw new BadRequestError(`Cannot change status of a PO that is already ${po.status}`);
    }

    if (status === 'APPROVED' || status === 'REJECTED') {
      if (!permissions.includes('po:approve')) {
        throw new ForbiddenError('You do not have permission to approve or reject purchase orders');
      }
    }

    if (status === 'CANCELLED') {
      // Only the creator or an admin/manager can cancel a PO
      if (po.created_by !== userId && !['ADMIN', 'MANAGER'].includes(userRole)) {
        throw new ForbiddenError('You do not have permission to cancel this purchase order');
      }
    }

    // Begin update
    const updateData: any = {
      status,
      remarks: remarks || po.remarks,
      updated_at: new Date().toISOString()
    };

    if (status === 'APPROVED' || status === 'REJECTED') {
      updateData.approved_by = userId;
      updateData.approved_at = new Date().toISOString();
    }

    const { data: updatedPo, error: updateErr } = await supabase
      .from('purchase_orders')
      .update(updateData)
      .eq('id', id)
      .select('*')
      .single();

    if (updateErr || !updatedPo) {
      throw new BadRequestError('Failed to update Purchase Order status');
    }

    // Log Audit Change
    await logAudit(
      userId,
      `PO_${status}`,
      'purchase_orders',
      id,
      { status: po.status, approved_by: po.approved_by, approved_at: po.approved_at },
      { status: updatedPo.status, approved_by: updatedPo.approved_by, approved_at: updatedPo.approved_at },
      req.ip
    );

    // Create Notification
    const titleMap: Record<string, string> = {
      APPROVED: 'Purchase Order Approved',
      REJECTED: 'Purchase Order Rejected',
      CANCELLED: 'Purchase Order Cancelled'
    };

    await supabase.from('notifications').insert({
      title: titleMap[status],
      message: `Purchase Order ${po.po_number} has been marked as ${status.toLowerCase()} by ${req.user?.username}.`,
      type: 'PENDING_APPROVAL', // Category of notice
      is_read: false
    });

    res.status(200).json({
      status: 'success',
      data: { purchase_order: updatedPo }
    });
  } catch (error) {
    next(error);
  }
};

export const deepPriceCorrection = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { lines, grandTotal } = req.body;
    
    // Fetch original PO
    const { data: po, error: fetchErr } = await supabase
      .from('purchase_orders')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchErr || !po) {
      throw new NotFoundError('Purchase Order not found');
    }

    const oldTotal = Number(po.total_amount || 0);
    const newTotal = Number(grandTotal || 0);
    const difference = newTotal - oldTotal;

    // 1. Update PO total
    await supabase.from('purchase_orders').update({ total_amount: newTotal }).eq('id', id);

    // 2. Update Supplier Balance
    if (difference !== 0) {
      const { data: supData } = await supabase.from('suppliers').select('outstanding_balance').eq('id', po.supplier_id).single();
      if (supData) {
        const newBalance = Number(supData.outstanding_balance || 0) + difference;
        await supabase.from('suppliers').update({ outstanding_balance: newBalance }).eq('id', po.supplier_id);
      }
    }

    // 3. Loop through lines and update PO Items + stock movements
    for (const line of lines) {
      const costPrice = Number(line.new_cost_price || 0);
      const totalCost = costPrice * Number(line.quantity || 0);

      // Update PO Item
      await supabase.from('purchase_order_items')
        .update({ cost_price: costPrice, total_cost: totalCost })
        .eq('id', line.id);

      // Deep Price Correction: Find GRNs linked to this PO
      const { data: grns } = await supabase.from('grns').select('id').eq('po_id', id);
      if (grns && grns.length > 0) {
        for (const grn of grns) {
          // Find the STOCK_IN movement for this specific item in this GRN
          const { data: stockIns } = await supabase.from('stock_movements')
            .select('id, batch_id')
            .eq('reference_type', 'GRN')
            .eq('reference_id', grn.id)
            .eq('item_id', line.item_id)
            .eq('type', 'STOCK_IN');

          if (stockIns && stockIns.length > 0) {
            for (const stockIn of stockIns) {
              // Update the cost_price on the STOCK_IN
              await supabase.from('stock_movements').update({ cost_price: costPrice }).eq('id', stockIn.id);
              
              // Find all other movements that used this batch (like STOCK_OUT for Kitchen)
              if (stockIn.batch_id) {
                await supabase.from('stock_movements').update({ cost_price: costPrice }).eq('batch_id', stockIn.batch_id);
              }
            }
          }
        }
      }
      
      // Update global inventory cost_price just to be safe
      await supabase.from('inventory_items').update({ cost_price: costPrice }).eq('id', line.item_id);
    }

    res.status(200).json({ status: 'success', message: 'Deep Price Correction applied successfully' });
  } catch (error) {
    next(error);
  }
};
