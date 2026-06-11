import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Search, Edit3, Trash2, CreditCard, AlertCircle, X, Clock, Package, DollarSign } from 'lucide-react';
import { ConfirmModal } from '../components/ConfirmModal';
import { format } from 'date-fns';

const PAYMENT_METHODS = ['By Home', 'From Ovin', 'By Restaurant', 'Cheque'];

export const Suppliers: React.FC = () => {
  const { user, hasPermission } = useAuth();
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Form Modal States
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<any | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [creditLimit, setCreditLimit] = useState('500000.00');
  const [formError, setFormError] = useState<string | null>(null);

  // Settlement Modal States
  const [settlementOpen, setSettlementOpen] = useState(false);
  const [targetSupplier, setTargetSupplier] = useState<any | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('By Restaurant');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [settling, setSettling] = useState(false);

  // History Modal
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historySupplier, setHistorySupplier] = useState<any | null>(null);
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Delete Modal States
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [supplierToDelete, setSupplierToDelete] = useState<string | null>(null);

  // Status Filter State
  const [selectedStatus, setSelectedStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');

  const fetchSuppliers = async () => {
    setLoading(true);
    try {
      let query = supabase.from('suppliers').select('*').eq('status', selectedStatus);
      if (search) query = query.ilike('name', `%${search}%`);
      const { data, error } = await query.order('name');
      if (!error && data) setSuppliers(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSuppliers(); }, [search, selectedStatus]);

  const openAddModal = () => {
    setEditingSupplier(null);
    setName(''); setCode(`SUP-${Math.floor(1000 + Math.random() * 9000)}`);
    setPhone(''); setEmail(''); setAddress(''); setCreditLimit('500000.00');
    setFormError(null); setModalOpen(true);
  };

  const openEditModal = (sup: any) => {
    setEditingSupplier(sup);
    setName(sup.name); setCode(sup.code); setPhone(sup.phone || '');
    setEmail(sup.email || ''); setAddress(sup.address || '');
    setCreditLimit(String(sup.credit_limit));
    setFormError(null); setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const payload = {
      name: name.trim(), code: code.trim(),
      phone: phone.trim() || null, email: email.trim() || null,
      address: address.trim() || null, credit_limit: Number(creditLimit), status: 'ACTIVE'
    };
    try {
      if (editingSupplier) {
        const { error } = await supabase.from('suppliers').update(payload).eq('id', editingSupplier.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('suppliers').insert(payload);
        if (error) throw error;
      }
      setModalOpen(false); fetchSuppliers();
    } catch (err: any) {
      setFormError(err.message || 'Error occurred while saving supplier.');
    }
  };

  const openSettlementModal = (sup: any) => {
    setTargetSupplier(sup);
    setPaymentAmount(''); setPaymentMethod('By Restaurant'); setPaymentNotes('');
    setFormError(null); setSettling(false); setSettlementOpen(true);
  };

  const handleSettle = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (Number(paymentAmount) <= 0) { setFormError('Payment amount must be greater than zero.'); return; }
    setSettling(true);
    try {
      const newBalance = Number(targetSupplier.outstanding_balance) - Number(paymentAmount);

      // 1. Update supplier balance
      const { error: balErr } = await supabase
        .from('suppliers')
        .update({ outstanding_balance: Math.max(0, newBalance) })
        .eq('id', targetSupplier.id);
      if (balErr) throw balErr;

      // 2. Log payment to supplier_payments
      const { error: payErr } = await supabase
        .from('supplier_payments')
        .insert({
          supplier_id: targetSupplier.id,
          amount: Number(paymentAmount),
          payment_method: paymentMethod,
          notes: paymentNotes.trim() || null,
          paid_by: user?.id || null,
        });
      if (payErr) console.warn('Payment log failed (table may not exist yet):', payErr.message);

      setSettlementOpen(false);
      fetchSuppliers();
    } catch (err: any) {
      setFormError(err.message || 'Failed to record payment settlement.');
    } finally {
      setSettling(false);
    }
  };

  const openHistoryModal = async (sup: any) => {
    setHistorySupplier(sup);
    setHistoryOpen(true);
    setHistoryLoading(true);
    setHistoryData([]);
    try {
      // Fetch POs
      const { data: pos } = await supabase
        .from('purchase_orders')
        .select('id, po_number, status, total_amount, created_at')
        .eq('supplier_id', sup.id)
        .order('created_at', { ascending: false });

      // Fetch GRNs
      const { data: grns } = await supabase
        .from('grns')
        .select('id, grn_number, total_amount, received_date')
        .eq('supplier_id', sup.id)
        .order('received_date', { ascending: false });

      // Fetch payments
      const { data: payments } = await supabase
        .from('supplier_payments')
        .select('id, amount, payment_method, cheque_realize_date, notes, created_at, profiles:paid_by(username)')
        .eq('supplier_id', sup.id)
        .order('created_at', { ascending: false });

      // Build unified timeline
      const timeline: any[] = [];
      (pos || []).forEach(p => timeline.push({ type: 'PO', date: p.created_at, data: p }));
      (grns || []).forEach(g => timeline.push({ type: 'GRN', date: g.received_date, data: g }));
      (payments || []).forEach(p => timeline.push({ type: 'PAYMENT', date: p.created_at, data: p }));
      timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setHistoryData(timeline);
    } catch (err) {
      console.error(err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleDeleteClick = (id: string) => { setSupplierToDelete(id); setDeleteModalOpen(true); };

  const confirmDelete = async () => {
    if (!supplierToDelete) return;
    try {
      const { error } = await supabase.from('suppliers').update({ status: 'INACTIVE' }).eq('id', supplierToDelete);
      if (error) throw error;
      setDeleteModalOpen(false); setSupplierToDelete(null); fetchSuppliers();
    } catch (err: any) {
      alert(err.message || 'Failed to archive supplier.');
    }
  };

  const handleRestoreSupplier = async (id: string) => {
    try {
      const { error } = await supabase.from('suppliers').update({ status: 'ACTIVE' }).eq('id', id);
      if (error) throw error;
      fetchSuppliers();
    } catch (err: any) {
      alert(err.message || 'Failed to restore supplier.');
    }
  };

  const canWrite = hasPermission('suppliers:create') || hasPermission('suppliers:update') || ['admin','owner','manager'].includes((user?.role?.name || '').toLowerCase());

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Suppliers Catalog</h2>
          <p className="text-sm text-slate-500">Manage vendor profiles and purchase outstanding ledger accounts</p>
        </div>
        {canWrite && (
          <button onClick={openAddModal} className="btn-primary flex items-center justify-center space-x-2">
            <Plus size={18} /><span>Add Supplier</span>
          </button>
        )}
      </div>

      {/* Tabs for Active/Archived */}
      <div className="flex border-b border-slate-200 gap-6">
        <button
          onClick={() => setSelectedStatus('ACTIVE')}
          className={`pb-2.5 text-sm font-semibold border-b-2 transition-all ${
            selectedStatus === 'ACTIVE'
              ? 'border-primary text-primary font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Active Suppliers
        </button>
        <button
          onClick={() => setSelectedStatus('INACTIVE')}
          className={`pb-2.5 text-sm font-semibold border-b-2 transition-all ${
            selectedStatus === 'INACTIVE'
              ? 'border-primary text-primary font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Archived Suppliers
        </button>
      </div>

      {/* Search */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 card-shadow">
        <div className="relative w-full">
          <Search className="absolute left-3.5 top-3.5 text-slate-400" size={18} />
          <input
            type="text" placeholder="Search by supplier name..."
            value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm"
          />
        </div>
      </div>

      {/* Suppliers Table */}
      <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm card-shadow">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-400 uppercase tracking-wider">
                <th className="px-6 py-4">Supplier Name</th>
                <th className="px-6 py-4">Code</th>
                <th className="px-6 py-4">Contact</th>
                <th className="px-6 py-4 text-right">Outstanding Balance</th>
                <th className="px-6 py-4 text-right">Credit Limit</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 text-sm">
              {loading ? (
                <tr><td colSpan={6} className="text-center py-8 text-slate-400">Loading suppliers...</td></tr>
              ) : suppliers.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-slate-400">No suppliers found.</td></tr>
              ) : (
                suppliers.map((sup) => {
                  const balanceRatio = sup.credit_limit > 0 ? sup.outstanding_balance / sup.credit_limit : 0;
                  return (
                    <tr key={sup.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <button
                          onClick={() => openHistoryModal(sup)}
                          className="font-bold text-primary hover:underline text-left"
                        >
                          {sup.name}
                        </button>
                        {sup.email && <p className="text-xs text-slate-400">{sup.email}</p>}
                      </td>
                      <td className="px-6 py-4 font-mono text-xs font-semibold text-slate-500">{sup.code}</td>
                      <td className="px-6 py-4 text-slate-500">{sup.phone || '—'}</td>
                      <td className="px-6 py-4 text-right">
                        <span className={`font-bold text-sm ${sup.outstanding_balance > 0 ? 'text-rose-600' : 'text-green-600'}`}>
                          LKR {Number(sup.outstanding_balance).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                        {sup.credit_limit > 0 && (
                          <div className="mt-1 w-full bg-slate-100 rounded-full h-1.5">
                            <div
                              className={`h-1.5 rounded-full transition-all ${balanceRatio > 0.8 ? 'bg-rose-500' : balanceRatio > 0.5 ? 'bg-amber-500' : 'bg-green-500'}`}
                              style={{ width: `${Math.min(balanceRatio * 100, 100)}%` }}
                            />
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right text-slate-500 text-sm">
                        LKR {Number(sup.credit_limit).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-4 text-right space-x-1">
                        {canWrite && (
                          selectedStatus === 'ACTIVE' ? (
                            <>
                              <button
                                onClick={() => openSettlementModal(sup)}
                                title="Record Payment"
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 rounded-lg transition-colors"
                              >
                                <CreditCard size={12} /> Pay
                              </button>
                              <button
                                onClick={() => openEditModal(sup)}
                                className="p-1.5 text-slate-400 hover:text-primary hover:bg-blue-50 rounded-lg transition-all"
                              >
                                <Edit3 size={16} />
                              </button>
                              <button
                                onClick={() => handleDeleteClick(sup.id)}
                                className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                                title="Archive"
                              >
                                <Trash2 size={16} />
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => handleRestoreSupplier(sup.id)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors active:scale-95"
                            >
                              Restore Supplier
                            </button>
                          )
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

      {/* ── Add/Edit Supplier Modal ── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-100 w-full max-w-lg p-6 space-y-5 card-shadow">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h3 className="text-lg font-bold text-slate-800">{editingSupplier ? 'Edit Supplier' : 'Add New Supplier'}</h3>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            {formError && (
              <div className="bg-red-50 border-l-4 border-red-500 p-3 rounded-r-xl flex items-start gap-2">
                <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={16} />
                <p className="text-xs font-semibold text-red-700">{formError}</p>
              </div>
            )}
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">Supplier Name *</label>
                  <input required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Fresh Farm Supplies" className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">Supplier Code *</label>
                  <input required value={code} onChange={e => setCode(e.target.value)} className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary uppercase" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">Phone</label>
                  <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="07X XXX XXXX" className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="vendor@email.com" className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase">Address</label>
                <textarea value={address} onChange={e => setAddress(e.target.value)} rows={2} placeholder="Full address..." className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase">Credit Limit (LKR)</label>
                <input type="number" min="0" step="0.01" value={creditLimit} onChange={e => setCreditLimit(e.target.value)} className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setModalOpen(false)} className="px-5 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold rounded-xl text-sm">Cancel</button>
                <button type="submit" className="px-5 py-2.5 bg-primary text-white font-bold rounded-xl text-sm hover:bg-opacity-90 active:scale-95 transition-all">
                  {editingSupplier ? 'Save Changes' : 'Add Supplier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Record Payment Modal ── */}
      {settlementOpen && targetSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40">
          <div className="bg-white rounded-2xl border border-slate-100 w-full max-w-md p-6 space-y-5 card-shadow">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Record Payment</h3>
                <p className="text-xs text-slate-500 mt-0.5">Supplier: <span className="font-semibold text-slate-700">{targetSupplier.name}</span></p>
              </div>
              <button onClick={() => setSettlementOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>

            <div className="bg-slate-50 rounded-xl p-3 flex justify-between items-center">
              <span className="text-xs font-bold text-slate-500 uppercase">Outstanding Balance</span>
              <span className="text-lg font-bold text-rose-600">LKR {Number(targetSupplier.outstanding_balance).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>

            {formError && (
              <div className="bg-red-50 border-l-4 border-red-500 p-3 rounded-r-xl flex items-start gap-2">
                <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={16} />
                <p className="text-xs font-semibold text-red-700">{formError}</p>
              </div>
            )}

            <form onSubmit={handleSettle} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase">Payment Amount (LKR) *</label>
                <input
                  type="number" min="0.01" step="0.01" required
                  value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase">Payment Method *</label>
                <div className="grid grid-cols-2 gap-2">
                  {PAYMENT_METHODS.map(method => (
                    <button
                      key={method} type="button"
                      onClick={() => setPaymentMethod(method)}
                      className={`py-2.5 px-3 text-sm font-semibold rounded-xl border transition-all text-left ${
                        paymentMethod === method
                          ? 'bg-primary text-white border-primary'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-primary/40'
                      }`}
                    >
                      {method}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase">Notes (Optional)</label>
                <textarea
                  value={paymentNotes} onChange={e => setPaymentNotes(e.target.value)}
                  rows={2} placeholder="Any additional notes..."
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                />
              </div>

              {paymentAmount && Number(paymentAmount) > 0 && (
                <div className="bg-green-50 border border-green-100 rounded-xl p-3 text-xs font-semibold text-green-700 flex items-center gap-2">
                  <DollarSign size={14} />
                  After payment: LKR {Math.max(0, Number(targetSupplier.outstanding_balance) - Number(paymentAmount)).toLocaleString(undefined, { minimumFractionDigits: 2 })} remaining
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => setSettlementOpen(false)} className="px-5 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold rounded-xl text-sm">Cancel</button>
                <button type="submit" disabled={settling} className="px-5 py-2.5 bg-green-600 text-white font-bold rounded-xl text-sm hover:bg-green-700 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-2">
                  <CreditCard size={16} />
                  {settling ? 'Recording...' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Supplier History Modal ── */}
      {historyOpen && historySupplier && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-slate-900/50 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-100 w-full max-w-2xl my-6 card-shadow flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 shrink-0">
              <div>
                <h3 className="text-lg font-bold text-slate-800">{historySupplier.name}</h3>
                <p className="text-xs text-slate-500 mt-0.5">Full transaction history · Outstanding: <span className="font-bold text-rose-600">LKR {Number(historySupplier.outstanding_balance).toLocaleString()}</span></p>
              </div>
              <button onClick={() => setHistoryOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[70vh]">
              {historyLoading ? (
                <div className="flex items-center justify-center py-12 text-slate-400">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mr-2" />
                  Loading history...
                </div>
              ) : historyData.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <Clock size={40} className="mx-auto mb-3 opacity-30" />
                  <p className="font-medium">No transaction history yet.</p>
                </div>
              ) : (
                <div className="relative">
                  <div className="absolute left-4 top-0 bottom-0 w-px bg-slate-100" />
                  <div className="space-y-4">
                    {historyData.map((item, idx) => (
                      <div key={idx} className="flex gap-4 relative">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 z-10 ${
                          item.type === 'PO' ? 'bg-blue-100' :
                          item.type === 'GRN' ? 'bg-green-100' : 'bg-amber-100'
                        }`}>
                          {item.type === 'PO' && <Package size={14} className="text-blue-600" />}
                          {item.type === 'GRN' && <Package size={14} className="text-green-600" />}
                          {item.type === 'PAYMENT' && <DollarSign size={14} className="text-amber-600" />}
                        </div>
                        <div className={`flex-1 rounded-xl p-4 border text-sm ${
                          item.type === 'PO' ? 'bg-blue-50/50 border-blue-100' :
                          item.type === 'GRN' ? 'bg-green-50/50 border-green-100' : 'bg-amber-50/50 border-amber-100'
                        }`}>
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              {item.type === 'PO' && (
                                <>
                                  <p className="font-bold text-blue-700">Purchase Order Raised</p>
                                  <p className="text-xs text-slate-600 mt-1">PO# <span className="font-mono font-semibold">{item.data.po_number}</span> · Status: <span className="font-semibold">{item.data.status}</span></p>
                                  <p className="text-xs font-bold text-slate-700 mt-1">LKR {Number(item.data.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                                </>
                              )}
                              {item.type === 'GRN' && (
                                <>
                                  <p className="font-bold text-green-700">Goods Received (GRN)</p>
                                  <p className="text-xs text-slate-600 mt-1">GRN# <span className="font-mono font-semibold">{item.data.grn_number}</span></p>
                                  <p className="text-xs font-bold text-slate-700 mt-1">LKR {Number(item.data.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                                </>
                              )}
                              {item.type === 'PAYMENT' && (
                                <>
                                  <p className="font-bold text-amber-700">Payment Recorded</p>
                                  <p className="text-xs text-slate-600 mt-1">
                                    Method: <span className="font-semibold">{item.data.payment_method}</span>
                                    {item.data.payment_method === 'Cheque' && item.data.cheque_realize_date && (
                                      <> · Realizes: <span className="font-semibold">{format(new Date(item.data.cheque_realize_date), 'dd MMM yyyy')}</span></>
                                    )}
                                    {item.data.profiles?.username && <> · By: <span className="font-semibold">{item.data.profiles.username}</span></>}
                                  </p>
                                  {item.data.notes && <p className="text-xs text-slate-500 mt-1 italic">"{item.data.notes}"</p>}
                                  <p className="text-sm font-bold text-green-700 mt-1">− LKR {Number(item.data.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                                </>
                              )}
                            </div>
                            <p className="text-[10px] text-slate-400 font-medium shrink-0 whitespace-nowrap">
                              {format(new Date(item.date), 'dd MMM yyyy')}
                              <br/>{format(new Date(item.date), 'hh:mm a')}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={deleteModalOpen}
        title="Archive Supplier"
        message="Are you sure you want to archive this supplier? They will be hidden from active listings."
        confirmText="Archive"
        onConfirm={confirmDelete}
        onCancel={() => { setDeleteModalOpen(false); setSupplierToDelete(null); }}
      />
    </div>
  );
};
export default Suppliers;
