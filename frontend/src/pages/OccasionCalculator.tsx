import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';
import { 
  Calculator, 
  Users, 
  Calendar, 
  DollarSign, 
  TrendingUp, 
  Plus, 
  Trash2, 
  Copy, 
  Save, 
  Printer, 
  Search, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  Layers, 
  Utensils, 
  FileText, 
  RefreshCw, 
  Clock, 
  Sparkles,
  ShoppingBag,
  Boxes,
  HelpCircle
} from 'lucide-react';

export interface OccasionItem {
  id: string;
  name: string;
  source: 'DAILY_PURCHASES' | 'INVENTORY' | 'CUSTOM';
  category?: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  totalCost: number;
  notes?: string;
}

export interface OccasionRecord {
  id: string;
  menuItemId?: string;
  occasionName: string;
  eventDate: string;
  pax: number;
  targetPricePerPax: number;
  totalCost: number;
  costPerPax: number;
  notes: string;
  // Menu dishes provided to guests (view only)
  menuRice?: string;
  menuDishes?: string;
  menuDessert?: string;
  menuExtras?: string;
  items: OccasionItem[];
  createdAt?: string;
  updatedAt?: string;
}

const COMMON_UNITS = ['kg', 'g', 'L', 'ml', 'pcs', 'packets', 'bottles', 'cans', 'bunches'];

