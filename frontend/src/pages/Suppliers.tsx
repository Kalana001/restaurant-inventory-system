import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Search, Edit3, Trash2, ShieldCheck, CreditCard, AlertCircle } from 'lucide-react';
import { ConfirmModal } from '../components/ConfirmModal';

export const Suppliers: React.FC = () => {
  const { hasPermission } = useAuth();
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

  // Delete Modal States
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [supplierToDelete, setSupplierToDelete] = useState<string | null>(null);

  const fetchSuppliers = async () => {
    setLoading(true);
    try {
      let query = supabase.from('suppliers').select('*').eq('status', 'ACTIVE');
      if (search) {
        query = query.ilike('name', `%${search}%`);
      }
      const { data, error } = await query.order('name');
      if (!error && data) {
        setSuppliers(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSuppliers();
  }, [search]);

  const openAddModal = () => {
    setEditingSupplier(null);
    setName('');
    setCode(`SUP-${Math.floor(1000 + Math.random() * 9000)}`);
    setPhone('');
    setEmail('');
    setAddress('');
    setCreditLimit('500000.00');
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (sup: any) => {
    setEditingSupplier(sup);
    setName(sup.name);
    setCode(sup.code);
    setPhone(sup.phone || '');
    setEmail(sup.email || '');
    setAddress(sup.address || '');
    setCreditLimit(String(sup.credit_limit));
    setFormError(null);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const payload = {
      name: name.trim(),
      code: code.trim(),
      phone: phone.trim() || null,
      email: email.trim() || null,
      address: address.trim() || null,
      credit_limit: Number(creditLimit),
      status: 'ACTIVE'
    };

    try {
      if (editingSupplier) {
        const { error } = await supabase
          .from('suppliers')
          .update(payload)
          .eq('id', editingSupplier.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('suppliers')
          .insert(payload);
        if (error) throw error;
      }
      setModalOpen(false);
      fetchSuppliers();
    } catch (err: any) {
      setFormError(err.message || 'Error occurred while saving supplier.');
    }
  };

  const openSettlementModal = (sup: any) => {
    setTargetSupplier(sup);
    setPaymentAmount('');
    setFormError(null);
    setSettlementOpen(true);
  };

  const handleSettle = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (Number(paymentAmount) <= 0) {
      setFormError('Payment amount must be greater than zero.');
      return;
    }

    try {
      const newBalance = Number(targetSupplier.outstanding_balance) - Number(paymentAmount);
      
      const { error } = await supabase
        .from('suppliers')
        .update({ outstanding_balance: newBalance })
        .eq('id', targetSupplier.id);

      if (error) throw error;

      // Log secure audit event of the balance modification
      // Since it's direct client write, normally we want to restrict it, but if RLS permits it, it goes through.
      // In Phase 1 we will execute it client-side.
      
      setSettlementOpen(false);
      fetchSuppliers();
    } catch (err: any) {
      setFormError(err.message || 'Failed to record payment settlement.');
    }
  };

  const handleDeleteClick = (id: string) => {
    setSupplierToDelete(id);
    setDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!supplierToDelete) return;
    try {
      const { error } = await supabase
        .from('suppliers')
        .update({ status: 'INACTIVE' })
        .eq('id', supplierToDelete);
      if (error) throw error;
      setDeleteModalOpen(false);
      setSupplierToDelete(null);
      fetchSuppliers();
    } catch (err: any) {
      alert(err.message || 'Failed to archive supplier.');
    }
  };

  return (
    <div className="space-y-8">
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Suppliers Catalog</h2>
          <p className="text-sm text-slate-500">Manage vendor profiles and purchase outstanding ledger accounts</p>
        </div>
        {hasPermission('suppliers:create') && (
          <button
            onClick={openAddModal}
            className="btn-primary flex items-center justify-center space-x-2"
          >
            <Plus size={18} />
            <span>Add Supplier</span>
          </button>
        )}
      </div>

      {/* Filter panel */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 card-shadow">
        <div className="relative w-full">
          <Search className="absolute left-3.5 top-3.5 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search by supplier name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
          />
        </div>
      </div>

      {/* Table grid listing */}
      <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm card-shadow">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-400 uppercase tracking-wider">
                <th className="px-6 py-4">Code</th>
                <th className="px-6 py-4">Supplier Name</th>
                <th className="px-6 py-4">Contact Phone</th>
                <th className="px-6 py-4">Email</th>
                <th className="px-6 py-4">Outstanding Bal (LKR)</th>
                <th className="px-6 py-4">Credit Limit (LKR)</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-400">
                    Loading suppliers catalog...
                  </td>
                </tr>
              ) : suppliers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-400">
                    No active suppliers found.
                  </td>
                </tr>
              ) : (
                suppliers.map((sup) => (
                  <tr key={sup.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 font-semibold text-slate-800">{sup.code}</td>
                    <td className="px-6 py-4 font-medium">{sup.name}</td>
                    <td className="px-6 py-4 text-slate-500">{sup.phone || 'N/A'}</td>
                    <td className="px-6 py-4 text-slate-500">{sup.email || 'N/A'}</td>
                    <td className="px-6 py-4">
                      <span className={`font-bold ${Number(sup.outstanding_balance) > 0 ? 'text-rose-500' : 'text-slate-500'}`}>
                        LKR {Number(sup.outstanding_balance).toFixed(2)}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-semibold">LKR {Number(sup.credit_limit).toFixed(2)}</td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <button
                        onClick={() => openSettlementModal(sup)}
                        title="Record Payment Settlement"
                        className="p-1.5 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-all inline-flex items-center"
                      >
                        <CreditCard size={16} />
                      </button>
                      {hasPermission('suppliers:update') && (
                        <button
                          onClick={() => openEditModal(sup)}
                          className="p-1.5 text-slate-400 hover:text-primary hover:bg-blue-50 rounded-lg transition-all inline-flex items-center"
                        >
                          <Edit3 size={16} />
                        </button>
                      )}
                      {hasPermission('suppliers:delete') && (
                        <button
                          onClick={() => handleDeleteClick(sup.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all inline-flex items-center"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Supplier Register/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900 bg-opacity-40 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-100 w-full max-w-lg p-6 space-y-6 card-shadow">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h3 className="text-lg font-bold text-slate-800">
                {editingSupplier ? 'Edit Supplier Details' : 'Register Supplier'}
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-slate-600">Cancel</button>
            </div>

            {formError && (
              <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-xl flex items-start space-x-3">
                <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={18} />
                <div className="text-xs font-semibold text-red-700">{formError}</div>
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase">Supplier Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Ceylon Spices Ltd."
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">Supplier Code</label>
                  <input
                    type="text"
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm uppercase"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">Credit Limit (LKR)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={creditLimit}
                    onChange={(e) => setCreditLimit(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">Phone Number</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+94 77 123 4567"
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">Email Address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="sales@ceylonspices.lk"
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase">Office Address</label>
                <textarea
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Street Address, City..."
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm h-20"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-5 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold rounded-xl text-sm transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-primary text-white hover:bg-opacity-90 font-semibold rounded-xl text-sm transition-all shadow-sm active:scale-95"
                >
                  Save Supplier
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment Settlement Modal */}
      {settlementOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900 bg-opacity-40 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-100 w-full max-w-md p-6 space-y-6 card-shadow">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h3 className="text-lg font-bold text-slate-800">Record Supplier Payment</h3>
              <button onClick={() => setSettlementOpen(false)} className="text-slate-400 hover:text-slate-600">Cancel</button>
            </div>

            {formError && (
              <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-xl flex items-start space-x-3">
                <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={18} />
                <div className="text-xs font-semibold text-red-700">{formError}</div>
              </div>
            )}

            <form onSubmit={handleSettle} className="space-y-4">
              <div className="bg-slate-50 p-4 rounded-xl space-y-1 text-sm text-slate-600">
                <p>Supplier: <span className="font-bold text-slate-800">{targetSupplier?.name}</span></p>
                <p>Outstanding: <span className="font-bold text-rose-500">LKR {Number(targetSupplier?.outstanding_balance).toFixed(2)}</span></p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase">Paid Amount (LKR)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="Enter amount to deduct"
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSettlementOpen(false)}
                  className="px-5 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold rounded-xl text-sm transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-green-600 text-white hover:bg-green-700 font-semibold rounded-xl text-sm transition-all shadow-sm active:scale-95"
                >
                  Post Settlement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={deleteModalOpen}
        title="Archive Supplier"
        message="Are you sure you want to archive this supplier profile? They will no longer appear in active searches."
        confirmText="Archive Supplier"
        onConfirm={confirmDelete}
        onCancel={() => {
          setDeleteModalOpen(false);
          setSupplierToDelete(null);
        }}
      />
    </div>
  );
};
export default Suppliers;
