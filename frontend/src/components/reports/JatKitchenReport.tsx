import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { DollarSign, Plus, CheckCircle, XCircle, Clock } from 'lucide-react';
import { JatPaymentModal } from './JatPaymentModal';

interface JatKitchenReportProps {
  month?: string; // YYYY-MM
  day?: string; // YYYY-MM-DD
}

interface TransactionRow {
  receipt: string;
  date: string;
  reason: string;
  totalCost: number;
  items: {
    name: string;
    quantity: number;
    cost_price: number;
    total: number;
  }[];
}

export const JatKitchenReport: React.FC<JatKitchenReportProps> = ({ month, day }) => {
  const [data, setData] = useState<TransactionRow[]>([]);
  const [selectedReceipt, setSelectedReceipt] = useState<TransactionRow | null>(null);
  const [settlements, setSettlements] = useState<any[]>([]);
  const [monthlyKitchen, setMonthlyKitchen] = useState(0);
  const [monthlyJat, setMonthlyJat] = useState(0);
  const [unsettledBalance, setUnsettledBalance] = useState(0);
  const [loading, setLoading] = useState(false);

  // Modal states
  const [modalOpen, setModalOpen] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Reasons
      const { data: reasons } = await supabase.from('movement_reasons').select('id, name').in('name', ['JAT', 'Kitchen Usage']);
      const jatReason = reasons?.find(r => r.name === 'JAT')?.id;
      const kitchenReason = reasons?.find(r => r.name === 'Kitchen Usage')?.id;

      // 2. Determine date range
      let start: string, end: string;
      if (day) {
        start = new Date(day + 'T00:00:00.000Z').toISOString();
        end = new Date(day + 'T23:59:59.999Z').toISOString();
      } else {
        const targetDate = month ? new Date(month + '-01') : new Date();
        start = startOfMonth(targetDate).toISOString();
        end = endOfMonth(targetDate).toISOString();
      }

      // 3. Fetch Stock Movements for this date range
      const { data: movements } = await supabase
        .from('stock_movements')
        .select('created_at, quantity, cost_price, reason_id, reference_type, inventory_items(name)')
        .eq('type', 'STOCK_OUT')
        .gte('created_at', start)
        .lte('created_at', end);

      const transactions: Record<string, TransactionRow> = {};
      let mKitchen = 0;
      let mJat = 0;

      if (movements) {
        movements.forEach(m => {
          const receipt = m.reference_type || 'Unknown';
          const cost = (Number(m.quantity) || 0) * (Number(m.cost_price) || 0);

          if (!transactions[receipt]) {
            let reasonName = 'Other';
            if (m.reason_id === jatReason) reasonName = 'JAT';
            else if (m.reason_id === kitchenReason) reasonName = 'Kitchen Usage';

            transactions[receipt] = {
              receipt,
              date: m.created_at.split('T')[0],
              reason: reasonName,
              totalCost: 0,
              items: []
            };
          }

          transactions[receipt].totalCost += cost;
          transactions[receipt].items.push({
            name: (m.inventory_items as any)?.name || 'Unknown Item',
            quantity: Number(m.quantity) || 0,
            cost_price: Number(m.cost_price) || 0,
            total: cost
          });

          if (m.reason_id === jatReason) {
            mJat += cost;
          } else if (m.reason_id === kitchenReason) {
            mKitchen += cost;
          }
        });
      }

      setMonthlyKitchen(mKitchen);
      setMonthlyJat(mJat);
      setData(Object.values(transactions).sort((a, b) => b.date.localeCompare(a.date)));

      // 4. Fetch All-Time Unsettled Balance for JAT
      // Total JAT All-Time
      const { data: allJat } = await supabase
        .from('stock_movements')
        .select('quantity, cost_price')
        .eq('type', 'STOCK_OUT')
        .eq('reason_id', jatReason);
      
      const totalJatCost = allJat?.reduce((sum, m) => sum + ((Number(m.quantity) || 0) * (Number(m.cost_price) || 0)), 0) || 0;

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

      if (monthSettlements) {
        setSettlements(monthSettlements);
        const monthSettlementsTotal = monthSettlements.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
        setMonthlyJat(Math.max(0, mJat - monthSettlementsTotal));
      }

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [month]);



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
        {/* Transaction Details Table */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <h3 className="font-bold text-slate-800">Transaction Details</h3>
          </div>
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-bold">Date</th>
                  <th className="px-4 py-3 font-bold">Reason</th>
                  <th className="px-4 py-3 font-bold text-right">Total Cost</th>
                  <th className="px-4 py-3 font-bold text-center">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-400">No data found</td></tr>
                ) : (
                  data.map(row => (
                    <tr key={row.receipt} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-medium text-slate-700">{format(parseISO(row.date), 'MMM dd, yyyy')}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 text-xs font-bold rounded-lg ${row.reason === 'JAT' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>{row.reason}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">LKR {row.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => setSelectedReceipt(row)}
                          className="text-primary hover:text-blue-700 font-semibold underline decoration-blue-300 underline-offset-2 transition-colors"
                        >
                          {row.receipt}
                        </button>
                      </td>
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
        <JatPaymentModal 
          onClose={() => setModalOpen(false)} 
          onSuccess={() => { setModalOpen(false); fetchData(); }} 
        />
      )}

      {/* Receipt Details Modal */}
      {selectedReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-bold text-lg text-slate-800">
                Receipt Details: <span className="text-primary">{selectedReceipt.receipt}</span>
              </h3>
              <button onClick={() => setSelectedReceipt(null)} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-colors">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto">
              <div className="flex items-center gap-4 mb-4 text-sm text-slate-600 bg-slate-50 p-4 rounded-xl border border-slate-100">
                <div><span className="font-bold text-slate-500">Date:</span> {format(parseISO(selectedReceipt.date), 'MMMM dd, yyyy')}</div>
                <div><span className="font-bold text-slate-500">Reason:</span> {selectedReceipt.reason}</div>
                <div><span className="font-bold text-slate-500">Total:</span> LKR {selectedReceipt.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-bold">Item Name</th>
                      <th className="px-4 py-3 font-bold text-right">Quantity</th>
                      <th className="px-4 py-3 font-bold text-right">Unit Cost</th>
                      <th className="px-4 py-3 font-bold text-right">Total Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedReceipt.items.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-700">{item.name}</td>
                        <td className="px-4 py-3 text-right">{item.quantity}</td>
                        <td className="px-4 py-3 text-right text-slate-500">LKR {item.cost_price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td className="px-4 py-3 text-right font-bold text-slate-700">LKR {item.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
