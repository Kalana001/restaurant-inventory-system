import { Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';
import { BadRequestError } from '../utils/errors';
import { logAudit } from '../services/audit.service';

export const createGRN = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { poId, supplierId, invoiceNumber, totalAmount, remarks, items } = req.body;

    if (!supplierId || !totalAmount || !items || !Array.isArray(items) || items.length === 0) {
      throw new BadRequestError('Invalid GRN details. Supplier, total amount, and items are required.');
    }

    const userId = req.user?.id || '';

    // Execute database transaction RPC in Supabase
    const { data: grnId, error: transactionError } = await supabase.rpc(
      'process_grn_transaction',
      {
        p_po_id: poId || null,
        p_supplier_id: supplierId,
        p_received_by: userId,
        p_invoice_number: invoiceNumber || null,
        p_total_amount: totalAmount,
        p_remarks: remarks || '',
        p_items: items
      }
    );

    if (transactionError || !grnId) {
      console.error('[GRN TRANSACTION ERROR]:', transactionError);
      throw new BadRequestError(transactionError?.message || 'Failed to process GRN transaction');
    }

    // Update global item cost prices from the GRN items
    for (const item of items) {
      if (item.costPrice !== undefined && item.costPrice !== null && item.costPrice !== '') {
        await supabase
          .from('inventory_items')
          .update({ cost_price: Number(item.costPrice) })
          .eq('id', item.itemId);
      }
    }

    // Log Audit Action
    await logAudit(
      userId,
      'CREATE_GRN',
      'grns',
      grnId,
      null,
      { poId, supplierId, invoiceNumber, totalAmount, remarks, items },
      req.ip
    );

    // Create Notification
    await supabase.from('notifications').insert({
      title: 'Goods Received Note Issued',
      message: `Goods Received Note for supplier has been issued. Stock has been incremented.`,
      type: 'LOW_STOCK', // standard system notice
      is_read: false
    });

    res.status(201).json({
      status: 'success',
      data: {
        grnId,
        message: 'Goods Received Note processed successfully'
      }
    });
  } catch (error) {
    next(error);
  }
};
