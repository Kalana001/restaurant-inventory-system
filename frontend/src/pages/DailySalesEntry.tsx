import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { SEED_MENU_ITEMS } from '../data/menuSeedData';
import { 
  loadChannelPrices, 
  saveChannelPrices, 
  loadCustomMenuItems, 
  saveCustomMenuItems
} from '../lib/channelPrices';
import type { 
  ChannelPriceMap, 
  CustomMenuItem 
} from '../lib/channelPrices';
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
  Sparkles,
  Plus,
  ListChecks,
  TrendingUp,
  TrendingDown,
  ArrowRight
} from 'lucide-react';
import { format, parseISO, subDays, addDays } from 'date-fns';

export interface MenuItem {
  id: string;
  item_code: string;
  name: string;
  category: string;
  restaurant_price: number;
  pickme_price: number;
  current_price: number; // Dynamically set to the active channel's price
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
  const [channelPrices, setChannelPrices] = useState<ChannelPriceMap>({});
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

  // Single Price Edit Modal (Allows editing BOTH Restaurant & PickMe prices)
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [editRestPrice, setEditRestPrice] = useState<number | ''>('');
  const [editPickmePrice, setEditPickmePrice] = useState<number | ''>('');
  const [savingPrice, setSavingPrice] = useState<boolean>(false);

  // Add Item Modal
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [newItemCode, setNewItemCode] = useState<string>('');
  const [newItemName, setNewItemName] = useState<string>('');
  const [selectedAddCategory, setSelectedAddCategory] = useState<string>('');
  const [customCategoryInput, setCustomCategoryInput] = useState<string>('');
  const [newItemRestPrice, setNewItemRestPrice] = useState<number | ''>('');
  const [newItemPickmePrice, setNewItemPickmePrice] = useState<number | ''>('');
  const [savingNewItem, setSavingNewItem] = useState<boolean>(false);
  const [addItemError, setAddItemError] = useState<string | null>(null);

  // Bulk Price Edit Modal (Side-by-side editing of both Restaurant & PickMe prices)
  const [showBulkPriceModal, setShowBulkPriceModal] = useState<boolean>(false);
  const [bulkPrices, setBulkPrices] = useState<Record<string, { restaurant_price: number | ''; pickme_price: number | '' }>>({});
  const [savingBulkPrices, setSavingBulkPrices] = useState<boolean>(false);
  const [bulkPriceSearch, setBulkPriceSearch] = useState<string>('');
  const [bulkPriceSaved, setBulkPriceSaved] = useState<boolean>(false);

