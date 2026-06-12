import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { FilterPanel } from '../components/reports/FilterPanel';
import { ReportTable } from '../components/reports/ReportTable';
import type { ColumnDef } from '../components/reports/ReportTable';
import { ExportPanel } from '../components/reports/ExportPanel';
import { JatKitchenReport } from '../components/reports/JatKitchenReport';
import { JatTransactionsReport } from '../components/reports/JatTransactionsReport';
import { generateCSV, generateExcel, generatePDF } from '../lib/exportUtils';
import type { ExportColumn } from '../lib/exportUtils';
import { format } from 'date-fns';
import { TrendingUp, TrendingDown, Clock, Package, DollarSign, X } from 'lucide-react';

export const Reports: React.FC = () => {
  const { type } = useParams<{ type: string }>();
  const navigate = useNavigate();
  const reportType = type || 'valuation';

  const [filters, setFilters] = useState<any>({});
  
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  const [exporting, setExporting] = useState(false);

  // Reference data for filters
  const [categories, setCategories] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);

  // History Modal States
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historySupplier, setHistorySupplier] = useState<any | null>(null);
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [itemHistoryOpen, setItemHistoryOpen] = useState(false);
  const [itemHistoryItem, setItemHistoryItem] = useState<any>(null);
  const [itemHistoryData, setItemHistoryData] = useState<any[]>([]);
  const [itemHistoryLoading, setItemHistoryLoading] = useState(false);

  useEffect(() => {
    if (!type) {
      navigate('/reports/valuation', { replace: true });
    }
  }, [type, navigate]);

  useEffect(() => {
    const loadRefs = async () => {
      const [cats, sups, usrs] = await Promise.all([
        supabase.from('categories').select('id, name').order('name'),
        supabase.from('suppliers').select('id, name, status').eq('status', 'ACTIVE').order('name'),
        supabase.from('profiles').select('id, username').order('username')
      ]);
      if (cats.data) setCategories(cats.data);
      if (sups.data) setSuppliers(sups.data);
      if (usrs.data) setUsers(usrs.data);
    };
    loadRefs();
  }, []);

  const fetchReportData = async () => {
    setLoading(true);
    try {
      let query;

      if (reportType === 'valuation') {
        query = supabase
          .from('inventory_items')
          .select(`*, categories(name), units:units!inventory_items_base_unit_id_fkey(abbreviation)`)
          .eq('status', 'ACTIVE');
          
        if (filters.categoryId) query = query.eq('category_id', filters.categoryId);
        if (filters.stockStatus === 'in_stock') query = query.gt('current_stock', 0);
        if (filters.stockStatus === 'out_of_stock') query = query.lte('current_stock', 0);
        if (filters.stockStatus === 'low_stock') query = query.lte('current_stock', 10);

      } else if (reportType === 'expiry') {
        query = supabase
          .from('batches')
          .select(`*, inventory_items(name, category_id, categories(name))`)
          .gt('available_qty', 0)
          .not('expiry_date', 'is', null);

        if (filters.showExpired === 'no') {
          query = query.gte('expiry_date', format(new Date(), 'yyyy-MM-dd'));
        }

      } else if (reportType === 'outstanding') {
        query = supabase.from('suppliers').select(`*, supplier_payments(payment_method, created_at)`).eq('status', 'ACTIVE').order('name');
        if (filters.supplierId) query = query.eq('id', filters.supplierId);

      } else if (reportType === 'movements') {
        query = supabase
          .from('stock_movements')
          .select(`*, profiles:created_by (username), inventory_items (name, units:units!inventory_items_base_unit_id_fkey(abbreviation)), movement_reasons (name)`)
          .order('created_at', { ascending: false })
          .limit(1000);

        if (filters.userId) query = query.eq('created_by', filters.userId);
        if (filters.type) query = query.eq('type', filters.type);
      } else if (reportType === 'purchase_orders') {
        query = supabase
          .from('purchase_orders')
          .select(`*, suppliers(name), profiles:created_by (username), supplier_payments(payment_method, amount)`)
          .order('created_at', { ascending: false });

        if (filters.supplierId) query = query.eq('supplier_id', filters.supplierId);
      } else {
        setData([]);
        return;
      }

      const { data: result, error } = await query;
      if (error) throw error;

      let finalData = result || [];

      if (reportType === 'expiry' && filters.days && filters.days !== 'all') {
        const thresholdDate = new Date();
        thresholdDate.setDate(thresholdDate.getDate() + parseInt(filters.days));
        finalData = finalData.filter((b: any) => new Date(b.expiry_date) <= thresholdDate);
      }

      if (reportType === 'movements' && filters.search) {
        const s = filters.search.toLowerCase();
        finalData = finalData.filter((m: any) => m.inventory_items?.name?.toLowerCase()?.includes(s));
      }

      if (reportType === 'purchase_orders' && filters.paymentMethod) {
        finalData = finalData.filter((p: any) => 
          p.supplier_payments?.some((sp: any) => sp.payment_method === filters.paymentMethod)
        );
      }

      setData(finalData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setFilters({});
  }, [reportType]);

  useEffect(() => {
    fetchReportData();
  }, [reportType]);

  const openHistoryModal = async (sup: any) => {
    setHistorySupplier(sup);
    setHistoryOpen(true);
    setHistoryLoading(true);
    setHistoryData([]);
    try {
      const { data: pos } = await supabase.from('purchase_orders').select('id, po_number, status, total_amount, created_at').eq('supplier_id', sup.id).order('created_at', { ascending: false });
      const { data: grns } = await supabase.from('grns').select('id, grn_number, total_amount, received_date').eq('supplier_id', sup.id).order('received_date', { ascending: false });
      const { data: payments } = await supabase.from('supplier_payments').select('id, amount, payment_method, notes, created_at, profiles:paid_by(username)').eq('supplier_id', sup.id).order('created_at', { ascending: false });

      const timeline: any[] = [];
      (pos || []).forEach(p => timeline.push({ type: 'PO', date: p.created_at, data: p }));
      (grns || []).forEach(g => timeline.push({ type: 'GRN', date: g.received_date, data: g }));
      (payments || []).forEach(p => timeline.push({ type: 'PAYMENT', date: p.created_at, data: p }));
      timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setHistoryData(timeline);
    } catch (err) {
      console.error(err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const openItemHistoryModal = async (item: any) => {
    setItemHistoryItem(item);
    setItemHistoryOpen(true);
    setItemHistoryLoading(true);
    setItemHistoryData([]);
    try {
      const { data: movements } = await supabase
        .from('stock_movements')
        .select('id, movement_number, type, quantity, cost_price, created_at, movement_reasons(name), profiles:created_by(username)')
        .eq('item_id', item.id)
        .order('created_at', { ascending: false });
        
      setItemHistoryData(movements || []);
    } catch (err) {
      console.error(err);
    } finally {
      setItemHistoryLoading(false);
    }
  };

  const columns = useMemo((): ColumnDef[] => {
    switch (reportType) {
      case 'valuation':
        return [
          { key: 'name', header: 'Item Name', sortable: true, render: (r) => (
            <button onClick={() => openItemHistoryModal(r)} className="font-bold text-primary hover:underline text-left">{r.name}</button>
          )},
          { key: 'category', header: 'Category', render: (r) => r.categories?.name },
          { key: 'unit', header: 'Unit', render: (r) => r.units?.abbreviation },
          { key: 'current_stock', header: 'Stock Qty', sortable: true },
          { key: 'cost_price', header: 'Unit Cost (LKR)', render: (r) => Number(r.cost_price).toLocaleString(undefined, { minimumFractionDigits: 2 }) },
          { key: 'total_value', header: 'Total Value (LKR)', render: (r) => (Number(r.current_stock) * Number(r.cost_price)).toLocaleString(undefined, { minimumFractionDigits: 2 }) }
        ];
      case 'expiry':
        return [
          { key: 'item', header: 'Item Name', render: (r) => r.inventory_items?.name, sortable: true },
          { key: 'batch_number', header: 'Batch No.' },
          { key: 'category', header: 'Category', render: (r) => r.inventory_items?.categories?.name },
          { key: 'available_qty', header: 'Qty Remaining' },
          { key: 'expiry_date', header: 'Expiry Date', render: (r) => r.expiry_date ? format(new Date(r.expiry_date), 'dd/MM/yyyy') : '-', sortable: true },
          { key: 'days', header: 'Days Until Expiry', render: (r) => {
              const diff = Math.ceil((new Date(r.expiry_date).getTime() - new Date().getTime()) / (1000 * 3600 * 24));
              return diff < 0 ? 'Expired' : `${diff} days`;
            }
          },
          { key: 'status', header: 'Status', render: (r) => {
              const diff = Math.ceil((new Date(r.expiry_date).getTime() - new Date().getTime()) / (1000 * 3600 * 24));
              if (diff < 0) return <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-bold">Expired</span>;
              if (diff <= 7) return <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs font-bold">Critical</span>;
              if (diff <= 30) return <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs font-bold">Warning</span>;
              return <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-bold">OK</span>;
            }
          }
        ];
      case 'outstanding':
        return [
          { key: 'name', header: 'Supplier Name', sortable: true, render: (r) => (
            <div className="flex items-center gap-2">
              <button onClick={() => openHistoryModal(r)} className="font-bold text-primary hover:underline">{r.name}</button>
              {r.status === 'INACTIVE' && (
                <span className="bg-slate-100 text-slate-500 text-[10px] font-bold px-1.5 py-0.5 rounded border border-slate-200">Archived</span>
              )}
            </div>
          )},
          { key: 'code', header: 'Code' },
          { key: 'contact_person', header: 'Contact', render: (r) => r.phone || r.email || '-' },
          { key: 'outstanding_balance', header: 'Outstanding Balance', render: (r) => (
            <span className={`font-bold ${Number(r.outstanding_balance) > 0 ? 'text-rose-600' : 'text-green-600'}`}>
              LKR {Number(r.outstanding_balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          )},
          { key: 'last_payment_method', header: 'Last Payment Method', render: (r) => {
            if (!r.supplier_payments || r.supplier_payments.length === 0) return '-';
            const sorted = [...r.supplier_payments].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
            return sorted[0].payment_method;
          }},
          { key: 'status', header: 'Status', render: (r) => <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-bold">Active</span> }
        ];
      case 'movements':
        return [
          { key: 'created_at', header: 'Date & Time', render: (r) => r.created_at ? format(new Date(r.created_at), 'dd/MM/yyyy HH:mm') : '-', sortable: true },
          { key: 'item', header: 'Item Name', render: (r) => r.inventory_items?.name },
          { key: 'type', header: 'Movement Type', render: (r) => (
            <span className={`px-2 py-1 rounded text-xs font-bold ${
              r.type === 'STOCK_IN' ? 'bg-green-100 text-green-700' :
              r.type === 'STOCK_OUT' ? 'bg-orange-100 text-orange-700' :
              'bg-blue-100 text-blue-700'
            }`}>{r.type?.replace('_', ' ') || '-'}</span>
          )},
          { key: 'quantity', header: 'Qty', render: (r) => `${r.type === 'STOCK_OUT' ? '-' : '+'}${Number(r.quantity)} ${r.inventory_items?.units?.abbreviation}` },
          { key: 'user', header: 'Staff Member', render: (r) => r.profiles?.username },
          { key: 'reason', header: 'Reason', render: (r) => r.movement_reasons?.name || '-' }
        ];
      default: return [];
    }
  }, [reportType]);

  const handleExport = async (formatType: 'excel' | 'pdf' | 'csv', selectedCols: string[]) => {
    setExporting(true);
    try {
      const exportCols: ExportColumn[] = columns
        .filter(c => selectedCols.includes(c.key))
        .map(c => ({
          header: c.header,
          key: c.key
        }));

      const mappedData = data.map(row => {
        const newRow: any = {};
        columns.filter(c => selectedCols.includes(c.key)).forEach(c => {
          newRow[c.key] = c.render && typeof c.render(row) === 'string' 
            ? c.render(row) 
            : c.render && React.isValidElement(c.render(row)) 
              ? row[c.key] 
              : row[c.key];
              
          if (reportType === 'valuation' && c.key === 'category') newRow[c.key] = row.categories?.name;
          if (reportType === 'valuation' && c.key === 'unit') newRow[c.key] = row.units?.abbreviation;
          if (reportType === 'valuation' && c.key === 'total_value') newRow[c.key] = (Number(row.current_stock) * Number(row.cost_price)).toFixed(2);
          if (reportType === 'expiry' && c.key === 'item') newRow[c.key] = row.inventory_items?.name;
          if (reportType === 'expiry' && c.key === 'category') newRow[c.key] = row.inventory_items?.categories?.name;
          if (reportType === 'expiry' && c.key === 'expiry_date') newRow[c.key] = row.expiry_date ? format(new Date(row.expiry_date), 'dd/MM/yyyy') : '-';
          if (reportType === 'outstanding' && c.key === 'name') newRow[c.key] = row.name + (row.status === 'INACTIVE' ? ' (Archived)' : '');
          if (reportType === 'outstanding' && c.key === 'contact_person') newRow[c.key] = row.phone || row.email || '-';
          if (reportType === 'outstanding' && c.key === 'outstanding_balance') newRow[c.key] = Number(row.outstanding_balance || 0).toFixed(2);
          if (reportType === 'outstanding' && c.key === 'last_payment_method') {
            if (!row.supplier_payments || row.supplier_payments.length === 0) newRow[c.key] = '-';
            else {
              const sorted = [...row.supplier_payments].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
              newRow[c.key] = sorted[0].payment_method;
            }
          }
          if (reportType === 'outstanding' && c.key === 'status') newRow[c.key] = 'Active';

          if (reportType === 'purchase_orders' && c.key === 'created_at') newRow[c.key] = row.created_at ? format(new Date(row.created_at), 'dd/MM/yyyy') : '-';
          if (reportType === 'purchase_orders' && c.key === 'supplier') newRow[c.key] = row.suppliers?.name;
          if (reportType === 'purchase_orders' && c.key === 'total_amount') newRow[c.key] = Number(row.total_amount || 0).toFixed(2);
          if (reportType === 'purchase_orders' && c.key === 'paid_amount') newRow[c.key] = Number(row.paid_amount || 0).toFixed(2);
          if (reportType === 'purchase_orders' && c.key === 'payment_methods') {
            if (!row.supplier_payments || row.supplier_payments.length === 0) newRow[c.key] = '-';
            else {
              const methods = Array.from(new Set(row.supplier_payments.map((p: any) => p.payment_method)));
              newRow[c.key] = methods.join(', ');
            }
          }
          if (reportType === 'purchase_orders' && c.key === 'status') {
              const paid = Number(row.paid_amount || 0);
              const total = Number(row.total_amount || 0);
              newRow[c.key] = (total > 0 && paid >= total) ? 'PAID' : 'PENDING';
          }

          if (reportType === 'movements' && c.key === 'item') newRow[c.key] = row.inventory_items?.name;
          if (reportType === 'movements' && c.key === 'user') newRow[c.key] = row.profiles?.username;
          if (reportType === 'movements' && c.key === 'reason') newRow[c.key] = row.movement_reasons?.name;
          if (reportType === 'movements' && c.key === 'created_at') newRow[c.key] = row.created_at ? format(new Date(row.created_at), 'dd/MM/yyyy HH:mm') : '-';
        });
        return newRow;
      });

      const title = `Sigiri Catering - Report`;
      const filename = `Report_${reportType}_${format(new Date(), 'yyyyMMdd_HHmm')}`;

      if (formatType === 'csv') generateCSV(exportCols, mappedData, filename);
      if (formatType === 'excel') await generateExcel(exportCols, mappedData, filename, title);
      if (formatType === 'pdf') generatePDF(exportCols, mappedData, filename, title);

    } catch (err) {
      console.error(err);
      alert('Export failed.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6 pb-20">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2 capitalize">
          <TrendingUp className="text-primary" />
          {reportType.replace('-', ' ')} Report
        </h2>
        <p className="text-sm text-slate-500 mt-1">Generate, filter, and export comprehensive operational data.</p>
      </div>

      <FilterPanel 
        reportType={reportType}
        filters={filters}
        setFilters={setFilters}
        onApply={fetchReportData}
        onReset={() => { setFilters({}); setTimeout(fetchReportData, 0); }}
        categories={categories}
        suppliers={suppliers}
        users={users}
      />

      {reportType === 'jat_kitchen' ? (
        <JatKitchenReport month={filters.month} day={filters.day} />
      ) : reportType === 'jat_transactions' ? (
        <JatTransactionsReport 
          month={filters.month} 
          day={filters.day} 
        />
      ) : (
        <ReportTable 
          columns={columns}
          data={data}
          loading={loading}
        />
      )}

      {reportType !== 'jat_kitchen' && reportType !== 'jat_transactions' && (
        <ExportPanel 
          totalCount={data.length}
          columns={columns}
          onExport={handleExport}
          exporting={exporting}
        />
      )}

      {/* Supplier History Modal */}
      {historyOpen && historySupplier && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-slate-900/50 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-100 w-full max-w-2xl my-6 card-shadow flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 shrink-0">
              <div>
                <h3 className="text-lg font-bold text-slate-800">{historySupplier.name}</h3>
                <p className="text-xs text-slate-500 mt-0.5">Full transaction history · Outstanding: <span className="font-bold text-rose-600">LKR {Number(historySupplier.outstanding_balance).toLocaleString()}</span></p>
              </div>
              <button onClick={() => setHistoryOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[70vh]">
              {historyLoading ? (
                <div className="flex items-center justify-center py-12 text-slate-400">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mr-2" />
                  Loading history...
                </div>
              ) : historyData.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <Clock size={40} className="mx-auto mb-3 opacity-30" />
                  <p className="font-medium">No transaction history yet.</p>
                </div>
              ) : (
                <div className="relative">
                  <div className="absolute left-4 top-0 bottom-0 w-px bg-slate-100" />
                  <div className="space-y-4">
                    {historyData.map((item, idx) => (
                      <div key={idx} className="flex gap-4 relative">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 z-10 ${
                          item.type === 'PO' ? 'bg-blue-100' :
                          item.type === 'GRN' ? 'bg-green-100' : 'bg-amber-100'
                        }`}>
                          {item.type === 'PO' && <Package size={14} className="text-blue-600" />}
                          {item.type === 'GRN' && <Package size={14} className="text-green-600" />}
                          {item.type === 'PAYMENT' && <DollarSign size={14} className="text-amber-600" />}
                        </div>
                        <div className={`flex-1 rounded-xl p-4 border text-sm ${
                          item.type === 'PO' ? 'bg-blue-50/50 border-blue-100' :
                          item.type === 'GRN' ? 'bg-green-50/50 border-green-100' : 'bg-amber-50/50 border-amber-100'
                        }`}>
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              {item.type === 'PO' && (
                                <>
                                  <p className="font-bold text-blue-700">Purchase Order Raised</p>
                                  <p className="text-xs text-slate-600 mt-1">PO# <span className="font-mono font-semibold">{item.data.po_number}</span> · Status: <span className="font-semibold">{item.data.status}</span></p>
                                  <p className="text-xs font-bold text-slate-700 mt-1">LKR {Number(item.data.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                                </>
                              )}
                              {item.type === 'GRN' && (
                                <>
                                  <p className="font-bold text-green-700">Goods Received (GRN)</p>
                                  <p className="text-xs text-slate-600 mt-1">GRN# <span className="font-mono font-semibold">{item.data.grn_number}</span></p>
                                  <p className="text-xs font-bold text-slate-700 mt-1">LKR {Number(item.data.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                                </>
                              )}
                              {item.type === 'PAYMENT' && (
                                <>
                                  <p className="font-bold text-amber-700">Payment Recorded</p>
                                  <p className="text-xs text-slate-600 mt-1">
                                    Method: <span className="font-semibold">{item.data.payment_method}</span>
                                    {item.data.profiles?.username && <> · By: <span className="font-semibold">{item.data.profiles.username}</span></>}
                                  </p>
                                  {item.data.notes && <p className="text-xs text-slate-500 mt-1 italic">"{item.data.notes}"</p>}
                                  <p className="text-sm font-bold text-green-700 mt-1">− LKR {Number(item.data.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                                </>
                              )}
                            </div>
                            <p className="text-[10px] text-slate-400 font-medium shrink-0 whitespace-nowrap">
                              {format(new Date(item.date), 'dd MMM yyyy')}
                              <br/>{format(new Date(item.date), 'hh:mm a')}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Item History Modal */}
      {itemHistoryOpen && itemHistoryItem && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-slate-900/50 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-100 w-full max-w-2xl my-6 card-shadow flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 shrink-0">
              <div>
                <h3 className="text-lg font-bold text-slate-800">{itemHistoryItem.name} - Stock Ledger</h3>
                <p className="text-xs text-slate-500 mt-0.5">Full history of stock in and stock out movements</p>
              </div>
              <button onClick={() => setItemHistoryOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[70vh]">
              {itemHistoryLoading ? (
                <div className="flex items-center justify-center py-12 text-slate-400">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mr-2" />
                  Loading ledger...
                </div>
              ) : itemHistoryData.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <Clock size={40} className="mx-auto mb-3 opacity-30" />
                  <p className="font-medium">No stock movements found.</p>
                </div>
              ) : (
                <div className="relative">
                  <div className="absolute left-4 top-0 bottom-0 w-px bg-slate-100" />
                  <div className="space-y-4">
                    {itemHistoryData.map((m, idx) => (
                      <div key={idx} className="flex gap-4 relative">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 z-10 ${
                          m.type === 'STOCK_IN' ? 'bg-green-100' :
                          m.type === 'STOCK_OUT' ? 'bg-rose-100' : 'bg-blue-100'
                        }`}>
                          {m.type === 'STOCK_IN' && <TrendingUp size={14} className="text-green-600" />}
                          {m.type === 'STOCK_OUT' && <TrendingDown size={14} className="text-rose-600" />}
                        </div>
                        <div className={`flex-1 rounded-xl p-4 border text-sm ${
                          m.type === 'STOCK_IN' ? 'bg-green-50/50 border-green-100' :
                          m.type === 'STOCK_OUT' ? 'bg-rose-50/50 border-rose-100' : 'bg-blue-50/50 border-blue-100'
                        }`}>
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className={`font-bold ${
                                m.type === 'STOCK_IN' ? 'text-green-700' :
                                m.type === 'STOCK_OUT' ? 'text-rose-700' : 'text-blue-700'
                              }`}>{m.type.replace('_', ' ')}</p>
                              <p className="text-xs text-slate-600 mt-1">Movement# <span className="font-mono font-semibold">{m.movement_number}</span> · Date: <span className="font-semibold">{format(new Date(m.created_at), 'dd MMM yyyy HH:mm')}</span></p>
                              <p className="text-xs text-slate-600 mt-1">Reason: <span className="font-semibold">{m.movement_reasons?.name || '-'}</span> · By: <span className="font-semibold">{m.profiles?.username || 'System'}</span></p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-bold text-slate-800">{m.type === 'STOCK_OUT' ? '-' : '+'}{Number(m.quantity)} {itemHistoryItem.units?.abbreviation}</p>
                              <p className="text-xs font-semibold text-slate-500 mt-1">@ LKR {Number(m.cost_price).toFixed(2)}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default Reports;
