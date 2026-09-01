import { withAuth } from '../_lib/withAuth.js';
import { supabaseAdmin, logAudit } from '../_lib/supabase.js';

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { supplierId, amount, paymentMethod, paymentDate, chequeRealizeDate, referenceNumber, remarks, notes, allocations, userId: bodyUserId } = req.body;

    const parsedAmount = Number(amount);
    if (!supplierId || !parsedAmount || parsedAmount <= 0 || !paymentMethod) {
      return res.status(400).json({ status: 'error', message: 'Invalid payment details. Supplier, valid amount, and payment method are required.' });
    }

    const userId = req.user?.id || bodyUserId || null;
    const cleanAllocations = Array.isArray(allocations)
      ? allocations
          .map(a => ({
            po_id: a.po_id || a.poId,
            amount: Number(a.amount_allocated || a.amount || 0)
          }))
          .filter(a => a.po_id && a.amount > 0)
      : [];

    // 1. Fetch supplier to ensure exists & get current outstanding balance
    const { data: supplier, error: supplierErr } = await supabaseAdmin
      .from('suppliers')
      .select('id, name, outstanding_balance')
      .eq('id', supplierId)
      .single();

    if (supplierErr || !supplier) {
      return res.status(404).json({ status: 'error', message: 'Supplier not found' });
    }

    // 2. Generate unique payment number
    const dateStr = (paymentDate || new Date().toISOString().split('T')[0]).replace(/-/g, '');
    const { count } = await supabaseAdmin
      .from('supplier_payments')
      .select('*', { count: 'exact', head: true });
    
    const paymentNumber = `PAY-${dateStr}-${String((count || 0) + 1).padStart(4, '0')}`;

    // 3. Insert into supplier_payments
    const { data: payment, error: paymentErr } = await supabaseAdmin
      .from('supplier_payments')
      .insert({
        payment_number: paymentNumber,
        supplier_id: supplierId,
        amount: parsedAmount,
        payment_method: paymentMethod,
        payment_date: paymentDate || new Date().toISOString().split('T')[0],
        cheque_realize_date: paymentMethod === 'Cheque' ? (chequeRealizeDate || null) : null,
        reference_number: referenceNumber || null,
        notes: remarks || notes || '',
        paid_by: userId
      })
      .select('id')
      .single();

    if (paymentErr || !payment) {
      console.error('[SUPPLIER PAYMENT INSERT ERROR]:', paymentErr);
      return res.status(400).json({ status: 'error', message: paymentErr?.message || 'Failed to create payment record' });
    }

    const paymentId = payment.id;

    // 4. Update supplier outstanding balance
    const updatedBalance = Number(supplier.outstanding_balance || 0) - parsedAmount;
    const { error: balanceErr } = await supabaseAdmin
      .from('suppliers')
      .update({ outstanding_balance: updatedBalance })
      .eq('id', supplierId);

    if (balanceErr) {
      console.error('[SUPPLIER BALANCE UPDATE ERROR]:', balanceErr);
    }

    // 5. Process allocations if any
    if (cleanAllocations.length > 0) {
      for (const alloc of cleanAllocations) {
        // Insert allocation record
        await supabaseAdmin
          .from('payment_allocations')
          .insert({
            payment_id: paymentId,
            po_id: alloc.po_id,
            amount: alloc.amount
          });

        // Fetch PO details and update paid amount & status
        const { data: po } = await supabaseAdmin
          .from('purchase_orders')
          .select('id, total_amount, paid_amount, amount_paid')
          .eq('id', alloc.po_id)
          .single();

        if (po) {
          const currentPaid = Number(po.paid_amount || po.amount_paid || 0);
          const newPaid = currentPaid + alloc.amount;
          const poTotal = Number(po.total_amount || 0);
          const newStatus = newPaid >= poTotal ? 'PAID' : (newPaid > 0 ? 'PARTIAL' : 'UNPAID');

          await supabaseAdmin
            .from('purchase_orders')
            .update({
              paid_amount: newPaid,
              amount_paid: newPaid,
              payment_status: newStatus
            })
            .eq('id', alloc.po_id);
        }
      }
    }

    // 6. Log audit
    await logAudit(
      userId,
      'CREATE_PAYMENT',
      'supplier_payments',
      paymentId,
      null,
      { supplierId, amount: parsedAmount, paymentMethod, chequeRealizeDate, allocations: cleanAllocations }
    );

    return res.status(201).json({
      status: 'success',
      data: {
        paymentId,
        paymentNumber,
        message: 'Supplier payment processed successfully'
      }
    });

  } catch (err) {
    console.error('[SUPPLIER PAYMENT ERROR]:', err);
    return res.status(400).json({ status: 'error', message: err.message || 'Failed to process supplier payment' });
  }
}

export default withAuth(handler);
