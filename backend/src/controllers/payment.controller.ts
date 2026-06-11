import { Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';
import { BadRequestError } from '../utils/errors';
import { logAudit } from '../services/audit.service';

export const processSupplierPayment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { supplierId, amount, paymentMethod, paymentDate, referenceNumber, remarks, allocations } = req.body;

    if (!supplierId || !amount || !paymentMethod || !allocations || !Array.isArray(allocations) || allocations.length === 0) {
      throw new BadRequestError('Invalid payment details. Supplier, amount, method, and allocations are required.');
    }

    const userId = req.user?.id || '';

    // Execute database transaction RPC
    const { data: paymentId, error: transactionError } = await supabase.rpc(
      'process_supplier_payment_transaction',
      {
        p_supplier_id: supplierId,
        p_amount: Number(amount),
        p_payment_method: paymentMethod,
        p_payment_date: paymentDate || new Date().toISOString().split('T')[0],
        p_reference_number: referenceNumber || null,
        p_remarks: remarks || '',
        p_created_by: userId,
        p_allocations: allocations
      }
    );

    if (transactionError || !paymentId) {
      console.error('[PAYMENT TRANSACTION ERROR]:', transactionError);
      throw new BadRequestError(transactionError?.message || 'Failed to process payment transaction');
    }

    // Log Audit Action
    await logAudit(
      userId,
      'CREATE_PAYMENT',
      'supplier_payments',
      paymentId,
      null,
      { supplierId, amount, paymentMethod, allocations },
      req.ip
    );

    res.status(201).json({
      status: 'success',
      data: {
        paymentId,
        message: 'Supplier payment processed successfully'
      }
    });
  } catch (error) {
    next(error);
  }
};
