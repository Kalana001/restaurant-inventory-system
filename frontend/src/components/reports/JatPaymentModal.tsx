import React, { useState, useEffect } from 'react';
import { XCircle, CheckCircle, DollarSign, Clock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { format, parseISO } from 'date-fns';

interface JatPaymentModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export const JatPaymentModal: React.FC<JatPaymentModalProps> = ({ onClose, onSuccess }) => {
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pendingReceipts, setPendingReceipts] = useState<any[]>([]);
  const [form, setForm] = useState({
    settlement_date: format(new Date(), 'yyyy-MM-dd'),
    payment_method: 'CASH',
    cheque_number: '',
    cheque_realize_date: '',
    for_date: '',
    notes: ''
  });
  const [allocations, setAllocations] = useState<Record<string, number>>({});

  useEffect(() => {
    const fetchPending = async () => {
      setLoading(true);
      try {
        const { data: jatReason } = await supabase.from('movement_reasons').select('id').eq('name', 'JAT').single();
        if (!jatReason) return;

        const [ { data: movements }, { data: settlements } ] = await Promise.all([
          supabase.from('stock_movements').select('quantity, cost_price, created_at, reference_type').eq('type', 'STOCK_OUT').eq('reason_id', jatReason.id),
          supabase.from('jat_settlements').select('notes').neq('status', 'BOUNCED')
        ]);

        if (movements) {
          const allocationsByReceipt: Record<string, number> = {};
          settlements?.forEach(s => {
            try {
              const parsed = JSON.parse(s.notes);
              if (parsed && parsed.allocations) {
                Object.entries(parsed.allocations).forEach(([receipt, amount]) => {
                  allocationsByReceipt[receipt] = (allocationsByReceipt[receipt] || 0) + Number(amount);
                });
              }
            } catch (e) {}
          });

          const txMap: Record<string, any> = {};
          movements.forEach(m => {
            const receipt = m.reference_type || 'MANUAL';
            const cost = m.quantity * m.cost_price;
            if (!txMap[receipt]) {
              txMap[receipt] = { receipt, date: m.created_at.split('T')[0], totalCost: 0, paid: 0, remaining: 0 };
            }
            txMap[receipt].totalCost += cost;
          });

          Object.values(txMap).forEach(tx => {
            tx.paid = allocationsByReceipt[tx.receipt] || 0;
            tx.remaining = Math.max(0, tx.totalCost - tx.paid);
          });

          setPendingReceipts(Object.values(txMap).filter(t => t.remaining > 0).sort((a, b) => a.date.localeCompare(b.date)));
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchPending();
  }, []);

  const totalAmount = Object.values(allocations).reduce((sum, val) => sum + (val || 0), 0);

  const handleAllocationChange = (receipt: string, val: string, max: number) => {
    const num = parseFloat(val);
    if (isNaN(num)) {
      const newAlloc = { ...allocations };
      delete newAlloc[receipt];
      setAllocations(newAlloc);
    } else {
      setAllocations({ ...allocations, [receipt]: Math.min(Math.max(0, num), max) });
    }
  };

  const handleAutoFill = () => {
    const newAlloc: Record<string, number> = {};
    pendingReceipts.forEach(r => {
      if (r.remaining > 0) newAlloc[r.receipt] = r.remaining;
    });
    setAllocations(newAlloc);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (totalAmount <= 0) return alert('Payment amount must be greater than 0');

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const notesPayload = JSON.stringify({
        user_note: form.notes,
        allocations: allocations
      });

      const { error } = await supabase.from('jat_settlements').insert([{
        ...form,
        amount: totalAmount,
        notes: notesPayload,
        created_by: user.id
      }]);

      if (error) throw error;
      onSuccess();
    } catch (err: any) {
      alert(err.message || 'Failed to save payment');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[95vh]">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-emerald-500" />
            Record JAT Payment
          </h3>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-colors">
            <XCircle className="w-5 h-5" />
          </button>
        </div>
        
        {loading ? (
          <div className="p-12 flex justify-center items-center">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6 flex-1">
            
            <div className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden flex flex-col max-h-[40vh]">
              <div className="p-3 bg-slate-100 border-b border-slate-200 flex justify-between items-center">
                <h4 className="font-bold text-sm text-slate-700">Select Receipts to Pay</h4>
                <button type="button" onClick={handleAutoFill} className="text-xs font-bold bg-white border border-slate-200 px-3 py-1.5 rounded-lg text-primary hover:bg-slate-50">
                  Auto-fill All Remaining
                </button>
              </div>
              <div className="overflow-y-auto p-0">
                <table className="w-full text-sm text-left">
                  <thead className="bg-white sticky top-0 shadow-sm">
                    <tr>
                      <th className="px-4 py-2 font-bold text-slate-500">Receipt</th>
                      <th className="px-4 py-2 font-bold text-slate-500">Date</th>
                      <th className="px-4 py-2 font-bold text-slate-500 text-right">Total Cost</th>
                      <th className="px-4 py-2 font-bold text-slate-500 text-right">Remaining</th>
                      <th className="px-4 py-2 font-bold text-slate-500 text-right w-40">Pay Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {pendingReceipts.length === 0 ? (
                      <tr><td colSpan={5} className="p-6 text-center text-slate-400">No pending receipts found.</td></tr>
                    ) : (
                      pendingReceipts.map(r => (
                        <tr key={r.receipt} className="hover:bg-slate-50">
                          <td className="px-4 py-2 font-semibold text-slate-700">{r.receipt}</td>
                          <td className="px-4 py-2 text-slate-500">{format(parseISO(r.date), 'MMM dd, yyyy')}</td>
                          <td className="px-4 py-2 text-right text-slate-600">LKR {r.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          <td className="px-4 py-2 text-right font-bold text-rose-500">LKR {r.remaining.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          <td className="px-4 py-2">
                            <input 
                              type="number" 
                              min="0" 
                              max={r.remaining} 
                              step="0.01"
                              className="w-full px-2 py-1 border border-slate-200 rounded-lg text-right font-bold text-emerald-600 focus:border-emerald-500 outline-none"
                              placeholder="0.00"
                              value={allocations[r.receipt] || ''}
                              onChange={e => handleAllocationChange(r.receipt, e.target.value, r.remaining)}
                            />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Payment Date</label>
                  <input type="date" required className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all" value={form.settlement_date} onChange={e => setForm({...form, settlement_date: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Payment Method</label>
                  <select className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all" value={form.payment_method} onChange={e => setForm({...form, payment_method: e.target.value})}>
                    <option value="CASH">Cash</option>
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                    <option value="CHEQUE">Cheque</option>
                  </select>
                </div>

                {form.payment_method === 'CHEQUE' && (
                  <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500 uppercase">Cheque No.</label>
                      <input type="text" className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl outline-none" placeholder="Optional" value={form.cheque_number} onChange={e => setForm({...form, cheque_number: e.target.value})} />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500 uppercase">Realize Date</label>
                      <input type="date" className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl outline-none" value={form.cheque_realize_date} onChange={e => setForm({...form, cheque_realize_date: e.target.value})} />
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100 flex flex-col justify-center items-center">
                  <p className="text-sm font-bold text-emerald-600 uppercase">Total Payment Amount</p>
                  <p className="text-3xl font-black text-emerald-700 mt-1">LKR {totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Notes</label>
                  <textarea className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all resize-none h-24" placeholder="Optional notes..." value={form.notes} onChange={e => setForm({...form, notes: e.target.value})}></textarea>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
              <button type="button" onClick={onClose} className="px-6 py-2 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors">Cancel</button>
              <button type="submit" disabled={submitting || totalAmount <= 0} className="px-8 py-2 bg-emerald-500 text-white font-bold rounded-xl hover:bg-emerald-600 transition-colors shadow-lg shadow-emerald-500/30 flex items-center justify-center gap-2 disabled:opacity-50 disabled:shadow-none">
                {submitting ? 'Saving...' : <><CheckCircle className="w-5 h-5" /> Save Payment</>}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

