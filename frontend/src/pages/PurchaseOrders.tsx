import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Search, Eye, CheckCircle2, XCircle, AlertCircle, ShoppingCart, Trash2, PackageSearch } from 'lucide-react';

export const PurchaseOrders: React.FC = () => {
  const { user, hasPermission } = useAuth();
  
  // List States
  const [pos, setPos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Dropdown lists
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [catalogItems, setCatalogItems] = useState<any[]>([]);

  // Create PO Form States
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [remarks, setRemarks] = useState('');
  const [poLines, setPoLines] = useState<any[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  // Item Search States
  const [itemSearch, setItemSearch] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Detail View States
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedPo, setSelectedPo] = useState<any | null>(null);
  const [poItems, setPoItems] = useState<any[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchPOs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select(`
          *,
          suppliers ( name, code ),
          profiles:created_by ( username )
        `)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setPos(data);
      }

      // Load static helpers
      if (suppliers.length === 0) {
        const { data: sups } = await supabase.from('suppliers').select('*').eq('status', 'ACTIVE');
        if (sups) setSuppliers(sups);

        const { data: items } = await supabase.from('inventory_items').select('*, units:units!inventory_items_purchase_unit_id_fkey(abbreviation)').eq('status', 'ACTIVE');
        if (items) setCatalogItems(items);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPOs();
  }, []);

  // Close suggestions on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const openCreateModal = () => {
    setSelectedSupplier(suppliers[0]?.id || '');
    setRemarks('');
    setPoLines([]);
    setFormError(null);
    setItemSearch('');
    setShowSuggestions(false);
    setCreateModalOpen(true);
      setActivePrice(String(defaultItem.cost_price));
    }
  };

  // Add line to draft PO
  const addPoLine = () => {
    setFormError(null);
    const item = catalogItems.find(i => i.id === activeItemId);
    if (!item) return;

    // Check duplicates
    if (poLines.some(l => l.itemId === activeItemId)) {
      setFormError('Item already added to PO lines. Remove it to change quantities.');
      return;
    }

    const qty = Number(activeQty);
    const price = Number(activePrice);
    if (qty <= 0 || price < 0) {
      setFormError('Quantity and price must be valid.');
      return;
    }

    setPoLines([
      ...poLines,
      {
        itemId: item.id,
        sku: item.sku,
        name: item.name,
        unit: item.units?.abbreviation || 'pcs',
        quantity: qty,
        costPrice: price,
        totalCost: qty * price
      }
    ]);
  };

  const removePoLine = (idx: number) => {
    setPoLines(poLines.filter((_, i) => i !== idx));
  };

  // Submit PO to Supabase
  const handleSavePO = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (poLines.length === 0) {
      setFormError('Please add at least one line item to the PO.');
      return;
    }

    try {
      const grandTotal = poLines.reduce((acc, curr) => acc + curr.totalCost, 0);
      const generatedPoNumber = `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;

      // 1. Insert PO Header
      const { data: poHeader, error: poErr } = await supabase
        .from('purchase_orders')
        .insert({
          po_number: generatedPoNumber,
          supplier_id: selectedSupplier,
          status: 'PENDING',
          total_amount: grandTotal,
          remarks: remarks.trim(),
          created_by: user?.id
        })
        .select('*')
        .single();

      if (poErr || !poHeader) throw poErr;

      // 2. Insert PO Items
      const poItemsPayload = poLines.map(line => ({
        po_id: poHeader.id,
        item_id: line.itemId,
        quantity: line.quantity,
        cost_price: line.costPrice,
        total_cost: line.totalCost
      }));

      const { error: linesErr } = await supabase
        .from('purchase_order_items')
        .insert(poItemsPayload);

      if (linesErr) throw linesErr;

      setCreateModalOpen(false);
      fetchPOs();
    } catch (err: any) {
      setFormError(err.message || 'Failed to submit Purchase Order.');
    }
  };

  // View PO Details Modal
  const openDetailModal = async (po: any) => {
    setSelectedPo(po);
    setDetailLoading(true);
    setDetailModalOpen(true);

    try {
      const { data: items, error } = await supabase
        .from('purchase_order_items')
        .select(`
          id,
          quantity,
          cost_price,
          total_cost,
          inventory_items (
            name,
            sku,
            units:units!inventory_items_purchase_unit_id_fkey ( abbreviation )
          )
        `)
        .eq('po_id', po.id);

      if (!error && items) {
        setPoItems(items);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setDetailLoading(false);
    }
  };

  // Change status of PO (Call Railway API broker)
  const handleUpdateStatus = async (status: 'APPROVED' | 'REJECTED') => {
    try {
      const response = await api.patch(`/purchase-orders/${selectedPo.id}/status`, {
        status,
        remarks: `Updated via system dashboard authorization by ${user?.username}`
      });

      if (response.data.status === 'success') {
        setDetailModalOpen(false);
        fetchPOs();
      }
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to authorize PO status transition.');
    }
  };

  return (
    <div className="space-y-8">
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Purchase Orders</h2>
          <p className="text-sm text-slate-500">Draft and approve procurement orders sent to vendor channels</p>
        </div>
        <button
          onClick={openCreateModal}
          className="btn-primary flex items-center justify-center space-x-2"
        >
          <Plus size={18} />
          <span>Draft PO</span>
        </button>
      </div>

      {/* PO Listing */}
      <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm card-shadow">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-400 uppercase tracking-wider">
                <th className="px-6 py-4">PO Number</th>
                <th className="px-6 py-4">Supplier</th>
                <th className="px-6 py-4">Created By</th>
                <th className="px-6 py-4">Grand Total (LKR)</th>
                <th className="px-6 py-4">Date Issued</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-400">
                    Loading purchase orders log...
                  </td>
                </tr>
              ) : pos.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-400">
                    No purchase orders found.
                  </td>
                </tr>
              ) : (
                pos.map((po) => (
                  <tr key={po.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 font-semibold text-slate-800">{po.po_number}</td>
                    <td className="px-6 py-4 font-medium">{po.suppliers?.name}</td>
                    <td className="px-6 py-4 text-slate-500">{po.profiles?.username || 'System'}</td>
                    <td className="px-6 py-4 font-bold">LKR {Number(po.total_amount).toFixed(2)}</td>
                    <td className="px-6 py-4 text-slate-400">{new Date(po.created_at).toLocaleDateString()}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold uppercase
                        ${po.status === 'PENDING' ? 'bg-amber-50 text-amber-600' : ''}
                        ${po.status === 'APPROVED' ? 'bg-blue-50 text-blue-600' : ''}
                        ${po.status === 'COMPLETED' ? 'bg-green-50 text-green-700' : ''}
                        ${po.status === 'REJECTED' ? 'bg-red-50 text-red-600' : ''}
                        ${po.status === 'CANCELLED' ? 'bg-gray-100 text-gray-500' : ''}
                      `}>
                        {po.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => openDetailModal(po)}
                        className="p-1.5 text-slate-400 hover:text-primary hover:bg-blue-50 rounded-lg transition-all"
                      >
                        <Eye size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* PO Creation Draft Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900 bg-opacity-40 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-100 w-full max-w-3xl p-6 space-y-6 card-shadow">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h3 className="text-lg font-bold text-slate-800">Draft Purchase Order</h3>
              <button onClick={() => setCreateModalOpen(false)} className="text-slate-400 hover:text-slate-600">Cancel</button>
            </div>

            {formError && (
              <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-xl flex items-start space-x-3">
                <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={18} />
                <div className="text-xs font-semibold text-red-700">{formError}</div>
              </div>
            )}

            <form onSubmit={handleSavePO} className="space-y-6">
              
              {/* Header options */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">Vendor Supplier</label>
                  <select
                    value={selectedSupplier}
                    onChange={(e) => setSelectedSupplier(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm bg-white"
                  >
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">Remarks / Instructions</label>
                  <input
                    type="text"
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder="Enter special shipping notes..."
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                  />
                </div>
              </div>

              {/* Search & Add Item Line */}
              <div ref={searchRef} className="border border-slate-100 bg-slate-50 p-4 rounded-xl space-y-3">
                <h4 className="text-xs font-bold text-slate-700 uppercase flex items-center gap-2">
                  <PackageSearch size={14} /> Search & Add Item
                </h4>
                <div className="relative">
                  <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-primary">
                    <Search size={14} className="text-slate-400 shrink-0" />
                    <input
                      type="text"
                      value={itemSearch}
                      onChange={(e) => { setItemSearch(e.target.value); setShowSuggestions(true); }}
                      onFocus={() => setShowSuggestions(true)}
                      placeholder="Type item name or SKU to search..."
                      className="flex-1 text-sm outline-none bg-transparent"
                    />
                    {itemSearch && (
                      <button type="button" onClick={() => { setItemSearch(''); setShowSuggestions(false); }} className="text-slate-300 hover:text-slate-500">
                        ✕
                      </button>
                    )}
                  </div>
                  {showSuggestions && filteredSuggestions.length > 0 && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden max-h-52 overflow-y-auto">
                      {filteredSuggestions.map(item => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => selectItemFromSearch(item)}
                          className="w-full text-left px-4 py-3 hover:bg-blue-50 border-b border-slate-50 last:border-0 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-semibold text-slate-800">{item.name}</p>
                              <p className="text-xs text-slate-400">{item.sku}</p>
                            </div>
                            <span className="text-xs font-bold text-primary bg-blue-50 px-2 py-1 rounded-lg">
                              LKR {Number(item.cost_price).toFixed(2)}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {showSuggestions && itemSearch.length > 0 && filteredSuggestions.length === 0 && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg px-4 py-3 text-sm text-slate-400">
                      No items found matching "{itemSearch}"
                    </div>
                  )}
                </div>
                <p className="text-[10px] text-slate-400">Click an item to add it. Adjust qty and price directly in the table below.</p>
              </div>

              {/* Draft table lists */}
              <div className="border border-slate-100 rounded-xl overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase">
                      <th className="px-4 py-2.5">SKU</th>
                      <th className="px-4 py-2.5">Item Name</th>
                      <th className="px-4 py-2.5">Purchase Qty</th>
                      <th className="px-4 py-2.5">Unit Price (LKR)</th>
                      <th className="px-4 py-2.5">Line Total (LKR)</th>
                      <th className="px-4 py-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="text-xs divide-y divide-slate-100">
                    {poLines.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-4 text-slate-400">No items added to draft PO yet.</td>
                      </tr>
                    ) : (
                      poLines.map((line, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="px-4 py-3 font-semibold text-slate-700">{line.sku}</td>
                          <td className="px-4 py-3 font-medium text-slate-800">{line.name}</td>
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min="1"
                                step="any"
                                value={line.quantity}
                                onChange={(e) => updatePoLine(idx, 'quantity', e.target.value)}
                                className="w-20 px-2 py-1.5 border border-slate-200 rounded-lg text-xs text-center focus:ring-1 focus:ring-primary outline-none"
                              />
                              <span className="text-slate-400 text-xs">{line.unit}</span>
                            </div>
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-slate-400">LKR</span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={line.costPrice}
                                onChange={(e) => updatePoLine(idx, 'costPrice', e.target.value)}
                                className="w-24 px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-primary outline-none"
                              />
                            </div>
                          </td>
                          <td className="px-4 py-3 font-bold text-slate-800">LKR {line.totalCost.toFixed(2)}</td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => removePoLine(idx)}
                              className="text-slate-400 hover:text-red-500 rounded p-1 hover:bg-red-50 transition-all"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Submit panel */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <div className="text-slate-600 text-sm">
                  Grand Total: <span className="font-bold text-lg text-slate-800">LKR {poLines.reduce((acc, curr) => acc + curr.totalCost, 0).toFixed(2)}</span>
                </div>
                <div className="flex items-center space-x-3">
                  <button
                    type="button"
                    onClick={() => setCreateModalOpen(false)}
                    className="px-5 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold rounded-xl text-sm transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-primary text-white hover:bg-opacity-90 font-semibold rounded-xl text-sm transition-all shadow-sm active:scale-95"
                  >
                    Save PO Draft
                  </button>
                </div>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* PO Detail Viewer Modal */}
      {detailModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900 bg-opacity-40 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-100 w-full max-w-2xl p-6 space-y-6 card-shadow">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h3 className="text-lg font-bold text-slate-800">Purchase Order Details</h3>
              <button onClick={() => setDetailModalOpen(false)} className="text-slate-400 hover:text-slate-600">Close</button>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm bg-slate-50 p-4 rounded-xl">
              <div>
                <p className="text-slate-400 font-semibold text-xs uppercase">PO Number</p>
                <p className="font-bold text-slate-800">{selectedPo?.po_number}</p>
              </div>
              <div>
                <p className="text-slate-400 font-semibold text-xs uppercase">Vendor Supplier</p>
                <p className="font-bold text-slate-800">{selectedPo?.suppliers?.name}</p>
              </div>
              <div>
                <p className="text-slate-400 font-semibold text-xs uppercase">Status</p>
                <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold uppercase bg-amber-50 text-amber-600 mt-1">
                  {selectedPo?.status}
                </span>
              </div>
              <div>
                <p className="text-slate-400 font-semibold text-xs uppercase">Grand Total</p>
                <p className="font-extrabold text-slate-800">LKR {Number(selectedPo?.total_amount).toFixed(2)}</p>
              </div>
            </div>

            {/* Line items table */}
            <div className="border border-slate-100 rounded-xl overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50 border-b border-slate-100 text-slate-400 font-bold uppercase">
                  <tr>
                    <th className="px-4 py-2.5">SKU</th>
                    <th className="px-4 py-2.5">Item Name</th>
                    <th className="px-4 py-2.5">PO Qty</th>
                    <th className="px-4 py-2.5">Unit Cost (LKR)</th>
                    <th className="px-4 py-2.5">Line Cost (LKR)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {detailLoading ? (
                    <tr>
                      <td colSpan={5} className="text-center py-4 text-slate-400">Loading line items...</td>
                    </tr>
                  ) : (
                    poItems.map((item) => (
                      <tr key={item.id}>
                        <td className="px-4 py-3 font-semibold">{item.inventory_items?.sku}</td>
                        <td className="px-4 py-3">{item.inventory_items?.name}</td>
                        <td className="px-4 py-3">{item.quantity} {item.inventory_items?.units?.abbreviation}</td>
                        <td className="px-4 py-3 font-semibold">LKR {Number(item.cost_price).toFixed(2)}</td>
                        <td className="px-4 py-3 font-bold text-slate-800">LKR {Number(item.total_cost).toFixed(2)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Action buttons (Approvals check) */}
            {selectedPo?.status === 'PENDING' && hasPermission('po:approve') && (
              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-100">
                <button
                  onClick={() => handleUpdateStatus('REJECTED')}
                  className="px-5 py-2.5 bg-rose-50 text-rose-600 hover:bg-rose-100 font-bold rounded-xl text-sm transition-all inline-flex items-center space-x-2"
                >
                  <XCircle size={16} />
                  <span>Reject PO</span>
                </button>
                <button
                  onClick={() => handleUpdateStatus('APPROVED')}
                  className="px-5 py-2.5 bg-blue-600 text-white hover:bg-blue-700 font-bold rounded-xl text-sm transition-all shadow-sm inline-flex items-center space-x-2 active:scale-95"
                >
                  <CheckCircle2 size={16} />
                  <span>Approve PO</span>
                </button>
              </div>
            )}

          </div>
        </div>
      )}

    </div>
  );
};
export default PurchaseOrders;
