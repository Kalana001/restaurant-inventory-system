import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Search, Edit3, Trash2, SlidersHorizontal, AlertCircle } from 'lucide-react';

export const Inventory: React.FC = () => {
  const { hasPermission } = useAuth();
  
  // Catalog List States
  const [items, setItems] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter States
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');

  // Form Modal States
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [baseUnitId, setBaseUnitId] = useState('');
  const [purchaseUnitId, setPurchaseUnitId] = useState('');
  const [issueUnitId, setIssueUnitId] = useState('');
  const [purchaseToBaseFactor, setPurchaseToBaseFactor] = useState('1');
  const [issueToBaseFactor, setIssueToBaseFactor] = useState('1');
  const [minStock, setMinStock] = useState('10');
  const [maxStock, setMaxStock] = useState('100');
  const [reorderLevel, setReorderLevel] = useState('20');
  const [costPrice, setCostPrice] = useState('0.00');
  const [sellingPrice, setSellingPrice] = useState('0.00');
  const [isBatchTracked, setIsBatchTracked] = useState(false);
  const [isExpiryTracked, setIsExpiryTracked] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchCatalogData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Inventory Items
      let query = supabase
        .from('inventory_items')
        .select(`
          *,
          categories ( name ),
          suppliers ( name ),
          base_unit:units!inventory_items_base_unit_id_fkey ( abbreviation ),
          purchase_unit:units!inventory_items_purchase_unit_id_fkey ( abbreviation ),
          issue_unit:units!inventory_items_issue_unit_id_fkey ( abbreviation )
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

  useEffect(() => {
    fetchCatalogData();
  }, [search, selectedCategory]);

  const openAddModal = () => {
    setEditingItem(null);
    setSku('');
    setName('');
    setDescription('');
    setCategoryId(categories[0]?.id || '');
    setSupplierId(suppliers[0]?.id || '');
    setBaseUnitId(units[0]?.id || '');
    setPurchaseUnitId(units[0]?.id || '');
    setIssueUnitId(units[0]?.id || '');
    setPurchaseToBaseFactor('1');
    setIssueToBaseFactor('1');
    setMinStock('10');
    setMaxStock('100');
    setReorderLevel('20');
    setCostPrice('0.00');
    setSellingPrice('0.00');
    setIsBatchTracked(false);
    setIsExpiryTracked(false);
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (item: any) => {
    setEditingItem(item);
    setSku(item.sku);
    setName(item.name);
    setDescription(item.description || '');
    setCategoryId(item.category_id);
    setSupplierId(item.supplier_id);
    setBaseUnitId(item.base_unit_id);
    setPurchaseUnitId(item.purchase_unit_id);
    setIssueUnitId(item.issue_unit_id);
    setPurchaseToBaseFactor(String(item.purchase_to_base_factor));
    setIssueToBaseFactor(String(item.issue_to_base_factor));
    setMinStock(String(item.min_stock));
    setMaxStock(String(item.max_stock));
    setReorderLevel(String(item.reorder_level));
    setCostPrice(String(item.cost_price));
    setSellingPrice(String(item.selling_price));
    setIsBatchTracked(item.is_batch_tracked);
    setIsExpiryTracked(item.is_expiry_tracked);
    setFormError(null);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Validate Factors
    if (Number(purchaseToBaseFactor) <= 0 || Number(issueToBaseFactor) <= 0) {
      setFormError('Conversion factors must be greater than zero.');
      return;
    }

    try {
      const selectedCat = categories.find(c => c.id === categoryId);
      const catAbbr = selectedCat ? selectedCat.name.toUpperCase().slice(0, 3) : 'GEN';
      const finalSku = sku.trim() || `INV-${catAbbr}-${Math.floor(1000 + Math.random() * 9000)}`;

      const itemPayload = {
        sku: finalSku,
        name: name.trim(),
        description: description.trim(),
        category_id: categoryId,
        supplier_id: supplierId,
        base_unit_id: baseUnitId,
        purchase_unit_id: purchaseUnitId,
        issue_unit_id: issueUnitId,
        purchase_to_base_factor: Number(purchaseToBaseFactor),
        issue_to_base_factor: Number(issueToBaseFactor),
        min_stock: Number(minStock),
        max_stock: Number(maxStock),
        reorder_level: Number(reorderLevel),
        cost_price: Number(costPrice),
        selling_price: Number(sellingPrice),
        is_batch_tracked: isBatchTracked,
        is_expiry_tracked: isExpiryTracked,
        status: 'ACTIVE'
      };

      if (editingItem) {
        const { error } = await supabase
          .from('inventory_items')
          .update(itemPayload)
          .eq('id', editingItem.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('inventory_items')
          .insert(itemPayload);
        if (error) throw error;
      }

      setModalOpen(false);
      fetchCatalogData();
    } catch (err: any) {
      setFormError(err.message || 'Error occurred while saving item.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to archive this inventory item?')) return;
    try {
      const { error } = await supabase
        .from('inventory_items')
        .update({ status: 'INACTIVE' })
        .eq('id', id);
      if (error) throw error;
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
        {hasPermission('items:create') && (
          <button
            onClick={openAddModal}
            className="btn-primary flex items-center justify-center space-x-2"
          >
            <Plus size={18} />
            <span>Add Catalog Item</span>
          </button>
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
                <th className="px-6 py-4">Supplier</th>
                <th className="px-6 py-4">Units Mapping (P / I / B)</th>
                <th className="px-6 py-4">Default Cost (LKR)</th>
                {hasPermission('items:update') && <th className="px-6 py-4 text-right">Actions</th>}
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
                    <td className="px-6 py-4 font-medium">{item.name}</td>
                    <td className="px-6 py-4">
                      <span className="bg-slate-100 text-slate-600 text-xs font-semibold px-2 py-0.5 rounded">
                        {item.categories?.name}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-500">{item.suppliers?.name}</td>
                    <td className="px-6 py-4 text-xs font-medium text-slate-600">
                      <span>{item.purchase_unit?.abbreviation}</span>
                      <span className="text-slate-300 mx-1">/</span>
                      <span>{item.issue_unit?.abbreviation}</span>
                      <span className="text-slate-300 mx-1">/</span>
                      <span>{item.base_unit?.abbreviation}</span>
                    </td>
                    <td className="px-6 py-4 font-semibold">LKR {Number(item.cost_price).toFixed(2)}</td>
                    {hasPermission('items:update') && (
                      <td className="px-6 py-4 text-right space-x-2.5">
                        <button
                          onClick={() => openEditModal(item)}
                          className="p-1.5 text-slate-400 hover:text-primary hover:bg-blue-50 rounded-lg transition-all"
                        >
                          <Edit3 size={16} />
                        </button>
                        {hasPermission('items:delete') && (
                          <button
                            onClick={() => handleDelete(item.id)}
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

      {/* Catalog Dialog Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900 bg-opacity-40 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-100 w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-6 card-shadow">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h3 className="text-lg font-bold text-slate-800">
                {editingItem ? 'Edit Inventory Item' : 'Register New Item'}
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
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">Category</label>
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm bg-white"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">Default Supplier</label>
                  <select
                    value={supplierId}
                    onChange={(e) => setSupplierId(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm bg-white"
                  >
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Units & Conversions - Hidden for now */}
              {/* <div className="border-t border-slate-100 pt-4 space-y-4">
                <h4 className="text-sm font-bold text-slate-800">Unit of Measure (UOM) Configuration</h4>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase">Purchase Unit</label>
                    <select
                      value={purchaseUnitId}
                      onChange={(e) => setPurchaseUnitId(e.target.value)}
                      className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm bg-white"
                    >
                      {units.map((u) => (
                        <option key={u.id} value={u.id}>{u.name} ({u.abbreviation})</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase">Issue Unit</label>
                    <select
                      value={issueUnitId}
                      onChange={(e) => setIssueUnitId(e.target.value)}
                      className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm bg-white"
                    >
                      {units.map((u) => (
                        <option key={u.id} value={u.id}>{u.name} ({u.abbreviation})</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase">Base Unit</label>
                    <select
                      value={baseUnitId}
                      onChange={(e) => setBaseUnitId(e.target.value)}
                      className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm bg-white"
                    >
                      {units.map((u) => (
                        <option key={u.id} value={u.id}>{u.name} ({u.abbreviation})</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase">1 Purchase Unit = X Base Units</label>
                    <input
                      type="number"
                      step="any"
                      required
                      value={purchaseToBaseFactor}
                      onChange={(e) => setPurchaseToBaseFactor(e.target.value)}
                      className="w-full px-3.5 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase">1 Issue Unit = Y Base Units</label>
                    <input
                      type="number"
                      step="any"
                      required
                      value={issueToBaseFactor}
                      onChange={(e) => setIssueToBaseFactor(e.target.value)}
                      className="w-full px-3.5 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                    />
                  </div>
                </div>
              </div> */}

              {/* Default prices and stock levels */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 border-t border-slate-100 pt-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">Cost Price (LKR)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={costPrice}
                    onChange={(e) => setCostPrice(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">Min Stock</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={minStock}
                    onChange={(e) => setMinStock(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">Reorder Level</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={reorderLevel}
                    onChange={(e) => setReorderLevel(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">Max Stock</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={maxStock}
                    onChange={(e) => setMaxStock(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                  />
                </div>
              </div>

              {/* Toggles */}
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

    </div>
  );
};
export default Inventory;
