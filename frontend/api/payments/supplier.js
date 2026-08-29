import { withAuth } from '../_lib/withAuth.js';
import { supabaseAdmin, logAudit } from '../_lib/supabase.js';

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { supplierId, amount, paymentMethod, paymentDate, chequeRealizeDate, referenceNumber, remarks, notes, allocations } = req.body;

    if (!supplierId || !amount || !paymentMethod || !allocations || !Array.isArray(allocations) || allocations.length === 0) {
      return res.status(400).json({ status: 'error', message: 'Invalid payment details. Supplier, amount, method, and allocations are required.' });
    }

    const userId = req.user?.id || '';
    const cleanAllocations = allocations.map(a => ({
      po_id: a.po_id || a.poId,
      amount: Number(a.amount_allocated || a.amount || 0)
    }));

    const { data: paymentId, error: transactionError } = await supabaseAdmin.rpc(
      'process_supplier_payment_transaction',
      {
        p_supplier_id: supplierId,
        p_amount: Number(amount),
        p_payment_method: paymentMethod,
        p_payment_date: paymentDate || new Date().toISOString().split('T')[0],
        p_reference_number: referenceNumber || null,
        p_remarks: remarks || notes || '',
        p_created_by: userId,
        p_allocations: cleanAllocations
      }
    );

    if (transactionError || !paymentId) {
      console.error('[PAYMENT TRANSACTION ERROR]:', transactionError);
      return res.status(400).json({ status: 'error', message: transactionError?.message || 'Failed to process payment transaction' });
    }

    if (paymentMethod === 'Cheque' && chequeRealizeDate) {
      await supabaseAdmin
        .from('supplier_payments')
        .update({ cheque_realize_date: chequeRealizeDate })
        .eq('id', paymentId);
    }

    await logAudit(userId, 'CREATE_PAYMENT', 'supplier_payments', paymentId, null, { supplierId, amount, paymentMethod, chequeRealizeDate, allocations: cleanAllocations });

    return res.status(201).json({ status: 'success', data: { paymentId, message: 'Supplier payment processed successfully' } });

  } catch (err) {
    console.error('[SUPPLIER PAYMENT ERROR]:', err);
    return res.status(400).json({ status: 'error', message: err.message || 'Failed to process supplier payment' });
  }
}

export default withAuth(handler);
