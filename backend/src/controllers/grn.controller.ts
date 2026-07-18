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
    let { data: grnId, error: transactionError } = await supabase.rpc(
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

    // Auto-heal logic if sequence count causes duplicate key on grn_number
    if (transactionError && (transactionError.message.includes('grns_grn_number_key') || transactionError.code === '23505')) {
      console.log('Duplicate GRN number detected. Attempting sequence auto-fix...');
      // Insert dummy record to bump COUNT(*) sequence
      await supabase.from('grns').insert({
        grn_number: `DUMMY-${Date.now()}`,
        supplier_id: supplierId,
        received_by: userId,
        total_amount: 0,
        remarks: 'System Sequence Auto-Fix'
      });
      
      // Retry transaction
      const retryResult = await supabase.rpc(
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
      
      if (!retryResult.error && retryResult.data) {
        grnId = retryResult.data;
        transactionError = null;
        console.log('Sequence auto-fix successful!');
      }
    }

    if (transactionError || !grnId) {
      console.error('[GRN TRANSACTION ERROR]:', transactionError);
      throw new BadRequestError(transactionError?.message || 'Failed to process GRN transaction');
    }

    // Update global item cost prices from the GRN items
    for (const item of items) {
      const price = item.cost_price ?? item.costPrice;
      const id = item.item_id ?? item.itemId;
      if (price !== undefined && price !== null && price !== '') {
        await supabase
          .from('inventory_items')
          .update({ cost_price: Number(price) })
          .eq('id', id);
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
