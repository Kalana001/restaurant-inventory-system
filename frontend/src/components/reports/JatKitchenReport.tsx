import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { XCircle, Printer } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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
  const [loading, setLoading] = useState(true);
  const [monthlyKitchen, setMonthlyKitchen] = useState(0);
  const [monthlyJat, setMonthlyJat] = useState(0);
  const [unsettledBalance, setUnsettledBalance] = useState(0);

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
              date: format(new Date(m.created_at), 'yyyy-MM-dd'),
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



    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [month, day]);





  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const handlePrintReceipt = () => {
    if (!selectedReceipt) return;

    const doc = new jsPDF();
    
    doc.setFontSize(20);
    doc.text('Sigiri Catering - Receipt', 14, 22);
    
    doc.setFontSize(10);
    doc.text(`Receipt No: ${selectedReceipt.receipt}`, 14, 30);
    doc.text(`Date: ${format(parseISO(selectedReceipt.date), 'MMMM dd, yyyy')}`, 14, 36);
    doc.text(`Reason: ${selectedReceipt.reason}`, 14, 42);

    const tableData = selectedReceipt.items.map((item: any) => [
      item.name,
      item.quantity.toString(),
      `LKR ${item.cost_price.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
      `LKR ${item.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
    ]);

    autoTable(doc, {
      startY: 50,
      head: [['Item Name', 'Quantity', 'Unit Cost', 'Total Cost']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [59, 130, 246] }, // blue-500
    });

    const finalY = (doc as any).lastAutoTable.finalY || 50;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`Grand Total: LKR ${selectedReceipt.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 14, finalY + 10);

    doc.save(`Receipt_${selectedReceipt.receipt}.pdf`);
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

      <div className="grid grid-cols-1 gap-6">
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
                      <td className="px-4 py-3 font-medium text-slate-700">{format(parseISO(row.date), 'dd MMM')}</td>
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
      </div>

      {/* Receipt Details Modal */}
      {selectedReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-bold text-lg text-slate-800">
                Receipt Details: <span className="text-primary">{selectedReceipt.receipt}</span>
              </h3>
              <div className="flex items-center gap-2">
                <button onClick={handlePrintReceipt} className="px-3 py-1.5 flex items-center gap-2 bg-blue-50 text-blue-600 hover:bg-blue-100 hover:text-blue-700 font-semibold rounded-lg transition-colors text-sm border border-blue-200">
                  <Printer size={16} /> Print PDF
                </button>
                <button onClick={() => setSelectedReceipt(null)} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-colors">
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
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
