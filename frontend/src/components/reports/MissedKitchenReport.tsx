import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { format, parseISO, startOfMonth, endOfMonth } from 'date-fns';
import { FileText, Download, Printer, Search, Calendar, RefreshCw, ArrowUpRight, DollarSign, Package, Clock } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Pagination } from '../ui/Pagination';

interface MissedKitchenReportProps {
  month?: string;
  day?: string;
}

interface MissedMovementRow {
  id: string;
  movement_number: string;
  created_at: string;
  quantity: number;
  cost_price: number;
  total_cost: number;
  reference_type: string;
  item_id: string;
  item_name: string;
  item_sku: string;
  unit: string;
  batch_number: string;
  created_by_user: string;
  reason_name: string;
}

export const MissedKitchenReport: React.FC<MissedKitchenReportProps> = ({ month, day }) => {
  const [movements, setMovements] = useState<MissedMovementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: reason } = await supabase
        .from('movement_reasons')
        .select('id, name')
        .eq('name', 'Missed Kitchen Usage')
        .single();

      if (!reason) {
        setMovements([]);
        setLoading(false);
        return;
      }

      let start: string | undefined, end: string | undefined;
      if (day) {
        start = new Date(day + 'T00:00:00').toISOString();
        end = new Date(day + 'T23:59:59.999').toISOString();
      } else if (month) {
        const targetDate = new Date(month + '-01');
        start = startOfMonth(targetDate).toISOString();
        end = endOfMonth(targetDate).toISOString();
      }

      let allMoves: any[] = [];
      let fetchMore = true;
      let from = 0;
      const step = 1000;

      while (fetchMore) {
        let query = supabase
          .from('stock_movements')
          .select(`
            id, movement_number, created_at, quantity, cost_price, reference_type, item_id,
            inventory_items ( name, sku, units:units!inventory_items_base_unit_id_fkey ( abbreviation ) ),
            batches ( batch_number ),
            profiles:created_by ( username ),
            movement_reasons ( name )
          `)
          .eq('reason_id', reason.id)
          .eq('type', 'STOCK_OUT');

        if (start && end) {
          query = query.gte('created_at', start).lte('created_at', end);
        }

        const { data: chunk, error } = await query
          .order('created_at', { ascending: false })
          .range(from, from + step - 1);

        if (error || !chunk || chunk.length === 0) {
          fetchMore = false;
        } else {
          allMoves = [...allMoves, ...chunk];
          from += step;
          if (chunk.length < step) fetchMore = false;
        }
      }

      const formatted: MissedMovementRow[] = allMoves.map(m => {
        const qty = Number(m.quantity) || 0;
        const cost = Number(m.cost_price) || 0;
        return {
          id: m.id,
          movement_number: m.movement_number,
          created_at: m.created_at,
          quantity: qty,
          cost_price: cost,
          total_cost: Math.round(qty * cost * 100) / 100,
          reference_type: m.reference_type || 'Direct Adjustment',
          item_id: m.item_id,
          item_name: (m.inventory_items as any)?.name || 'Unknown Item',
          item_sku: (m.inventory_items as any)?.sku || '-',
          unit: (m.inventory_items as any)?.units?.abbreviation || 'unit',
          batch_number: (m.batches as any)?.batch_number || 'N/A',
          created_by_user: (m.profiles as any)?.username || 'System',
          reason_name: (m.movement_reasons as any)?.name || 'Missed Kitchen Usage'
        };
      });

      setMovements(formatted);
      setPage(1);
    } catch (err) {
      console.error('[MISSED KITCHEN REPORT ERROR]:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [month, day]);

  const filteredData = useMemo(() => {
    if (!search.trim()) return movements;
    const q = search.toLowerCase();
    return movements.filter(m =>
      m.item_name.toLowerCase().includes(q) ||
      m.item_sku.toLowerCase().includes(q) ||
      m.reference_type.toLowerCase().includes(q) ||
      m.movement_number.toLowerCase().includes(q) ||
      m.batch_number.toLowerCase().includes(q) ||
      m.created_by_user.toLowerCase().includes(q)
    );
  }, [movements, search]);

  const totalCost = useMemo(() => filteredData.reduce((sum, m) => sum + m.total_cost, 0), [filteredData]);
  const totalQty = useMemo(() => filteredData.reduce((sum, m) => sum + m.quantity, 0), [filteredData]);
  const uniqueItemsCount = useMemo(() => new Set(filteredData.map(m => m.item_id)).size, [filteredData]);

  const paginatedData = useMemo(() => {
    return filteredData.slice((page - 1) * pageSize, page * pageSize);
  }, [filteredData, page, pageSize]);

  const handleExportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('Sigiri Catering - Missed Kitchen Stock-Outs Report', 14, 20);

    doc.setFontSize(10);
    const dateLabel = day ? `Day: ${day}` : month ? `Month: ${month}` : 'All Time';
    doc.text(`Period: ${dateLabel} | Generated: ${format(new Date(), 'yyyy-MM-dd HH:mm')}`, 14, 28);
    doc.text(`Total Catch-up Value: LKR ${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })} | Total Items: ${uniqueItemsCount}`, 14, 34);

    const tableData = filteredData.map(row => [
      format(parseISO(row.created_at), 'yyyy-MM-dd HH:mm'),
      row.reference_type,
      `${row.item_name} (${row.item_sku})`,
      row.batch_number,
      `${row.quantity} ${row.unit}`,
      `LKR ${row.cost_price.toFixed(2)}`,
      `LKR ${row.total_cost.toFixed(2)}`,
      row.created_by_user
    ]);

    autoTable(doc, {
      startY: 40,
      head: [['Date', 'Receipt / Ref', 'Item (SKU)', 'Batch', 'Qty', 'Unit Cost', 'Total (LKR)', 'User']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [217, 119, 6] },
      styles: { fontSize: 8 }
    });

    doc.save(`Missed_Kitchen_Stock_Outs_${day || month || 'all'}.pdf`);
  };

  const handleExportCSV = () => {
    const headers = ['Date', 'Receipt/Ref', 'Movement Number', 'Item Name', 'SKU', 'Batch Number', 'Quantity', 'Unit', 'Unit Cost', 'Total Cost (LKR)', 'Recorded By'];
    const rows = filteredData.map(r => [
      `"${format(parseISO(r.created_at), 'yyyy-MM-dd HH:mm')}"`,
      `"${r.reference_type}"`,
      `"${r.movement_number}"`,
      `"${r.item_name}"`,
      `"${r.item_sku}"`,
      `"${r.batch_number}"`,
      r.quantity,
      `"${r.unit}"`,
      r.cost_price.toFixed(2),
      r.total_cost.toFixed(2),
      `"${r.created_by_user}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Missed_Kitchen_Stock_Outs_${day || month || 'all'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-amber-50 to-orange-50/50 p-5 rounded-2xl border border-amber-200/60 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-700 uppercase tracking-wider">Total Backlog Cost</span>
            <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-sm">
              <DollarSign size={18} />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-black text-slate-800">
              LKR {totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </h3>
            <p className="text-xs text-amber-600 font-medium mt-1">
              Deducted & calculated in Kitchen Balance
            </p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Items Adjusted</span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Package size={18} />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-black text-slate-800">{uniqueItemsCount}</h3>
            <p className="text-xs text-slate-500 mt-1">Unique catalog items</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Quantities</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ArrowUpRight size={18} />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-black text-slate-800">{totalQty.toLocaleString(undefined, { maximumFractionDigits: 2 })}</h3>
            <p className="text-xs text-slate-500 mt-1">Units stocked out</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Records</span>
            <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <Clock size={18} />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-black text-slate-800">{filteredData.length}</h3>
            <p className="text-xs text-slate-500 mt-1">Catch-up movement lines</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50/50">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Search items, SKU, batch, user..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              onClick={handleExportCSV}
              disabled={filteredData.length === 0}
              className="px-3.5 py-2 border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-40"
            >
              <Download size={14} /> Export CSV
            </button>
            <button
              onClick={handleExportPDF}
              disabled={filteredData.length === 0}
              className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-40"
            >
              <FileText size={14} /> Export PDF
            </button>
            <button
              onClick={fetchData}
              className="p-2 border border-slate-200 text-slate-500 hover:bg-slate-100 rounded-xl transition-all"
              title="Refresh"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold border-b border-slate-100">
              <tr>
                <th className="px-4 py-3">Recorded Date</th>
                <th className="px-4 py-3">Receipt / Ref</th>
                <th className="px-4 py-3">Item & SKU</th>
                <th className="px-4 py-3">Batch Number</th>
                <th className="px-4 py-3 text-right">Quantity</th>
                <th className="px-4 py-3 text-right">Unit Cost</th>
                <th className="px-4 py-3 text-right">Total (LKR)</th>
                <th className="px-4 py-3">Recorded By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredData.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-500 flex items-center justify-center">
                        <Package size={22} />
                      </div>
                      <p className="font-semibold text-slate-600">No Missed Kitchen Stock-Outs Found</p>
                      <p className="text-xs text-slate-400">Transactions created with the reason "Missed Kitchen Usage" will appear here.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedData.map(row => (
                  <tr key={row.id} className="hover:bg-amber-50/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-700 whitespace-nowrap">
                      {format(parseISO(row.created_at), 'dd MMM yyyy, HH:mm')}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-slate-800">{row.reference_type}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-800">{row.item_name}</div>
                      <div className="text-xs text-slate-400">{row.item_sku}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded text-xs font-mono bg-slate-100 text-slate-700 border border-slate-200">
                        {row.batch_number}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-slate-700">
                      {row.quantity} <span className="text-xs font-normal text-slate-400">{row.unit}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600">
                      LKR {row.cost_price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-right font-black text-amber-900">
                      LKR {row.total_cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">
                        {row.created_by_user}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {filteredData.length > pageSize && (
          <div className="p-4 border-t border-slate-100 flex justify-center bg-slate-50/50">
            <Pagination
              currentPage={page}
              totalCount={filteredData.length}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </div>
        )}
      </div>
    </div>
  );
};