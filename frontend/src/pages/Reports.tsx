import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { FilterPanel } from '../components/reports/FilterPanel';
import { ReportTable, ColumnDef } from '../components/reports/ReportTable';
import { ExportPanel } from '../components/reports/ExportPanel';
import { generateCSV, generateExcel, generatePDF, ExportColumn } from '../lib/exportUtils';
import { format } from 'date-fns';
import { TrendingUp, BarChart3, Calendar, FileText, Activity } from 'lucide-react';

export const Reports: React.FC = () => {
  const [reportType, setReportType] = useState('valuation');
  const [filters, setFilters] = useState<any>({});
  
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);

  // Reference data for filters
  const [categories, setCategories] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);

  useEffect(() => {
    // Load filter reference data
    const loadRefs = async () => {
      const [cats, sups, usrs] = await Promise.all([
        supabase.from('categories').select('id, name').order('name'),
        supabase.from('suppliers').select('id, name').order('name'),
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
    setSelectedRowIds([]);
    try {
      let query;

      if (reportType === 'valuation') {
        query = supabase
          .from('inventory_items')
          .select(`
            *,
            categories(name),
            units:units!inventory_items_base_unit_id_fkey(abbreviation)
          `)
          .eq('status', 'ACTIVE');
          
        if (filters.categoryId) query = query.eq('category_id', filters.categoryId);
        if (filters.stockStatus === 'in_stock') query = query.gt('current_stock', 0);
        if (filters.stockStatus === 'out_of_stock') query = query.lte('current_stock', 0);
        if (filters.stockStatus === 'low_stock') query = query.lte('current_stock', 10); // Simple threshold for demo

      } else if (reportType === 'expiry') {
        query = supabase
          .from('batches')
          .select(`
            *,
            inventory_items(name, category_id, categories(name))
          `)
          .gt('available_qty', 0)
          .not('expiry_date', 'is', null);

        if (filters.showExpired === 'no') {
          query = query.gte('expiry_date', new Date().toISOString().split('T')[0]);
        }
        
        // Expiry threshold filtering could be done client-side or server-side.
        // We'll fetch and filter client-side for complex date math ease.

      } else if (reportType === 'outstanding') {
        // Mocking Supplier Balances (Since we may not have a dedicated ledger table in this snapshot)
        query = supabase.from('suppliers').select('*');
        if (filters.supplierId) query = query.eq('id', filters.supplierId);

      } else if (reportType === 'movements') {
        query = supabase
          .from('stock_movements')
          .select(`
            *,
            profiles:created_by (username),
            inventory_items (name, units:units!inventory_items_base_unit_id_fkey(abbreviation)),
            movement_reasons (name)
          `)
          .order('created_at', { ascending: false })
          .limit(1000);

        if (filters.userId) query = query.eq('created_by', filters.userId);
        if (filters.type) query = query.eq('type', filters.type);
      }

      const { data: result, error } = await query;
      if (error) throw error;

      let finalData = result || [];

      // Additional client-side filtering for complex types
      if (reportType === 'expiry' && filters.days && filters.days !== 'all') {
        const thresholdDate = new Date();
        thresholdDate.setDate(thresholdDate.getDate() + parseInt(filters.days));
        finalData = finalData.filter((b: any) => new Date(b.expiry_date) <= thresholdDate);
      }

      if (reportType === 'movements' && filters.search) {
        const s = filters.search.toLowerCase();
        finalData = finalData.filter((m: any) => m.inventory_items?.name?.toLowerCase().includes(s));
      }

      setData(finalData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReportData();
  }, [reportType]); // Fetch on tab change immediately

  // --- COLUMNS DEFINITION ---
  const getColumns = (): ColumnDef[] => {
    switch (reportType) {
      case 'valuation':
        return [
          { key: 'name', header: 'Item Name', sortable: true },
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
          { key: 'expiry_date', header: 'Expiry Date', render: (r) => format(new Date(r.expiry_date), 'dd/MM/yyyy'), sortable: true },
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
          { key: 'name', header: 'Supplier Name', sortable: true },
          { key: 'code', header: 'Code' },
          { key: 'contact_person', header: 'Contact' },
          { key: 'status', header: 'Status', render: (r) => <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-bold">Active</span> }
        ];
      case 'movements':
        return [
          { key: 'created_at', header: 'Date & Time', render: (r) => format(new Date(r.created_at), 'dd/MM/yyyy HH:mm'), sortable: true },
          { key: 'item', header: 'Item Name', render: (r) => r.inventory_items?.name },
          { key: 'type', header: 'Movement Type', render: (r) => (
            <span className={`px-2 py-1 rounded text-xs font-bold ${
              r.type === 'STOCK_IN' ? 'bg-green-100 text-green-700' :
              r.type === 'STOCK_OUT' ? 'bg-orange-100 text-orange-700' :
              'bg-blue-100 text-blue-700'
            }`}>{r.type.replace('_', ' ')}</span>
          )},
          { key: 'quantity', header: 'Qty', render: (r) => `${r.type === 'STOCK_OUT' ? '-' : '+'}${Number(r.quantity)} ${r.inventory_items?.units?.abbreviation}` },
          { key: 'user', header: 'Staff Member', render: (r) => r.profiles?.username },
          { key: 'reason', header: 'Reason', render: (r) => r.movement_reasons?.name || '-' }
        ];
      default: return [];
    }
  };

  const handleExport = async (formatType: 'excel' | 'pdf' | 'csv', selectedOnly: boolean) => {
    setExporting(true);
    try {
      const exportData = selectedOnly ? data.filter(d => selectedRowIds.includes(d.id)) : data;
      const cols = getColumns();
      
      const exportCols: ExportColumn[] = cols.map(c => ({
        header: c.header,
        key: c.key
      }));

      // Map dynamic render values for export
      const mappedData = exportData.map(row => {
        const newRow: any = {};
        cols.forEach(c => {
          newRow[c.key] = c.render && typeof c.render(row) === 'string' 
            ? c.render(row) 
            : c.render && React.isValidElement(c.render(row)) 
              ? row[c.key] // fallback to raw value if it's a JSX badge
              : row[c.key];
              
          // Fix nested object extraction for export if JSX fallback didn't work
          if (reportType === 'valuation' && c.key === 'category') newRow[c.key] = row.categories?.name;
          if (reportType === 'valuation' && c.key === 'unit') newRow[c.key] = row.units?.abbreviation;
          if (reportType === 'valuation' && c.key === 'total_value') newRow[c.key] = (Number(row.current_stock) * Number(row.cost_price)).toFixed(2);
          if (reportType === 'expiry' && c.key === 'item') newRow[c.key] = row.inventory_items?.name;
          if (reportType === 'expiry' && c.key === 'category') newRow[c.key] = row.inventory_items?.categories?.name;
          if (reportType === 'expiry' && c.key === 'expiry_date') newRow[c.key] = format(new Date(row.expiry_date), 'dd/MM/yyyy');
          if (reportType === 'movements' && c.key === 'item') newRow[c.key] = row.inventory_items?.name;
          if (reportType === 'movements' && c.key === 'user') newRow[c.key] = row.profiles?.username;
          if (reportType === 'movements' && c.key === 'reason') newRow[c.key] = row.movement_reasons?.name;
          if (reportType === 'movements' && c.key === 'created_at') newRow[c.key] = format(new Date(row.created_at), 'dd/MM/yyyy HH:mm');
        });
        return newRow;
      });

      const title = `Sigiri Catering - ${reportTabs.find(t => t.id === reportType)?.label}`;
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

  const reportTabs = [
    { id: 'valuation', label: 'Inventory Valuation', icon: <BarChart3 size={18} /> },
    { id: 'expiry', label: 'Expiry Warning', icon: <Calendar size={18} /> },
    { id: 'outstanding', label: 'Supplier Balances', icon: <FileText size={18} /> },
    { id: 'movements', label: 'Stock Movements', icon: <Activity size={18} /> }
  ];

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
          <TrendingUp className="text-primary" />
          Analytics & Reports
        </h2>
        <p className="text-sm text-slate-500 mt-1">Generate, filter, and export comprehensive operational data.</p>
      </div>

      {/* Report Type Tabs */}
      <div className="flex overflow-x-auto gap-2 border-b border-slate-200 pb-px hide-scrollbar">
        {reportTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => { setReportType(tab.id); setFilters({}); }}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold whitespace-nowrap border-b-2 transition-all ${
              reportType === tab.id 
                ? 'border-primary text-primary' 
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filter Panel */}
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

      {/* Data Table */}
      <ReportTable 
        columns={getColumns()}
        data={data}
        loading={loading}
        selectedIds={selectedRowIds}
        onSelectionChange={setSelectedRowIds}
      />

      {/* Export Panel (Sticky Bottom) */}
      <ExportPanel 
        selectedCount={selectedRowIds.length}
        totalCount={data.length}
        onSelectAllPages={() => setSelectedRowIds(data.map(d => d.id))}
        onExport={handleExport}
        exporting={exporting}
      />
    </div>
  );
};
export default Reports;
