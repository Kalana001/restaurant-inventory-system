import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Search, Eye, CheckCircle2, XCircle, AlertCircle, ShoppingCart, Trash2, PackageSearch, Banknote, UserPlus, ChevronDown } from 'lucide-react';

export const PurchaseOrders: React.FC = () => {
  const { user, hasPermission } = useAuth();
  
  const [pos, setPos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [catalogItems, setCatalogItems] = useState<any[]>([]);

  // Create PO Form States
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [remarks, setRemarks] = useState('');
  const [poLines, setPoLines] = useState<any[]>([]);
  const [poDiscount, setPoDiscount] = useState<number>(0);
  const [poDiscountType, setPoDiscountType] = useState<'fixed' | 'percentage'>('fixed');
  const [formError, setFormError] = useState<string | null>(null);

  // Item Search States
  const [itemSearch, setItemSearch] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Supplier Search States
  const [supplierSearch, setSupplierSearch] = useState('');
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
  const supplierRef = useRef<HTMLDivElement>(null);

  // Quick Create Supplier Modal States
  const [createSupplierOpen, setCreateSupplierOpen] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newSupplierCode, setNewSupplierCode] = useState('');
  const [newSupplierPhone, setNewSupplierPhone] = useState('');
  const [newSupplierEmail, setNewSupplierEmail] = useState('');
  const [newSupplierAddress, setNewSupplierAddress] = useState('');
  const [supplierSaving, setSupplierSaving] = useState(false);
  const [supplierError, setSupplierError] = useState<string | null>(null);

  // Detail View States
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedPo, setSelectedPo] = useState<any | null>(null);
  const [poItems, setPoItems] = useState<any[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Pay Modal States
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [payPo, setPayPo] = useState<any | null>(null);
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payMethod, setPayMethod] = useState<string>('Cash');
  const [chequeDate, setChequeDate] = useState<string>('');
  const [payError, setPayError] = useState<string | null>(null);
  const [payLoading, setPayLoading] = useState(false);

  const fetchPOs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select(`*, suppliers ( name, code ), profiles:created_by ( username )`)
        .order('created_at', { ascending: false });

      if (!error && data) setPos(data);

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

  useEffect(() => { fetchPOs(); }, []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
      if (supplierRef.current && !supplierRef.current.contains(e.target as Node)) {
        setShowSupplierDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const openCreateModal = () => {
    setSelectedSupplier(suppliers[0]?.id || '');
    setSupplierSearch(suppliers[0] ? `${suppliers[0].name} (${suppliers[0].code})` : '');
    setRemarks('');
    setPoLines([]);
    setPoDiscount(0);
    setPoDiscountType('fixed');
    setFormError(null);
    setItemSearch('');
    setShowSuggestions(false);
    setShowSupplierDropdown(false);
    setCreateModalOpen(true);
  };

  const handleCreateSupplier = async () => {
    setSupplierError(null);
    if (!newSupplierName.trim() || !newSupplierCode.trim()) {
      setSupplierError('Supplier name and code are required.');
      return;
    }
    setSupplierSaving(true);
    try {
      const { data, error } = await supabase.from('suppliers').insert({
        name: newSupplierName.trim(),
        code: newSupplierCode.trim().toUpperCase(),
        phone: newSupplierPhone.trim() || null,
        email: newSupplierEmail.trim() || null,
        address: newSupplierAddress.trim() || null,
        status: 'ACTIVE'
      }).select('*').single();
      if (error) throw error;
      setSuppliers(prev => [...prev, data]);
      setSelectedSupplier(data.id);
      setSupplierSearch(`${data.name} (${data.code})`);
      setCreateSupplierOpen(false);
      setNewSupplierName(''); setNewSupplierCode(''); setNewSupplierPhone('');
      setNewSupplierEmail(''); setNewSupplierAddress('');
    } catch (err: any) {
      setSupplierError(err.message || 'Failed to create supplier.');
    } finally {
      setSupplierSaving(false);
    }
  };

  const filteredSuggestions = itemSearch.trim() === '' ? [] : catalogItems.filter(item => 
    item.name.toLowerCase().includes(itemSearch.toLowerCase()) || 
    item.sku.toLowerCase().includes(itemSearch.toLowerCase())
  );

  const selectItemFromSearch = (item: any) => {
    setFormError(null);
    if (poLines.some(l => l.itemId === item.id)) {
      setFormError('Item already added. Adjust quantity below.');
      return;
    }
    
    setPoLines([
      ...poLines,
      {
        itemId: item.id,
        sku: item.sku,
        name: item.name,
        unit: item.units?.abbreviation || 'pcs',
        quantity: 1,
        costPrice: Number(item.cost_price),
        discount: 0,
        discountType: 'fixed',
        totalCost: Number(item.cost_price)
      }
    ]);
    setItemSearch('');
    setShowSuggestions(false);
  };

  const calculateLineTotal = (qty: number, price: number, disc: number, type: 'fixed' | 'percentage') => {
    const baseCost = qty * price;
    if (type === 'percentage') {
      const discAmt = baseCost * (disc / 100);
      return Math.max(0, baseCost - discAmt);
    }
    return Math.max(0, baseCost - disc);
  };

  const updatePoLine = (idx: number, field: 'quantity' | 'costPrice' | 'discount', value: string) => {
    const num = Number(value) || 0;
    setPoLines(prev => {
      const copy = [...prev];
      const line = { ...copy[idx], [field]: num };
      line.totalCost = calculateLineTotal(line.quantity, line.costPrice, line.discount, line.discountType || 'fixed');
      copy[idx] = line;
      return copy;
    });
  };

  const updatePoLineType = (idx: number, type: 'fixed' | 'percentage') => {
    setPoLines(prev => {
      const copy = [...prev];
      const line = { ...copy[idx], discountType: type };
      line.totalCost = calculateLineTotal(line.quantity, line.costPrice, line.discount, type);
      copy[idx] = line;
      return copy;
    });
  };

  const removePoLine = (idx: number) => {
    setPoLines(poLines.filter((_, i) => i !== idx));
  };

  const handleSavePO = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (poLines.length === 0) {
      setFormError('Please add at least one line item to the PO.');
      return;
    }

    try {
      const subTotal = poLines.reduce((acc, curr) => acc + curr.totalCost, 0);
      const calculatedPoDiscountAmount = poDiscountType === 'percentage' 
        ? subTotal * (poDiscount / 100) 
        : poDiscount;
      const grandTotal = Math.max(0, subTotal - calculatedPoDiscountAmount);
      const generatedPoNumber = `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;

      const { data: poHeader, error: poErr } = await supabase
        .from('purchase_orders')
        .insert({
          po_number: generatedPoNumber,
          supplier_id: selectedSupplier,
          status: 'PENDING',
          total_amount: grandTotal,
          discount_amount: calculatedPoDiscountAmount,
          paid_amount: 0,
          remarks: remarks.trim(),
          created_by: user?.id
        })
        .select('*')
        .single();

      if (poErr || !poHeader) throw poErr;

      const poItemsPayload = poLines.map(line => {
        const lineDiscountAmount = line.discountType === 'percentage'
          ? (line.quantity * line.costPrice) * (line.discount / 100)
          : line.discount;
        return {
          po_id: poHeader.id,
          item_id: line.itemId,
          quantity: line.quantity,
          cost_price: line.costPrice,
          discount_amount: lineDiscountAmount,
          total_cost: line.totalCost
        };
      });

      const { error: linesErr } = await supabase.from('purchase_order_items').insert(poItemsPayload);
      if (linesErr) throw linesErr;

      setCreateModalOpen(false);
      fetchPOs();
    } catch (err: any) {
      setFormError(err.message || 'Failed to create Purchase Order.');
    }
  };

  const openDetailModal = async (po: any) => {
    setSelectedPo(po);
    setDetailLoading(true);
    setDetailModalOpen(true);

    try {
      const { data: items, error } = await supabase
        .from('purchase_order_items')
        .select(`id, quantity, cost_price, discount_amount, total_cost, inventory_items ( name, sku, units:units!inventory_items_purchase_unit_id_fkey ( abbreviation ) )`)
        .eq('po_id', po.id);
      if (!error && items) setPoItems(items);
    } catch (err) {
      console.error(err);
    } finally {
      setDetailLoading(false);
    }
  };

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

  const openPayModal = (po: any) => {
    setPayPo(po);
    setPayAmount(Number(po.total_amount) - Number(po.paid_amount || 0));
    setPayMethod('Cash');
    setChequeDate('');
    setPayError(null);
    setPayModalOpen(true);
  };

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    setPayError(null);
    const amount = Number(payAmount);
    const outstanding = Number(payPo.total_amount) - Number(payPo.paid_amount || 0);

    if (amount <= 0) return setPayError('Payment amount must be greater than zero.');
    if (amount > outstanding) return setPayError('Payment cannot exceed the outstanding balance.');
    if (payMethod === 'Cheque' && !chequeDate) return setPayError('Please provide a realize date for the cheque.');

    setPayLoading(true);
    try {
      const { error: insertErr } = await supabase.from('supplier_payments').insert({
        supplier_id: payPo.supplier_id,
        po_id: payPo.id,
        amount,
        payment_method: payMethod,
        cheque_realize_date: payMethod === 'Cheque' ? chequeDate : null,
        notes: `Payment for ${payPo.po_number}`,
        paid_by: user?.id
      });
      if (insertErr) throw insertErr;

      const newPaidAmount = Number(payPo.paid_amount || 0) + amount;
      const { error: updatePoErr } = await supabase.from('purchase_orders').update({ paid_amount: newPaidAmount }).eq('id', payPo.id);
      if (updatePoErr) throw updatePoErr;

      const { data: supData } = await supabase.from('suppliers').select('outstanding_balance').eq('id', payPo.supplier_id).single();
      if (supData) {
        const newBalance = Number(supData.outstanding_balance || 0) - amount;
        await supabase.from('suppliers').update({ outstanding_balance: newBalance }).eq('id', payPo.supplier_id);
      }

      setPayModalOpen(false);
      fetchPOs();
    } catch (err: any) {
      setPayError(err.message || 'Failed to process payment.');
    } finally {
      setPayLoading(false);
    }
  };

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Purchase Orders</h2>
          <p className="text-sm text-slate-500">Create and approve procurement orders sent to vendor channels</p>
        </div>
        <button onClick={openCreateModal} className="btn-primary flex items-center justify-center space-x-2">
          <Plus size={18} /><span>Create PO</span>
        </button>
      </div>

      <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm card-shadow">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-400 uppercase tracking-wider">
                <th className="px-6 py-4">PO Number</th>
                <th className="px-6 py-4">Supplier</th>
                <th className="px-6 py-4">Created By</th>
                <th className="px-6 py-4 text-right">Grand Total (LKR)</th>
                <th className="px-6 py-4 text-center">Status</th>
                <th className="px-6 py-4 text-center">Payment Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 text-sm">
              {loading ? (
                <tr><td colSpan={7} className="text-center py-8 text-slate-400">Loading purchase orders...</td></tr>
              ) : pos.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-slate-400">No purchase orders found.</td></tr>
              ) : (
                pos.map((po) => {
                  const paid = Number(po.paid_amount || 0);
                  const total = Number(po.total_amount);
                  const isPayable = (po.status === 'APPROVED' || po.status === 'COMPLETED') && paid < total;
                  const paymentStatus = paid === 0 ? 'UNPAID' : paid >= total ? 'PAID' : 'PARTIAL';

                  return (
                    <tr key={po.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 font-semibold text-slate-800">{po.po_number}</td>
                      <td className="px-6 py-4 font-medium">{po.suppliers?.name}</td>
                      <td className="px-6 py-4 text-slate-500">{po.profiles?.username || 'System'}</td>
                      <td className="px-6 py-4 font-bold text-right">LKR {total.toFixed(2)}</td>
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase
                          ${po.status === 'PENDING' ? 'bg-amber-50 text-amber-600' : ''}
                          ${po.status === 'APPROVED' ? 'bg-blue-50 text-blue-600' : ''}
                          ${po.status === 'COMPLETED' ? 'bg-green-50 text-green-700' : ''}
                          ${po.status === 'REJECTED' ? 'bg-red-50 text-red-600' : ''}
                          ${po.status === 'CANCELLED' ? 'bg-gray-100 text-gray-500' : ''}
                        `}>{po.status}</span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase
                          ${paymentStatus === 'PAID' ? 'bg-green-50 text-green-600' : ''}
                          ${paymentStatus === 'PARTIAL' ? 'bg-purple-50 text-purple-600' : ''}
                          ${paymentStatus === 'UNPAID' ? 'bg-slate-100 text-slate-500' : ''}
                        `}>{paymentStatus}</span>
                      </td>
                      <td className="px-6 py-4 text-right flex justify-end gap-2 items-center">
                        {isPayable && (
                          <button onClick={() => openPayModal(po)} className="px-3 py-1 bg-primary/10 text-primary hover:bg-primary hover:text-white rounded text-xs font-bold transition-colors">
                            Pay Now
                          </button>
                        )}
                        <button onClick={() => openDetailModal(po)} className="p-1.5 text-slate-400 hover:text-primary hover:bg-blue-50 rounded-lg transition-all">
                          <Eye size={16} />
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

      {/* PO Creation Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900 bg-opacity-40 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-4xl p-6 space-y-6 card-shadow my-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h3 className="text-lg font-bold text-slate-800">Create Purchase Order</h3>
              <button onClick={() => setCreateModalOpen(false)} className="text-slate-400 hover:text-slate-600">Cancel</button>
            </div>

            {formError && (
              <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-xl flex items-start space-x-3">
                <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={18} />
                <div className="text-xs font-semibold text-red-700">{formError}</div>
              </div>
            )}

            <form onSubmit={handleSavePO} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">Vendor Supplier</label>
                  <div ref={supplierRef} className="relative">
                    <div
                      className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-primary cursor-text"
                      onClick={() => setShowSupplierDropdown(true)}
                    >
                      <Search size={14} className="text-slate-400 shrink-0" />
                      <input
                        type="text"
                        value={supplierSearch}
                        onChange={(e) => { setSupplierSearch(e.target.value); setShowSupplierDropdown(true); }}
                        onFocus={() => setShowSupplierDropdown(true)}
                        placeholder="Search supplier..."
                        className="flex-1 text-sm outline-none bg-transparent"
                        autoComplete="off"
                      />
                      <ChevronDown size={14} className="text-slate-400 shrink-0" />
                    </div>
                    {showSupplierDropdown && (
                      <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-52 overflow-y-auto">
                        {suppliers
                          .filter(s =>
                            supplierSearch.trim() === '' ||
                            s.name.toLowerCase().includes(supplierSearch.toLowerCase()) ||
                            s.code.toLowerCase().includes(supplierSearch.toLowerCase())
                          )
                          .map(s => (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => {
                                setSelectedSupplier(s.id);
                                setSupplierSearch(`${s.name} (${s.code})`);
                                setShowSupplierDropdown(false);
                              }}
                              className={`w-full text-left px-4 py-3 hover:bg-blue-50 border-b border-slate-50 transition-colors text-sm ${
                                selectedSupplier === s.id ? 'bg-blue-50 font-semibold text-primary' : 'text-slate-700'
                              }`}
                            >
                              <span className="font-semibold">{s.name}</span>
                              <span className="text-slate-400 text-xs ml-2">({s.code})</span>
                            </button>
                          ))
                        }
                        {suppliers.filter(s =>
                          supplierSearch.trim() === '' ||
                          s.name.toLowerCase().includes(supplierSearch.toLowerCase()) ||
                          s.code.toLowerCase().includes(supplierSearch.toLowerCase())
                        ).length === 0 && (
                          <div className="px-4 py-2 text-xs text-slate-400 text-center italic">No suppliers found</div>
                        )}
                        <button
                          type="button"
                          onClick={() => { setShowSupplierDropdown(false); setCreateSupplierOpen(true); setSupplierError(null); }}
                          className="w-full text-left px-4 py-3 flex items-center gap-2 text-primary font-semibold text-sm hover:bg-blue-50 border-t border-slate-100 transition-colors"
                        >
                          <UserPlus size={14} /> Create New Supplier
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">Remarks / Instructions</label>
                  <input type="text" value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Enter special shipping notes..." className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm" />
                </div>
              </div>

              <div ref={searchRef} className="border border-slate-100 bg-slate-50 p-4 rounded-xl space-y-3">
                <h4 className="text-xs font-bold text-slate-700 uppercase flex items-center gap-2"><PackageSearch size={14} /> Search & Add Item</h4>
                <div className="relative">
                  <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-primary">
                    <Search size={14} className="text-slate-400 shrink-0" />
                    <input type="text" value={itemSearch} onChange={(e) => { setItemSearch(e.target.value); setShowSuggestions(true); }} onFocus={() => setShowSuggestions(true)} placeholder="Type item name or SKU to search..." className="flex-1 text-sm outline-none bg-transparent" />
                  </div>
                  {showSuggestions && filteredSuggestions.length > 0 && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-52 overflow-y-auto">
                      {filteredSuggestions.map(item => (
                        <button key={item.id} type="button" onClick={() => selectItemFromSearch(item)} className="w-full text-left px-4 py-3 hover:bg-blue-50 border-b border-slate-50 transition-colors">
                          <div className="flex justify-between items-center">
                            <div><p className="text-sm font-semibold">{item.name}</p><p className="text-xs text-slate-400">{item.sku}</p></div>
                            <span className="text-xs font-bold text-primary bg-blue-50 px-2 py-1 rounded-lg">LKR {Number(item.cost_price).toFixed(2)}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="border border-slate-100 rounded-xl overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[700px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase">
                      <th className="px-4 py-2.5">Item Name</th>
                      <th className="px-4 py-2.5">Qty</th>
                      <th className="px-4 py-2.5">Unit Cost</th>
                      <th className="px-4 py-2.5">Discount</th>
                      <th className="px-4 py-2.5 text-right">Line Total</th>
                      <th className="px-4 py-2.5 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="text-xs divide-y divide-slate-100">
                    {poLines.length === 0 ? (
                      <tr><td colSpan={6} className="text-center py-4 text-slate-400">No items added to PO yet.</td></tr>
                    ) : (
                      poLines.map((line, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="px-4 py-3 font-medium text-slate-800">{line.name}</td>
                          <td className="px-4 py-2">
                            <input type="number" min="0.001" step="0.001" value={line.quantity || ''} onChange={(e) => updatePoLine(idx, 'quantity', e.target.value)} className="w-20 px-2.5 py-1.5 border-2 border-slate-300 rounded-lg text-center font-bold text-slate-800 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all shadow-sm" /> <span className="text-slate-500 font-medium ml-1">{line.unit}</span>
                          </td>
                          <td className="px-4 py-2">
                            <input type="number" min="0" step="0.01" value={line.costPrice || ''} onChange={(e) => updatePoLine(idx, 'costPrice', e.target.value)} className="w-24 px-2.5 py-1.5 border-2 border-slate-300 rounded-lg font-bold text-slate-800 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all shadow-sm" />
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex items-center space-x-2">
                              <input type="number" min="0" step="0.01" value={line.discount || ''} onChange={(e) => updatePoLine(idx, 'discount', e.target.value)} className="w-20 px-2.5 py-1.5 border-2 border-slate-300 rounded-lg text-right font-bold text-slate-800 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all shadow-sm" />
                              <select
                                value={line.discountType || 'fixed'}
                                onChange={(e) => updatePoLineType(idx, e.target.value as 'fixed' | 'percentage')}
                                className="px-2 py-1.5 border-2 border-slate-300 rounded-lg bg-white font-bold text-slate-800 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all shadow-sm cursor-pointer"
                              >
                                <option value="fixed">LKR</option>
                                <option value="percentage">%</option>
                              </select>
                            </div>
                          </td>
                          <td className="px-4 py-3 font-bold text-slate-800 text-right">LKR {line.totalCost.toFixed(2)}</td>
                          <td className="px-4 py-3 text-center">
                            <button type="button" onClick={() => removePoLine(idx)} className="text-slate-400 hover:text-red-500"><Trash2 size={14} /></button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col items-end space-y-3 pt-4 border-t border-slate-100">
                <div className="flex items-center gap-4 text-sm">
                  <span className="font-bold text-slate-600">Subtotal:</span>
                  <span className="font-semibold w-24 text-right">LKR {poLines.reduce((acc, curr) => acc + curr.totalCost, 0).toFixed(2)}</span>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="font-bold text-slate-600">Overall PO Discount:</span>
                  <div className="flex items-center space-x-1">
                    <input type="number" min="0" step="0.01" value={poDiscount || ''} onChange={(e) => setPoDiscount(Number(e.target.value) || 0)} className="w-20 text-right px-2 py-1 border border-slate-200 rounded" />
                    <select
                      value={poDiscountType}
                      onChange={(e) => setPoDiscountType(e.target.value as 'fixed' | 'percentage')}
                      className="px-1.5 py-1 border border-slate-200 rounded bg-white text-xs"
                    >
                      <option value="fixed">LKR</option>
                      <option value="percentage">%</option>
                    </select>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-lg">
                  <span className="font-bold text-slate-800">Grand Total:</span>
                  <span className="font-extrabold text-primary w-24 text-right">
                    LKR {Math.max(0, poLines.reduce((acc, curr) => acc + curr.totalCost, 0) - (poDiscountType === 'percentage' ? poLines.reduce((acc, curr) => acc + curr.totalCost, 0) * (poDiscount / 100) : poDiscount)).toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => setCreateModalOpen(false)} className="px-5 py-2.5 border border-slate-200 text-slate-700 font-semibold rounded-xl text-sm">Cancel</button>
                <button type="submit" className="px-5 py-2.5 bg-primary text-white font-semibold rounded-xl text-sm shadow-sm active:scale-95">Save Purchase Order</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detailModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900 bg-opacity-40 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-3xl p-6 space-y-6 card-shadow my-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h3 className="text-lg font-bold text-slate-800">Purchase Order Details</h3>
              <button onClick={() => setDetailModalOpen(false)} className="text-slate-400 hover:text-slate-600">Close</button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm bg-slate-50 p-4 rounded-xl">
              <div><p className="text-slate-400 font-semibold text-[10px] uppercase">PO Number</p><p className="font-bold">{selectedPo?.po_number}</p></div>
              <div><p className="text-slate-400 font-semibold text-[10px] uppercase">Supplier</p><p className="font-bold">{selectedPo?.suppliers?.name}</p></div>
              <div><p className="text-slate-400 font-semibold text-[10px] uppercase">Status</p><p className="font-bold text-amber-600">{selectedPo?.status}</p></div>
              <div><p className="text-slate-400 font-semibold text-[10px] uppercase">Paid Amount</p><p className="font-bold text-green-600">LKR {Number(selectedPo?.paid_amount || 0).toFixed(2)}</p></div>
            </div>
            
            <div className="border border-slate-100 rounded-xl overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-100 font-bold text-slate-400 uppercase">
                  <tr><th className="px-4 py-2">Item Name</th><th className="px-4 py-2">Qty</th><th className="px-4 py-2">Unit Cost</th><th className="px-4 py-2">Discount</th><th className="px-4 py-2 text-right">Line Total</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {detailLoading ? <tr><td colSpan={5} className="text-center py-4 text-slate-400">Loading...</td></tr> : poItems.map(item => (
                    <tr key={item.id}>
                      <td className="px-4 py-3">{item.inventory_items?.name}</td>
                      <td className="px-4 py-3">{item.quantity} {item.inventory_items?.units?.abbreviation}</td>
                      <td className="px-4 py-3">LKR {Number(item.cost_price).toFixed(2)}</td>
                      <td className="px-4 py-3 text-red-500">- LKR {Number(item.discount_amount || 0).toFixed(2)}</td>
                      <td className="px-4 py-3 font-bold text-right">LKR {Number(item.total_cost).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col items-end text-sm space-y-1">
              <p className="text-slate-500">Overall PO Discount: <span className="text-red-500 font-semibold">- LKR {Number(selectedPo?.discount_amount || 0).toFixed(2)}</span></p>
              <p className="text-lg font-bold">Grand Total: LKR {Number(selectedPo?.total_amount).toFixed(2)}</p>
            </div>

            {selectedPo?.status === 'PENDING' && hasPermission('po:approve') && (
              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-100">
                <button onClick={() => handleUpdateStatus('REJECTED')} className="px-5 py-2.5 bg-rose-50 text-rose-600 font-bold rounded-xl text-sm">Reject PO</button>
                <button onClick={() => handleUpdateStatus('APPROVED')} className="px-5 py-2.5 bg-blue-600 text-white font-bold rounded-xl text-sm">Approve PO</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pay Now Modal */}
      {payModalOpen && payPo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900 bg-opacity-40">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-6 card-shadow">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Banknote className="text-primary"/> Pay Supplier</h3>
              <button onClick={() => setPayModalOpen(false)} className="text-slate-400 hover:text-slate-600"><XCircle size={20}/></button>
            </div>

            <div className="bg-blue-50 p-4 rounded-xl space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">PO Number:</span><span className="font-semibold text-slate-800">{payPo.po_number}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">PO Total:</span><span className="font-semibold text-slate-800">LKR {Number(payPo.total_amount).toLocaleString(undefined, {minimumFractionDigits: 2})}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Already Paid:</span><span className="font-semibold text-green-600">LKR {Number(payPo.paid_amount || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</span></div>
              <div className="pt-2 mt-2 border-t border-blue-100 flex justify-between font-bold text-base">
                <span className="text-slate-700">Outstanding:</span>
                <span className="text-rose-600">LKR {(Number(payPo.total_amount) - Number(payPo.paid_amount || 0)).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
              </div>
            </div>

            {payError && <div className="text-xs text-red-600 bg-red-50 p-3 rounded-lg border border-red-100">{payError}</div>}

            <form onSubmit={handlePay} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">Payment Amount (LKR)</label>
                <input type="number" step="0.01" value={payAmount} onChange={(e) => setPayAmount(Number(e.target.value))} className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary outline-none" />
              </div>
              
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">Payment Method</label>
                <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary outline-none bg-white">
                  <option value="Cash">Cash</option>
                  <option value="Online Transfer">Online Transfer</option>
                  <option value="Cheque">Cheque</option>
                  <option value="By Restaurant">By Restaurant</option>
                  <option value="From Ovin">From Ovin</option>
                  <option value="By Home">By Home</option>
                </select>
              </div>

              {payMethod === 'Cheque' && (
                <div className="animate-in fade-in slide-in-from-top-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">Cheque Realize Date</label>
                  <input type="date" value={chequeDate} onChange={(e) => setChequeDate(e.target.value)} className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary outline-none" />
                </div>
              )}

              <button type="submit" disabled={payLoading} className="w-full py-3 bg-primary text-white font-bold rounded-xl hover:opacity-90 transition-opacity flex justify-center items-center">
                {payLoading ? 'Processing...' : 'Record Payment'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Quick Create Supplier Modal */}
      {createSupplierOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900 bg-opacity-50">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-primary/10 rounded-lg"><UserPlus size={18} className="text-primary" /></div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">Create New Supplier</h3>
                  <p className="text-xs text-slate-400">Add supplier and auto-select in PO</p>
                </div>
              </div>
              <button onClick={() => setCreateSupplierOpen(false)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
            </div>

            {supplierError && (
              <div className="bg-red-50 border-l-4 border-red-400 p-3 rounded-r-lg text-xs text-red-700 font-semibold flex items-center gap-2">
                <AlertCircle size={14} /> {supplierError}
              </div>
            )}

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase">Supplier Name *</label>
                  <input
                    type="text" value={newSupplierName} onChange={e => setNewSupplierName(e.target.value)}
                    placeholder="e.g. ABC Traders"
                    className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase">Supplier Code *</label>
                  <input
                    type="text" value={newSupplierCode} onChange={e => setNewSupplierCode(e.target.value)}
                    placeholder="e.g. ABC001"
                    className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm uppercase"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase">Phone</label>
                  <input
                    type="text" value={newSupplierPhone} onChange={e => setNewSupplierPhone(e.target.value)}
                    placeholder="e.g. 0771234567"
                    className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase">Email</label>
                  <input
                    type="email" value={newSupplierEmail} onChange={e => setNewSupplierEmail(e.target.value)}
                    placeholder="e.g. info@abc.com"
                    className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">Address</label>
                <input
                  type="text" value={newSupplierAddress} onChange={e => setNewSupplierAddress(e.target.value)}
                  placeholder="Supplier address (optional)"
                  className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setCreateSupplierOpen(false)}
                className="flex-1 py-2.5 border border-slate-200 text-slate-600 font-semibold rounded-xl text-sm hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateSupplier}
                disabled={supplierSaving}
                className="flex-1 py-2.5 bg-primary text-white font-bold rounded-xl text-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
              >
                {supplierSaving ? 'Saving...' : <><UserPlus size={14} /> Create & Select</>}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
export default PurchaseOrders;