  // Input refs for Enter key navigation
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Format currency
  const formatCurrency = (amount: number) => {
    return amount.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  // 1. Fetch Menu Items and Channel Prices (Restaurant & PickMe)
  const fetchMenuItemsAndPrices = async () => {
    setLoading(true);
    try {
      const [savedPrices, customItems] = await Promise.all([
        loadChannelPrices(),
        loadCustomMenuItems()
      ]);

      setChannelPrices(savedPrices);

      // Build base items from SEED
      const baseItems: MenuItem[] = SEED_MENU_ITEMS.map(seed => {
        const p = savedPrices[seed.item_code];
        const restPrice = p?.restaurant_price !== undefined ? Number(p.restaurant_price) : Number(seed.current_price);
        const pickPrice = p?.pickme_price !== undefined ? Number(p.pickme_price) : Number(seed.current_price);
        return {
          id: `seed-${seed.item_code}`,
          item_code: seed.item_code,
          name: seed.name,
          category: seed.category,
          restaurant_price: restPrice,
          pickme_price: pickPrice,
          current_price: salesChannel === 'RESTAURANT' ? restPrice : pickPrice,
          is_active: true
        };
      });

      // Append custom items
      const customFormatted: MenuItem[] = customItems.map(c => {
        const p = savedPrices[c.item_code];
        const restPrice = p?.restaurant_price !== undefined ? Number(p.restaurant_price) : Number(c.restaurant_price);
        const pickPrice = p?.pickme_price !== undefined ? Number(p.pickme_price) : Number(c.pickme_price);
        return {
          id: c.id,
          item_code: c.item_code,
          name: c.name,
          category: c.category,
          restaurant_price: restPrice,
          pickme_price: pickPrice,
          current_price: salesChannel === 'RESTAURANT' ? restPrice : pickPrice,
          is_active: c.is_active ?? true
        };
      });

      const all = [...baseItems, ...customFormatted].sort((a, b) => {
        const numA = parseInt(a.item_code, 10);
        const numB = parseInt(b.item_code, 10);
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        return a.item_code.localeCompare(b.item_code);
      });

      setMenuItems(all);
    } catch (err: any) {
      console.error('Error in fetchMenuItemsAndPrices:', err);
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
    fetchMenuItemsAndPrices();
  }, []);

  useEffect(() => {
    if (selectedDate) {
      fetchDaySalesAndPnL(selectedDate);
    }
  }, [selectedDate]);

  // When switching salesChannel, update the display price
  useEffect(() => {
    setMenuItems(prev => prev.map(item => ({
      ...item,
      current_price: salesChannel === 'RESTAURANT' ? item.restaurant_price : item.pickme_price
    })));
  }, [salesChannel]);

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

  // Calculations for Restaurant Channel (uses restaurant_price)
  const restaurantSummary = useMemo(() => {
    let totalQty = 0;
    let totalAmount = 0;
    menuItems.forEach(item => {
      const qty = Number(restaurantQuantities[item.id]) || 0;
      if (qty > 0) {
        totalQty += qty;
        totalAmount += qty * Number(item.restaurant_price);
      }
    });
    const pnlExpected = pnlCash + pnlCard;
    const difference = pnlExpected - totalAmount;
    return { totalQty, totalAmount, pnlExpected, difference };
  }, [menuItems, restaurantQuantities, pnlCash, pnlCard]);

  // Calculations for PickMe Channel (uses pickme_price)
  const pickmeSummary = useMemo(() => {
    let totalQty = 0;
    let totalAmount = 0;
    menuItems.forEach(item => {
      const qty = Number(pickmeQuantities[item.id]) || 0;
      if (qty > 0) {
        totalQty += qty;
        totalAmount += qty * Number(item.pickme_price);
      }
    });
    const pnlExpected = pnlPickme;
    const difference = pnlExpected - totalAmount;
    return { totalQty, totalAmount, pnlExpected, difference };
  }, [menuItems, pickmeQuantities, pnlPickme]);

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
          const unitPrice = salesChannel === 'RESTAURANT' ? item.restaurant_price : item.pickme_price;
          rowsToUpsert.push({
            date: selectedDate,
            sales_channel: salesChannel,
            menu_item_id: item.id,
            quantity: qty,
            unit_price: unitPrice,
            total_amount: qty * unitPrice
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

  // Open Single Price Edit Modal
  const openSinglePriceModal = (item: MenuItem) => {
    setEditingItem(item);
    setEditRestPrice(item.restaurant_price);
    setEditPickmePrice(item.pickme_price);
  };

  // Save Single Item Edited Prices (Both Restaurant & PickMe)
  const handleSavePrice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;

    const restVal = editRestPrice === '' ? 0 : Number(editRestPrice);
    const pickVal = editPickmePrice === '' ? restVal : Number(editPickmePrice);

    setSavingPrice(true);
    try {
      const updatedPricesMap: ChannelPriceMap = {
        ...channelPrices,
        [editingItem.item_code]: {
          restaurant_price: restVal,
          pickme_price: pickVal,
          updated_at: new Date().toISOString()
        }
      };

      await saveChannelPrices(updatedPricesMap);
      setChannelPrices(updatedPricesMap);

      setMenuItems(prev => prev.map(i => {
        if (i.id === editingItem.id) {
          return {
            ...i,
            restaurant_price: restVal,
            pickme_price: pickVal,
            current_price: salesChannel === 'RESTAURANT' ? restVal : pickVal
          };
        }
        return i;
      }));

      setEditingItem(null);
    } catch (err: any) {
      alert(err.message || 'Failed to update prices');
    } finally {
      setSavingPrice(false);
    }
  };

  // Open Bulk Price Edit Modal
  const openBulkPriceModal = () => {
    const map: Record<string, { restaurant_price: number | ''; pickme_price: number | '' }> = {};
    menuItems.forEach(item => {
      map[item.id] = {
        restaurant_price: item.restaurant_price,
        pickme_price: item.pickme_price
      };
    });
    setBulkPrices(map);
    setBulkPriceSearch('');
    setBulkPriceSaved(false);
    setShowBulkPriceModal(true);
  };

  // Auto-calculate all PickMe prices in Bulk Edit
  const handleApplyBulkMarkup = (percentage: number) => {
    setBulkPrices(prev => {
      const next = { ...prev };
      menuItems.forEach(item => {
        const curRest = prev[item.id]?.restaurant_price !== undefined && prev[item.id]?.restaurant_price !== ''
          ? Number(prev[item.id].restaurant_price)
          : Number(item.restaurant_price);
        const calculated = Math.round(curRest * (1 + percentage / 100));
        next[item.id] = {
          restaurant_price: curRest,
          pickme_price: calculated
        };
      });
      return next;
    });
  };

  // Save Bulk Prices (Both Restaurant & PickMe)
  const handleSaveBulkPrices = async () => {
    setSavingBulkPrices(true);
    try {
      const updatedMap: ChannelPriceMap = { ...channelPrices };

      menuItems.forEach(item => {
        const entry = bulkPrices[item.id];
        if (entry) {
          const restVal = entry.restaurant_price !== '' && entry.restaurant_price !== undefined
            ? Number(entry.restaurant_price)
            : item.restaurant_price;
          const pickVal = entry.pickme_price !== '' && entry.pickme_price !== undefined
            ? Number(entry.pickme_price)
            : item.pickme_price;

          updatedMap[item.item_code] = {
            restaurant_price: restVal,
            pickme_price: pickVal,
            updated_at: new Date().toISOString()
          };
        }
      });

      await saveChannelPrices(updatedMap);
      setChannelPrices(updatedMap);

      setMenuItems(prev => prev.map(item => {
        const entry = bulkPrices[item.id];
        if (!entry) return item;
        const restVal = entry.restaurant_price !== '' && entry.restaurant_price !== undefined ? Number(entry.restaurant_price) : item.restaurant_price;
        const pickVal = entry.pickme_price !== '' && entry.pickme_price !== undefined ? Number(entry.pickme_price) : item.pickme_price;
        return {
          ...item,
          restaurant_price: restVal,
          pickme_price: pickVal,
          current_price: salesChannel === 'RESTAURANT' ? restVal : pickVal
        };
      }));

      setBulkPriceSaved(true);
      setTimeout(() => {
        setBulkPriceSaved(false);
        setShowBulkPriceModal(false);
      }, 1500);
    } catch (err: any) {
      alert(err.message || 'Failed to save bulk prices');
    } finally {
      setSavingBulkPrices(false);
    }
  };

  // Add New Menu Item
  const handleAddNewItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddItemError(null);

    const trimmedCode = newItemCode.trim();
    const trimmedName = newItemName.trim();
    const restNum = Number(newItemRestPrice);
    const pickNum = newItemPickmePrice === '' ? restNum : Number(newItemPickmePrice);

    const finalCategory = (
      selectedAddCategory === '__NEW__'
        ? customCategoryInput.trim()
        : selectedAddCategory.trim()
    ).toUpperCase();

    if (!trimmedCode) {
      setAddItemError('Please enter an item code.');
      return;
    }
    if (!trimmedName) {
      setAddItemError('Please enter an item name.');
      return;
    }
    if (!finalCategory) {
      setAddItemError('Please select or specify a category.');
      return;
    }
    if (isNaN(restNum) || restNum < 0) {
      setAddItemError('Please enter a valid Restaurant price (>= 0).');
      return;
    }

    if (menuItems.some(i => i.item_code.trim() === trimmedCode)) {
      setAddItemError(`Item code #${trimmedCode} already exists. Please choose a different code.`);
      return;
    }

    setSavingNewItem(true);
    try {
      const newItemId = `custom-${trimmedCode}-${Date.now()}`;
      const newCustomItem: CustomMenuItem = {
        id: newItemId,
        item_code: trimmedCode,
        name: trimmedName,
        category: finalCategory,
        restaurant_price: restNum,
        pickme_price: pickNum,
        is_active: true
      };

      const existingCustom = await loadCustomMenuItems();
      const updatedCustom = [...existingCustom, newCustomItem];
      await saveCustomMenuItems(updatedCustom);

      const updatedPricesMap: ChannelPriceMap = {
        ...channelPrices,
        [trimmedCode]: {
          restaurant_price: restNum,
          pickme_price: pickNum,
          updated_at: new Date().toISOString()
        }
      };
      await saveChannelPrices(updatedPricesMap);
      setChannelPrices(updatedPricesMap);

      const newItem: MenuItem = {
        ...newCustomItem,
        current_price: salesChannel === 'RESTAURANT' ? restNum : pickNum
      };

      setMenuItems(prev => [...prev, newItem].sort((a, b) => {
        const numA = parseInt(a.item_code, 10);
        const numB = parseInt(b.item_code, 10);
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        return a.item_code.localeCompare(b.item_code);
      }));

      setShowAddModal(false);
      setNewItemCode('');
      setNewItemName('');
      setNewItemRestPrice('');
      setNewItemPickmePrice('');
      setSelectedAddCategory('');
      setCustomCategoryInput('');
    } catch (err: any) {
      setAddItemError(err.message || 'Failed to add item');
    } finally {
      setSavingNewItem(false);
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
            Input day-end portion quantities sold for Restaurant (Cash + Card) and PickMe. Separate unit prices stored for both channels.
          </p>
        </div>

        {/* Channel Tab Switcher: Restaurant vs PickMe */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 self-start md:self-auto shadow-xs">
          <button
            onClick={() => setSalesChannel('RESTAURANT')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
              salesChannel === 'RESTAURANT'
                ? 'bg-white text-primary shadow-sm border border-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Store size={15} />
            <span>Restaurant (Cash + Card)</span>
          </button>
          <button
            onClick={() => setSalesChannel('PICKME')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
              salesChannel === 'PICKME'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Bike size={15} />
            <span>PickMe Delivery</span>
            <span className="text-[10px] bg-emerald-500 text-white px-1.5 py-0.2 rounded font-mono">
              30% Comm.
            </span>
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
            className={`flex items-center gap-2 px-5 py-2.5 text-white rounded-xl text-xs font-bold shadow-sm transition-all active:scale-95 disabled:opacity-50 ${
              salesChannel === 'RESTAURANT' ? 'bg-primary hover:bg-primary-dark' : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
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
          <p className={`text-2xl font-extrabold mt-1 ${salesChannel === 'RESTAURANT' ? 'text-primary' : 'text-emerald-700'}`}>
            LKR {formatCurrency(salesChannel === 'RESTAURANT' ? restaurantSummary.totalAmount : pickmeSummary.totalAmount)}
          </p>
          <span className="text-[11px] text-slate-400">
            Qty × {salesChannel === 'RESTAURANT' ? 'Restaurant Price' : 'PickMe Price'}
          </span>
        </div>

        {/* Card 3: P&L Reported Revenue */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            P&L {salesChannel === 'RESTAURANT' ? 'Cash + Card' : 'PickMe'}
          </span>
          <p className="text-2xl font-extrabold text-slate-800 mt-1">
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
          const isPositive = diff > 0;

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

      {/* SEARCH & ACTIONS BAR */}
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

          <div className="flex items-center gap-2 flex-wrap">
            <div className="text-xs text-slate-400 font-medium mr-1">
              Showing <strong className="text-slate-700">{filteredItems.length}</strong> items
            </div>

            <button
              type="button"
              onClick={openBulkPriceModal}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold shadow-sm transition-all active:scale-95 whitespace-nowrap"
            >
              <ListChecks size={15} />
              Bulk Edit Prices (Both Channels)
            </button>

            <button
              type="button"
              onClick={() => {
                setAddItemError(null);
                setNewItemCode('');
                setNewItemName('');
                setNewItemRestPrice('');
                setNewItemPickmePrice('');
                const existingCats = categories.filter(c => c !== 'ALL');
                setSelectedAddCategory(existingCats[0] || 'RICE');
                setCustomCategoryInput('');
                setShowAddModal(true);
              }}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-primary hover:bg-primary-dark text-white rounded-xl text-xs font-bold shadow-sm transition-all active:scale-95 whitespace-nowrap"
            >
              <Plus size={15} />
              Add New Item
            </button>
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

      {/* ITEMS QUANTITIES & PRICES TABLE */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 text-center w-16">Code</th>
                <th className="px-5 py-3">Item Name</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3 text-right">
                  {salesChannel === 'RESTAURANT' ? 'Restaurant Price' : 'PickMe Price'}
                </th>
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
                  const unitPrice = salesChannel === 'RESTAURANT' ? item.restaurant_price : item.pickme_price;
                  const lineTotal = (Number(qty) || 0) * unitPrice;

                  // PickMe 30% margin preview
                  const pickmeNet = item.pickme_price * 0.70;
                  const marginVsRest = pickmeNet - item.restaurant_price;
                  const isMarginLoss = marginVsRest < -0.5;

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
                      <td className="px-5 py-3">
                        <span className="font-bold text-slate-800">{item.name}</span>
                        {salesChannel === 'PICKME' && (
                          <div className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                            <span>Rest: LKR {formatCurrency(item.restaurant_price)}</span>
                            <span>•</span>
                            <span>Net (-30%): LKR {formatCurrency(pickmeNet)}</span>
                            {isMarginLoss && (
                              <span className="text-rose-600 font-bold bg-rose-50 px-1 rounded">
                                Loss -LKR {Math.abs(marginVsRest).toFixed(0)}
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Category */}
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold text-[10px]">
                          {item.category}
                        </span>
                      </td>

                      {/* Price + Edit Icon */}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          <span className={`font-bold ${salesChannel === 'RESTAURANT' ? 'text-slate-800' : 'text-emerald-700'}`}>
                            LKR {formatCurrency(unitPrice)}
                          </span>
                          <button
                            type="button"
                            onClick={() => openSinglePriceModal(item)}
                            className="text-slate-400 hover:text-primary transition-colors p-1 rounded-lg hover:bg-slate-100"
                            title="Edit Restaurant & PickMe prices"
                          >
                            <Edit3 size={13} />
                          </button>
                        </div>
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
                              ? salesChannel === 'RESTAURANT'
                                ? 'border-primary ring-2 ring-primary/20 bg-white text-primary'
                                : 'border-emerald-600 ring-2 ring-emerald-600/20 bg-white text-emerald-700'
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

      {/* MODAL: SINGLE ITEM PRICE EDIT (BOTH RESTAURANT & PICKME) */}
      {editingItem && (() => {
        const restNum = Number(editRestPrice) || 0;
        const pickNum = Number(editPickmePrice) || 0;
        const diff = pickNum - restNum;
        const diffPct = restNum > 0 ? ((diff / restNum) * 100).toFixed(1) : '0';
        const netPickme = pickNum * 0.70;
        const marginVsRest = netPickme - restNum;
        const isProfit = marginVsRest >= 0;
        const breakEvenPrice = Math.ceil(restNum / 0.70);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white rounded-2xl border border-slate-100 max-w-md w-full p-6 shadow-2xl relative">
              <button
                onClick={() => setEditingItem(null)}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1"
              >
                <X size={18} />
              </button>

              <h3 className="text-base font-bold text-slate-800 mb-1 flex items-center gap-2">
                <Edit3 size={16} className="text-primary" />
                Edit Item Prices
              </h3>
              <p className="text-xs text-slate-400 mb-4">
                #{editingItem.item_code} - <strong>{editingItem.name}</strong> ({editingItem.category})
              </p>

              <form onSubmit={handleSavePrice} className="space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1">
                      <Store size={13} className="text-primary" />
                      Restaurant Price (LKR) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editRestPrice}
                      onChange={e => setEditRestPrice(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl font-bold text-base text-slate-800 outline-none focus:ring-2 focus:ring-primary/20"
                      required
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-emerald-800 mb-1 flex items-center gap-1">
                      <Bike size={13} className="text-emerald-600" />
                      PickMe Price (LKR) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editPickmePrice}
                      onChange={e => setEditPickmePrice(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full px-3 py-2 border border-emerald-300 rounded-xl font-bold text-base text-emerald-800 outline-none focus:ring-2 focus:ring-emerald-500/20 bg-emerald-50/20"
                      required
                    />
                  </div>
                </div>

                {/* Quick PickMe Calculation Buttons */}
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Quick Set:</span>
                  <button
                    type="button"
                    onClick={() => setEditPickmePrice(breakEvenPrice)}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg text-[10px] font-bold text-slate-700 transition-colors"
                  >
                    Break-Even (+42.9% = LKR {breakEvenPrice})
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditPickmePrice(Math.round(restNum * 1.30))}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg text-[10px] font-bold text-slate-700 transition-colors"
                  >
                    +30% Markup
                  </button>
                </div>

                {/* PickMe vs Restaurant 30% Deduction Analysis Box */}
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-500 font-medium">Difference vs Restaurant:</span>
                    <span className="font-bold text-slate-700">
                      {diff >= 0 ? `+LKR ${diff.toFixed(2)} (+${diffPct}%)` : `-LKR ${Math.abs(diff).toFixed(2)} (${diffPct}%)`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-500 font-medium">Net Payout after PickMe 30% cut:</span>
                    <span className="font-bold text-slate-800 font-mono">
                      LKR {netPickme.toFixed(2)}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700">Net Profit / Loss vs Dine-in:</span>
                    <span className={`px-2 py-0.5 rounded-lg text-xs font-black flex items-center gap-1 ${
                      isProfit ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                    }`}>
                      {isProfit ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                      {isProfit ? `+LKR ${marginVsRest.toFixed(2)}` : `-LKR ${Math.abs(marginVsRest).toFixed(2)}`}
                    </span>
                  </div>
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
                    {savingPrice ? 'Saving...' : 'Save Both Prices'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* MODAL: BULK EDIT ITEM PRICES (SIDE-BY-SIDE RESTAURANT & PICKME) */}
      {showBulkPriceModal && (() => {
        const bulkFiltered = menuItems.filter(item =>
          item.is_active && (
            !bulkPriceSearch ||
            item.name.toLowerCase().includes(bulkPriceSearch.toLowerCase()) ||
            item.item_code.toLowerCase().includes(bulkPriceSearch.toLowerCase()) ||
            item.category.toLowerCase().includes(bulkPriceSearch.toLowerCase())
          )
        );

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white rounded-2xl border border-slate-100 w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh]">

              {/* Header */}
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70 rounded-t-2xl">
                <div>
                  <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                    <ListChecks size={18} className="text-amber-500" />
                    Bulk Edit Menu Prices (Restaurant & PickMe)
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Store independent prices for both Restaurant and PickMe. PickMe prices automatically calculate the 30% commission.
                  </p>
                </div>
                <button onClick={() => setShowBulkPriceModal(false)} className="text-slate-400 hover:text-slate-600 p-1">
                  <X size={18} />
                </button>
              </div>

              {/* Tools Bar: Search & Quick Markup Actions */}
              <div className="px-6 py-3 border-b border-slate-100 bg-white flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="relative w-full sm:w-72">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search item name, code or category..."
                    value={bulkPriceSearch}
                    onChange={e => setBulkPriceSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-amber-400/30"
                    autoFocus
                  />
                </div>

                <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Apply to all PickMe:</span>
                  <button
                    type="button"
                    onClick={() => handleApplyBulkMarkup(30)}
                    className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-bold transition-all"
                  >
                    +30% Markup
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyBulkMarkup(42.86)}
                    className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-lg text-xs font-bold transition-all"
                  >
                    Break-Even (+42.9%)
                  </button>
                </div>
              </div>

              {/* Items Table */}
              <div className="overflow-y-auto flex-1">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider sticky top-0 z-10">
                    <tr>
                      <th className="px-3 py-2.5 w-14 text-center">Code</th>
                      <th className="px-4 py-2.5">Item Name</th>
                      <th className="px-3 py-2.5">Category</th>
                      <th className="px-4 py-2.5 text-right w-36">Restaurant Price (LKR)</th>
                      <th className="px-4 py-2.5 text-right w-36">PickMe Price (LKR)</th>
                      <th className="px-3 py-2.5 text-right w-24">PickMe (-30%)</th>
                      <th className="px-3 py-2.5 text-center w-28">Net vs Rest.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {bulkFiltered.length === 0 ? (
                      <tr><td colSpan={7} className="text-center py-10 text-slate-400">No items match your search.</td></tr>
                    ) : (
                      bulkFiltered.map(item => {
                        const entry = bulkPrices[item.id] || { restaurant_price: item.restaurant_price, pickme_price: item.pickme_price };
                        const restVal = Number(entry.restaurant_price) || 0;
                        const pickVal = Number(entry.pickme_price) || 0;
                        const netPickme = pickVal * 0.70;
                        const marginDiff = netPickme - restVal;
                        const isProfit = marginDiff >= 0;

                        return (
                          <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="px-3 py-2 text-center font-bold text-slate-500 font-mono text-[11px]">
                              #{item.item_code}
                            </td>
                            <td className="px-4 py-2 font-semibold text-slate-800">
                              {item.name}
                            </td>
                            <td className="px-3 py-2">
                              <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold text-[10px]">
                                {item.category}
                              </span>
                            </td>
                            {/* Restaurant Price Input */}
                            <td className="px-4 py-1.5 text-right">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={entry.restaurant_price}
                                onChange={e => {
                                  const val = e.target.value === '' ? '' : Number(e.target.value);
                                  setBulkPrices(prev => ({
                                    ...prev,
                                    [item.id]: {
                                      ...prev[item.id],
                                      restaurant_price: val
                                    }
                                  }));
                                }}
                                className="w-28 px-2 py-1 border border-slate-200 rounded-lg text-right font-bold text-slate-800 focus:border-primary outline-none"
                              />
                            </td>
                            {/* PickMe Price Input */}
                            <td className="px-4 py-1.5 text-right">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={entry.pickme_price}
                                onChange={e => {
                                  const val = e.target.value === '' ? '' : Number(e.target.value);
                                  setBulkPrices(prev => ({
                                    ...prev,
                                    [item.id]: {
                                      ...prev[item.id],
                                      pickme_price: val
                                    }
                                  }));
                                }}
                                className="w-28 px-2 py-1 border border-emerald-300 bg-emerald-50/30 rounded-lg text-right font-bold text-emerald-800 focus:border-emerald-600 outline-none"
                              />
                            </td>
                            {/* Net after 30% */}
                            <td className="px-3 py-2 text-right font-mono font-semibold text-slate-600 text-[11px]">
                              LKR {netPickme.toFixed(0)}
                            </td>
                            {/* Net Margin vs Rest */}
                            <td className="px-3 py-2 text-center">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                                isProfit ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                              }`}>
                                {isProfit ? `+${marginDiff.toFixed(0)}` : `${marginDiff.toFixed(0)}`}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/70 rounded-b-2xl">
                <div className="text-xs text-slate-500 font-medium">
                  Editing prices across all {menuItems.length} items
                </div>
                <div className="flex items-center gap-2">
                  {bulkPriceSaved && (
                    <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 animate-in fade-in">
                      <CheckCircle2 size={13} /> Prices Saved Successfully!
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowBulkPriceModal(false)}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveBulkPrices}
                    disabled={savingBulkPrices}
                    className="flex items-center gap-2 px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold shadow-sm transition-all disabled:opacity-50"
                  >
                    <Save size={14} />
                    {savingBulkPrices ? 'Saving...' : 'Save All Channel Prices'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL: ADD NEW MENU ITEM */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl border border-slate-100 max-w-md w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setShowAddModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
            >
              <X size={18} />
            </button>

            <h3 className="text-base font-bold text-slate-800 mb-1 flex items-center gap-2">
              <Plus size={16} className="text-primary" />
              Add New Menu Item
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Add a new menu item and define both its Restaurant and PickMe prices.
            </p>

            {addItemError && (
              <div className="mb-3 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
                <AlertCircle size={14} className="shrink-0" />
                <span>{addItemError}</span>
              </div>
            )}

            <form onSubmit={handleAddNewItem} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Item Code * (e.g. 101)</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 101"
                    value={newItemCode}
                    onChange={e => setNewItemCode(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl font-bold text-slate-800 outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Category *</label>
                  <select
                    value={selectedAddCategory}
                    onChange={e => {
                      setSelectedAddCategory(e.target.value);
                      if (e.target.value !== '__NEW__') {
                        setCustomCategoryInput('');
                      }
                    }}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl font-bold text-slate-800 outline-none focus:ring-2 focus:ring-primary/20 bg-white"
                  >
                    {categories.filter(c => c !== 'ALL').map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                    <option value="__NEW__">+ Create New Category...</option>
                  </select>
                </div>
              </div>

              {selectedAddCategory === '__NEW__' && (
                <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl animate-in fade-in duration-150">
                  <label className="block font-bold text-amber-900 mb-1">New Category Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. BEVERAGES, DESSERT, SOUP"
                    value={customCategoryInput}
                    onChange={e => setCustomCategoryInput(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 border border-amber-300 rounded-lg font-bold text-slate-800 uppercase outline-none focus:ring-2 focus:ring-amber-500/30 bg-white"
                  />
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 mb-1">Item Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. EGG NOODLES FULL"
                  value={newItemName}
                  onChange={e => setNewItemName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl font-bold text-slate-800 outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Restaurant Price (LKR) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    placeholder="0.00"
                    value={newItemRestPrice}
                    onChange={e => {
                      const v = e.target.value === '' ? '' : Number(e.target.value);
                      setNewItemRestPrice(v);
                      if (newItemPickmePrice === '') {
                        setNewItemPickmePrice(v);
                      }
                    }}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl font-bold text-base text-slate-800 outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div>
                  <label className="block font-bold text-emerald-800 mb-1">PickMe Price (LKR)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Same as Rest. or higher"
                    value={newItemPickmePrice}
                    onChange={e => setNewItemPickmePrice(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full px-3 py-2 border border-emerald-300 rounded-xl font-bold text-base text-emerald-800 outline-none focus:ring-2 focus:ring-emerald-500/20 bg-emerald-50/20"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingNewItem}
                  className="px-5 py-2 bg-primary hover:bg-primary-dark text-white rounded-xl text-xs font-bold shadow-sm transition-all"
                >
                  {savingNewItem ? 'Adding...' : 'Add Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
