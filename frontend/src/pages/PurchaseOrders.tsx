import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useAutoSave, loadDraft } from '../hooks/useAutoSave';
import {
import { format } from 'date-fns';
  Plus, Search, Eye, AlertCircle, ShoppingCart, Trash2,
  PackageSearch, Banknote, UserPlus, ChevronDown, XCircle,
  PackageCheck, Clock, CheckCircle2, DollarSign
} from 'lucide-react';

export const PurchaseOrders: React.FC = () => {
  const { user, hasPermission } = useAuth();

  const [pos, setPos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [catalogItems, setCatalogItems] = useState<any[]>([]);

  // ── Create PO States ──────────────────────────────────────────
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState(() => loadDraft<string>('po_draft_supplier') || '');
  const [remarks, setRemarks] = useState(() => loadDraft<string>('po_draft_remarks') || '');
  const [poLines, setPoLines] = useState<any[]>(() => loadDraft<any[]>('po_draft_lines') || []);
  const [poDiscount, setPoDiscount] = useState<number>(() => loadDraft<number>('po_draft_discount') || 0);
  const [poDiscountType, setPoDiscountType] = useState<'fixed' | 'percentage'>(() => loadDraft<'fixed' | 'percentage'>('po_draft_discount_type') || 'fixed');

  const { clearDraft: clearSupplier } = useAutoSave('po_draft_supplier', selectedSupplier);
  const { clearDraft: clearRemarks } = useAutoSave('po_draft_remarks', remarks);
  const { clearDraft: clearLines } = useAutoSave('po_draft_lines', poLines);
  const { clearDraft: clearDiscount } = useAutoSave('po_draft_discount', poDiscount);
  const { clearDraft: clearDiscountType } = useAutoSave('po_draft_discount_type', poDiscountType);

  const clearPoDrafts = () => {
    clearSupplier(); clearRemarks(); clearLines(); clearDiscount(); clearDiscountType();
  };
  const [formError, setFormError] = useState<string | null>(null);

  // ── Item Search States ────────────────────────────────────────
  const [itemSearch, setItemSearch] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // ── Supplier Search States ────────────────────────────────────
  const [supplierSearch, setSupplierSearch] = useState('');
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
  const supplierRef = useRef<HTMLDivElement>(null);

  // ── Quick Create Supplier States ──────────────────────────────
  const [createSupplierOpen, setCreateSupplierOpen] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newSupplierCode, setNewSupplierCode] = useState('');
  const [newSupplierPhone, setNewSupplierPhone] = useState('');
  const [newSupplierEmail, setNewSupplierEmail] = useState('');
  const [newSupplierAddress, setNewSupplierAddress] = useState('');
  const [supplierSaving, setSupplierSaving] = useState(false);
  const [supplierError, setSupplierError] = useState<string | null>(null);

  // ── Detail View States ────────────────────────────────────────
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedPo, setSelectedPo] = useState<any | null>(null);
  const [poItems, setPoItems] = useState<any[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // ── GRN States ────────────────────────────────────────────────
  const [grnModalOpen, setGrnModalOpen] = useState(false);
  const [grnPo, setGrnPo] = useState<any | null>(null);
  const [grnInvoiceNumber, setGrnInvoiceNumber] = useState('');
  const [grnRemarks, setGrnRemarks] = useState('');
  const [grnLoading, setGrnLoading] = useState(false);
  const [grnError, setGrnError] = useState<string | null>(null);
  const [grnItems, setGrnItems] = useState<any[]>([]);

  // ── Pay Modal States ──────────────────────────────────────────
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [payPo, setPayPo] = useState<any | null>(null);
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payMethod, setPayMethod] = useState<string>('Cash');
  const [payDate, setPayDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [chequeDate, setChequeDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [payError, setPayError] = useState<string | null>(null);
  const [payLoading, setPayLoading] = useState(false);

  // ── Update Prices States ──────────────────────────────────────────────
  const [updatePricesModalOpen, setUpdatePricesModalOpen] = useState(false);
  const [updatePricesPo, setUpdatePricesPo] = useState<any | null>(null);
  const [updatePricesLines, setUpdatePricesLines] = useState<any[]>([]);
  const [updatePricesLoading, setUpdatePricesLoading] = useState(false);
  const [updatePricesError, setUpdatePricesError] = useState<string | null>(null);

  // ─────────────────────────────────────────────────────────────
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

        const { data: items } = await supabase
          .from('inventory_items')
          .select('*, units:units!inventory_items_purchase_unit_id_fkey(abbreviation)')
          .eq('status', 'ACTIVE');
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
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowSuggestions(false);
      if (supplierRef.current && !supplierRef.current.contains(e.target as Node)) setShowSupplierDropdown(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // ── Open Create PO Modal ──────────────────────────────────────
  const openCreateModal = () => {
    setSelectedSupplier('');
    setSupplierSearch('');
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

  // ── Quick Create Supplier ─────────────────────────────────────
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

  // ── Item Search Helpers ───────────────────────────────────────
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
    setPoLines([...poLines, {
      itemId: item.id,
      sku: item.sku,
      name: item.name,
      unit: item.units?.abbreviation || 'pcs',
      quantity: 1,
      costPrice: Number(item.cost_price),
      discount: 0,
      discountType: 'fixed',
      totalCost: Number(item.cost_price)
    }]);
    setItemSearch('');
    setShowSuggestions(false);
  };

  const calculateLineTotal = (qty: number, price: number, disc: number, type: 'fixed' | 'percentage') => {
    const baseCost = qty * price;
    if (type === 'percentage') return Math.max(0, baseCost - baseCost * (disc / 100));
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

  const removePoLine = (idx: number) => setPoLines(poLines.filter((_, i) => i !== idx));

  // ── Save PO ───────────────────────────────────────────────────
  const handleCancelPO = () => {
    clearPoDrafts();
    setCreateModalOpen(false);
    setSelectedSupplier(''); setRemarks(''); setPoLines([]); setPoDiscount(0); setPoDiscountType('fixed');
  };

  const handleSavePO = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (poLines.length === 0) { setFormError('Please add at least one line item to the PO.'); return; }
    try {
      const subTotal = poLines.reduce((acc, curr) => acc + curr.totalCost, 0);
      const discountAmount = poDiscountType === 'percentage' ? subTotal * (poDiscount / 100) : poDiscount;
      const grandTotal = Math.max(0, subTotal - discountAmount);
      const generatedPoNumber = `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;

      const { data: poHeader, error: poErr } = await supabase.from('purchase_orders').insert({
        po_number: generatedPoNumber,
        supplier_id: selectedSupplier,
        status: 'PENDING',
        total_amount: grandTotal,
        discount_amount: discountAmount,
        paid_amount: 0,
        remarks: remarks.trim(),
        created_by: user?.id
      }).select('*').single();

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

      clearPoDrafts();
      handleCancelPO();
      setSelectedSupplier(''); setRemarks(''); setPoLines([]); setPoDiscount(0); setPoDiscountType('fixed');
      fetchPOs();
    } catch (err: any) {
      setFormError(err.message || 'Failed to create Purchase Order.');
    }
  };

  // ── Detail Modal ──────────────────────────────────────────────
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
    } catch (err) { console.error(err); }
    finally { setDetailLoading(false); }
  };

  // ── Open GRN Modal ────────────────────────────────────────────
  const openGrnModal = async (po: any) => {
    setGrnPo(po);
    setGrnInvoiceNumber('');
    setGrnRemarks('');
    setGrnError(null);
    // Load PO items as GRN line items (quantity pre-filled from PO)
    const { data: items } = await supabase
      .from('purchase_order_items')
      .select(`id, quantity, cost_price, total_cost, item_id, inventory_items ( name, sku, units:units!inventory_items_purchase_unit_id_fkey ( abbreviation ) )`)
      .eq('po_id', po.id);
    if (items) {
      setGrnItems(items.map(i => ({
        itemId: i.item_id,
        name: i.inventory_items?.name,
        unit: i.inventory_items?.units?.abbreviation || 'pcs',
        quantity: i.quantity,
        costPrice: Number(i.cost_price),
        expiryDate: format(new Date(), 'yyyy-MM-dd')
      })));
    }
    setGrnModalOpen(true);
  };

  // ── Save GRN ──────────────────────────────────────────────────
  const handleSaveGRN = async () => {
    setGrnError(null);
    setGrnLoading(true);
    try {
      const payload = {
        poId: grnPo.id,
        supplierId: grnPo.supplier_id,
        invoiceNumber: grnInvoiceNumber.trim() || null,
        totalAmount: Number(grnPo.total_amount),
        remarks: grnRemarks.trim(),
        items: grnItems.map(i => ({
          item_id: i.itemId,
          quantity: Number(i.quantity),
          cost_price: Number(i.costPrice),
          expiry_date: i.expiryDate || null,
          batch_number: `GRN-${Date.now()}-${i.itemId.slice(0, 6)}`
        }))
      };
      const response = await api.post('/grns', payload);
      if (response.data.status === 'success') {
        // Mark PO as COMPLETED
        await supabase.from('purchase_orders').update({ status: 'COMPLETED' }).eq('id', grnPo.id);
        setGrnModalOpen(false);
        fetchPOs();
      }
    } catch (err: any) {
      setGrnError(err.response?.data?.message || err.message || 'Failed to process GRN.');
    } finally {
      setGrnLoading(false);
    }
  };

  // ── Pay Modal ─────────────────────────────────────────────────
  const openPayModal = (po: any) => {
    setPayPo(po);
    setPayAmount(Number(po.total_amount) - Number(po.paid_amount || 0));
    setPayMethod('Cash');
    setPayDate(format(new Date(), 'yyyy-MM-dd'));
    setChequeDate(format(new Date(), 'yyyy-MM-dd'));
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
    if (payMethod === 'Cheque' && !chequeDate) return setPayError('Please provide a cheque realize date.');

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
      const { error: updatePoErr } = await supabase.from('purchase_orders')
        .update({ paid_amount: newPaidAmount })
        .eq('id', payPo.id);
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

  // ── Helpers ───────────────────────────────────────────────────

  // ── Update Prices ───────────────────────────────────────────────────────────
  const handleOpenUpdatePrices = async (po: any) => {
    setUpdatePricesPo(po);
    setUpdatePricesError(null);
    setUpdatePricesModalOpen(true);
    setUpdatePricesLoading(true);
    try {
      const { data, error } = await supabase
        .from('purchase_order_items')
        .select(`id, quantity, cost_price, total_cost, item_id, inventory_items ( name, sku, units:units!inventory_items_purchase_unit_id_fkey ( abbreviation ) )`)
        .eq('po_id', po.id);
      if (error) throw error;
      // Initialize with existing data, defaulting to 0 if it was missing/0
      const lines = data.map(d => ({
        ...d,
        new_cost_price: d.cost_price || 0
      }));
      setUpdatePricesLines(lines);
    } catch (err: any) {
      setUpdatePricesError('Failed to load PO items: ' + err.message);
    } finally {
      setUpdatePricesLoading(false);
    }
  };

  const handleUpdatePrices = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdatePricesError(null);
    setUpdatePricesLoading(true);

    try {
      let newTotal = 0;
      // 1. Update all items
      for (const line of updatePricesLines) {
        const costPrice = Number(line.new_cost_price) || 0;
        const totalCost = costPrice * Number(line.quantity);
        newTotal += totalCost;

        const { error } = await supabase.from('purchase_order_items')
          .update({ cost_price: costPrice, total_cost: totalCost })
          .eq('id', line.id);
        if (error) throw error;
      }

      // 2. We keep the discount amount as is or calculate it? 
      // The user didn't specify, so we will keep the existing discount_amount or zero it if we wanted.
      // We'll leave discount amount as it was in the DB, but just recalculate grand total.
      const discountAmount = Number(updatePricesPo.discount_amount || 0);
      const grandTotal = Math.max(0, newTotal - discountAmount);

      const { error: poErr } = await supabase.from('purchase_orders')
        .update({ total_amount: grandTotal })
        .eq('id', updatePricesPo.id);
      if (poErr) throw poErr;

      setUpdatePricesModalOpen(false);
      fetchPOs();
    } catch (err: any) {
      setUpdatePricesError('Failed to update prices: ' + err.message);
    } finally {
      setUpdatePricesLoading(false);
    }
  };

  const getPaymentStatus = (po: any) => {
    const paid = Number(po.paid_amount || 0);
    const total = Number(po.total_amount);
    if (total === 0 && paid === 0) return 'UNPAID';
    if (paid >= total) return 'PAID';
    if (paid > 0) return 'PARTIAL';
    return 'UNPAID';
  };

  const filteredPos = pos.filter(p =>
    p.po_number?.toLowerCase().includes(search.toLowerCase()) ||
    p.suppliers?.name?.toLowerCase().includes(search.toLowerCase())
  );

  const subTotal = poLines.reduce((acc, curr) => acc + curr.totalCost, 0);
  const discountAmount = poDiscountType === 'percentage' ? subTotal * (poDiscount / 100) : poDiscount;
  const grandTotal = Math.max(0, subTotal - discountAmount);

  // ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8 pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Purchase Orders</h2>
          <p className="text-sm text-slate-500">Create POs, receive goods (GRN) and record payments independently</p>
        </div>
        <button onClick={openCreateModal} className="btn-primary flex items-center justify-center space-x-2">
          <Plus size={18} /><span>Create PO</span>
        </button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-3 py-2.5 w-full max-w-sm">
        <Search size={16} className="text-slate-400" />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by PO number or supplier..." className="flex-1 text-sm outline-none bg-transparent" />
      </div>

      {/* PO Table */}
      <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm card-shadow">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-400 uppercase tracking-wider">
                <th className="px-6 py-4">PO Number</th>
                <th className="px-6 py-4">Supplier</th>
                <th className="px-6 py-4">Created By</th>
                <th className="px-6 py-4 text-right">Grand Total (LKR)</th>
                <th className="px-6 py-4 text-center">GRN Status</th>
                <th className="px-6 py-4 text-center">Payment</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 text-sm">
              {loading ? (
                <tr><td colSpan={7} className="text-center py-8 text-slate-400">Loading purchase orders...</td></tr>
              ) : filteredPos.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-slate-400">No purchase orders found.</td></tr>
              ) : (
                filteredPos.map((po) => {
                  const paymentStatus = getPaymentStatus(po);
                  const grnDone = po.status === 'COMPLETED';
                  const canGRN = !['COMPLETED', 'CANCELLED', 'REJECTED'].includes(po.status);
                  const canPay = (Number(po.paid_amount || 0) < Number(po.total_amount));

                  return (
                    <tr key={po.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 font-semibold text-slate-800">{po.po_number}</td>
                      <td className="px-6 py-4 font-medium">{po.suppliers?.name}</td>
                      <td className="px-6 py-4 text-slate-500">{po.profiles?.username || 'System'}</td>
                      <td className="px-6 py-4 font-bold text-right">LKR {Number(po.total_amount).toFixed(2)}</td>
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                          grnDone ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-600'
                        }`}>
                          {grnDone ? <><CheckCircle2 size={10}/> Received</> : <><Clock size={10}/> Pending</>}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase
                          ${paymentStatus === 'PAID' ? 'bg-green-50 text-green-600' : ''}
                          ${paymentStatus === 'PARTIAL' ? 'bg-purple-50 text-purple-600' : ''}
                          ${paymentStatus === 'UNPAID' ? 'bg-slate-100 text-slate-500' : ''}
                        `}>{paymentStatus}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2 items-center">
                          {canGRN && (
                            <button
                              onClick={() => openGrnModal(po)}
                              className="px-3 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white rounded text-xs font-bold transition-colors flex items-center gap-1"
                            >
                              <PackageCheck size={12} /> GRN
                            </button>
                          )}
                          {paymentStatus !== 'PAID' && (
                            <button
                              onClick={() => handleOpenUpdatePrices(po)}
                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Update Prices"
                            >
                              <DollarSign size={16} />
                            </button>
                          )}
                          {canPay && (
                            <button
                              onClick={() => openPayModal(po)}
                              className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                              title="Pay"
                            >  <DollarSign size={12} /> Pay
                            </button>
                          )}
                          <button onClick={() => openDetailModal(po)} className="p-1.5 text-slate-400 hover:text-primary hover:bg-blue-50 rounded-lg transition-all">
                            <Eye size={16} />
                          </button>
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

      {/* ── Create PO Modal ────────────────────────────────────── */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900 bg-opacity-40 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-4xl p-6 space-y-6 card-shadow my-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-bold text-slate-800">Create Purchase Order</h3>
                  {(poLines.length > 0 || selectedSupplier || remarks) && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 uppercase tracking-widest">Draft Loaded</span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">Goods can be received later via GRN</p>
              </div>
              <button onClick={() => handleCancelPO()} className="text-slate-400 hover:text-slate-600"><XCircle size={20}/></button>
            </div>

            {formError && (
              <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-xl flex items-start space-x-3">
                <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={18} />
                <div className="text-xs font-semibold text-red-700">{formError}</div>
              </div>
            )}

            <form onSubmit={handleSavePO} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Supplier Search */}
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
                        onChange={e => { setSupplierSearch(e.target.value); setShowSupplierDropdown(true); }}
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
                            <button key={s.id} type="button"
                              onClick={() => { setSelectedSupplier(s.id); setSupplierSearch(`${s.name} (${s.code})`); setShowSupplierDropdown(false); }}
                              className={`w-full text-left px-4 py-3 hover:bg-blue-50 border-b border-slate-50 transition-colors text-sm ${selectedSupplier === s.id ? 'bg-blue-50 font-semibold text-primary' : 'text-slate-700'}`}
                            >
                              <span className="font-semibold">{s.name}</span>
                              <span className="text-slate-400 text-xs ml-2">({s.code})</span>
                            </button>
                          ))
                        }
                        {suppliers.filter(s => supplierSearch.trim() === '' || s.name.toLowerCase().includes(supplierSearch.toLowerCase()) || s.code.toLowerCase().includes(supplierSearch.toLowerCase())).length === 0 && (
                          <div className="px-4 py-2 text-xs text-slate-400 text-center italic">No suppliers found</div>
                        )}
                        <button type="button"
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
                  <input type="text" value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Enter special shipping notes..." className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm" />
                </div>
              </div>

              {/* Item Search */}
              <div ref={searchRef} className="border border-slate-100 bg-slate-50 p-4 rounded-xl space-y-3">
                <h4 className="text-xs font-bold text-slate-700 uppercase flex items-center gap-2"><PackageSearch size={14} /> Search & Add Item</h4>
                <div className="relative">
                  <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-primary">
                    <Search size={14} className="text-slate-400 shrink-0" />
                    <input type="text" value={itemSearch} onChange={e => { setItemSearch(e.target.value); setShowSuggestions(true); }} onFocus={() => setShowSuggestions(true)} placeholder="Type item name or SKU to search..." className="flex-1 text-sm outline-none bg-transparent" />
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

              {/* PO Lines Table */}
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
                            <input type="number" min="0.001" step="0.001" value={line.quantity || ''} onChange={e => updatePoLine(idx, 'quantity', e.target.value)} className="w-20 px-2.5 py-1.5 border-2 border-slate-300 rounded-lg text-center font-bold text-slate-800 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all shadow-sm" /> <span className="text-slate-500 font-medium ml-1">{line.unit}</span>
                          </td>
                          <td className="px-4 py-2">
                            <input type="number" min="0" step="0.001" value={line.costPrice || ''} onChange={e => updatePoLine(idx, 'costPrice', e.target.value)} className="w-24 px-2.5 py-1.5 border-2 border-slate-300 rounded-lg font-bold text-slate-800 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all shadow-sm" />
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex items-center space-x-2">
                              <input type="number" min="0" step="0.01" value={line.discount || ''} onChange={e => updatePoLine(idx, 'discount', e.target.value)} className="w-20 px-2.5 py-1.5 border-2 border-slate-300 rounded-lg text-right font-bold text-slate-800 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all shadow-sm" />
                              <select value={line.discountType || 'fixed'} onChange={e => updatePoLineType(idx, e.target.value as 'fixed' | 'percentage')} className="px-2 py-1.5 border-2 border-slate-300 rounded-lg bg-white font-bold text-slate-800 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all shadow-sm cursor-pointer">
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

              {/* Totals */}
              <div className="flex flex-col items-end space-y-3 pt-4 border-t border-slate-100">
                <div className="flex items-center gap-4 text-sm">
                  <span className="font-bold text-slate-600">Subtotal:</span>
                  <span className="font-semibold w-28 text-right">LKR {subTotal.toFixed(2)}</span>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="font-bold text-slate-600">Overall PO Discount:</span>
                  <div className="flex items-center space-x-1">
                    <input type="number" min="0" step="0.01" value={poDiscount || ''} onChange={e => setPoDiscount(Number(e.target.value) || 0)} className="w-20 text-right px-2 py-1 border border-slate-200 rounded" />
                    <select value={poDiscountType} onChange={e => setPoDiscountType(e.target.value as 'fixed' | 'percentage')} className="px-1.5 py-1 border border-slate-200 rounded bg-white text-xs">
                      <option value="fixed">LKR</option>
                      <option value="percentage">%</option>
                    </select>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-lg">
                  <span className="font-bold text-slate-800">Grand Total:</span>
                  <span className="font-extrabold text-primary w-28 text-right">LKR {grandTotal.toFixed(2)}</span>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => handleCancelPO()} className="px-5 py-2.5 border border-slate-200 text-slate-700 font-semibold rounded-xl text-sm">Cancel</button>
                <button type="submit" className="px-5 py-2.5 bg-primary text-white font-semibold rounded-xl text-sm shadow-sm active:scale-95 flex items-center gap-2">
                  <ShoppingCart size={16} /> Save Purchase Order
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── GRN Modal ──────────────────────────────────────────── */}
      {grnModalOpen && grnPo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900 bg-opacity-40 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-2xl p-6 space-y-5 card-shadow my-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-50 rounded-xl"><PackageCheck size={20} className="text-emerald-600" /></div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Goods Received Note (GRN)</h3>
                  <p className="text-xs text-slate-400">{grnPo.po_number} · {grnPo.suppliers?.name}</p>
                </div>
              </div>
              <button onClick={() => setGrnModalOpen(false)} className="text-slate-400 hover:text-slate-600"><XCircle size={20} /></button>
            </div>

            {grnError && (
              <div className="bg-red-50 border-l-4 border-red-500 p-3 rounded-r-xl text-xs font-semibold text-red-700 flex items-center gap-2">
                <AlertCircle size={14} /> {grnError}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">Invoice / Reference No. <span className="text-slate-300 font-normal">(Optional)</span></label>
                <input type="text" value={grnInvoiceNumber} onChange={e => setGrnInvoiceNumber(e.target.value)} placeholder="e.g. INV-2024-001" className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">Remarks <span className="text-slate-300 font-normal">(Optional)</span></label>
                <input type="text" value={grnRemarks} onChange={e => setGrnRemarks(e.target.value)} placeholder="e.g. All items received in good condition" className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm" />
              </div>
            </div>

            {/* GRN Items */}
            <div className="border border-slate-100 rounded-xl overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-100 font-bold text-slate-400 uppercase">
                  <tr>
                    <th className="px-4 py-2.5">Item</th>
                    <th className="px-4 py-2.5">Qty Received</th>
                    <th className="px-4 py-2.5">Unit Cost</th>
                    <th className="px-4 py-2.5">Expiry Date <span className="text-slate-300 font-normal">(Optional)</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {grnItems.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-medium text-slate-800">{item.name}</td>
                      <td className="px-4 py-2">
                        <input type="number" min="0.001" step="0.001" value={item.quantity || ''}
                          onChange={e => setGrnItems(prev => { const c=[...prev]; c[idx]={...c[idx], quantity: e.target.value}; return c; })}
                          className="w-20 px-2 py-1.5 border-2 border-slate-300 rounded-lg text-center font-bold text-slate-800 focus:border-primary outline-none"
                        /> <span className="text-slate-500 ml-1">{item.unit}</span>
                      </td>
                      <td className="px-4 py-2">
                        <input type="number" min="0" step="0.001" value={item.costPrice || ''}
                          onChange={e => setGrnItems(prev => { const c=[...prev]; c[idx]={...c[idx], costPrice: e.target.value}; return c; })}
                          className="w-24 px-2 py-1.5 border-2 border-slate-300 rounded-lg font-bold text-slate-800 focus:border-primary outline-none"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input type="date" value={item.expiryDate || ''}
                          onChange={e => setGrnItems(prev => { const c=[...prev]; c[idx]={...c[idx], expiryDate: e.target.value}; return c; })}
                          className="px-2 py-1.5 border-2 border-slate-300 rounded-lg text-slate-800 focus:border-primary outline-none"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs text-amber-700 font-medium flex items-start gap-2">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              Confirming GRN will update stock levels and mark this PO as Received. Payment can be made separately.
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={() => setGrnModalOpen(false)} className="flex-1 py-2.5 border border-slate-200 text-slate-600 font-semibold rounded-xl text-sm hover:bg-slate-50 transition-colors">Cancel</button>
              <button onClick={handleSaveGRN} disabled={grnLoading} className="flex-1 py-2.5 bg-emerald-600 text-white font-bold rounded-xl text-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-2">
                {grnLoading ? 'Processing...' : <><PackageCheck size={16} /> Confirm GRN & Update Stock</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Detail Modal ───────────────────────────────────────── */}
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
              <div>
                <p className="text-slate-400 font-semibold text-[10px] uppercase">GRN Status</p>
                <p className={`font-bold ${selectedPo?.status === 'COMPLETED' ? 'text-green-600' : 'text-amber-600'}`}>
                  {selectedPo?.status === 'COMPLETED' ? 'Received' : 'Pending Delivery'}
                </p>
              </div>
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
          </div>
        </div>
      )}

      {/* ── Pay Modal ──────────────────────────────────────────── */}
      {/* UPDATE PRICES MODAL */}
      {updatePricesModalOpen && updatePricesPo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900 bg-opacity-40 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-2xl p-6 space-y-6 card-shadow my-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h3 className="text-lg font-bold text-slate-800">Update Prices for {updatePricesPo.po_number}</h3>
              <button onClick={() => setUpdatePricesModalOpen(false)} className="text-slate-400 hover:text-slate-600"><XCircle size={20}/></button>
            </div>

            {updatePricesError && (
              <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-xl flex items-start gap-3">
                <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={18} />
                <p className="text-sm font-medium text-red-800">{updatePricesError}</p>
              </div>
            )}

            <form onSubmit={handleUpdatePrices} className="space-y-4">
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Item</th>
                      <th className="px-4 py-3 font-semibold text-center">Qty</th>
                      <th className="px-4 py-3 font-semibold text-right">Cost Price</th>
                      <th className="px-4 py-3 font-semibold text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {updatePricesLines.map((line, idx) => {
                      const cost = Number(line.new_cost_price) || 0;
                      const total = cost * Number(line.quantity);
                      return (
                        <tr key={line.id} className="hover:bg-slate-50/50">
                          <td className="px-4 py-3 font-medium text-slate-800">{line.inventory_items?.name}</td>
                          <td className="px-4 py-3 text-center">{line.quantity} {line.inventory_items?.units?.abbreviation}</td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end">
                              <input
                                type="number"
                                step="0.001"
                                required
                                min="0"
                                className="input-field text-right w-32 py-1.5"
                                value={line.new_cost_price}
                                onChange={e => {
                                  const newLines = [...updatePricesLines];
                                  newLines[idx].new_cost_price = e.target.value;
                                  setUpdatePricesLines(newLines);
                                }}
                              />
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-700">
                            {total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl flex justify-between items-center">
                <span className="font-semibold text-slate-600">New Grand Total:</span>
                <span className="text-lg font-bold text-slate-800">
                  LKR {Math.max(0, updatePricesLines.reduce((acc, line) => acc + (Number(line.new_cost_price) || 0) * Number(line.quantity), 0) - Number(updatePricesPo.discount_amount || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => setUpdatePricesModalOpen(false)} className="px-5 py-2.5 border border-slate-200 text-slate-700 font-semibold rounded-xl text-sm hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={updatePricesLoading} className="px-5 py-2.5 bg-blue-600 text-white font-semibold rounded-xl text-sm shadow-sm hover:bg-blue-700 disabled:opacity-50">
                  {updatePricesLoading ? 'Saving...' : 'Save Prices'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {payModalOpen && payPo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900 bg-opacity-40">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-6 card-shadow">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Banknote className="text-primary" /> Pay Supplier</h3>
              <button onClick={() => setPayModalOpen(false)} className="text-slate-400 hover:text-slate-600"><XCircle size={20} /></button>
            </div>

            <div className="bg-blue-50 p-4 rounded-xl space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">PO Number:</span><span className="font-semibold text-slate-800">{payPo.po_number}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">PO Total:</span><span className="font-semibold text-slate-800">LKR {Number(payPo.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Already Paid:</span><span className="font-semibold text-green-600">LKR {Number(payPo.paid_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
              <div className="pt-2 mt-2 border-t border-blue-100 flex justify-between font-bold text-base">
                <span className="text-slate-700">Outstanding:</span>
                <span className="text-rose-600">LKR {(Number(payPo.total_amount) - Number(payPo.paid_amount || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
            </div>

            {payError && <div className="text-xs text-red-600 bg-red-50 p-3 rounded-lg border border-red-100">{payError}</div>}

            <form onSubmit={handlePay} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">Payment Amount (LKR)</label>
                <input type="number" step="0.001" value={payAmount} onChange={e => setPayAmount(Number(e.target.value))} className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary outline-none" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">Payment Date</label>
                <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary outline-none" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">Payment Method</label>
                <select value={payMethod} onChange={e => setPayMethod(e.target.value)} className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary outline-none bg-white">
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
                  <input type="date" value={chequeDate} onChange={e => setChequeDate(e.target.value)} className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary outline-none" />
                </div>
              )}

              <button type="submit" disabled={payLoading} className="w-full py-3 bg-primary text-white font-bold rounded-xl hover:opacity-90 transition-opacity flex justify-center items-center gap-2">
                {payLoading ? 'Processing...' : <><DollarSign size={16}/> Save & Record Payment</>}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Quick Create Supplier Modal ────────────────────────── */}
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
                  <input type="text" value={newSupplierName} onChange={e => setNewSupplierName(e.target.value)} placeholder="e.g. ABC Traders" className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase">Supplier Code *</label>
                  <input type="text" value={newSupplierCode} onChange={e => setNewSupplierCode(e.target.value)} placeholder="e.g. ABC001" className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm uppercase" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase">Phone</label>
                  <input type="text" value={newSupplierPhone} onChange={e => setNewSupplierPhone(e.target.value)} placeholder="e.g. 0771234567" className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase">Email</label>
                  <input type="email" value={newSupplierEmail} onChange={e => setNewSupplierEmail(e.target.value)} placeholder="e.g. info@abc.com" className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm" />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">Address</label>
                <input type="text" value={newSupplierAddress} onChange={e => setNewSupplierAddress(e.target.value)} placeholder="Supplier address (optional)" className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm" />
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setCreateSupplierOpen(false)} className="flex-1 py-2.5 border border-slate-200 text-slate-600 font-semibold rounded-xl text-sm hover:bg-slate-50 transition-colors">Cancel</button>
              <button type="button" onClick={handleCreateSupplier} disabled={supplierSaving} className="flex-1 py-2.5 bg-primary text-white font-bold rounded-xl text-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-2">
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
