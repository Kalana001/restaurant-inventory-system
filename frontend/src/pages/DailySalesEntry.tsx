import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { SEED_MENU_ITEMS } from '../data/menuSeedData';
import { 
  ShoppingBag, 
  Calendar, 
  Search, 
  Save, 
  Edit3, 
  X, 
  CheckCircle2, 
  AlertCircle, 
  ChevronLeft, 
  ChevronRight, 
  DollarSign, 
  RotateCcw,
  Bike,
  Store,
  Layers,
  Sparkles
} from 'lucide-react';
import { format, parseISO, subDays, addDays } from 'date-fns';

export interface MenuItem {
  id: string;
  item_code: string;
  name: string;
  category: string;
  current_price: number;
  is_active: boolean;
}

export interface DailySaleEntry {
  id?: string;
  date: string;
  sales_channel: 'RESTAURANT' | 'PICKME';
  menu_item_id: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
}

export const DailySalesEntry: React.FC = () => {
  // Mode: 'RESTAURANT' (Cash + Card) vs 'PICKME'
  const [salesChannel, setSalesChannel] = useState<'RESTAURANT' | 'PICKME'>('RESTAURANT');
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));

  // Menu items list
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Input quantities for each channel: { [menu_item_id]: quantity }
  const [restaurantQuantities, setRestaurantQuantities] = useState<Record<string, number | ''>>({});
  const [pickmeQuantities, setPickmeQuantities] = useState<Record<string, number | ''>>({});

  // P&L Reported amounts for reconciliation
  const [pnlCash, setPnlCash] = useState<number>(0);
  const [pnlCard, setPnlCard] = useState<number>(0);
  const [pnlPickme, setPnlPickme] = useState<number>(0);
  const [hasPnlRecord, setHasPnlRecord] = useState<boolean>(false);

  // Price Edit Modal
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [editPriceVal, setEditPriceVal] = useState<number | ''>('');
  const [savingPrice, setSavingPrice] = useState<boolean>(false);

  // Input refs for Enter key navigation
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Format currency
  const formatCurrency = (amount: number) => {
    return amount.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  // 1. Fetch or Seed Menu Items
  const fetchMenuItems = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('menu_items')
        .select('*')
        .order('category', { ascending: true })
        .order('item_code', { ascending: true });

      if (error) {
        // Table might not exist yet; fallback to seed
        console.warn('Could not query menu_items table:', error.message);
        setMenuItems(SEED_MENU_ITEMS.map((item, idx) => ({
          id: `seed-${item.item_code}`,
          ...item,
          is_active: true
        })));
        return;
      }

      if (!data || data.length === 0) {
        // Auto-seed table
        const rows = SEED_MENU_ITEMS.map(i => ({
          item_code: i.item_code,
          name: i.name,
          category: i.category,
          current_price: i.current_price,
          is_active: true
        }));

        const { data: seeded, error: seedErr } = await supabase
          .from('menu_items')
          .insert(rows)
          .select();

        if (seedErr) {
          console.warn('Auto-seed insert skipped:', seedErr.message);
          setMenuItems(SEED_MENU_ITEMS.map((item) => ({
            id: `seed-${item.item_code}`,
            ...item,
            is_active: true
          })));
        } else {
          setMenuItems(seeded || []);
        }
      } else {
        setMenuItems(data);
      }
    } catch (err: any) {
      console.error('Error in fetchMenuItems:', err);
      setMenuItems(SEED_MENU_ITEMS.map((item) => ({
        id: `seed-${item.item_code}`,
        ...item,
        is_active: true
      })));
    } finally {
      setLoading(false);
    }
  };

  // 2. Fetch Daily Sales Quantities & P&L Numbers for selectedDate
  const fetchDaySalesAndPnL = async (targetDate: string) => {
    try {
      // A. Fetch P&L record to get Cash, Card, PickMe numbers
      const { data: pnlData } = await supabase
        .from('expenses')
        .select('*')
        .eq('date', targetDate)
        .eq('expense_type', 'DAILY_PNL_SUMMARY')
        .maybeSingle();

      if (pnlData) {
        setHasPnlRecord(true);
        try {
          const p = JSON.parse(pnlData.description || '{}');
          setPnlCash(Number(p.incomeCash) || 0);
          setPnlCard(Number(p.incomeCard) || 0);
          setPnlPickme(Number(p.incomePickme) || 0);
        } catch {
          setPnlCash(0);
          setPnlCard(0);
          setPnlPickme(0);
        }
      } else {
        setHasPnlRecord(false);
        setPnlCash(0);
        setPnlCard(0);
        setPnlPickme(0);
      }

      // B. Fetch existing Daily Menu Sales
      const { data: salesData, error: salesErr } = await supabase
        .from('daily_menu_sales')
        .select('*')
        .eq('date', targetDate);

      if (!salesErr && salesData) {
        const restMap: Record<string, number | ''> = {};
        const pickMap: Record<string, number | ''> = {};

        salesData.forEach(row => {
          if (row.sales_channel === 'RESTAURANT') {
            restMap[row.menu_item_id] = Number(row.quantity) > 0 ? Number(row.quantity) : '';
          } else if (row.sales_channel === 'PICKME') {
            pickMap[row.menu_item_id] = Number(row.quantity) > 0 ? Number(row.quantity) : '';
          }
        });

        setRestaurantQuantities(restMap);
        setPickmeQuantities(pickMap);
      } else {
        setRestaurantQuantities({});
        setPickmeQuantities({});
      }
    } catch (err) {
      console.error('Error fetching sales:', err);
    }
  };

  useEffect(() => {
    fetchMenuItems();
  }, []);

  useEffect(() => {
    if (selectedDate) {
      fetchDaySalesAndPnL(selectedDate);
    }
  }, [selectedDate]);

  // Date Navigation
  const handlePrevDay = () => setSelectedDate(format(subDays(parseISO(selectedDate), 1), 'yyyy-MM-dd'));
  const handleNextDay = () => setSelectedDate(format(addDays(parseISO(selectedDate), 1), 'yyyy-MM-dd'));

  // Categories list
  const categories = useMemo(() => {
    const set = new Set<string>();
    menuItems.forEach(i => set.add(i.category));
    return ['ALL', ...Array.from(set)];
  }, [menuItems]);

  // Filtered menu items
  const filteredItems = useMemo(() => {
    return menuItems.filter(item => {
      const matchCat = selectedCategory === 'ALL' || item.category === selectedCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchSearch = !q || item.name.toLowerCase().includes(q) || item.item_code.toLowerCase().includes(q);
      return matchCat && matchSearch && item.is_active;
    });
  }, [menuItems, selectedCategory, searchQuery]);

  // Calculations for Restaurant Channel
  const restaurantSummary = useMemo(() => {
    let totalQty = 0;
    let totalAmount = 0;
    menuItems.forEach(item => {
      const qty = Number(restaurantQuantities[item.id]) || 0;
      if (qty > 0) {
        totalQty += qty;
        totalAmount += qty * Number(item.current_price);
      }
    });
    const pnlExpected = pnlCash + pnlCard;
    const difference = pnlExpected - totalAmount; // positive means PnL cash/card is higher, negative means item sales higher
    return { totalQty, totalAmount, pnlExpected, difference };
  }, [menuItems, restaurantQuantities, pnlCash, pnlCard]);

  // Calculations for PickMe Channel
  const pickmeSummary = useMemo(() => {
    let totalQty = 0;
    let totalAmount = 0;
    menuItems.forEach(item => {
      const qty = Number(pickmeQuantities[item.id]) || 0;
      if (qty > 0) {
        totalQty += qty;
        totalAmount += qty * Number(item.current_price);
      }
    });
    const pnlExpected = pnlPickme;
    const difference = pnlExpected - totalAmount;
    return { totalQty, totalAmount, pnlExpected, difference };
  }, [menuItems, pickmeQuantities, pnlPickme]);

  // Combined Difference
  const combinedDifference = restaurantSummary.difference + pickmeSummary.difference;

  // Handle Quantity Change
  const handleQuantityChange = (itemId: string, val: string) => {
    if (val === '') {
      if (salesChannel === 'RESTAURANT') {
        setRestaurantQuantities(prev => ({ ...prev, [itemId]: '' }));
      } else {
        setPickmeQuantities(prev => ({ ...prev, [itemId]: '' }));
      }
      return;
    }

    const num = Math.max(0, Number(val));
    if (salesChannel === 'RESTAURANT') {
      setRestaurantQuantities(prev => ({ ...prev, [itemId]: num }));
    } else {
      setPickmeQuantities(prev => ({ ...prev, [itemId]: num }));
    }
  };

  // Handle Enter / Arrow key navigation between items
  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      const nextInput = inputRefs.current[index + 1];
      if (nextInput) {
        nextInput.focus();
        nextInput.select();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevInput = inputRefs.current[index - 1];
      if (prevInput) {
        prevInput.focus();
        prevInput.select();
      }
    }
  };

  // Save Quantities
  const handleSaveSalesQuantities = async () => {
    setSaving(true);
    setErrorMsg(null);
    setSaveSuccess(false);

    try {
      const activeQuantities = salesChannel === 'RESTAURANT' ? restaurantQuantities : pickmeQuantities;
      const rowsToUpsert: any[] = [];

      menuItems.forEach(item => {
        const qty = Number(activeQuantities[item.id]) || 0;
        if (qty > 0) {
          rowsToUpsert.push({
            date: selectedDate,
            sales_channel: salesChannel,
            menu_item_id: item.id,
            quantity: qty,
            unit_price: item.current_price,
            total_amount: qty * item.current_price
          });
        }
      });

      // 1. Delete previous entries for this date & channel
      await supabase
        .from('daily_menu_sales')
        .delete()
        .eq('date', selectedDate)
        .eq('sales_channel', salesChannel);

      // 2. Insert new non-zero rows
      if (rowsToUpsert.length > 0) {
        const { error: insertErr } = await supabase
          .from('daily_menu_sales')
          .insert(rowsToUpsert);

        if (insertErr) throw insertErr;
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3500);
    } catch (err: any) {
      console.error('Failed to save daily sales quantities:', err);
      setErrorMsg(err.message || 'Failed to save quantities.');
    } finally {
      setSaving(false);
    }
  };

  // Save Edited Price
  const handleSavePrice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem || editPriceVal === '' || Number(editPriceVal) < 0) return;

    setSavingPrice(true);
    try {
      const newPrice = Number(editPriceVal);
      const { error } = await supabase
        .from('menu_items')
        .update({ current_price: newPrice, updated_at: new Date().toISOString() })
        .eq('id', editingItem.id);

      if (error) throw error;

      setMenuItems(prev => prev.map(i => i.id === editingItem.id ? { ...i, current_price: newPrice } : i));
      setEditingItem(null);
    } catch (err: any) {
      alert(err.message || 'Failed to update price');
    } finally {
      setSavingPrice(false);
    }
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
              <ShoppingBag className="text-primary" />
              Day-End Sales Quantity & Item Revenue
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              Menu Reconciliation
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Input day-end portion quantities sold for Restaurant (Cash + Card) and PickMe. Verifies that quantity value equals collected revenue.
          </p>
        </div>

        {/* Channel Tab Switcher: Restaurant vs PickMe */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 self-start md:self-auto">
          <button
            onClick={() => setSalesChannel('RESTAURANT')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              salesChannel === 'RESTAURANT'
                ? 'bg-white text-primary shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Store size={15} />
            Restaurant (Cash + Card)
          </button>
          <button
            onClick={() => setSalesChannel('PICKME')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              salesChannel === 'PICKME'
                ? 'bg-white text-emerald-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Bike size={15} />
            PickMe Delivery
          </button>
        </div>
      </div>

      {/* Date Navigation & Actions Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
          <button
            type="button"
            onClick={handlePrevDay}
            className="p-1.5 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600 transition-colors"
            title="Previous Day"
          >
            <ChevronLeft size={16} />
          </button>

          <div className="flex items-center gap-2 text-sm font-bold text-slate-700 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-100">
            <Calendar size={16} className="text-primary" />
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="bg-transparent text-sm font-bold text-slate-800 outline-none cursor-pointer"
            />
          </div>

          <button
            type="button"
            onClick={handleNextDay}
            className="p-1.5 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600 transition-colors"
            title="Next Day"
          >
            <ChevronRight size={16} />
          </button>

          {selectedDate !== format(new Date(), 'yyyy-MM-dd') && (
            <button
              type="button"
              onClick={() => setSelectedDate(format(new Date(), 'yyyy-MM-dd'))}
              className="px-2.5 py-1 rounded-lg text-xs font-bold text-primary bg-primary/10 hover:bg-primary/20"
            >
              Today
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
          {saveSuccess && (
            <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 animate-in fade-in">
              <CheckCircle2 size={14} /> Quantities Saved
            </span>
          )}
          {errorMsg && (
            <span className="flex items-center gap-1.5 text-xs font-bold text-rose-600 bg-rose-50 px-3 py-1.5 rounded-lg border border-rose-200 animate-in fade-in">
              <AlertCircle size={14} /> {errorMsg}
            </span>
          )}
          <button
            onClick={handleSaveSalesQuantities}
            disabled={saving || loading}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary-dark text-white rounded-xl text-xs font-bold shadow-sm transition-all active:scale-95 disabled:opacity-50"
          >
            <Save size={16} />
            {saving ? 'Saving...' : `Save ${salesChannel === 'RESTAURANT' ? 'Restaurant' : 'PickMe'} Quantities`}
          </button>
        </div>
      </div>

      {/* RECONCILIATION SUMMARY CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        {/* Card 1: Total Items Sold */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Total Items Sold ({salesChannel === 'RESTAURANT' ? 'Rest.' : 'PickMe'})
          </span>
          <p className="text-2xl font-extrabold text-slate-800 mt-1">
            {salesChannel === 'RESTAURANT' ? restaurantSummary.totalQty : pickmeSummary.totalQty} Portions
          </p>
          <span className="text-[11px] text-slate-400">Sum of all entered quantities</span>
        </div>

        {/* Card 2: Calculated Items Value */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Calculated Items Value
          </span>
          <p className="text-2xl font-extrabold text-primary mt-1">
            LKR {formatCurrency(salesChannel === 'RESTAURANT' ? restaurantSummary.totalAmount : pickmeSummary.totalAmount)}
          </p>
          <span className="text-[11px] text-slate-400">Qty × Current Selling Price</span>
        </div>

        {/* Card 3: P&L Reported Revenue */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            P&L {salesChannel === 'RESTAURANT' ? 'Cash + Card' : 'PickMe'}
          </span>
          <p className="text-2xl font-extrabold text-emerald-700 mt-1">
            LKR {formatCurrency(salesChannel === 'RESTAURANT' ? restaurantSummary.pnlExpected : pickmeSummary.pnlExpected)}
          </p>
          <span className="text-[11px] text-slate-400">
            {hasPnlRecord ? 'From Daily Expense Report' : 'No P&L saved yet'}
          </span>
        </div>

        {/* Card 4: Variance / Difference */}
        {(() => {
          const diff = salesChannel === 'RESTAURANT' ? restaurantSummary.difference : pickmeSummary.difference;
          const isExact = Math.abs(diff) < 0.01;
          const isPositive = diff > 0; // P&L is higher than item sales

          return (
            <div className={`p-4 rounded-2xl border shadow-sm ${
              isExact
                ? 'bg-emerald-50/60 border-emerald-200 text-emerald-900'
                : 'bg-amber-50/70 border-amber-300 text-amber-900'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider">
                  Reconciliation Difference
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  isExact ? 'bg-emerald-200 text-emerald-900' : 'bg-amber-200 text-amber-900'
                }`}>
                  {isExact ? 'Matched' : 'Discrepancy'}
                </span>
              </div>
              <p className="text-2xl font-extrabold mt-1">
                {isExact ? 'LKR 0.00' : `${isPositive ? '+' : '-'}LKR ${formatCurrency(Math.abs(diff))}`}
              </p>
              <p className="text-[11px] mt-0.5">
                {isExact
                  ? 'Items value matches P&L revenue exactly!'
                  : isPositive
                  ? 'P&L revenue is higher than item total'
                  : 'Item portion sales are higher than reported revenue'}
              </p>
            </div>
          );
        })()}
      </div>

      {/* SEARCH & CATEGORY FILTER BAR */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative w-full sm:w-80">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by code (e.g. 45) or name (e.g. CHI S/M)..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="text-xs text-slate-400 font-medium">
            Showing <strong className="text-slate-700">{filteredItems.length}</strong> items • Click ✏️ to edit any item's price
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all ${
                selectedCategory === cat
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* ITEMS QUANTITIES TABLE */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 text-center w-16">Code</th>
                <th className="px-5 py-3">Item Name</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3 text-right">Unit Price</th>
                <th className="px-6 py-3 text-center w-40">
                  {salesChannel === 'RESTAURANT' ? 'Restaurant Sold Qty' : 'PickMe Sold Qty'}
                </th>
                <th className="px-5 py-3 text-right w-44">Total Amount (LKR)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-400">
                    No items match the selected filter.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item, index) => {
                  const activeQuantities = salesChannel === 'RESTAURANT' ? restaurantQuantities : pickmeQuantities;
                  const qty = activeQuantities[item.id] ?? '';
                  const lineTotal = (Number(qty) || 0) * Number(item.current_price);

                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        Number(qty) > 0 ? (salesChannel === 'RESTAURANT' ? 'bg-blue-50/20' : 'bg-emerald-50/20') : ''
                      }`}
                    >
                      {/* Code */}
                      <td className="px-4 py-3 text-center font-bold text-slate-500 font-mono text-[11px]">
                        #{item.item_code}
                      </td>

                      {/* Name */}
                      <td className="px-5 py-3 font-bold text-slate-800">
                        {item.name}
                      </td>

                      {/* Category */}
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold text-[10px]">
                          {item.category}
                        </span>
                      </td>

                      {/* Price + Edit Icon */}
                      <td className="px-4 py-3 text-right font-semibold text-slate-700 whitespace-nowrap">
                        <span>LKR {formatCurrency(Number(item.current_price))}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingItem(item);
                            setEditPriceVal(item.current_price);
                          }}
                          className="ml-2 text-slate-400 hover:text-primary transition-colors p-1"
                          title="Edit price"
                        >
                          <Edit3 size={13} />
                        </button>
                      </td>

                      {/* Quantity Input with Enter Key Navigation */}
                      <td className="px-6 py-2.5 text-center">
                        <input
                          ref={el => (inputRefs.current[index] = el)}
                          type="number"
                          step="1"
                          min="0"
                          placeholder="0"
                          value={qty}
                          onChange={e => handleQuantityChange(item.id, e.target.value)}
                          onKeyDown={e => handleKeyDown(index, e)}
                          onFocus={e => e.target.select()}
                          className={`w-28 px-3 py-1.5 border rounded-xl text-center font-bold text-sm outline-none transition-all ${
                            Number(qty) > 0
                              ? 'border-primary ring-2 ring-primary/20 bg-white text-primary'
                              : 'border-slate-200 text-slate-700 focus:border-primary'
                          }`}
                        />
                      </td>

                      {/* Line Total */}
                      <td className="px-5 py-3 text-right font-extrabold text-slate-800 whitespace-nowrap">
                        {lineTotal > 0 ? (
                          <span className={salesChannel === 'RESTAURANT' ? 'text-primary' : 'text-emerald-700'}>
                            LKR {formatCurrency(lineTotal)}
                          </span>
                        ) : (
                          <span className="text-slate-300 font-normal">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: EDIT ITEM PRICE */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl border border-slate-100 max-w-sm w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setEditingItem(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
            >
              <X size={18} />
            </button>

            <h3 className="text-base font-bold text-slate-800 mb-1 flex items-center gap-2">
              <Edit3 size={16} className="text-primary" />
              Update Item Price
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Editing price for <strong>#{editingItem.item_code} - {editingItem.name}</strong>.
            </p>

            <form onSubmit={handleSavePrice} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Selling Price (LKR) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editPriceVal}
                  onChange={e => setEditPriceVal(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl font-bold text-base text-slate-800 outline-none focus:ring-2 focus:ring-primary/20"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingPrice}
                  className="px-5 py-2 bg-primary hover:bg-primary-dark text-white rounded-xl text-xs font-bold shadow-sm transition-all"
                >
                  {savingPrice ? 'Updating...' : 'Update Price'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
