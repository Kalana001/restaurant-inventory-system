import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Link, useSearchParams } from 'react-router-dom';
import { subDays, startOfDay, format } from 'date-fns';
import { 
  Layers, 
  Search, 
  Save, 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Filter, 
  Sparkles, 
  Package, 
  TrendingDown, 
  ArrowRight, 
  Check, 
  Info,
  ShieldOff,
  ShoppingCart,
  Boxes
} from 'lucide-react';

interface ReorderItem {
  id: string;
  name: string;
  sku: string;
  categoryName: string;
  unitAbbr: string;
  currentStock: number;
  currentReorderLevel: number;
  costPrice: number;
  // Velocity & Cadence
  avgDailyUsage: number;
  totalUsage: number;
  purchaseCadenceDays: number;
  hasPurchaseHistory: boolean;
  // Calculated Suggestion
  suggestedReorderLevel: number;
  leadTimeDemand: number;
  safetyBuffer: number;
}

export const ReorderLevels: React.FC = () => {
  const { hasPermission } = useAuth();
  const [searchParams] = useSearchParams();

  // Lookback window for velocity: 7, 14, or 30 days
  const [lookbackDays, setLookbackDays] = useState<7 | 14 | 30>(14);
  const [leadTimeDays] = useState<number>(3); // Standard 3-day lead time
  const [safetyBufferPercent] = useState<number>(0.35); // 35% safety stock buffer

  // Data states
  const [loading, setLoading] = useState<boolean>(true);
  const [savingAll, setSavingAll] = useState<boolean>(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [items, setItems] = useState<ReorderItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Editable input state: itemId -> numeric value string
  const [editedLevels, setEditedLevels] = useState<Record<string, string>>({});
  // Track modified items
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());

  // Filters & Search
  const [search, setSearch] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const initialFilter = searchParams.get('filter') === 'NEEDS_REORDER' ? 'NEEDS_REORDER' : 'ALL';
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'NEEDS_REORDER' | 'SAFE' | 'TRACKING_OFF'>(initialFilter);

  // Auto-dismiss notification
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Fetch items, movements, and GRNs to calculate cadence and suggested ROL
  const fetchData = async () => {
    setLoading(true);
    try {
      const windowStartDate = startOfDay(subDays(new Date(), lookbackDays)).toISOString();

      const [itemsRes, reasonsRes, movementsRes, grnItemsRes] = await Promise.all([
        supabase
          .from('inventory_items')
          .select(`
            id, name, sku, reorder_level, min_stock, max_stock, cost_price, status,
            categories ( name ),
            units:units!inventory_items_base_unit_id_fkey ( abbreviation ),
            batches ( id, available_qty, status )
          `)
          .eq('status', 'ACTIVE')
          .order('name'),

        supabase
          .from('movement_reasons')
          .select('id, name')
          .in('name', ['Kitchen Usage', 'Missed Kitchen Usage']),

        supabase
          .from('stock_movements')
          .select('id, item_id, quantity, type, created_at')
          .eq('type', 'STOCK_OUT')
          .gte('created_at', windowStartDate),

        supabase
          .from('grns')
          .select(`
            id, grn_number, created_at, received_date,
            grn_items ( id, item_id, quantity, cost_price )
          `)
          .order('received_date', { ascending: false })
          .limit(600)
      ]);

      if (itemsRes.error) throw itemsRes.error;

      // Group usage by item_id
      const usageMap: Record<string, number> = {};
      (movementsRes.data || []).forEach(m => {
        const qty = Number(m.quantity) || 0;
        usageMap[m.item_id] = (usageMap[m.item_id] || 0) + qty;
      });

      // Group GRN purchases by item_id
      const grnMap: Record<string, any[]> = {};
      (grnItemsRes.data || []).forEach((grn: any) => {
        (grn.grn_items || []).forEach((itemLine: any) => {
          if (!grnMap[itemLine.item_id]) grnMap[itemLine.item_id] = [];
          grnMap[itemLine.item_id].push({
            id: itemLine.id,
            item_id: itemLine.item_id,
            quantity: itemLine.quantity,
            received_date: grn.received_date || grn.created_at
          });
        });
      });

      const catSet = new Set<string>();
      const initialInputs: Record<string, string> = {};

      const processed: ReorderItem[] = (itemsRes.data || []).map(item => {
        const catName = item.categories?.name || 'Uncategorized';
        catSet.add(catName);

        // Sum current stock across active batches
        const currentStock = (item.batches || [])
          .filter((b: any) => b.status === 'ACTIVE')
          .reduce((sum: number, b: any) => sum + (Number(b.available_qty) || 0), 0);

        const currentReorderLevel = Number(item.reorder_level) || 0;
        initialInputs[item.id] = String(currentReorderLevel);

        // Average Daily Usage
        const totalUsage = usageMap[item.id] || 0;
        const avgDailyUsage = totalUsage / lookbackDays;

        // Calculate Purchase Cadence
        const purchases = grnMap[item.id] || [];
        let purchaseCadenceDays = 7; // sensible default when no history
        let hasPurchaseHistory = false;

        if (purchases.length > 1) {
          hasPurchaseHistory = true;
          // Sort descending by date
          purchases.sort((a, b) => new Date(b.received_date).getTime() - new Date(a.received_date).getTime());
          const newest = new Date(purchases[0].received_date).getTime();
          const oldest = new Date(purchases[purchases.length - 1].received_date).getTime();
          const spanDays = Math.max(1, (newest - oldest) / (1000 * 60 * 60 * 24));
          const calculatedCadence = spanDays / (purchases.length - 1);
          // Cap cadence between 2 and 30 days
          purchaseCadenceDays = Math.min(30, Math.max(2, Math.round(calculatedCadence * 10) / 10));
        } else if (purchases.length === 1) {
          hasPurchaseHistory = true;
          purchaseCadenceDays = 7;
        }

        // Formula: Lead Time Demand + Safety Stock (35% of order cycle consumption)
        // Suggested ROL = (avgDailyUsage * 3) + (avgDailyUsage * cadence * 0.35)
        const leadTimeDemand = avgDailyUsage * leadTimeDays;
        const safetyBuffer = avgDailyUsage * purchaseCadenceDays * safetyBufferPercent;
        const rawSuggested = leadTimeDemand + safetyBuffer;

        // Clean rounding: if >= 5 round to whole number; if < 5 round to 1 decimal place
        const suggestedReorderLevel = rawSuggested >= 5 
          ? Math.ceil(rawSuggested) 
          : Math.round(rawSuggested * 10) / 10;

        return {
          id: item.id,
          name: item.name,
          sku: item.sku || '-',
          categoryName: catName,
          unitAbbr: item.units?.abbreviation || '',
          currentStock,
          currentReorderLevel,
          costPrice: Number(item.cost_price) || 0,
          avgDailyUsage: Math.round(avgDailyUsage * 100) / 100,
          totalUsage,
          purchaseCadenceDays,
          hasPurchaseHistory,
          suggestedReorderLevel,
          leadTimeDemand: Math.round(leadTimeDemand * 10) / 10,
          safetyBuffer: Math.round(safetyBuffer * 10) / 10
        };
      });

      setItems(processed);
      setCategories(Array.from(catSet).sort());
      setEditedLevels(initialInputs);
      setDirtyIds(new Set());

    } catch (err: any) {
      console.error('Failed to load reorder levels data:', err);
      setNotification({ type: 'error', message: err.message || 'Failed to load reorder levels' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [lookbackDays]);

  // Handle individual input changes
  const handleLevelChange = (id: string, val: string) => {
    setEditedLevels(prev => ({ ...prev, [id]: val }));
    const orig = items.find(i => i.id === id);
    if (orig && String(orig.currentReorderLevel) !== val) {
      setDirtyIds(prev => new Set(prev).add(id));
    } else {
      setDirtyIds(prev => {
        const updated = new Set(prev);
        updated.delete(id);
        return updated;
      });
    }
  };

  // Apply suggestion for a single item
  const applySingleSuggestion = (item: ReorderItem) => {
    const valStr = String(item.suggestedReorderLevel);
    handleLevelChange(item.id, valStr);
  };

  // Set reorder level to 0 (Turn Off tracking) for a single item
  const setSingleToZero = (item: ReorderItem) => {
    handleLevelChange(item.id, '0');
  };

  // Apply suggestions to ALL currently filtered items
  const applyAllVisibleSuggestions = () => {
    const updated = { ...editedLevels };
    const newDirty = new Set(dirtyIds);

    filteredItems.forEach(item => {
      const valStr = String(item.suggestedReorderLevel);
      updated[item.id] = valStr;
      if (String(item.currentReorderLevel) !== valStr) {
        newDirty.add(item.id);
      }
    });

    setEditedLevels(updated);
    setDirtyIds(newDirty);
    setNotification({ 
      type: 'success', 
      message: `Applied suggested levels to ${filteredItems.length} items. Click "Save All Changes" to persist.` 
    });
  };

  // Save single item change
  const saveSingleItem = async (item: ReorderItem) => {
    const newVal = Number(editedLevels[item.id]);
    if (isNaN(newVal) || newVal < 0) {
      setNotification({ type: 'error', message: 'Please enter a valid non-negative number' });
      return;
    }

    setSavingId(item.id);
    try {
      const { error } = await supabase
        .from('inventory_items')
        .update({ reorder_level: newVal })
        .eq('id', item.id);

      if (error) throw error;

      // Update local item
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, currentReorderLevel: newVal } : i));
      setDirtyIds(prev => {
        const updated = new Set(prev);
        updated.delete(item.id);
        return updated;
      });

      setNotification({ 
        type: 'success', 
        message: `${item.name} reorder level updated to ${newVal} ${item.unitAbbr}.` 
      });
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to update reorder level' });
    } finally {
      setSavingId(null);
    }
  };

  // Batch Save all modified items
  const saveAllChanges = async () => {
    if (dirtyIds.size === 0) return;

    setSavingAll(true);
    try {
      const updates = Array.from(dirtyIds).map(async id => {
        const newVal = Number(editedLevels[id]);
        if (isNaN(newVal) || newVal < 0) return;

        return supabase
          .from('inventory_items')
          .update({ reorder_level: newVal })
          .eq('id', id);
      });

      await Promise.all(updates);

      // Update items in state
      setItems(prev => prev.map(item => {
        if (dirtyIds.has(item.id)) {
          return { ...item, currentReorderLevel: Number(editedLevels[item.id]) || 0 };
        }
        return item;
      }));

      const countSaved = dirtyIds.size;
      setDirtyIds(new Set());
      setNotification({ 
        type: 'success', 
        message: `Successfully updated reorder levels for ${countSaved} item${countSaved > 1 ? 's' : ''}.` 
      });
    } catch (err: any) {
      console.error('Batch save error:', err);
      setNotification({ type: 'error', message: err.message || 'Failed to save changes' });
    } finally {
      setSavingAll(false);
    }
  };

  // KPI Calculations
  const { totalItems, needsReorderCount, safeCount, trackingOffCount } = useMemo(() => {
    let reorderCnt = 0;
    let safeCnt = 0;
    let offCnt = 0;

    items.forEach(i => {
      const activeLevel = Number(editedLevels[i.id] ?? i.currentReorderLevel);
      if (activeLevel === 0) {
        offCnt++;
      } else if (i.currentStock <= activeLevel) {
        reorderCnt++;
      } else {
        safeCnt++;
      }
    });

    return {
      totalItems: items.length,
      needsReorderCount: reorderCnt,
      safeCount: safeCnt,
      trackingOffCount: offCnt
    };
  }, [items, editedLevels]);

  // Filtered Items for Display
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      // Category filter
      if (selectedCategory !== 'ALL' && item.categoryName !== selectedCategory) return false;

      // Status filter
      const activeLevel = Number(editedLevels[item.id] ?? item.currentReorderLevel);
      if (statusFilter === 'TRACKING_OFF' && activeLevel !== 0) return false;
      if (statusFilter === 'NEEDS_REORDER' && (activeLevel === 0 || item.currentStock > activeLevel)) return false;
      if (statusFilter === 'SAFE' && (activeLevel === 0 || item.currentStock <= activeLevel)) return false;

      // Search filter
      if (search.trim()) {
        const q = search.toLowerCase();
        const nameMatch = item.name.toLowerCase().includes(q);
        const skuMatch = item.sku.toLowerCase().includes(q);
        const catMatch = item.categoryName.toLowerCase().includes(q);
        return nameMatch || skuMatch || catMatch;
      }

      return true;
    });
  }, [items, selectedCategory, statusFilter, search, editedLevels]);

  return (
    <div className="space-y-6 pb-24">
      {/* Toast Notification */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 px-5 py-3.5 rounded-xl shadow-lg border flex items-center gap-3 transition-all animate-in fade-in slide-in-from-top-2 ${
          notification.type === 'success' 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
            : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          {notification.type === 'success' ? (
            <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle size={18} className="text-rose-600 shrink-0" />
          )}
          <span className="text-sm font-semibold">{notification.message}</span>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
              <Layers className="text-primary" />
              Reorder Levels Management
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
              Inventory Master
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Configure reorder thresholds individually or in bulk. Calculated using 3-day lead time + order cadence from velocity.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <Link
            to="/reports/forecast?urgency=ACTION_NEEDED"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors shadow-sm"
          >
            <TrendingDown size={14} className="text-amber-600" />
            <span>Runout Forecast</span>
          </Link>
          <Link
            to="/purchase-orders"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors shadow-sm"
          >
            <ShoppingCart size={14} className="text-blue-600" />
            <span>Purchase Orders</span>
          </Link>
          <button
            onClick={() => fetchData()}
            disabled={loading}
            className="p-2 text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-sm"
            title="Refresh Data"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin text-primary' : ''} />
          </button>
        </div>
      </div>

      {/* 4 Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Managed Items */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
              <Package size={16} className="text-blue-600" />
              Total Items
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
              Active Catalog
            </span>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">
            {totalItems}
          </p>
          <p className="text-xs text-slate-400 mt-1">Managed inventory lines</p>
        </div>

        {/* Card 2: Needs Reorder (Alert) */}
        <div 
          onClick={() => setStatusFilter('NEEDS_REORDER')}
          className={`p-5 rounded-2xl border shadow-sm cursor-pointer transition-all ${
            statusFilter === 'NEEDS_REORDER'
              ? 'bg-rose-50 border-rose-300 ring-2 ring-rose-500/20'
              : 'bg-white border-rose-200/80 hover:shadow-md'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-rose-700 uppercase tracking-wider flex items-center gap-1.5">
              <AlertTriangle size={16} className="text-rose-600" />
              Below Reorder Level
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800">
              Urgent PO
            </span>
          </div>
          <p className="text-2xl font-black text-rose-600 mt-2">
            {needsReorderCount}
          </p>
          <p className="text-xs text-rose-500 mt-1">Stock &le; Reorder threshold</p>
        </div>

        {/* Card 3: Safe / Optimal */}
        <div 
          onClick={() => setStatusFilter('SAFE')}
          className={`p-5 rounded-2xl border shadow-sm cursor-pointer transition-all ${
            statusFilter === 'SAFE'
              ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-500/20'
              : 'bg-white border-emerald-200/80 hover:shadow-md'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 size={16} className="text-emerald-600" />
              Optimal Stock
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
              Safe
            </span>
          </div>
          <p className="text-2xl font-black text-emerald-700 mt-2">
            {safeCount}
          </p>
          <p className="text-xs text-slate-400 mt-1">Healthy stock on hand</p>
        </div>

        {/* Card 4: Tracking Off (0) */}
        <div 
          onClick={() => setStatusFilter('TRACKING_OFF')}
          className={`p-5 rounded-2xl border shadow-sm cursor-pointer transition-all ${
            statusFilter === 'TRACKING_OFF'
              ? 'bg-slate-100 border-slate-400 ring-2 ring-slate-400/20'
              : 'bg-white border-slate-200 hover:shadow-md'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
              <ShieldOff size={16} className="text-slate-500" />
              Tracking Off (0)
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
              Muted
            </span>
          </div>
          <p className="text-2xl font-black text-slate-700 mt-2">
            {trackingOffCount}
          </p>
          <p className="text-xs text-slate-400 mt-1">Alerts disabled by setting 0</p>
        </div>
      </div>

      {/* Global Actions & Unsaved Changes Alert Bar */}
      {dirtyIds.size > 0 && (
        <div className="sticky top-4 z-40 bg-slate-900 text-white px-5 py-3.5 rounded-2xl shadow-xl flex flex-col sm:flex-row items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 border border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-sm border border-amber-500/30">
              {dirtyIds.size}
            </div>
            <div>
              <p className="text-sm font-bold">
                {dirtyIds.size} Reorder Level{dirtyIds.size > 1 ? 's' : ''} Modified
              </p>
              <p className="text-xs text-slate-300">
                You have unsaved changes in the table below.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              onClick={() => {
                // Revert all to items' original values
                const reset: Record<string, string> = {};
                items.forEach(i => reset[i.id] = String(i.currentReorderLevel));
                setEditedLevels(reset);
                setDirtyIds(new Set());
              }}
              className="px-3.5 py-1.5 text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
            >
              Discard Changes
            </button>
            <button
              onClick={saveAllChanges}
              disabled={savingAll}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-2 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-slate-950 font-bold text-sm rounded-xl transition-all shadow-md shadow-emerald-500/20 disabled:opacity-50"
            >
              <Save size={16} />
              <span>{savingAll ? 'Saving...' : `Save All Changes (${dirtyIds.size})`}</span>
            </button>
          </div>
        </div>
      )}

      {/* Filter and Table Section */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Table Top Toolbar */}
        <div className="p-4 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Status Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-3.5 py-2 text-xs font-bold rounded-xl transition-all ${
                statusFilter === 'ALL'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              All Items ({totalItems})
            </button>
            <button
              onClick={() => setStatusFilter('NEEDS_REORDER')}
              className={`px-3.5 py-2 text-xs font-bold rounded-xl transition-all ${
                statusFilter === 'NEEDS_REORDER'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Needs Reorder ({needsReorderCount})
            </button>
            <button
              onClick={() => setStatusFilter('SAFE')}
              className={`px-3.5 py-2 text-xs font-bold rounded-xl transition-all ${
                statusFilter === 'SAFE'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Safe ({safeCount})
            </button>
            <button
              onClick={() => setStatusFilter('TRACKING_OFF')}
              className={`px-3.5 py-2 text-xs font-bold rounded-xl transition-all ${
                statusFilter === 'TRACKING_OFF'
                  ? 'bg-slate-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Tracking Off ({trackingOffCount})
            </button>
          </div>

          {/* Right Toolbar Controls */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Lookback Days Switcher */}
            <div className="inline-flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
              <span className="px-2 py-1 text-[11px] text-slate-500 font-semibold self-center">Usage Window:</span>
              <button
                onClick={() => setLookbackDays(7)}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  lookbackDays === 7 ? 'bg-white text-primary shadow-sm' : 'text-slate-600'
                }`}
              >
                7d
              </button>
              <button
                onClick={() => setLookbackDays(14)}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  lookbackDays === 14 ? 'bg-white text-primary shadow-sm' : 'text-slate-600'
                }`}
              >
                14d
              </button>
              <button
                onClick={() => setLookbackDays(30)}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  lookbackDays === 30 ? 'bg-white text-primary shadow-sm' : 'text-slate-600'
                }`}
              >
                30d
              </button>
            </div>

            {/* Category Dropdown */}
            <select
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 bg-white outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="ALL">All Categories</option>
              {categories.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            {/* Search Input */}
            <div className="relative w-full sm:w-56">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search item, SKU..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-primary/20 outline-none"
              />
            </div>

            {/* Apply All Suggestions Button */}
            {hasPermission('items:edit') && (
              <button
                onClick={applyAllVisibleSuggestions}
                disabled={filteredItems.length === 0}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
                title="Fill suggested levels into editable inputs for visible items"
              >
                <Sparkles size={14} className="text-purple-600" />
                <span>Apply All Suggestions</span>
              </button>
            )}
          </div>
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="px-4 py-3.5">Item & SKU</th>
                <th className="px-4 py-3.5">Category</th>
                <th className="px-4 py-3.5 text-right">Current Stock</th>
                <th className="px-4 py-3.5 text-right">Avg Daily Usage</th>
                <th className="px-4 py-3.5 text-right">Purchase Cadence</th>
                <th className="px-4 py-3.5 text-right">
                  <div className="inline-flex items-center gap-1 justify-end">
                    <span>Suggested Level</span>
                    <Info size={12} className="text-slate-400" title="Calculated as (Daily Usage * 3d Lead Time) + (35% of Order Cycle Consumption)" />
                  </div>
                </th>
                <th className="px-4 py-3.5 text-center min-w-[140px]">
                  Active Reorder Level
                </th>
                <th className="px-4 py-3.5">Stock Status</th>
                <th className="px-4 py-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-slate-400">
                    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    Calculating reorder levels and stock velocity...
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-slate-400">
                    No items found matching the selected filters.
                  </td>
                </tr>
              ) : (
                filteredItems.map(item => {
                  const inputVal = editedLevels[item.id] ?? String(item.currentReorderLevel);
                  const numVal = Number(inputVal);
                  const isModified = dirtyIds.has(item.id);
                  const isTrackingOff = numVal === 0;
                  const isOutOfStock = item.currentStock <= 0;
                  const isLow = !isTrackingOff && item.currentStock <= numVal;

                  return (
                    <tr 
                      key={item.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isModified ? 'bg-amber-50/40' : ''
                      }`}
                    >
                      {/* Name & SKU */}
                      <td className="px-4 py-3.5">
                        <p className="font-bold text-slate-900">{item.name}</p>
                        <p className="text-[10px] text-slate-400 font-mono">SKU: {item.sku}</p>
                      </td>

                      {/* Category */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                          {item.categoryName}
                        </span>
                      </td>

                      {/* Current Stock */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap font-extrabold text-sm">
                        <span className={isOutOfStock ? 'text-rose-600' : isLow ? 'text-amber-600' : 'text-slate-800'}>
                          {item.currentStock.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </span>{' '}
                        <span className="text-[10px] text-slate-400 font-normal">{item.unitAbbr}</span>
                      </td>

                      {/* Avg Daily Usage */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap text-slate-600">
                        {item.avgDailyUsage > 0 ? (
                          <>
                            <span className="font-bold text-slate-800">
                              {item.avgDailyUsage.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                            </span>{' '}
                            <span className="text-[10px] text-slate-400">{item.unitAbbr}/day</span>
                          </>
                        ) : (
                          <span className="text-slate-400 italic">No usage</span>
                        )}
                      </td>

                      {/* Cadence */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap text-slate-600">
                        <span className="font-bold text-slate-800">
                          ~{item.purchaseCadenceDays}
                        </span>{' '}
                        <span className="text-[10px] text-slate-400">days</span>
                        {!item.hasPurchaseHistory && (
                          <span className="block text-[9px] text-slate-400 italic">Default</span>
                        )}
                      </td>

                      {/* Suggested Level */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          <span className="font-black text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                            {item.suggestedReorderLevel.toLocaleString(undefined, { maximumFractionDigits: 2 })} {item.unitAbbr}
                          </span>
                          <button
                            type="button"
                            onClick={() => applySingleSuggestion(item)}
                            className="p-1 text-purple-600 hover:text-purple-800 hover:bg-purple-100 rounded transition-colors"
                            title={`Apply suggested ${item.suggestedReorderLevel}`}
                          >
                            <Sparkles size={13} />
                          </button>
                        </div>
                      </td>

                      {/* Active Reorder Level Editable Input */}
                      <td className="px-4 py-3.5 text-center whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5 justify-center">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={inputVal}
                            onChange={e => handleLevelChange(item.id, e.target.value)}
                            className={`w-24 px-2.5 py-1.5 text-center font-bold text-sm border rounded-xl outline-none transition-all ${
                              isModified
                                ? 'border-amber-400 bg-amber-50 text-amber-950 focus:ring-2 focus:ring-amber-500/20'
                                : isTrackingOff
                                ? 'border-slate-200 bg-slate-50 text-slate-400'
                                : 'border-slate-200 bg-white text-slate-800 focus:ring-2 focus:ring-primary/20'
                            }`}
                          />
                          <span className="text-[10px] text-slate-400 font-semibold">{item.unitAbbr}</span>
                          
                          {/* Quick 0 button to silence */}
                          {numVal !== 0 && (
                            <button
                              type="button"
                              onClick={() => setSingleToZero(item)}
                              className="text-[10px] text-slate-400 hover:text-slate-700 hover:underline px-1"
                              title="Turn off reorder alerts (set to 0)"
                            >
                              Off
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Status Badge */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        {isTrackingOff ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                            <ShieldOff size={11} /> Tracking Off (0)
                          </span>
                        ) : isOutOfStock ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                            <AlertTriangle size={11} /> Out of Stock
                          </span>
                        ) : isLow ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            <Clock size={11} /> Reorder Needed
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            <CheckCircle2 size={11} /> Optimal Stock
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {isModified ? (
                            <button
                              onClick={() => saveSingleItem(item)}
                              disabled={savingId === item.id}
                              className="px-2.5 py-1 text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 rounded-lg transition-all shadow-sm flex items-center gap-1"
                              title="Save this row"
                            >
                              <Save size={12} />
                              <span>{savingId === item.id ? 'Saving...' : 'Save'}</span>
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-300 font-medium">Saved</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
