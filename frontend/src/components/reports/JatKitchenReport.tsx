import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { DollarSign, Plus, CheckCircle, XCircle, Clock } from 'lucide-react';

interface JatKitchenReportProps {
  month?: string; // YYYY-MM
}

export const JatKitchenReport: React.FC<JatKitchenReportProps> = ({ month }) => {
  const [data, setData] = useState<{ date: string; kitchen: number; jat: number }[]>([]);
  const [settlements, setSettlements] = useState<any[]>([]);
  const [monthlyKitchen, setMonthlyKitchen] = useState(0);
  const [monthlyJat, setMonthlyJat] = useState(0);
  const [unsettledBalance, setUnsettledBalance] = useState(0);
  const [loading, setLoading] = useState(false);

  // Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    settlement_date: format(new Date(), 'yyyy-MM-dd'),
    amount: '',
    payment_method: 'CASH',
    for_date: '',
    cheque_number: '',
    cheque_realize_date: '',
    notes: ''
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Reasons
      const { data: reasons } = await supabase.from('movement_reasons').select('id, name').in('name', ['JAT', 'Kitchen Usage']);
      const jatReason = reasons?.find(r => r.name === 'JAT')?.id;
      const kitchenReason = reasons?.find(r => r.name === 'Kitchen Usage')?.id;

      // 2. Determine date range
      const targetDate = month ? new Date(month + '-01') : new Date();
      const start = startOfMonth(targetDate).toISOString();
      const end = endOfMonth(targetDate).toISOString();

      // 3. Fetch Stock Movements for this month
      const { data: movements } = await supabase
        .from('stock_movements')
        .select('created_at, total_cost, reason_id')
        .eq('type', 'STOCK_OUT')
        .gte('created_at', start)
        .lte('created_at', end);

      const daily: Record<string, { kitchen: number; jat: number }> = {};
      let mKitchen = 0;
      let mJat = 0;

      if (movements) {
        movements.forEach(m => {
          const date = m.created_at.split('T')[0];
          if (!daily[date]) daily[date] = { kitchen: 0, jat: 0 };
          const cost = Number(m.total_cost) || 0;
          if (m.reason_id === jatReason) {
            daily[date].jat += cost;
            mJat += cost;
          } else if (m.reason_id === kitchenReason) {
            daily[date].kitchen += cost;
            mKitchen += cost;
          }
        });
      }

      setMonthlyKitchen(mKitchen);
      setMonthlyJat(mJat);
      setData(Object.entries(daily).map(([date, vals]) => ({ date, ...vals })).sort((a, b) => b.date.localeCompare(a.date)));

      // 4. Fetch All-Time Unsettled Balance for JAT
      // Total JAT All-Time
      const { data: allJat } = await supabase
        .from('stock_movements')
        .select('total_cost')
        .eq('type', 'STOCK_OUT')
        .eq('reason_id', jatReason);
      
      const totalJatCost = allJat?.reduce((sum, m) => sum + (Number(m.total_cost) || 0), 0) || 0;

      // Total Settled (Cleared or Pending) - Assume pending counts as paid until bounced, or maybe just all?
      // Actually, let's sum all valid settlements
      const { data: allSettlements } = await supabase
        .from('jat_settlements')
        .select('amount')
        .neq('status', 'BOUNCED');
      
      const totalSettled = allSettlements?.reduce((sum, s) => sum + (Number(s.amount) || 0), 0) || 0;

      setUnsettledBalance(totalJatCost - totalSettled);

      // 5. Fetch Settlements for this month's view
      const { data: monthSettlements } = await supabase
        .from('jat_settlements')
        .select('*')
        .gte('settlement_date', start.split('T')[0])
        .lte('settlement_date', end.split('T')[0])
        .order('settlement_date', { ascending: false });

      if (monthSettlements) setSettlements(monthSettlements);

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [month]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not logged in");

      const payload: any = {
        settlement_date: form.settlement_date,
        amount: Number(form.amount),
        payment_method: form.payment_method,
        created_by: user.id
      };
      if (form.for_date) payload.for_date = form.for_date;
      if (form.notes) payload.notes = form.notes;
      if (form.payment_method === 'CHEQUE') {
        if (form.cheque_number) payload.cheque_number = form.cheque_number;
        if (form.cheque_realize_date) payload.cheque_realize_date = form.cheque_realize_date;
      }

      const { error } = await supabase.from('jat_settlements').insert(payload);
      if (error) throw error;

      setModalOpen(false);
      setForm({
        settlement_date: format(new Date(), 'yyyy-MM-dd'),
        amount: '',
        payment_method: 'CASH',
        for_date: '',
        cheque_number: '',
        cheque_realize_date: '',
        notes: ''
      });
      fetchData();
    } catch (err) {
      console.error(err);
      alert("Failed to save settlement");
    } finally {
      setSubmitting(false);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      await supabase.from('jat_settlements').update({ status }).eq('id', id);
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <h3 className="text-sm font-bold text-slate-500 uppercase">JAT Unsettled Balance (All-Time)</h3>
          <p className="text-2xl font-black text-rose-600 mt-2">LKR {unsettledBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <h3 className="text-sm font-bold text-slate-500 uppercase">JAT Cost (This Month)</h3>
          <p className="text-2xl font-black text-slate-800 mt-2">LKR {monthlyJat.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <h3 className="text-sm font-bold text-slate-500 uppercase">Kitchen Usage (This Month)</h3>
          <p className="text-2xl font-black text-slate-800 mt-2">LKR {monthlyKitchen.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Day-wise Stock Out Table */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <h3 className="font-bold text-slate-800">Day-wise Costs</h3>
          </div>
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-bold">Date</th>
                  <th className="px-4 py-3 font-bold text-right">Kitchen Usage</th>
                  <th className="px-4 py-3 font-bold text-right">JAT Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.length === 0 ? (
                  <tr><td colSpan={3} className="px-4 py-6 text-center text-slate-400">No data found</td></tr>
                ) : (
                  data.map(row => (
                    <tr key={row.date} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-medium text-slate-700">{format(parseISO(row.date), 'MMM dd, yyyy')}</td>
                      <td className="px-4 py-3 text-right">LKR {row.kitchen.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td className="px-4 py-3 text-right font-semibold">LKR {row.jat.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* JAT Settlements Table */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <h3 className="font-bold text-slate-800">JAT Settlements</h3>
            <button
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-primary text-white text-sm font-bold rounded-lg hover:bg-opacity-90 transition-all shadow-sm"
            >
              <Plus className="w-4 h-4" /> Record Payment
            </button>
          </div>
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-bold">Date</th>
                  <th className="px-4 py-3 font-bold">Method</th>
                  <th className="px-4 py-3 font-bold text-right">Amount</th>
                  <th className="px-4 py-3 font-bold text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {settlements.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-400">No settlements found</td></tr>
                ) : (
                  settlements.map(s => (
                    <tr key={s.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-medium text-slate-700">
                        {format(parseISO(s.settlement_date), 'MMM dd, yyyy')}
                        {s.for_date && <div className="text-xs text-slate-400">For: {format(parseISO(s.for_date), 'MMM dd')}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-semibold text-slate-600 text-xs px-2 py-1 bg-slate-100 rounded-lg">{s.payment_method.replace('_', ' ')}</span>
                        {s.payment_method === 'CHEQUE' && s.cheque_realize_date && (
                          <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                            <Clock className="w-3 h-3" /> Due {format(parseISO(s.cheque_realize_date), 'MMM dd')}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-600">
                        LKR {Number(s.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <select
                          value={s.status}
                          onChange={(e) => updateStatus(s.id, e.target.value)}
                          className={`text-xs font-bold rounded-full px-2 py-1 border-0 ${
                            s.status === 'CLEARED' ? 'bg-emerald-100 text-emerald-700' :
                            s.status === 'BOUNCED' ? 'bg-rose-100 text-rose-700' :
                            'bg-amber-100 text-amber-700'
                          }`}
                        >
                          <option value="PENDING">PENDING</option>
                          <option value="CLEARED">CLEARED</option>
                          <option value="BOUNCED">BOUNCED</option>
                        </select>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add Settlement Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-emerald-500" />
                Record JAT Payment
              </h3>
              <button onClick={() => setModalOpen(false)} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-colors">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Payment Date</label>
                  <input type="date" required className="input-field" value={form.settlement_date} onChange={e => setForm({...form, settlement_date: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase">Amount (LKR)</label>
                  <input type="number" required min="0.01" step="0.01" className="input-field font-bold" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Payment Method</label>
                <select className="input-field" value={form.payment_method} onChange={e => setForm({...form, payment_method: e.target.value})}>
                  <option value="CASH">Cash</option>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                  <option value="CHEQUE">Cheque</option>
                </select>
              </div>

              {form.payment_method === 'CHEQUE' && (
                <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Cheque No.</label>
                    <input type="text" className="input-field" placeholder="Optional" value={form.cheque_number} onChange={e => setForm({...form, cheque_number: e.target.value})} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase">Realize Date</label>
                    <input type="date" className="input-field" value={form.cheque_realize_date} onChange={e => setForm({...form, cheque_realize_date: e.target.value})} />
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">For Specific Date (Optional)</label>
                <input type="date" className="input-field" value={form.for_date} onChange={e => setForm({...form, for_date: e.target.value})} />
                <p className="text-[10px] text-slate-400">Leave blank if this is a bulk payment against the total balance.</p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Notes</label>
                <input type="text" className="input-field" placeholder="Optional notes..." value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} />
              </div>

              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setModalOpen(false)} className="flex-1 px-4 py-2 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors">Cancel</button>
                <button type="submit" disabled={submitting} className="flex-1 px-4 py-2 bg-emerald-500 text-white font-bold rounded-xl hover:bg-emerald-600 transition-colors shadow-lg shadow-emerald-500/30 flex items-center justify-center gap-2 disabled:opacity-50">
                  {submitting ? 'Saving...' : <><CheckCircle className="w-5 h-5" /> Save Payment</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