export const OccasionCalculator: React.FC = () => {
  const { user } = useAuth();

  // Occasion Details State
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [currentMenuItemId, setCurrentMenuItemId] = useState<string | null>(null);
  const [occasionName, setOccasionName] = useState<string>('');
  const [eventDate, setEventDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [pax, setPax] = useState<number>(100);
  const [targetPricePerPax, setTargetPricePerPax] = useState<number | ''>(1800);
  const [notes, setNotes] = useState<string>('');
  // Menu dishes given to guests (view only)
  const [menuRice, setMenuRice] = useState<string>('');
  const [menuDishes, setMenuDishes] = useState<string>('');
  const [menuDessert, setMenuDessert] = useState<string>('');
  const [menuExtras, setMenuExtras] = useState<string>('');
  const [items, setItems] = useState<OccasionItem[]>([]);

  // Item Search & Suggestion State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchDropdownOpen, setSearchDropdownOpen] = useState<boolean>(false);
  const [systemCatalogue, setSystemCatalogue] = useState<Array<{
    name: string;
    source: 'DAILY_PURCHASES' | 'INVENTORY';
    unit: string;
    unitPrice: number;
    lastDate?: string;
    category?: string;
  }>>([]);
  const [catalogueLoading, setCatalogueLoading] = useState<boolean>(true);

  // Saved Occasions Modal State
  const [savedModalOpen, setSavedModalOpen] = useState<boolean>(false);
  const [savedOccasions, setSavedOccasions] = useState<OccasionRecord[]>([]);
  const [savedLoading, setSavedLoading] = useState<boolean>(false);
  const [savedSearchQuery, setSavedSearchQuery] = useState<string>('');

  // UI States
  const [saving, setSaving] = useState<boolean>(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Auto-dismiss notification
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Load active draft from localStorage on initial load
  useEffect(() => {
    try {
      const draft = localStorage.getItem('occasion_calculator_draft');
      if (draft) {
        const parsed = JSON.parse(draft);
        if (parsed.items && parsed.items.length > 0) {
          setOccasionName(parsed.occasionName || '');
          setEventDate(parsed.eventDate || format(new Date(), 'yyyy-MM-dd'));
          setPax(Number(parsed.pax) || 100);
          setTargetPricePerPax(parsed.targetPricePerPax !== undefined ? parsed.targetPricePerPax : 1800);
          setNotes(parsed.notes || '');
          setMenuRice(parsed.menuRice || '');
          setMenuDishes(parsed.menuDishes || '');
          setMenuDessert(parsed.menuDessert || '');
          setMenuExtras(parsed.menuExtras || '');
          setItems(parsed.items || []);
          setCurrentId(parsed.currentId || null);
          setCurrentMenuItemId(parsed.currentMenuItemId || null);
        }
      }
    } catch (e) {
      console.error('Error loading draft from localStorage:', e);
    }
  }, []);

  // Save active draft to localStorage on change
  useEffect(() => {
    if (items.length > 0 || occasionName || menuRice || menuDishes || menuDessert) {
      const draftPayload = {
        currentId,
        currentMenuItemId,
        occasionName,
        eventDate,
        pax,
        targetPricePerPax,
        notes,
        menuRice,
        menuDishes,
        menuDessert,
        menuExtras,
        items
      };
      localStorage.setItem('occasion_calculator_draft', JSON.stringify(draftPayload));
    }
  }, [occasionName, eventDate, pax, targetPricePerPax, notes, menuRice, menuDishes, menuDessert, menuExtras, items, currentId, currentMenuItemId]);

  // Fetch catalogue of inventory items + recent daily purchases
  const fetchCatalogue = async () => {
    setCatalogueLoading(true);
    try {
      const [invRes, dpRes] = await Promise.all([
        supabase
          .from('inventory_items')
          .select('id, name, cost_price, categories(name), base_unit:units!inventory_items_base_unit_id_fkey(abbreviation)')
          .eq('status', 'ACTIVE')
          .order('name'),
        supabase
          .from('daily_purchases')
          .select('item_name, quantity, total_cost, date')
          .order('date', { ascending: false })
          .limit(600)
      ]);

      const catalogueList: Array<{
        name: string;
        source: 'DAILY_PURCHASES' | 'INVENTORY';
        unit: string;
        unitPrice: number;
        lastDate?: string;
        category?: string;
      }> = [];

      // 1. Process Daily Purchases (Vegetables, Fruits, Fresh items)
      const dailyMap: Record<string, boolean> = {};
      (dpRes.data || []).forEach(dp => {
        const cleanName = (dp.item_name || '').trim();
        const key = cleanName.toLowerCase();
        if (cleanName && !dailyMap[key]) {
          dailyMap[key] = true;
          const qty = Number(dp.quantity) || 1;
          const unitCost = Number(dp.total_cost) / (qty > 0 ? qty : 1);
          catalogueList.push({
            name: cleanName,
            source: 'DAILY_PURCHASES',
            unit: 'kg', // Standard daily vegetable unit
            unitPrice: Math.round(unitCost * 100) / 100,
            lastDate: dp.date,
            category: 'Vegetables & Market'
          });
        }
      });

      // 2. Process Inventory Items
      (invRes.data || []).forEach(item => {
        catalogueList.push({
          name: item.name,
          source: 'INVENTORY',
          unit: item.base_unit?.abbreviation || 'unit',
          unitPrice: Number(item.cost_price) || 0,
          category: item.categories?.name || 'Inventory'
        });
      });

      setSystemCatalogue(catalogueList);
    } catch (err) {
      console.error('Failed to load system catalogue:', err);
    } finally {
      setCatalogueLoading(false);
    }
  };

  useEffect(() => {
    fetchCatalogue();
  }, []);

  // Filtered catalogue based on user search
  const filteredSuggestions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return systemCatalogue
      .filter(item => item.name.toLowerCase().includes(q))
      .slice(0, 10);
  }, [searchQuery, systemCatalogue]);

  // Derived Financial Metrics
  const totalCost = useMemo(() => {
    return items.reduce((sum, item) => sum + (Number(item.totalCost) || 0), 0);
  }, [items]);

  const safePax = pax > 0 ? pax : 1;
  const costPerPax = totalCost / safePax;

  const targetRevenue = Number(targetPricePerPax || 0) * safePax;
  const estimatedProfit = targetRevenue > 0 ? targetRevenue - totalCost : 0;
  const profitPerPax = targetRevenue > 0 ? (Number(targetPricePerPax || 0) - costPerPax) : 0;
  const profitMarginPercent = targetRevenue > 0 ? (estimatedProfit / targetRevenue) * 100 : 0;

  // Add Item from Catalogue
  const handleSelectItem = (catItem: {
    name: string;
    source: 'DAILY_PURCHASES' | 'INVENTORY';
    unit: string;
    unitPrice: number;
    category?: string;
  }) => {
    const defaultQty = catItem.unit === 'kg' ? Math.max(1, Math.round((safePax * 0.15) * 10) / 10) : 1;
    const newItem: OccasionItem = {
      id: `item-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: catItem.name,
      source: catItem.source,
      category: catItem.category,
      unit: catItem.unit,
      quantity: defaultQty,
      unitPrice: catItem.unitPrice,
      totalCost: defaultQty * catItem.unitPrice
    };

    setItems(prev => [...prev, newItem]);
    setSearchQuery('');
    setSearchDropdownOpen(false);
  };

  // Add Custom / Unlisted Item
  const handleAddCustomItem = (customName?: string) => {
    const nameToAdd = (customName || searchQuery).trim() || 'Custom Item';
    const newItem: OccasionItem = {
      id: `custom-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: nameToAdd,
      source: 'CUSTOM',
      category: 'Custom / Unlisted',
      unit: 'pcs',
      quantity: 1,
      unitPrice: 0,
      totalCost: 0
    };

    setItems(prev => [...prev, newItem]);
    setSearchQuery('');
    setSearchDropdownOpen(false);
  };

  // Update Item Fields
  const handleUpdateItem = (id: string, field: keyof OccasionItem, value: any) => {
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;

      const updated = { ...item, [field]: value };
      if (field === 'quantity' || field === 'unitPrice') {
        const q = field === 'quantity' ? Number(value) : item.quantity;
        const p = field === 'unitPrice' ? Number(value) : item.unitPrice;
        updated.totalCost = Math.round((q * p) * 100) / 100;
      }
      return updated;
    }));
  };

  // Remove Item
  const handleRemoveItem = (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
  };

  // Duplicate Item Row
  const handleDuplicateItem = (item: OccasionItem) => {
    const duplicated: OccasionItem = {
      ...item,
      id: `item-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: `${item.name} (Copy)`
    };
    setItems(prev => [...prev, duplicated]);
  };

  // Clear / Reset Form
  const handleClearAll = () => {
    if (items.length > 0 && !window.confirm('Are you sure you want to clear this calculation? Unsaved changes will be lost.')) {
      return;
    }
    setCurrentId(null);
    setCurrentMenuItemId(null);
    setOccasionName('');
    setEventDate(format(new Date(), 'yyyy-MM-dd'));
    setPax(100);
    setTargetPricePerPax(1800);
    setNotes('');
    setMenuRice('');
    setMenuDishes('');
    setMenuDessert('');
    setMenuExtras('');
    setItems([]);
    localStorage.removeItem('occasion_calculator_draft');
    setNotification({ type: 'success', message: 'Calculator reset for a new occasion.' });
  };

  // Save to Database
  const handleSaveToDatabase = async () => {
    const cleanTitle = occasionName.trim() || `Occasion - ${pax} Pax (${eventDate})`;
    if (items.length === 0) {
      setNotification({ type: 'error', message: 'Please add at least one item before saving.' });
      return;
    }

    setSaving(true);
    try {
      const calculationPayload: OccasionRecord = {
        id: currentId || `occ-${Date.now()}`,
        occasionName: cleanTitle,
        eventDate,
        pax,
        targetPricePerPax: Number(targetPricePerPax || 0),
        totalCost,
        costPerPax,
        notes: notes.trim(),
        menuRice: menuRice.trim(),
        menuDishes: menuDishes.trim(),
        menuDessert: menuDessert.trim(),
        menuExtras: menuExtras.trim(),
        items,
        updatedAt: new Date().toISOString()
      };

      // Get a unit id for recipes foreign key requirement
      const { data: units } = await supabase.from('units').select('id').limit(1);
      const defaultUnitId = units?.[0]?.id;

      if (currentMenuItemId) {
        // Update existing record
        await supabase
          .from('menu_items')
          .update({
            name: cleanTitle,
            selling_price: Number(targetPricePerPax || 0),
            updated_at: new Date().toISOString()
          })
          .eq('id', currentMenuItemId);

        await supabase
          .from('recipes')
          .update({
            yield_quantity: pax,
            instructions: JSON.stringify(calculationPayload),
            updated_at: new Date().toISOString()
          })
          .eq('menu_item_id', currentMenuItemId);

        setNotification({ type: 'success', message: `"${cleanTitle}" updated successfully!` });
      } else {
        // Create new record
        const sku = `OCC-${format(new Date(), 'yyyyMMdd')}-${Math.floor(1000 + Math.random() * 9000)}`;
        const { data: menuData, error: menuErr } = await supabase
          .from('menu_items')
          .insert({
            name: cleanTitle,
            sku: sku,
            selling_price: Number(targetPricePerPax || 0),
            active: true
          })
          .select('id')
          .single();

        if (menuErr) throw menuErr;

        calculationPayload.menuItemId = menuData.id;
        setCurrentMenuItemId(menuData.id);
        setCurrentId(calculationPayload.id);

        const { error: recErr } = await supabase
          .from('recipes')
          .insert({
            menu_item_id: menuData.id,
            yield_quantity: pax,
            yield_unit_id: defaultUnitId,
            instructions: JSON.stringify(calculationPayload),
            active: true
          });

        if (recErr) throw recErr;

        setNotification({ type: 'success', message: `"${cleanTitle}" saved to database successfully!` });
      }

      setOccasionName(cleanTitle);
    } catch (err: any) {
      console.error('Failed to save occasion calculation:', err);
      setNotification({ type: 'error', message: err.message || 'Failed to save occasion calculation' });
    } finally {
      setSaving(false);
    }
  };

  // Fetch Saved Occasions List
  const fetchSavedOccasions = async () => {
    setSavedLoading(true);
    try {
      const { data, error } = await supabase
        .from('menu_items')
        .select('id, name, sku, created_at, recipes(id, yield_quantity, instructions)')
        .ilike('sku', 'OCC-%')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const list: OccasionRecord[] = [];
      (data || []).forEach(m => {
        const r = m.recipes?.[0];
        if (r && r.instructions) {
          try {
            const parsed = JSON.parse(r.instructions);
            list.push({
              ...parsed,
              menuItemId: m.id,
              createdAt: m.created_at
            });
          } catch (e) {}
        }
      });

      setSavedOccasions(list);
    } catch (err) {
      console.error('Failed to fetch saved occasions:', err);
    } finally {
      setSavedLoading(false);
    }
  };

  const handleOpenSavedModal = () => {
    setSavedModalOpen(true);
    fetchSavedOccasions();
  };

  // Load a Saved Occasion into Calculator
  const handleLoadOccasion = (rec: OccasionRecord) => {
    setCurrentId(rec.id);
    setCurrentMenuItemId(rec.menuItemId || null);
    setOccasionName(rec.occasionName || '');
    setEventDate(rec.eventDate || format(new Date(), 'yyyy-MM-dd'));
    setPax(Number(rec.pax) || 100);
    setTargetPricePerPax(rec.targetPricePerPax !== undefined ? rec.targetPricePerPax : 1800);
    setNotes(rec.notes || '');
    setMenuRice(rec.menuRice || '');
    setMenuDishes(rec.menuDishes || '');
    setMenuDessert(rec.menuDessert || '');
    setMenuExtras(rec.menuExtras || '');
    setItems(rec.items || []);
    setSavedModalOpen(false);
    setNotification({ type: 'success', message: `Loaded "${rec.occasionName}".` });
  };

  // Duplicate a Saved Occasion as a fresh calculation
  const handleDuplicateOccasion = (rec: OccasionRecord) => {
    setCurrentId(null);
    setCurrentMenuItemId(null);
    setOccasionName(`${rec.occasionName} (Copy)`);
    setEventDate(format(new Date(), 'yyyy-MM-dd'));
    setPax(Number(rec.pax) || 100);
    setTargetPricePerPax(rec.targetPricePerPax !== undefined ? rec.targetPricePerPax : 1800);
    setNotes(rec.notes || '');
    setMenuRice(rec.menuRice || '');
    setMenuDishes(rec.menuDishes || '');
    setMenuDessert(rec.menuDessert || '');
    setMenuExtras(rec.menuExtras || '');
    setItems((rec.items || []).map(i => ({ ...i, id: `item-${Date.now()}-${Math.random()}` })));
    setSavedModalOpen(false);
    setNotification({ type: 'success', message: `Duplicated "${rec.occasionName}" as a new calculation.` });
  };

  // Delete a Saved Occasion
  const handleDeleteOccasion = async (menuItemId?: string) => {
    if (!menuItemId) return;
    if (!window.confirm('Are you sure you want to permanently delete this saved occasion?')) return;

    try {
      const { error } = await supabase.from('menu_items').delete().eq('id', menuItemId);
      if (error) throw error;
      setSavedOccasions(prev => prev.filter(o => o.menuItemId !== menuItemId));
      if (currentMenuItemId === menuItemId) {
        setCurrentMenuItemId(null);
      }
      setNotification({ type: 'success', message: 'Occasion calculation deleted successfully.' });
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to delete occasion' });
    }
  };

  // Filtered Saved Occasions
  const filteredSavedList = useMemo(() => {
    const q = savedSearchQuery.trim().toLowerCase();
    if (!q) return savedOccasions;
    return savedOccasions.filter(o => 
      (o.occasionName || '').toLowerCase().includes(q) ||
      (o.eventDate || '').includes(q) ||
      (o.notes || '').toLowerCase().includes(q)
    );
  }, [savedOccasions, savedSearchQuery]);

  return (
    <div className="space-y-6 pb-28">
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
            <AlertCircle size={18} className="text-rose-600 shrink-0" />
          )}
          <span className="text-sm font-semibold">{notification.message}</span>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-amber-500/10 text-amber-600 border border-amber-200">
                <Calculator size={22} />
              </span>
              Special Occasion Calculator
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
              <Sparkles size={12} />
              Real-time Costing & Quotation
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Calculate exact food cost, cost per head, and profit quotations for weddings, parties, and catering orders.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleOpenSavedModal}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-semibold text-sm rounded-xl shadow-xs transition-all active:scale-95"
          >
            <Clock size={16} className="text-slate-500" />
            <span>Saved Occasions</span>
          </button>
          <button
            onClick={handleClearAll}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-200 hover:border-rose-200 font-semibold text-sm rounded-xl shadow-xs transition-all active:scale-95"
            title="Reset form for a new calculation"
          >
            <RefreshCw size={16} />
            <span>New / Reset</span>
          </button>
          <button
            onClick={handleSaveToDatabase}
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-bold text-sm rounded-xl shadow-sm shadow-amber-500/20 transition-all disabled:opacity-50"
          >
            <Save size={16} />
            <span>{saving ? 'Saving...' : currentMenuItemId ? 'Update Occasion' : 'Save Occasion'}</span>
          </button>
        </div>
      </div>

      {/* TOP SECTION: Occasion Inputs & Guest Count */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Occasion Name */}
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
              <FileText size={14} className="text-amber-500" />
              Occasion / Event Title *
            </label>
            <input
              type="text"
              value={occasionName}
              onChange={e => setOccasionName(e.target.value)}
              placeholder="e.g. Perera Wedding Reception (150 Pax)"
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none"
            />
          </div>

          {/* Event Date */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
              <Calendar size={14} className="text-amber-500" />
              Event Date
            </label>
            <input
              type="date"
              value={eventDate}
              onChange={e => setEventDate(e.target.value)}
              className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none"
            />
          </div>

          {/* NUMBER ATTENDING (PAX) - PRIMARY INPUT */}
          <div className="space-y-1.5 bg-amber-50/70 p-2.5 rounded-xl border border-amber-200">
            <label className="text-xs font-extrabold text-amber-900 uppercase tracking-wider flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Users size={16} className="text-amber-600" />
                How Many Attending? (Pax) *
              </span>
            </label>
            <div className="relative">
              <input
                type="number"
                min="1"
                step="1"
                value={pax}
                onChange={e => setPax(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full px-3.5 py-2 border border-amber-300 rounded-lg text-lg font-black text-amber-950 bg-white focus:ring-2 focus:ring-amber-500 outline-none shadow-xs text-right pr-12"
              />
              <span className="absolute right-3 top-2.5 text-xs font-bold text-amber-600 pointer-events-none">
                Pax
              </span>
            </div>
          </div>
        </div>

        {/* Secondary Inputs: Notes & Target Selling Price */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-slate-100">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
              <DollarSign size={14} className="text-emerald-500" />
              Target Selling Price Per Person (LKR)
            </label>
            <input
              type="number"
              min="0"
              step="10"
              value={targetPricePerPax}
              onChange={e => setTargetPricePerPax(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="e.g. 1850.00"
              className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
            />
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">
              Occasion Notes / General Details (Optional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Lunch Buffet menu, customer contact, venue location, hall timing"
              className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-slate-300 outline-none"
            />
          </div>
        </div>

        {/* VIEW-ONLY: Planned Menu Items Given to Guests */}
        <div className="pt-4 border-t border-slate-200 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
            <span className="text-xs font-extrabold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Utensils size={15} className="text-amber-600" />
              Menu Dishes Provided (View Only Reference)
            </span>
            <span className="text-[11px] font-semibold text-slate-400">
              Specify what dishes, rice & desserts will be given · For quotation and menu view only
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Field 1: What Rice */}
            <div className="space-y-1.5 bg-slate-50/70 p-3 rounded-xl border border-slate-200/80">
              <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <span>🍚</span> What Rice / Staples?
              </label>
              <textarea
                rows={2}
                value={menuRice}
                onChange={e => setMenuRice(e.target.value)}
                placeholder="e.g. Basmathi Chicken Fried Rice, Steamed Rice, Yellow Rice..."
                className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none resize-none"
              />
            </div>

            {/* Field 2: What Dishes */}
            <div className="space-y-1.5 bg-slate-50/70 p-3 rounded-xl border border-slate-200/80">
              <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <span>🍗</span> What Dishes & Curries?
              </label>
              <textarea
                rows={2}
                value={menuDishes}
                onChange={e => setMenuDishes(e.target.value)}
                placeholder="e.g. Devilled Chicken, Butter Fish, Dhal Curry, Veg Chop Suey..."
                className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none resize-none"
              />
            </div>

            {/* Field 3: What Dessert */}
            <div className="space-y-1.5 bg-slate-50/70 p-3 rounded-xl border border-slate-200/80">
              <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <span>🍨</span> What Dessert?
              </label>
              <textarea
                rows={2}
                value={menuDessert}
                onChange={e => setMenuDessert(e.target.value)}
                placeholder="e.g. Watalappan, Caramel Pudding, Fruit Salad with Ice Cream..."
                className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none resize-none"
              />
            </div>

            {/* Field 4: Drinks & Extras */}
            <div className="space-y-1.5 bg-slate-50/70 p-3 rounded-xl border border-slate-200/80">
              <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <span>🍹</span> Welcome Drinks & Extras
              </label>
              <textarea
                rows={2}
                value={menuExtras}
                onChange={e => setMenuExtras(e.target.value)}
                placeholder="e.g. Welcome Passion Fruit Juice, Fish Cutlets, Salad, Papadam..."
                className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none resize-none"
              />
            </div>
          </div>
        </div>
      </div>

      {/* TOP LIVE KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Cost */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <Boxes size={16} className="text-slate-600" />
            Total Material Cost
          </span>
          <p className="text-2xl font-black text-slate-900 mt-2">
            LKR {totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Sum of all {items.length} ingredient & material items
          </p>
        </div>

        {/* Card 2: COST PER PERSON - HIGHLIGHTED HERO CARD */}
        <div className="bg-gradient-to-br from-amber-500 to-amber-600 text-white p-5 rounded-2xl shadow-sm shadow-amber-500/20 border border-amber-400 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5 text-white/90">
              <Users size={16} />
              Cost Per Person (Head)
            </span>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white/20 backdrop-blur-xs">
              ÷ {safePax} Pax
            </span>
          </div>
          <p className="text-3xl font-black mt-2 tracking-tight">
            LKR {costPerPax.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-amber-100 mt-1 font-medium">
            Raw material expense per attending guest
          </p>
        </div>

        {/* Card 3: Quotation / Revenue */}
        <div className="bg-white p-5 rounded-2xl border border-emerald-200/80 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-1.5">
              <DollarSign size={16} className="text-emerald-600" />
              Suggested Quotation
            </span>
            {targetPricePerPax && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                LKR {Number(targetPricePerPax).toLocaleString()} / Pax
              </span>
            )}
          </div>
          <p className="text-2xl font-black text-emerald-700 mt-2">
            LKR {targetRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Total invoice value for {safePax} guests
          </p>
        </div>

        {/* Card 4: Estimated Profit */}
        <div className="bg-white p-5 rounded-2xl border border-sky-200/80 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-sky-700 uppercase tracking-wider flex items-center gap-1.5">
              <TrendingUp size={16} className="text-sky-600" />
              Estimated Profit
            </span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${profitMarginPercent >= 20 ? 'bg-sky-50 text-sky-700 border border-sky-200' : 'bg-slate-100 text-slate-600'}`}>
              {profitMarginPercent.toFixed(1)}% Margin
            </span>
          </div>
          <p className={`text-2xl font-black mt-2 ${estimatedProfit >= 0 ? 'text-sky-700' : 'text-rose-600'}`}>
            LKR {estimatedProfit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            Profit per guest: <span className="font-bold text-sky-800">LKR {profitPerPax.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </p>
        </div>
      </div>

      {/* ITEMS MANAGEMENT SECTION */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Search & Add Bar */}
        <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50/60 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          <div className="relative flex-1">
            <div className="relative">
              <Search size={18} className="absolute left-3.5 top-3 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={e => {
                  setSearchQuery(e.target.value);
                  setSearchDropdownOpen(true);
                }}
                onFocus={() => setSearchDropdownOpen(true)}
                placeholder="Search ingredients or vegetables (e.g. Carrot, Leeks, Chicken, Basmathi, Cabbage)..."
                className="w-full pl-10 pr-24 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none shadow-xs"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-20 top-3 text-slate-400 hover:text-slate-600 text-xs"
                >
                  Clear
                </button>
              )}
              <button
                onClick={() => handleAddCustomItem()}
                className="absolute right-2 top-1.5 px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold transition-all shadow-xs"
                title="Add as a custom unlisted item"
              >
                + Add Custom
              </button>
            </div>

            {/* Smart Autocomplete Dropdown */}
            {searchDropdownOpen && searchQuery.trim() && (
              <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-xl z-30 max-h-80 overflow-y-auto divide-y divide-slate-100 animate-in fade-in zoom-in-98 duration-150">
                {catalogueLoading ? (
                  <div className="p-4 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                    <RefreshCw size={14} className="animate-spin text-amber-500" />
                    Searching catalogue...
                  </div>
                ) : filteredSuggestions.length > 0 ? (
                  <>
                    <div className="px-3.5 py-2 bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                      <span>Matching System Items</span>
                      <span>Latest Unit Price</span>
                    </div>
                    {filteredSuggestions.map((item, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleSelectItem(item)}
                        className="w-full px-4 py-2.5 text-left flex items-center justify-between hover:bg-amber-50/60 transition-colors group"
                      >
                        <div className="flex items-center gap-2.5">
                          {item.source === 'DAILY_PURCHASES' ? (
                            <span className="p-1 rounded bg-emerald-50 text-emerald-600 border border-emerald-200 text-[10px] font-bold">
                              Vegetable / Market
                            </span>
                          ) : (
                            <span className="p-1 rounded bg-blue-50 text-blue-600 border border-blue-200 text-[10px] font-bold">
                              Inventory
                            </span>
                          )}
                          <div>
                            <p className="text-sm font-bold text-slate-800 group-hover:text-amber-700 transition-colors">
                              {item.name}
                            </p>
                            <p className="text-[11px] text-slate-400">
                              {item.source === 'DAILY_PURCHASES' && item.lastDate
                                ? `Last Market Date: ${item.lastDate}`
                                : item.category || 'Store'}
                            </p>
                          </div>
                        </div>

                        <div className="text-right">
                          <p className="text-sm font-black text-slate-900 group-hover:text-amber-700">
                            LKR {item.unitPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                          <p className="text-[10px] text-slate-400 font-semibold">
                            per {item.unit}
                          </p>
                        </div>
                      </button>
                    ))}
                  </>
                ) : (
                  <div className="p-4 text-center space-y-2">
                    <p className="text-xs text-slate-500">No catalogue item matching "{searchQuery}".</p>
                    <button
                      type="button"
                      onClick={() => handleAddCustomItem()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 rounded-xl text-xs font-bold transition-all"
                    >
                      <Plus size={14} />
                      Add "{searchQuery}" as an Unlisted / Custom Item
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => handleAddCustomItem('Custom Service / Item')}
              className="px-3.5 py-2.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5"
            >
              <Plus size={14} />
              <span>Blank Custom Row</span>
            </button>
          </div>
        </div>

        {/* Table View */}
        {items.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto">
              <Utensils size={28} />
            </div>
            <h3 className="text-base font-bold text-slate-800">No items added to this occasion yet</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Use the search bar above to look up vegetables (Carrot, Leeks, etc.) or inventory goods (Meat, Fish, Rice), or add custom unlisted items.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                  <th className="py-3 px-3 w-12 text-center">#</th>
                  <th className="py-3 px-4 min-w-[220px]">Item Name & Source</th>
                  <th className="py-3 px-3 w-28">Unit</th>
                  <th className="py-3 px-3 w-36 text-right">Unit Price (LKR)</th>
                  <th className="py-3 px-3 w-32 text-right">Quantity</th>
                  <th className="py-3 px-4 w-40 text-right">Total Cost (LKR)</th>
                  <th className="py-3 px-4 w-36 text-right bg-amber-50/50 text-amber-900">Cost / Person</th>
                  <th className="py-3 px-3 w-24 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {items.map((item, index) => {
                  const itemCostPerPax = (Number(item.totalCost) || 0) / safePax;
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition-colors group">
                      {/* Index */}
                      <td className="py-3 px-3 text-center text-xs text-slate-400 font-semibold">
                        {index + 1}
                      </td>

                      {/* Name & Source */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={item.name}
                            onChange={e => handleUpdateItem(item.id, 'name', e.target.value)}
                            className="w-full px-2 py-1 text-sm font-bold text-slate-800 bg-transparent hover:bg-white hover:border hover:border-slate-200 focus:bg-white focus:border-amber-500 rounded-lg outline-none transition-all"
                          />
                          {item.source === 'DAILY_PURCHASES' && (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold shrink-0" title="Fetched from Daily Market Purchases">
                              Market
                            </span>
                          )}
                          {item.source === 'INVENTORY' && (
                            <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold shrink-0" title="Fetched from Inventory Master">
                              Inventory
                            </span>
                          )}
                          {item.source === 'CUSTOM' && (
                            <span className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 text-[10px] font-bold shrink-0" title="Unlisted / Custom Item">
                              Custom
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Unit */}
                      <td className="py-3 px-3">
                        <select
                          value={item.unit}
                          onChange={e => handleUpdateItem(item.id, 'unit', e.target.value)}
                          className="w-full px-2 py-1 text-xs font-semibold text-slate-700 bg-transparent hover:bg-white border border-transparent hover:border-slate-200 focus:bg-white focus:border-amber-500 rounded-lg outline-none cursor-pointer"
                        >
                          {COMMON_UNITS.map(u => (
                            <option key={u} value={u}>{u}</option>
                          ))}
                          {!COMMON_UNITS.includes(item.unit) && (
                            <option value={item.unit}>{item.unit}</option>
                          )}
                        </select>
                      </td>

                      {/* Unit Price (Editable) */}
                      <td className="py-3 px-3 text-right">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.unitPrice}
                          onChange={e => handleUpdateItem(item.id, 'unitPrice', e.target.value)}
                          className="w-full px-2 py-1 text-sm font-semibold text-slate-800 bg-transparent hover:bg-white border border-transparent hover:border-slate-200 focus:bg-white focus:border-amber-500 rounded-lg outline-none text-right transition-all"
                        />
                      </td>

                      {/* Quantity */}
                      <td className="py-3 px-3 text-right">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.quantity}
                          onChange={e => handleUpdateItem(item.id, 'quantity', e.target.value)}
                          className="w-full px-2 py-1 text-sm font-black text-amber-700 bg-transparent hover:bg-white border border-transparent hover:border-slate-200 focus:bg-white focus:border-amber-500 rounded-lg outline-none text-right transition-all"
                        />
                      </td>

                      {/* Line Total */}
                      <td className="py-3 px-4 text-right font-black text-slate-900">
                        LKR {Number(item.totalCost).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>

                      {/* COST PER PERSON */}
                      <td className="py-3 px-4 text-right font-bold text-amber-900 bg-amber-50/40">
                        LKR {itemCostPerPax.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() => handleDuplicateItem(item)}
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                            title="Duplicate Row"
                          >
                            <Copy size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(item.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Remove Row"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* Table Footer Totals */}
              <tfoot>
                <tr className="bg-slate-100/80 font-black text-slate-900 border-t-2 border-slate-300">
                  <td colSpan={5} className="py-3.5 px-4 text-right uppercase text-xs tracking-wider text-slate-600">
                    Grand Total ({items.length} items):
                  </td>
                  <td className="py-3.5 px-4 text-right text-base text-slate-900 font-extrabold">
                    LKR {totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="py-3.5 px-4 text-right text-base text-amber-900 font-black bg-amber-100/60">
                    LKR {costPerPax.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* SAVED OCCASIONS MODAL */}
      {savedModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-hidden">
          <div className="bg-white rounded-2xl border border-slate-100 w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-amber-50 text-amber-600 border border-amber-200">
                  <Clock size={18} />
                </span>
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Saved Occasion Calculations</h3>
                  <p className="text-xs text-slate-400">Reopen, duplicate, or manage previously saved event calculations</p>
                </div>
              </div>
              <button
                onClick={() => setSavedModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Search filter */}
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
              <div className="relative">
                <Search size={16} className="absolute left-3.5 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={savedSearchQuery}
                  onChange={e => setSavedSearchQuery(e.target.value)}
                  placeholder="Search saved occasions by name, date or notes..."
                  className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none"
                />
              </div>
            </div>

            {/* Occasions List */}
            <div className="p-4 overflow-y-auto flex-1 divide-y divide-slate-100 space-y-2">
              {savedLoading ? (
                <div className="p-10 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                  <RefreshCw size={16} className="animate-spin text-amber-500" />
                  Loading saved calculations...
                </div>
              ) : filteredSavedList.length === 0 ? (
                <div className="p-10 text-center space-y-2">
                  <p className="text-xs text-slate-400">No saved occasion calculations found.</p>
                </div>
              ) : (
                filteredSavedList.map(rec => (
                  <div
                    key={rec.id}
                    className="p-4 rounded-xl border border-slate-200 hover:border-amber-300 hover:bg-amber-50/30 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-slate-900">{rec.occasionName}</h4>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                          {rec.pax} Pax
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Date: <span className="font-semibold text-slate-700">{rec.eventDate}</span> • Total Cost: <span className="font-bold text-slate-800">LKR {Number(rec.totalCost || 0).toLocaleString()}</span> • Cost/Pax: <span className="font-bold text-amber-700">LKR {Number(rec.costPerPax || 0).toFixed(2)}</span>
                      </p>
                      {rec.notes && (
                        <p className="text-[11px] text-slate-400 mt-1 italic line-clamp-1">{rec.notes}</p>
                      )}
                      {(rec.menuRice || rec.menuDishes || rec.menuDessert || rec.menuExtras) && (
                        <div className="mt-2 pt-1.5 border-t border-slate-100 flex flex-wrap gap-1.5 text-[10px]">
                          {rec.menuRice && (
                            <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
                              🍚 <strong>Rice:</strong> {rec.menuRice}
                            </span>
                          )}
                          {rec.menuDishes && (
                            <span className="px-2 py-0.5 rounded-md bg-orange-50 text-orange-800 border border-orange-200">
                              🍗 <strong>Dishes:</strong> {rec.menuDishes}
                            </span>
                          )}
                          {rec.menuDessert && (
                            <span className="px-2 py-0.5 rounded-md bg-pink-50 text-pink-800 border border-pink-200">
                              🍨 <strong>Dessert:</strong> {rec.menuDessert}
                            </span>
                          )}
                          {rec.menuExtras && (
                            <span className="px-2 py-0.5 rounded-md bg-teal-50 text-teal-800 border border-teal-200">
                              🍹 <strong>Extras:</strong> {rec.menuExtras}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      <button
                        onClick={() => handleLoadOccasion(rec)}
                        className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold transition-all shadow-2xs"
                      >
                        Load & Edit
                      </button>
                      <button
                        onClick={() => handleDuplicateOccasion(rec)}
                        className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                        title="Duplicate as new"
                      >
                        <Copy size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteOccasion(rec.menuItemId)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                        title="Delete calculation"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
