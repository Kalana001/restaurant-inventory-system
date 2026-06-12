import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Search, Edit3, Trash2, SlidersHorizontal, AlertCircle, Upload, X } from 'lucide-react';
import { ConfirmModal } from '../components/ConfirmModal';
import { BulkImportModal } from '../components/BulkImportModal';
import { useSearchParams } from 'react-router-dom';

export const Inventory: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { hasPermission, user } = useAuth();
  // Allow create/edit for admins, owners and managers; also for anyone with explicit permission
  const isAdminOrManager = ['admin','owner','manager'].includes((user?.role?.name || '').toLowerCase());
  const canCreate = isAdminOrManager || hasPermission('items:create');
  const canDelete = isAdminOrManager || hasPermission('items:delete');
  
  // Catalog List States
  const [items, setItems] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [subcategories, setSubcategories] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter States
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');

  // Form Modal States
  const [modalOpen, setModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [categoryInput, setCategoryInput] = useState('');
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [subcategoryId, setSubcategoryId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [baseUnitId, setBaseUnitId] = useState('');

  const [minStock, setMinStock] = useState('10');
  const [maxStock, setMaxStock] = useState('100');
  const [reorderLevel, setReorderLevel] = useState('20');
  const [costPrice, setCostPrice] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [isBatchTracked, setIsBatchTracked] = useState(false);
  const [isExpiryTracked, setIsExpiryTracked] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Opening stock states (only shown on Add, not Edit)
  const [openingQty, setOpeningQty] = useState('');
  const [openingBatchNo, setOpeningBatchNo] = useState('');
  const [openingExpiryDate, setOpeningExpiryDate] = useState('');

  // Confirm Modal States
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);

  // Batch Modal States
  const [selectedBatchItem, setSelectedBatchItem] = useState<any | null>(null);
  const [batchModalOpen, setBatchModalOpen] = useState(false);

  // Filtered categories for autocomplete
  const filteredCategories = categoryInput.trim()
    ? categories.filter((c) =>
        c.name.toLowerCase().includes(categoryInput.toLowerCase())
      )
    : categories;

  const fetchCatalogData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Inventory Items
      let query = supabase
        .from('inventory_items')
        .select(`
          *,
          categories ( name ),
          subcategories ( name ),
          units:units!inventory_items_base_unit_id_fkey ( abbreviation ),
          batches ( id, batch_number, current_qty, available_qty, received_date, expiry_date, status, stock_movements ( type, cost_price ) )
        `)
        .eq('status', 'ACTIVE');

      if (selectedCategory) {
        query = query.eq('category_id', selectedCategory);
      }
      if (search) {
        query = query.ilike('name', `%${search}%`);
      }

      const { data: itemData, error } = await query;
      if (!error && itemData) {
        setItems(itemData);
      }

      // 2. Fetch Helper Lists (Only once on load)
      if (categories.length === 0) {
        const { data: cats } = await supabase.from('categories').select('*');
        if (cats) setCategories(cats);

        const { data: subs } = await supabase.from('subcategories').select('*');
        if (subs) setSubcategories(subs);

        const { data: sups } = await supabase.from('suppliers').select('*').eq('status', 'ACTIVE');
        if (sups) setSuppliers(sups);

        const { data: uns } = await supabase.from('units').select('*');
        if (uns) setUnits(uns);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCatalogData(); }, [search, selectedCategory]);

  useEffect(() => {
    const batchId = searchParams.get('openBatchId');
    if (batchId && items.length > 0) {
      const targetItem = items.find(i => i.id === batchId);
      if (targetItem) {
        setSelectedBatchItem(targetItem);
        setBatchModalOpen(true);
        searchParams.delete('openBatchId');
        setSearchParams(searchParams, { replace: true });
      }
    }
  }, [searchParams, items, setSearchParams]);

  const openAddModal = () => {
    setEditingItem(null);
    setSku('');
    setName('');
    setDescription('');
    setCategoryId(categories[0]?.id || '');
    setCategoryInput(categories[0]?.name || '');
    setSubcategoryId('');
    setSupplierId(suppliers[0]?.id || '');

    setMinStock('10');
    setMaxStock('100');
    setReorderLevel('20');
    setCostPrice('');
    setSellingPrice('');
    setBaseUnitId(units[0]?.id || '');
    setIsBatchTracked(false);
    setIsExpiryTracked(false);
    setOpeningQty('');
    setOpeningBatchNo('');
    setOpeningExpiryDate('');
    setFormError(null);
    setCategoryDropdownOpen(false);
    setModalOpen(true);
  };

  const openEditModal = (item: any) => {
    setEditingItem(item);
    setSku(item.sku);
    setName(item.name);
    setDescription(item.description || '');
    setCategoryId(item.category_id);
    setCategoryInput(item.categories?.name || '');
    setSubcategoryId(item.subcategory_id || '');
    setSupplierId(item.supplier_id);
    setBaseUnitId(item.base_unit_id || '');

    setMinStock(String(item.min_stock));
    setMaxStock(String(item.max_stock));
    setReorderLevel(String(item.reorder_level));
    setCostPrice(String(item.cost_price));
    setSellingPrice(String(item.selling_price));
    setIsBatchTracked(item.is_batch_tracked);
    setIsExpiryTracked(item.is_expiry_tracked);
    setFormError(null);
    setCategoryDropdownOpen(false);
    setModalOpen(true);
  };

  const handleCategoryInputChange = (value: string) => {
    setCategoryInput(value);
    setCategoryDropdownOpen(true);
    const match = categories.find(
      (c) => c.name.toLowerCase() === value.toLowerCase()
    );
    setCategoryId(match ? match.id : '');
  };

  const handleCategorySelect = (cat: any) => {
    setCategoryId(cat.id);
    setCategoryInput(cat.name);
    setCategoryDropdownOpen(false);
  };

  const [addingCategory, setAddingCategory] = useState(false);

  const handleAddNewCategory = async () => {
    const trimmed = categoryInput.trim();
    if (!trimmed) return;
    setAddingCategory(true);
    try {
      const { data: newCat, error: catError } = await supabase
        .from('categories')
        .insert({ name: trimmed })
        .select()
        .single();
      if (catError) throw catError;
      setCategories((prev) => [...prev, newCat]);
      setCategoryId(newCat.id);
      setCategoryInput(newCat.name);
      setCategoryDropdownOpen(false);
    } catch (err: any) {
      setFormError(err.message || 'Failed to create category.');
    } finally {
      setAddingCategory(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    try {
      if (!categoryId) {
        setFormError('Please select or create a category before saving.');
        return;
      }
      const totalItemsCount = items.length;
      const finalSku = sku.trim() || `INT-${String(totalItemsCount + 1).padStart(4,'0')}`;

      const itemPayload = {
        sku: finalSku,
        name: name.trim(),
        description: description.trim(),
        category_id: categoryId,
        subcategory_id: subcategoryId || null,
        supplier_id: supplierId || null,
        
        base_unit_id: baseUnitId || units[0]?.id,
        purchase_unit_id: baseUnitId || units[0]?.id,
        issue_unit_id: baseUnitId || units[0]?.id,
        purchase_to_base_factor: 1,
        issue_to_base_factor: 1,

        min_stock: Number(minStock) || 0,
        max_stock: Number(maxStock) || 0,
        reorder_level: Number(reorderLevel) || 0,
        cost_price: Number(costPrice),
        selling_price: Number(sellingPrice) || 0,
        is_batch_tracked: isBatchTracked,
        is_expiry_tracked: isExpiryTracked,
        status: 'ACTIVE'
      };

      let savedItemId: string | null = null;

      if (editingItem) {
        const { error } = await supabase
          .from('inventory_items')
          .update(itemPayload)
          .eq('id', editingItem.id);
        if (error) throw error;
        savedItemId = editingItem.id;
      } else {
        const { data: newItem, error } = await supabase
          .from('inventory_items')
          .insert(itemPayload)
          .select('id')
          .single();
        if (error) throw error;
        savedItemId = newItem.id;

        // If opening stock is provided, create a batch + stock movement
        if (savedItemId && openingQty && Number(openingQty) > 0) {
          const qty = Number(openingQty);
          const batchNo = openingBatchNo.trim() || `INIT-${finalSku}`;

            const { error: rpcErr } = await supabase.rpc('process_opening_stock', {
              p_item_id: savedItemId,
              p_supplier_id: supplierId || null,
              p_qty: qty,
              p_cost_price: Number(costPrice) || 0,
              p_batch_number: batchNo,
              p_expiry_date: openingExpiryDate || null,
              p_created_by: user?.id
            });

            if (rpcErr) throw rpcErr;
          }
        }

      setModalOpen(false);
      fetchCatalogData();
    } catch (err: any) {
      setFormError(err.message || 'Error occurred while saving item.');
    }
  };

  const handleDeleteClick = (id: string) => {
    setItemToDelete(id);
    setDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    try {
      const { error } = await supabase
        .from('inventory_items')
        .update({ status: 'INACTIVE' })
        .eq('id', itemToDelete);
      if (error) throw error;
      setDeleteModalOpen(false);
      setItemToDelete(null);
      fetchCatalogData();
    } catch (err: any) {
      alert(err.message || 'Failed to archive item.');
    }
  };

  return (
    <div className="space-y-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Inventory Catalog</h2>
          <p className="text-sm text-slate-500">Manage ingredients, packaging, and consumables</p>
        </div>
        {canCreate && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => setImportModalOpen(true)}
              className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold rounded-xl text-sm transition-all shadow-sm flex items-center justify-center space-x-2"
            >
              <Upload size={18} />
              <span className="hidden sm:inline">Bulk Import</span>
            </button>
            <button
              onClick={openAddModal}
              className="btn-primary flex items-center justify-center space-x-2"
            >
              <Plus size={18} />
              <span>Add Item</span>
            </button>
          </div>
        )}
      </div>

      {/* Filter panel */}
      <div className="flex flex-col md:flex-row gap-4 items-center bg-white p-4 rounded-2xl border border-slate-100 card-shadow">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3.5 top-3.5 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search by name or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
          />
        </div>
        
        <div className="flex w-full md:w-auto items-center space-x-3 shrink-0">
          <SlidersHorizontal className="text-slate-400" size={18} />
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="flex-1 md:w-48 px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm bg-white text-slate-700"
          >
            <option value="">All Categories</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Grid List Table */}
      <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm card-shadow">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-400 uppercase tracking-wider">
                <th className="px-6 py-4">SKU / Code</th>
                <th className="px-6 py-4">Item Name</th>
                <th className="px-6 py-4">Category</th>
                <th className="px-6 py-4">Sub Category</th>
                <th className="px-6 py-4 text-right">Cost Price</th>
                <th className="px-6 py-4 text-right">Total Stock</th>
                {canCreate && <th className="px-6 py-4 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-400">
                    Loading inventory records...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-400">
                    No items found matching the filter criteria.
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 font-semibold text-slate-800">{item.sku}</td>
                    <td className="px-6 py-4 font-medium">
                      <button
                        onClick={() => {
                          setSelectedBatchItem(item);
                          setBatchModalOpen(true);
                        }}
                        className="text-primary hover:text-blue-700 hover:underline font-semibold text-left focus:outline-none"
                      >
                        {item.name}
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      <span className="bg-slate-100 text-slate-600 text-xs font-semibold px-2 py-0.5 rounded">
                        {item.categories?.name}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-500">{item.subcategories?.name || '-'}</td>
                    <td className="px-6 py-4 font-semibold text-slate-700 text-right">
                      {item.cost_price ? `LKR ${Number(item.cost_price).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}` : '-'}
                    </td>
                    <td className="px-6 py-4 font-semibold text-slate-700 text-right">
                      {Number((item.batches?.reduce((acc: number, b: any) => acc + Number(b.available_qty || 0), 0) || 0).toFixed(3))}{' '}
                      <span className="text-xs text-slate-400 font-normal">{item.units?.abbreviation || ''}</span>
                    </td>
                    {canCreate && (
                      <td className="px-6 py-4 text-right space-x-2.5">
                        <button
                          onClick={() => openEditModal(item)}
                          className="p-1.5 text-slate-400 hover:text-primary hover:bg-blue-50 rounded-lg transition-all"
                        >
                          <Edit3 size={16} />
                        </button>
                        {canDelete && (
                          <button
                            onClick={() => handleDeleteClick(item.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      {importModalOpen && (
        <BulkImportModal 
          onClose={() => setImportModalOpen(false)} 
          onSuccess={() => {
            setImportModalOpen(false);
            fetchCatalogData();
          }}
        />
      )}

      {/* Catalog Dialog Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900 bg-opacity-40 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-100 w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-6 card-shadow">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h3 className="text-lg font-bold text-slate-800">
                {editingItem ? 'Edit Inventory Item' : 'Add New Item'}
              </h3>
              <button 
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                Cancel
              </button>
            </div>

            {formError && (
              <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-xl flex items-start space-x-3">
                <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={18} />
                <div className="text-xs font-semibold text-red-700">{formError}</div>
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-6">
              
              {/* Basic Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">Item Name</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Milk Bottle 2L"
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">SKU Code (Optional)</label>
                  <input
                    type="text"
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    placeholder="Leave blank to auto-generate"
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm uppercase"
                  />
                </div>
              </div>

              {/* Category, subcategory & supplier */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5 relative">
                  <label className="text-xs font-bold text-slate-500 uppercase">Category</label>
                  <input
                    type="text"
                    value={categoryInput}
                    onChange={(e) => handleCategoryInputChange(e.target.value)}
                    onFocus={() => setCategoryDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setCategoryDropdownOpen(false), 150)}
                    placeholder="Type to search or add category..."
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm bg-white"
                    autoComplete="off"
                  />
                  {categoryDropdownOpen && (filteredCategories.length > 0 || categoryInput.trim()) && (
                    <ul className="absolute z-50 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
                      {filteredCategories.map((c) => (
                        <li
                          key={c.id}
                          onMouseDown={() => handleCategorySelect(c)}
                          className={`px-4 py-2.5 text-sm cursor-pointer hover:bg-blue-50 hover:text-primary transition-colors ${
                            c.id === categoryId ? 'bg-blue-50 text-primary font-semibold' : 'text-slate-700'
                          }`}
                        >
                          {c.name}
                        </li>
                      ))}
                      {categoryInput.trim() && !categories.find(c => c.name.toLowerCase() === categoryInput.toLowerCase()) && (
                        <li
                          onMouseDown={handleAddNewCategory}
                          className="px-4 py-2.5 text-sm cursor-pointer flex items-center space-x-2 border-t border-slate-100 text-primary font-semibold hover:bg-blue-50 transition-colors"
                        >
                          {addingCategory ? (
                            <>
                              <svg className="animate-spin h-3.5 w-3.5 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                              </svg>
                              <span>Saving...</span>
                            </>
                          ) : (
                            <>
                              <Plus size={14} />
                              <span>Add "{categoryInput}" as new category</span>
                            </>
                          )}
                        </li>
                      )}
                    </ul>
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">Sub Category (Optional)</label>
                  <select
                    value={subcategoryId}
                    onChange={(e) => setSubcategoryId(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm bg-white"
                  >
                    <option value="">None</option>
                    {subcategories.filter(s => s.category_id === categoryId).map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Base Unit */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-slate-100 pt-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">Base Unit of Measure</label>
                  <select
                    value={baseUnitId}
                    onChange={(e) => setBaseUnitId(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm bg-white"
                  >
                    <option value="">Select a unit</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>{u.name} ({u.abbreviation})</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Pricing */}
              <div className="border-t border-slate-100 pt-4">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">💰 Pricing</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase">Cost Price (LKR)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.001"
                      value={costPrice}
                      onChange={(e) => setCostPrice(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                    />
                    <p className="text-xs text-slate-400">Price you pay when purchasing this item</p>
                  </div>
                </div>
              </div>

              {/* Reorder Level */}
              <div className="border-t border-slate-100 pt-4">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">📊 Stock Threshold</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase">Reorder Level</label>
                    <input
                      type="number" min="0" step="0.001"
                      value={reorderLevel}
                      onChange={(e) => setReorderLevel(e.target.value)}
                      placeholder="e.g. 20"
                      className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                    />
                    <p className="text-xs text-slate-400">Alert when stock falls below this level</p>
                  </div>
                </div>
              </div>

              {/* Tracking Toggles */}
              <div className="flex items-center space-x-6 border-t border-slate-100 pt-4">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isBatchTracked}
                    onChange={(e) => setIsBatchTracked(e.target.checked)}
                    className="rounded text-primary border-slate-200 focus:ring-primary h-4 w-4"
                  />
                  <span className="text-sm font-semibold text-slate-700">Track Batches</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isExpiryTracked}
                    onChange={(e) => setIsExpiryTracked(e.target.checked)}
                    className="rounded text-primary border-slate-200 focus:ring-primary h-4 w-4"
                  />
                  <span className="text-sm font-semibold text-slate-700">Track Expiration</span>
                </label>
              </div>

              {/* Opening Stock — only for new items */}
              {!editingItem && (
                <div className="border-t border-slate-100 pt-4 bg-green-50/50 rounded-xl p-4 -mx-1">
                  <p className="text-xs font-bold text-green-700 uppercase tracking-widest mb-1">📦 Opening Stock (Optional)</p>
                  <p className="text-xs text-green-600 mb-4">Add the current stock you have on hand. Leave blank if you'll receive stock via a Purchase Order later.</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase">Quantity</label>
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        value={openingQty}
                        onChange={(e) => setOpeningQty(e.target.value)}
                        placeholder="e.g. 50"
                        className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-400 text-sm bg-white"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase">Batch No. (Optional)</label>
                      <input
                        type="text"
                        value={openingBatchNo}
                        onChange={(e) => setOpeningBatchNo(e.target.value)}
                        placeholder="Auto-generated if blank"
                        className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-400 text-sm bg-white"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase">Expiry Date (Optional)</label>
                      <input
                        type="date"
                        value={openingExpiryDate}
                        onChange={(e) => setOpeningExpiryDate(e.target.value)}
                        className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-400 text-sm bg-white"
                      />
                    </div>
                  </div>
                  {openingQty && Number(openingQty) > 0 && (
                    <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-green-700 bg-green-100 px-3 py-2 rounded-lg">
                      <span>✓</span>
                      <span>{openingQty} units will be added to stock at LKR {costPrice || '0'} per unit</span>
                    </div>
                  )}
                </div>
              )}

              {/* Submit Buttons */}
              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-5 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold rounded-xl text-sm transition-all"
                >
                  Close
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-primary text-white hover:bg-opacity-90 font-semibold rounded-xl text-sm transition-all shadow-sm shadow-blue-500/10 active:scale-95"
                >
                  {editingItem ? 'Save Updates' : 'Add Item'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={deleteModalOpen}
        title="Delete Inventory Item"
        message="Are you sure you want to delete this item? It will no longer appear in active catalog searches or PO drafts."
        confirmText="Delete Item"
        onConfirm={confirmDelete}
        onCancel={() => {
          setDeleteModalOpen(false);
          setItemToDelete(null);
        }}
      />

       {/* Batch Details Modal */}
       {batchModalOpen && selectedBatchItem && (
         <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900 bg-opacity-40 backdrop-blur-sm overflow-y-auto">
           <div className="bg-white rounded-2xl border border-slate-100 w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-6 card-shadow flex flex-col">
             <div className="flex items-center justify-between border-b border-slate-100 pb-4">
               <div>
                 <h3 className="text-lg font-bold text-slate-800">Batch-wise Stock Levels</h3>
                 <p className="text-xs text-slate-500 mt-1">{selectedBatchItem.name} ({selectedBatchItem.sku})</p>
               </div>
               <button 
                 onClick={() => setBatchModalOpen(false)}
                 className="text-slate-400 hover:text-slate-600 transition-colors"
               >
                 <X size={20} />
               </button>
             </div>

             <div className="grid grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl text-sm">
               <div>
                 <p className="text-slate-400 font-semibold text-[10px] uppercase">Base Unit</p>
                 <p className="font-bold text-slate-700">{selectedBatchItem.units?.abbreviation || 'N/A'}</p>
               </div>
               <div>
                 <p className="text-slate-400 font-semibold text-[10px] uppercase">Reorder Level</p>
                 <p className="font-bold text-rose-600">{selectedBatchItem.reorder_level || 0} {selectedBatchItem.units?.abbreviation || ''}</p>
               </div>
               <div>
                 <p className="text-slate-400 font-semibold text-[10px] uppercase">Total Available Stock</p>
                 <p className="font-extrabold text-primary">
                    {Number((selectedBatchItem.batches?.reduce((acc: number, b: any) => acc + Number(b.available_qty || 0), 0) || 0).toFixed(3))} {selectedBatchItem.units?.abbreviation || ''}
                 </p>
               </div>
             </div>

             <div className="border border-slate-100 rounded-xl overflow-hidden shadow-sm">
               <div className="overflow-x-auto">
                 <table className="w-full text-left border-collapse text-xs">
                   <thead>
                     <tr className="bg-slate-50 border-b border-slate-100 font-bold text-slate-500 uppercase tracking-wider">
                       <th className="px-4 py-3">Batch Number</th>
                       <th className="px-4 py-3">Received Date</th>
                       <th className="px-4 py-3">Expiry Date</th>
                       <th className="px-4 py-3 text-right">Unit Price</th>
                       <th className="px-4 py-3 text-right">Current Qty</th>
                       <th className="px-4 py-3 text-right">Available Qty</th>
                       <th className="px-4 py-3 text-center">Status</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-100 text-slate-600">
                     {!selectedBatchItem.batches || selectedBatchItem.batches.length === 0 ? (
                       <tr>
                         <td colSpan={7} className="text-center py-6 text-slate-400 font-medium">
                           No batches found for this item.
                         </td>
                       </tr>
                     ) : (
                       selectedBatchItem.batches.map((batch: any) => (
                         <tr key={batch.id} className="hover:bg-slate-50/50 transition-colors">
                           <td className="px-4 py-3 font-semibold text-slate-800">{batch.batch_number}</td>
                           <td className="px-4 py-3">{batch.received_date || '-'}</td>
                           <td className="px-4 py-3 text-rose-600">{batch.expiry_date || 'N/A'}</td>
                           <td className="px-4 py-3 text-right font-medium text-slate-700">
                             {(() => {
                               const stockIn = batch.stock_movements?.find((m: any) => m.type === 'STOCK_IN' && m.cost_price > 0);
                               return stockIn ? Number(stockIn.cost_price).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 }) : '-';
                             })()}
                           </td>
                           <td className="px-4 py-3 text-right font-medium">{batch.current_qty}</td>
                           <td className="px-4 py-3 text-right font-bold text-slate-800">{batch.available_qty}</td>
                           <td className="px-4 py-3 text-center">
                             <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                               batch.status === 'ACTIVE' ? 'bg-green-50 text-green-700 border border-green-200' :
                               batch.status === 'EXPIRED' ? 'bg-red-50 text-red-700 border border-red-200' :
                               'bg-slate-50 text-slate-500 border border-slate-200'
                             }`}>
                               {batch.status}
                             </span>
                           </td>
                         </tr>
                       ))
                     )}
                   </tbody>
                 </table>
               </div>
             </div>

             <div className="flex justify-end pt-2 border-t border-slate-100">
               <button
                 onClick={() => setBatchModalOpen(false)}
                 className="px-5 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold rounded-xl text-sm transition-all"
               >
                 Close Details
               </button>
             </div>
           </div>
         </div>
       )}
    </div>
  );
};
export default Inventory;

