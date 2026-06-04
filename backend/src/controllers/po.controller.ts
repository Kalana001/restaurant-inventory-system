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
