import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { 
  TrendingDown, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Search, 
  RefreshCw, 
  X, 
  Calendar, 
  ChevronRight,
  TrendingUp,
  Package,
  ShoppingCart,
  ArrowUpDown,
  Filter
} from 'lucide-react';
import { format, subDays, startOfDay, parseISO } from 'date-fns';

export interface VelocityItem {
  id: string;
  name: string;
  categoryName: string;
  unitAbbr: string;
  currentStock: number;
  minStock: number;
  maxStock: number;
  costPrice: number;
  // Calculations
  totalKitchenUsage: number;
  avgDailyUsage: number;
  daysRemaining: number | null; // null if no usage
  status: 'OUT_OF_STOCK' | 'CRITICAL' | 'REORDER_SOON' | 'SAFE' | 'NO_USAGE';
  // Purchase insights
  purchaseCount: number;
  avgPurchaseCadenceDays: number | null;
  avgOrderQuantity: number | null;
  lastPurchaseDate: string | null;
  lastPurchasePrice: number | null;
}

export const StockForecastReport: React.FC = () => {
  const [lookbackDays, setLookbackDays] = useState<7 | 14 | 30>(14);
  const [items, setItems] = useState<VelocityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [filterUrgency, setFilterUrgency] = useState<'ALL' | 'ACTION_NEEDED' | 'OUT' | 'CRITICAL' | 'SAFE' | 'NO_USAGE'>('ALL');
  const [categories, setCategories] = useState<string[]>([]);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Modal State for Deep-Dive Graph & Activity
  const [selectedItem, setSelectedItem] = useState<VelocityItem | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [itemUsageHistory, setItemUsageHistory] = useState<any[]>([]);
  const [itemPurchaseHistory, setItemPurchaseHistory] = useState<any[]>([]);

  // 1. Fetch & Calculate Velocity
  const fetchVelocityData = async (showRefreshIndicator = false) => {
    if (showRefreshIndicator) setIsRefreshing(true);
    else setLoading(true);

    try {
      const windowStartDate = startOfDay(subDays(new Date(), lookbackDays)).toISOString();

      // Parallel fetch:
      // A. Active Inventory items with batches
      // B. Kitchen usage reasons
      // C. Stock movements in lookback window (STOCK_OUT)
      // D. Purchase orders / GRN items for purchases
      const [
        itemsRes,
        reasonsRes,
        movementsRes,
        grnItemsRes
      ] = await Promise.all([
        supabase
          .from('inventory_items')
          .select(`
            id, name, min_stock, max_stock, cost_price, status,
            categories ( name ),
            units:units!inventory_items_base_unit_id_fkey ( abbreviation ),
            batches ( id, available_qty, current_qty, status )
          `)
          .eq('status', 'ACTIVE')
          .order('name'),

        supabase
          .from('movement_reasons')
          .select('id, name')
          .in('name', ['Kitchen Usage', 'Missed Kitchen Usage']),

        supabase
          .from('stock_movements')
          .select('id, item_id, quantity, type, reason_id, created_at')
          .eq('type', 'STOCK_OUT')
          .gte('created_at', windowStartDate),

        supabase
          .from('grn_items')
          .select(`
            id, item_id, quantity, cost_price,
            grns ( id, grn_number, created_at, received_date )
          `)
      ]);

      const kitchenReasonIds = new Set((reasonsRes.data || []).map(r => r.id));

      // Group kitchen usage by item_id
      const kitchenUsageMap: Record<string, { total: number; entries: any[] }> = {};
      (movementsRes.data || []).forEach(m => {
        if (kitchenReasonIds.has(m.reason_id)) {
          if (!kitchenUsageMap[m.item_id]) {
            kitchenUsageMap[m.item_id] = { total: 0, entries: [] };
          }
          const qty = Number(m.quantity) || 0;
          kitchenUsageMap[m.item_id].total += qty;
          kitchenUsageMap[m.item_id].entries.push(m);
        }
      });

      // Group GRN purchases by item_id
      const grnMap: Record<string, any[]> = {};
      (grnItemsRes.data || []).forEach(g => {
        if (!grnMap[g.item_id]) grnMap[g.item_id] = [];
        grnMap[g.item_id].push(g);
      });

      // Extract unique categories
      const catSet = new Set<string>();

      // Compute calculations per item
      const processed: VelocityItem[] = (itemsRes.data || []).map(item => {
        const catName = item.categories?.name || 'Uncategorized';
        catSet.add(catName);

        // Sum current stock across active batches
        const currentStock = (item.batches || []).reduce((sum: number, b: any) => {
          return sum + (Number(b.available_qty) || 0);
        }, 0);

        // Usage calculations (Kitchen Only)
        const usageData = kitchenUsageMap[item.id];
        const totalKitchenUsage = usageData ? usageData.total : 0;
        const avgDailyUsage = totalKitchenUsage / lookbackDays;

        // Days remaining
        let daysRemaining: number | null = null;
        let status: VelocityItem['status'] = 'SAFE';

        if (currentStock <= 0) {
          daysRemaining = 0;
          status = 'OUT_OF_STOCK';
        } else if (avgDailyUsage > 0) {
          daysRemaining = currentStock / avgDailyUsage;
          if (daysRemaining <= 2) {
            status = 'CRITICAL';
          } else if (daysRemaining <= 5 || currentStock <= (Number(item.min_stock) || 0)) {
            status = 'REORDER_SOON';
          } else {
            status = 'SAFE';
          }
        } else {
          daysRemaining = null;
          status = 'NO_USAGE';
        }

        // Purchase analytics from GRNs
        const allPurchases = grnMap[item.id] || [];
        // Sort all purchases by date descending
        allPurchases.sort((a: any, b: any) => {
          const dateA = new Date(a.grns?.received_date || a.grns?.created_at || 0).getTime();
          const dateB = new Date(b.grns?.received_date || b.grns?.created_at || 0).getTime();
          return dateB - dateA;
        });

        // Filter purchases within the active lookback window
        const windowStartTime = new Date(windowStartDate).getTime();
        const windowPurchases = allPurchases.filter((p: any) => {
          const pDate = new Date(p.grns?.received_date || p.grns?.created_at || 0).getTime();
          return pDate >= windowStartTime;
        });

        // Primary metrics prioritize window purchases; fallback to recent purchases if none in window
        const activePurchases = windowPurchases.length > 0 ? windowPurchases : allPurchases.slice(0, 5);
        const purchaseCount = windowPurchases.length; // purchases strictly in window
        let lastPurchaseDate: string | null = null;
        let lastPurchasePrice: number | null = null;
        let avgPurchaseCadenceDays: number | null = null;
        let avgOrderQuantity: number | null = null;

        if (allPurchases.length > 0) {
          const newest = allPurchases[0];
          lastPurchaseDate = newest.grns?.received_date || newest.grns?.created_at || null;
          lastPurchasePrice = Number(newest.cost_price) || null;
        }

        if (activePurchases.length > 0) {
          // Typical Order Size: Sum of quantities / total deliveries in active set
          const totalReceivedQty = activePurchases.reduce((sum: number, p: any) => sum + (Number(p.quantity) || 0), 0);
          avgOrderQuantity = totalReceivedQty / activePurchases.length;

          if (windowPurchases.length > 0) {
            // In the lookback window: Cadence = lookbackDays / number of purchases in window
            avgPurchaseCadenceDays = lookbackDays / windowPurchases.length;
          } else if (allPurchases.length > 1) {
            // If none in this window, calculate across last 3-5 orders as fallback
            const sample = allPurchases.slice(0, 5);
            const newestDate = new Date(sample[0].grns?.received_date || sample[0].grns?.created_at || Date.now()).getTime();
            const oldestDate = new Date(sample[sample.length - 1].grns?.received_date || sample[sample.length - 1].grns?.created_at || Date.now()).getTime();
            const spanDays = Math.max(1, (newestDate - oldestDate) / (1000 * 60 * 60 * 24));
            avgPurchaseCadenceDays = spanDays / (sample.length - 1);
          }
        }

        return {
          id: item.id,
          name: item.name,
          categoryName: catName,
          unitAbbr: item.units?.abbreviation || '',
          currentStock,
          minStock: Number(item.min_stock) || 0,
          maxStock: Number(item.max_stock) || 0,
          costPrice: Number(item.cost_price) || 0,
          totalKitchenUsage,
          avgDailyUsage,
          daysRemaining,
          status,
          purchaseCount,
          avgPurchaseCadenceDays,
          avgOrderQuantity,
          lastPurchaseDate,
          lastPurchasePrice
        };
      });

      // Primary Sort: Stock Low to High (ascending)
      // Secondary: Least days remaining first
      processed.sort((a, b) => {
        if (a.currentStock !== b.currentStock) {
          return a.currentStock - b.currentStock;
        }
        if (a.daysRemaining !== null && b.daysRemaining !== null) {
          return a.daysRemaining - b.daysRemaining;
        }
        if (a.daysRemaining !== null) return -1;
        if (b.daysRemaining !== null) return 1;
        return a.name.localeCompare(b.name);
      });

      setItems(processed);
      setCategories(Array.from(catSet).sort());
      setLastRefreshed(new Date());
    } catch (err) {
      console.error('Failed to calculate stock velocity:', err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchVelocityData();
  }, [lookbackDays]);

  // 2. Real-Time Subscription to Batches & Stock Movements
  useEffect(() => {
    const channel = supabase
      .channel('stock-forecast-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'batches' },
        () => fetchVelocityData(true)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stock_movements' },
        () => fetchVelocityData(true)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'grn_items' },
        () => fetchVelocityData(true)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [lookbackDays]);

  // 3. Load deep-dive history when an item is clicked
  const handleItemClick = async (item: VelocityItem) => {
    setSelectedItem(item);
    setModalLoading(true);

    try {
      const windowStartDate = startOfDay(subDays(new Date(), lookbackDays)).toISOString();

      const [usageRes, grnRes] = await Promise.all([
        supabase
          .from('stock_movements')
          .select(`
            id, quantity, cost_price, created_at, movement_number,
            movement_reasons!inner ( name ),
            profiles:created_by ( username )
          `)
          .eq('item_id', item.id)
          .eq('type', 'STOCK_OUT')
          .in('movement_reasons.name', ['Kitchen Usage', 'Missed Kitchen Usage'])
          .gte('created_at', windowStartDate)
          .order('created_at', { ascending: false }),

        supabase
          .from('grn_items')
          .select(`
            id, quantity, cost_price,
            grns ( id, grn_number, created_at, received_date, supplier_id, suppliers ( name ) )
          `)
          .eq('item_id', item.id)
      ]);

      setItemUsageHistory(usageRes.data || []);
      const sortedGrns = (grnRes.data || []).sort((a: any, b: any) => {
        const dateA = new Date(a.grns?.received_date || a.grns?.created_at || 0).getTime();
        const dateB = new Date(b.grns?.received_date || b.grns?.created_at || 0).getTime();
        return dateB - dateA;
      });
      setItemPurchaseHistory(sortedGrns);
    } catch (err) {
      console.error('Failed to load item history modal:', err);
    } finally {
      setModalLoading(false);
    }
  };

  // Group daily usage for charting in modal
  const chartData = useMemo(() => {
    if (!selectedItem) return [];

    const days: Record<string, number> = {};
    for (let i = lookbackDays - 1; i >= 0; i--) {
      const d = format(subDays(new Date(), i), 'yyyy-MM-dd');
      days[d] = 0;
    }

    itemUsageHistory.forEach(u => {
      const d = format(parseISO(u.created_at), 'yyyy-MM-dd');
      if (days[d] !== undefined) {
        days[d] += Number(u.quantity) || 0;
      }
    });

    return Object.entries(days).map(([dateStr, qty]) => ({
      date: dateStr,
      label: format(parseISO(dateStr), 'MMM dd'),
      qty: Number(qty.toFixed(2))
    }));
  }, [selectedItem, itemUsageHistory, lookbackDays]);

  const maxChartQty = useMemo(() => {
    if (chartData.length === 0) return 10;
    const maxVal = Math.max(...chartData.map(d => d.qty));
    return maxVal > 0 ? maxVal * 1.15 : 10;
  }, [chartData]);

  // Filtered Items
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      // Category filter
      if (selectedCategory !== 'ALL' && item.categoryName !== selectedCategory) {
        return false;
      }
      // Urgency filter
      if (filterUrgency === 'ACTION_NEEDED') {
        if (item.status !== 'OUT_OF_STOCK' && item.status !== 'CRITICAL' && item.status !== 'REORDER_SOON') return false;
      } else if (filterUrgency === 'OUT') {
        if (item.status !== 'OUT_OF_STOCK') return false;
      } else if (filterUrgency === 'CRITICAL') {
        if (item.status !== 'CRITICAL') return false;
      } else if (filterUrgency === 'SAFE') {
        if (item.status !== 'SAFE') return false;
      } else if (filterUrgency === 'NO_USAGE') {
        if (item.status !== 'NO_USAGE') return false;
      }
      // Search filter
      if (search) {
        const q = search.toLowerCase();
        return item.name.toLowerCase().includes(q) || item.categoryName.toLowerCase().includes(q);
      }
      return true;
    });
  }, [items, selectedCategory, filterUrgency, search]);

  // KPI Summary stats
  const kpiStats = useMemo(() => {
    const outCount = items.filter(i => i.status === 'OUT_OF_STOCK').length;
    const criticalCount = items.filter(i => i.status === 'CRITICAL').length;
    const reorderCount = items.filter(i => i.status === 'REORDER_SOON').length;
    const safeCount = items.filter(i => i.status === 'SAFE').length;
    return { outCount, criticalCount, reorderCount, safeCount };
  }, [items]);

  return (
    <div className="space-y-6 pb-20">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
              <TrendingDown className="text-rose-500" />
              Stock Velocity & Runout Forecast
            </h2>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              Live Sync
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Real-time replenishment predictor sorted from lowest to highest stock. Click any item for usage trends and purchase analytics.
          </p>
        </div>

        {/* Controls: Lookback & Refresh */}
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            <span className="text-xs font-bold text-slate-500 px-2 flex items-center gap-1">
              <Calendar size={13} /> Window:
            </span>
            {([7, 14, 30] as const).map(days => (
              <button
                key={days}
                onClick={() => setLookbackDays(days)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  lookbackDays === days
                    ? 'bg-white text-primary shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {days} Days
              </button>
            ))}
          </div>

          <button
            onClick={() => fetchVelocityData(true)}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50 hover:text-slate-900 transition-all shadow-sm active:scale-95 disabled:opacity-50"
            title="Refresh calculations now"
          >
            <RefreshCw size={14} className={isRefreshing ? 'animate-spin text-primary' : ''} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <button
          onClick={() => setFilterUrgency(filterUrgency === 'OUT' ? 'ALL' : 'OUT')}
          className={`p-4 rounded-2xl border text-left transition-all ${
            filterUrgency === 'OUT'
              ? 'bg-red-50 border-red-300 ring-2 ring-red-400'
              : 'bg-white border-slate-200 hover:border-red-200 hover:bg-red-50/30'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-red-600 uppercase tracking-wider">Out of Stock</span>
            <AlertTriangle size={18} className="text-red-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-red-700">{kpiStats.outCount}</span>
            <span className="text-xs text-slate-500">items</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Stock is currently 0</p>
        </button>

        <button
          onClick={() => setFilterUrgency(filterUrgency === 'CRITICAL' ? 'ALL' : 'CRITICAL')}
          className={`p-4 rounded-2xl border text-left transition-all ${
            filterUrgency === 'CRITICAL'
              ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-400'
              : 'bg-white border-slate-200 hover:border-amber-200 hover:bg-amber-50/30'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">Critical (&lt; 2 Days)</span>
            <Clock size={18} className="text-amber-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-amber-700">{kpiStats.criticalCount}</span>
            <span className="text-xs text-slate-500">items</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Runs out within 48h</p>
        </button>

        <button
          onClick={() => setFilterUrgency(filterUrgency === 'ACTION_NEEDED' ? 'ALL' : 'ACTION_NEEDED')}
          className={`p-4 rounded-2xl border text-left transition-all ${
            filterUrgency === 'ACTION_NEEDED'
              ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-400'
              : 'bg-white border-slate-200 hover:border-blue-200 hover:bg-blue-50/30'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">Reorder Needed</span>
            <ShoppingCart size={18} className="text-blue-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-blue-700">
              {kpiStats.outCount + kpiStats.criticalCount + kpiStats.reorderCount}
            </span>
            <span className="text-xs text-slate-500">items</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Below safe buffer / 5 days</p>
        </button>

        <button
          onClick={() => setFilterUrgency(filterUrgency === 'SAFE' ? 'ALL' : 'SAFE')}
          className={`p-4 rounded-2xl border text-left transition-all ${
            filterUrgency === 'SAFE'
              ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-400'
              : 'bg-white border-slate-200 hover:border-emerald-200 hover:bg-emerald-50/30'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Adequate Stock</span>
            <CheckCircle2 size={18} className="text-emerald-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-emerald-700">{kpiStats.safeCount}</span>
            <span className="text-xs text-slate-500">items</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">&gt; 5 Days buffer</p>
        </button>
      </div>

      {/* Filter / Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex flex-1 flex-col sm:flex-row gap-3 w-full">
          {/* Search */}
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search items by name..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
            />
          </div>

          {/* Category Filter */}
          <div className="sm:w-56">
            <select
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none"
            >
              <option value="ALL">All Categories</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="sm:w-48">
            <select
              value={filterUrgency}
              onChange={e => setFilterUrgency(e.target.value as any)}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none"
            >
              <option value="ALL">All Stock Statuses</option>
              <option value="ACTION_NEEDED">Action Needed (Out & Low)</option>
              <option value="OUT">Out of Stock</option>
              <option value="CRITICAL">Critical (&lt; 2 Days)</option>
              <option value="SAFE">Adequate Stock</option>
              <option value="NO_USAGE">No Recent Usage</option>
            </select>
          </div>
        </div>

        <div className="text-xs text-slate-400 shrink-0">
          Showing <span className="font-bold text-slate-700">{filteredItems.length}</span> of {items.length} items
        </div>
      </div>

      {/* Main Real-Time Forecast Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="px-6 py-3.5">
                  <div className="flex items-center gap-1.5 cursor-pointer">
                    Item Name <ArrowUpDown size={12} className="text-slate-400" />
                  </div>
                </th>
                <th className="px-4 py-3.5">Category</th>
                <th className="px-4 py-3.5 text-right">
                  <span className="text-primary font-bold">Current Stock ↑</span>
                </th>
                <th className="px-4 py-3.5 text-right">Avg Daily Usage</th>
                <th className="px-4 py-3.5 text-center">Runout Forecast</th>
                <th className="px-4 py-3.5 text-center">Order Cadence & Size</th>
                <th className="px-4 py-3.5 text-right">Last Purchase</th>
                <th className="px-4 py-3.5 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-16 text-slate-400">
                    <div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    Calculating real-time stock velocity & forecasts...
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-16 text-slate-400">
                    <Filter size={36} className="mx-auto mb-2 opacity-30" />
                    No items match the selected filter criteria.
                  </td>
                </tr>
              ) : (
                filteredItems.map(item => {
                  return (
                    <tr
                      key={item.id}
                      onClick={() => handleItemClick(item)}
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                    >
                      {/* Item Name */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800 group-hover:text-primary transition-colors">
                            {item.name}
                          </span>
                          {item.minStock > 0 && item.currentStock <= item.minStock && item.currentStock > 0 && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                              Below Min ({item.minStock})
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Category */}
                      <td className="px-4 py-4 text-xs font-medium text-slate-500">
                        {item.categoryName}
                      </td>

                      {/* Current Stock (Low to High) */}
                      <td className="px-4 py-4 text-right">
                        <span
                          className={`font-extrabold ${
                            item.currentStock <= 0
                              ? 'text-rose-600'
                              : item.status === 'CRITICAL'
                              ? 'text-amber-600'
                              : 'text-slate-800'
                          }`}
                        >
                          {Number(item.currentStock).toLocaleString(undefined, {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 2
                          })}
                        </span>{' '}
                        <span className="text-xs text-slate-500 font-medium">{item.unitAbbr}</span>
                      </td>

                      {/* Avg Daily Usage */}
                      <td className="px-4 py-4 text-right">
                        {item.avgDailyUsage > 0 ? (
                          <div>
                            <span className="font-bold text-slate-700">
                              {item.avgDailyUsage.toFixed(2)}
                            </span>{' '}
                            <span className="text-xs text-slate-400 font-medium">{item.unitAbbr}/day</span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 italic">—</span>
                        )}
                      </td>

                      {/* Runout Prediction Badge */}
                      <td className="px-4 py-4 text-center">
                        {item.status === 'OUT_OF_STOCK' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-600"></span>
                            Out of Stock
                          </span>
                        )}
                        {item.status === 'CRITICAL' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-300 animate-pulse">
                            <Clock size={12} className="text-amber-600" />
                            {item.daysRemaining !== null ? `${item.daysRemaining.toFixed(1)} Days Left` : 'Critical'}
                          </span>
                        )}
                        {item.status === 'REORDER_SOON' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-orange-50 text-orange-700 border border-orange-200">
                            {item.daysRemaining !== null ? `${item.daysRemaining.toFixed(1)} Days Left` : 'Reorder Soon'}
                          </span>
                        )}
                        {item.status === 'SAFE' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            {item.daysRemaining !== null ? `${item.daysRemaining.toFixed(1)} Days Left` : 'Safe'}
                          </span>
                        )}
                        {item.status === 'NO_USAGE' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium text-slate-400 bg-slate-100">
                            No Usage
                          </span>
                        )}
                      </td>

                      {/* Purchase Cadence & Typical Order */}
                      <td className="px-4 py-4 text-center">
                        {item.purchaseCount > 0 ? (
                          <div className="text-xs flex flex-col items-center">
                            <span className="font-bold text-slate-800">
                              {item.avgPurchaseCadenceDays !== null
                                ? `Every ~${Math.max(1, Math.round(item.avgPurchaseCadenceDays))} Days`
                                : `Ordered ${item.purchaseCount}x`}
                            </span>
                            {item.avgOrderQuantity !== null && (
                              <span className="text-slate-500 text-[11px]">
                                avg ~{item.avgOrderQuantity.toFixed(1)} {item.unitAbbr} / order
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 italic">No GRN yet</span>
                        )}
                      </td>

                      {/* Last Purchase */}
                      <td className="px-4 py-4 text-right">
                        {item.lastPurchaseDate ? (
                          <div>
                            <p className="text-xs font-bold text-slate-700">
                              {format(parseISO(item.lastPurchaseDate), 'dd MMM yyyy')}
                            </p>
                            {item.lastPurchasePrice !== null && (
                              <p className="text-[11px] text-slate-400">
                                LKR {item.lastPurchasePrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 italic">—</span>
                        )}
                      </td>

                      {/* Action Chevron */}
                      <td className="px-4 py-4 text-center">
                        <button className="text-slate-400 group-hover:text-primary transition-colors p-1">
                          <ChevronRight size={18} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* DETAIL MODAL WITH VISUAL USAGE CHART & RECENT ACTIVITY */}
      {selectedItem && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-2 sm:p-4 md:p-6 bg-slate-900/60 backdrop-blur-sm overflow-hidden animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-slate-100 w-full max-w-[calc(100vw-1.5rem)] sm:max-w-2xl md:max-w-4xl max-h-[92vh] shadow-2xl flex flex-col my-auto overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 shrink-0 bg-slate-50/50">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-slate-800">{selectedItem.name}</h3>
                  <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                    {selectedItem.categoryName}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Detailed consumption trend & replenishment velocity (Last {lookbackDays} Days)
                </p>
              </div>
              <button
                onClick={() => setSelectedItem(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {/* Quick Stat Pill Cards - 5 Separate Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <div className="bg-slate-50 p-3 sm:p-3.5 rounded-xl border border-slate-100 flex flex-col justify-between">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-tight">Current Stock</span>
                  <p className="text-sm sm:text-base font-extrabold text-slate-800 mt-1 leading-snug break-words">
                    {Number(selectedItem.currentStock).toLocaleString()} {selectedItem.unitAbbr}
                  </p>
                </div>
                <div className="bg-slate-50 p-3 sm:p-3.5 rounded-xl border border-slate-100 flex flex-col justify-between">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-tight">Avg Daily Usage</span>
                  <p className="text-sm sm:text-base font-extrabold text-primary mt-1 leading-snug break-words">
                    {selectedItem.avgDailyUsage.toFixed(2)} {selectedItem.unitAbbr}/d
                  </p>
                </div>
                <div className="bg-slate-50 p-3 sm:p-3.5 rounded-xl border border-slate-100 flex flex-col justify-between">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-tight">Runout Estimate</span>
                  <p className="text-sm sm:text-base font-extrabold text-slate-800 mt-1 leading-snug break-words">
                    {selectedItem.daysRemaining !== null ? `${selectedItem.daysRemaining.toFixed(1)} Days` : 'No usage'}
                  </p>
                </div>
                <div className="bg-blue-50/70 p-3 sm:p-3.5 rounded-xl border border-blue-200 flex flex-col justify-between">
                  <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider leading-tight">Order Cadence</span>
                  <p className="text-sm sm:text-base font-extrabold text-blue-900 mt-1 leading-snug break-words">
                    {selectedItem.avgPurchaseCadenceDays !== null
                      ? `Every ~${Math.max(1, Math.round(selectedItem.avgPurchaseCadenceDays))} Days`
                      : selectedItem.purchaseCount > 0
                      ? `Ordered ${selectedItem.purchaseCount}x in ${lookbackDays}d`
                      : '—'}
                  </p>
                </div>
                <div className="bg-emerald-50/70 p-3 sm:p-3.5 rounded-xl border border-emerald-200 col-span-2 sm:col-span-1 flex flex-col justify-between">
                  <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider leading-tight">Typical Order Size</span>
                  <p className="text-sm sm:text-base font-extrabold text-emerald-900 mt-1 leading-snug break-words">
                    {selectedItem.avgOrderQuantity !== null
                      ? `~${selectedItem.avgOrderQuantity.toFixed(1)} ${selectedItem.unitAbbr}`
                      : '—'}
                  </p>
                </div>
              </div>

              {/* VISUAL USAGE GRAPH (SVG Bar Chart) */}
              <div className="bg-slate-50/70 p-5 rounded-2xl border border-slate-200">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h4 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                      <TrendingUp size={16} className="text-primary" />
                      Daily Kitchen Usage Trend
                    </h4>
                    <p className="text-[11px] text-slate-400">
                      Total: {selectedItem.totalKitchenUsage.toFixed(2)} {selectedItem.unitAbbr} consumed over {lookbackDays} days
                    </p>
                  </div>
                  {selectedItem.avgDailyUsage > 0 && (
                    <span className="text-xs font-semibold text-slate-600 bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-sm">
                      Avg: {selectedItem.avgDailyUsage.toFixed(2)} {selectedItem.unitAbbr}
                    </span>
                  )}
                </div>

                {modalLoading ? (
                  <div className="h-44 flex items-center justify-center text-slate-400">
                    <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin mr-2" />
                    Loading trend...
                  </div>
                ) : chartData.length === 0 || selectedItem.totalKitchenUsage === 0 ? (
                  <div className="h-40 flex flex-col items-center justify-center text-slate-400">
                    <Clock size={32} className="opacity-25 mb-1" />
                    <p className="text-xs font-medium">No kitchen usage recorded during this {lookbackDays}-day window.</p>
                  </div>
                ) : (
                  <div className="relative pt-6">
                    {/* SVG Interactive Chart */}
                    <div className="h-44 flex items-end gap-1 sm:gap-2 border-b border-slate-200 pb-1">
                      {chartData.map((d, i) => {
                        const heightPct = Math.min(100, (d.qty / maxChartQty) * 100);
                        const isAboveAvg = selectedItem.avgDailyUsage > 0 && d.qty > selectedItem.avgDailyUsage;

                        return (
                          <div key={i} className="flex-1 flex flex-col items-center group/bar relative">
                            {/* Hover Tooltip */}
                            <div className="absolute -top-9 bg-slate-900 text-white text-[10px] font-bold py-1 px-2 rounded opacity-0 group-hover/bar:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-20 shadow-md">
                              {d.label}: {d.qty} {selectedItem.unitAbbr}
                            </div>

                            {/* Bar */}
                            <div className="w-full flex justify-center h-36 items-end">
                              <div
                                style={{ height: `${Math.max(4, heightPct)}%` }}
                                className={`w-full max-w-[28px] rounded-t-md transition-all duration-300 ${
                                  d.qty === 0
                                    ? 'bg-slate-200/60'
                                    : isAboveAvg
                                    ? 'bg-primary hover:bg-primary-dark shadow-sm'
                                    : 'bg-blue-400/80 hover:bg-blue-500'
                                }`}
                              />
                            </div>

                            {/* X-Axis Date Label */}
                            <span className="text-[9px] font-semibold text-slate-400 mt-1 truncate max-w-full text-center">
                              {d.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* RECENT KITCHEN STOCK-OUT HISTORY */}
              <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                  Recent Kitchen Usage Logs ({itemUsageHistory.length})
                </h4>
                {itemUsageHistory.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No kitchen stock-outs in this period.</p>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-500 uppercase text-[10px]">
                        <tr>
                          <th className="px-4 py-2">Date & Time</th>
                          <th className="px-4 py-2">Voucher / Movement</th>
                          <th className="px-4 py-2">Reason</th>
                          <th className="px-4 py-2 text-right">Deducted Qty</th>
                          <th className="px-4 py-2">Recorded By</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {itemUsageHistory.slice(0, 5).map((u, idx) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="px-4 py-2.5 font-medium text-slate-700">
                              {format(parseISO(u.created_at), 'dd MMM yyyy, hh:mm a')}
                            </td>
                            <td className="px-4 py-2.5 font-mono text-slate-500">
                              {u.movement_number}
                            </td>
                            <td className="px-4 py-2.5 text-slate-600 font-medium">
                              {u.movement_reasons?.name}
                            </td>
                            <td className="px-4 py-2.5 text-right font-bold text-rose-600">
                              −{Number(u.quantity).toFixed(2)} {selectedItem.unitAbbr}
                            </td>
                            <td className="px-4 py-2.5 text-slate-500">
                              {u.profiles?.username || 'System'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* RECENT PURCHASE / GRN HISTORY */}
              <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                  Purchase & GRN History ({itemPurchaseHistory.length})
                </h4>
                {itemPurchaseHistory.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No purchase orders / GRNs recorded for this item.</p>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-500 uppercase text-[10px]">
                        <tr>
                          <th className="px-4 py-2">GRN Date</th>
                          <th className="px-4 py-2">GRN Number</th>
                          <th className="px-4 py-2">Supplier</th>
                          <th className="px-4 py-2 text-right">Received Qty</th>
                          <th className="px-4 py-2 text-right">Unit Price</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {itemPurchaseHistory.slice(0, 5).map((p, idx) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="px-4 py-2.5 font-medium text-slate-700">
                              {p.grns?.received_date || p.grns?.created_at ? format(parseISO(p.grns?.received_date || p.grns?.created_at), 'dd MMM yyyy') : '—'}
                            </td>
                            <td className="px-4 py-2.5 font-mono text-slate-500">
                              {p.grns?.grn_number || '—'}
                            </td>
                            <td className="px-4 py-2.5 font-semibold text-slate-700">
                              {p.grns?.suppliers?.name || '—'}
                            </td>
                            <td className="px-4 py-2.5 text-right font-bold text-emerald-600">
                              +{Number(p.quantity).toFixed(2)} {selectedItem.unitAbbr}
                            </td>
                            <td className="px-4 py-2.5 text-right font-semibold text-slate-700">
                              LKR {Number(p.cost_price).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 flex justify-end bg-slate-50">
              <button
                onClick={() => setSelectedItem(null)}
                className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs rounded-xl transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
