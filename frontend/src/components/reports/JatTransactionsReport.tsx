import React, { useState, useEffect } from 'react';
import { format, parseISO, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { FileText, DollarSign, RefreshCw, XCircle, CheckCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { FilterPanel } from './FilterPanel';
import { JatPaymentModal } from './JatPaymentModal';

interface TransactionRow {
  receipt: string;
  date: string;
  reason: string;
  totalCost: number;
  paid: number;
  remaining: number;
  status: 'PENDING' | 'PARTIALLY PAID' | 'PAID';
  items: any[];
}

interface JatTransactionsReportProps {
  month?: string;
  day?: string;
}

export const JatTransactionsReport: React.FC<JatTransactionsReportProps> = ({ month, day }) => {
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<TransactionRow | null>(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: jatReason } = await supabase.from('movement_reasons').select('id').eq('name', 'JAT').single();
      if (!jatReason) return;

      let allMovements: any[] = [];
      let fetchMore = true;
      let from = 0;
      const step = 1000;

      while (fetchMore && from < 5000) {
        let chunkQuery = supabase
          .from('stock_movements')
          .select('*, inventory_items(name)')
          .eq('type', 'STOCK_OUT')
          .eq('reason_id', jatReason.id);

        if (day) {
          const start = new Date(day + 'T00:00:00').toISOString();
          const end = new Date(day + 'T23:59:59.999').toISOString();
          chunkQuery = chunkQuery.gte('created_at', start).lte('created_at', end);
        } else if (month) {
          const targetDate = new Date(month + '-01');
          const start = startOfMonth(targetDate).toISOString();
          const end = endOfMonth(targetDate).toISOString();
          chunkQuery = chunkQuery.gte('created_at', start).lte('created_at', end);
        }
        
        chunkQuery = chunkQuery.order('created_at', { ascending: false }).range(from, from + step - 1);
        
        const { data: chunk, error } = await chunkQuery;
        
        if (error || !chunk || chunk.length === 0) {
          fetchMore = false;
        } else {
          allMovements = [...allMovements, ...chunk];
          from += step;
          if (chunk.length < step) fetchMore = false;
        }
      }

      let dpQuery = supabase.from('daily_purchases').select('*').eq('department', 'JAT');
      let tcQuery = supabase.from('transportation_costs').select('*').eq('department', 'JAT');
      let expQuery = supabase.from('expenses').select('*').eq('category', 'JAT');
      if (day) {
        dpQuery = dpQuery.gte('date', day).lte('date', day);
        tcQuery = tcQuery.gte('date', day).lte('date', day);
        expQuery = expQuery.gte('date', day).lte('date', day);
      } else if (month) {
        const targetDate = new Date(month + '-01');
        const startStr = format(startOfMonth(targetDate), 'yyyy-MM-dd');
        const endStr = format(endOfMonth(targetDate), 'yyyy-MM-dd');
        dpQuery = dpQuery.gte('date', startStr).lte('date', endStr);
        tcQuery = tcQuery.gte('date', startStr).lte('date', endStr);
        expQuery = expQuery.gte('date', startStr).lte('date', endStr);
      }

      const movements = allMovements;
      const { data: dailyPurchases } = await dpQuery;
      const { data: transCosts } = await tcQuery;
      const { data: jatExpenses } = await expQuery;
      const { data: settlements } = await supabase.from('jat_settlements').select('id, notes, status').neq('status', 'BOUNCED');

      if (movements) {
        // Parse settlements allocations
        const allocationsByReceipt: Record<string, number> = {};
        settlements?.forEach(s => {
          try {
            const parsed = JSON.parse(s.notes);
            if (parsed && parsed.allocations) {
              Object.entries(parsed.allocations).forEach(([receipt, amount]) => {
                allocationsByReceipt[receipt] = (allocationsByReceipt[receipt] || 0) + Number(amount);
              });
            }
          } catch (e) {
            // Notes not JSON
          }
        });

        const txMap: Record<string, TransactionRow> = {};
        movements.forEach(m => {
          const receipt = m.reference_type || 'MANUAL';
          const date = format(new Date(m.created_at), 'yyyy-MM-dd');
          const cost = m.quantity * m.cost_price;

          if (!txMap[receipt]) {
            txMap[receipt] = {
              receipt,
              date,
              reason: 'JAT',
              totalCost: 0,
              paid: 0,
              remaining: 0,
              status: 'PENDING',
              items: []
            };
          }
          txMap[receipt].totalCost += cost;
          txMap[receipt].items.push({
            name: m.inventory_items?.name || 'Unknown',
            quantity: m.quantity,
            cost_price: m.cost_price,
            total: cost
          });
        });

        if (dailyPurchases) {
          dailyPurchases.forEach((dp: any) => {
            const receipt = `MKT-${dp.date}-JAT`;
            const date = dp.date;
            const cost = Number(dp.total_cost) || 0;

            if (!txMap[receipt]) {
              txMap[receipt] = {
                receipt,
                date,
                reason: 'JAT / Vege',
                totalCost: 0,
                paid: 0,
                remaining: 0,
                status: 'PENDING',
                items: []
              };
            }
            txMap[receipt].totalCost += cost;
            txMap[receipt].items.push({
              name: `${dp.item_name} (Market Buy)`,
              quantity: Number(dp.quantity) || 0,
              cost_price: Number(dp.quantity) ? cost / Number(dp.quantity) : cost,
              total: cost
            });
          });
        }

        if (transCosts) {
          transCosts.forEach((tc: any) => {
            const receipt = `TRN-${tc.date}-JAT`;
            const date = tc.date;
            const cost = Number(tc.cost) || 0;

            if (!txMap[receipt]) {
              txMap[receipt] = {
                receipt,
                date,
                reason: 'JAT / Trans',
                totalCost: 0,
                paid: 0,
                remaining: 0,
                status: 'PENDING',
                items: []
              };
            }
            txMap[receipt].totalCost += cost;
            txMap[receipt].items.push({
              name: `${tc.reason} (Transport)`,
              quantity: 1,
              cost_price: cost,
              total: cost
            });
          });
        }

        if (jatExpenses) {
          jatExpenses.forEach((e: any) => {
            const receipt = `EXP-${e.date}-${e.id.substring(0, 6)}`;
            const date = e.date;
            const cost = Number(e.total_amount) || 0;

            if (!txMap[receipt]) {
              txMap[receipt] = {
                receipt,
                date,
                reason: 'JAT / Expenses',
                totalCost: 0,
                paid: 0,
                remaining: 0,
                status: 'PENDING',
                items: []
              };
            }
            txMap[receipt].totalCost += cost;
            txMap[receipt].items.push({
              name: `JAT / ${e.expense_type}`,
              quantity: 1,
              cost_price: cost,
              total: cost
            });
          });
        }

        // Calculate statuses
        Object.values(txMap).forEach(tx => {
          tx.paid = allocationsByReceipt[tx.receipt] || 0;
          tx.remaining = Math.max(0, tx.totalCost - tx.paid);
          if (tx.paid >= tx.totalCost && tx.totalCost > 0) {
            tx.status = 'PAID';
          } else if (tx.paid > 0) {
            tx.status = 'PARTIALLY PAID';
          } else {
            tx.status = 'PENDING';
          }
        });

        setTransactions(Object.values(txMap).sort((a, b) => b.date.localeCompare(a.date)));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [month, day]);

  const totalSettled = transactions.reduce((acc, curr) => acc + curr.paid, 0);
  const totalUnsettled = transactions.reduce((acc, curr) => acc + curr.remaining, 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">JAT Transactions Report</h2>
          <p className="text-sm text-slate-500">Detailed view of JAT usage and payment status</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={fetchData} 
            disabled={loading}
            className="flex items-center space-x-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition-colors"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
          <button
            onClick={() => setPaymentModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white font-bold rounded-xl hover:bg-emerald-600 shadow-lg shadow-emerald-500/30 transition-all"
          >
            <DollarSign size={18} /> Record Payment
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-rose-50 flex items-center justify-center text-rose-500">
            <DollarSign size={24} />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">Unsettled Amount</p>
            <p className="text-2xl font-black text-rose-600 mt-1">LKR {totalUnsettled.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-500">
            <CheckCircle size={24} />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">Settled Amount</p>
            <p className="text-2xl font-black text-emerald-600 mt-1">LKR {totalSettled.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <h3 className="font-bold text-slate-800">Transaction Details</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-bold">Date</th>
                <th className="px-4 py-3 font-bold">Receipt</th>
                <th className="px-4 py-3 font-bold text-right">Total Cost</th>
                <th className="px-4 py-3 font-bold text-right">Paid</th>
                <th className="px-4 py-3 font-bold text-right">Remaining</th>
                <th className="px-4 py-3 font-bold text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {transactions.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">No data found</td></tr>
              ) : (
                transactions.map(row => (
                  <tr key={row.receipt} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-medium text-slate-700">{format(parseISO(row.date), 'MMM dd, yyyy')}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setSelectedReceipt(row)}
                        className="text-primary hover:text-blue-700 font-semibold underline decoration-blue-300 underline-offset-2 transition-colors"
                      >
                        {row.receipt}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-700">LKR {row.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-600">LKR {row.paid.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td className="px-4 py-3 text-right font-bold text-rose-500">LKR {row.remaining.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-1 text-xs font-bold rounded-lg ${
                        row.status === 'PAID' ? 'bg-emerald-100 text-emerald-700' :
                        row.status === 'PARTIALLY PAID' ? 'bg-amber-100 text-amber-700' :
                        'bg-rose-100 text-rose-700'
                      }`}>
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {paymentModalOpen && (
        <JatPaymentModal 
          onClose={() => setPaymentModalOpen(false)} 
          onSuccess={() => { setPaymentModalOpen(false); fetchData(); }} 
        />
      )}

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

