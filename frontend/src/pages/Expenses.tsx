import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';
import { Pagination } from '../components/ui/Pagination';
import { Plus, Search, DollarSign, Wallet, Building2, User, ChevronDown, CheckCircle2, Clock, AlertCircle } from 'lucide-react';

export const Expenses: React.FC = () => {
  const { hasPermission } = useAuth();
  
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalCount, setTotalCount] = useState(0);

  // Filters
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<'ALL' | 'RESTAURANT' | 'PERSONAL' | 'JAT'>('ALL');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'UNPAID' | 'PARTIAL' | 'PAID'>('ALL');

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [payModalOpen, setPayModalOpen] = useState(false);

  // Create Form State
  const [newDate, setNewDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [newCategory, setNewCategory] = useState<'RESTAURANT' | 'PERSONAL' | 'JAT'>('RESTAURANT');
  const [newType, setNewType] = useState('ELECTRICITY');
  const [newDesc, setNewDesc] = useState('');
  const [newAmount, setNewAmount] = useState<number | ''>('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);

  // Pay Form State
  const [payExpense, setPayExpense] = useState<any>(null);
  const [payAmount, setPayAmount] = useState<number | ''>('');
  const [payMethod, setPayMethod] = useState('CASH');
  const [payDate, setPayDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [payNotes, setPayNotes] = useState('');
  const [payError, setPayError] = useState<string | null>(null);
  const [payLoading, setPayLoading] = useState(false);

  const fetchExpenses = async () => {
    setLoading(true);
    try {
      let query = supabase.from('expenses').select('*, profiles:created_by(username)', { count: 'exact' });
      
      if (filterCategory !== 'ALL') query = query.eq('category', filterCategory);
      if (filterStatus !== 'ALL') query = query.eq('status', filterStatus);
      if (search) query = query.ilike('description', `%${search}%`);

      query = query.order('date', { ascending: false });

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      const { data, count, error } = await query;
      
      if (!error && data) {
        // Fetch paid amounts for each expense
        const expenseIds = data.map(e => e.id);
        if (expenseIds.length > 0) {
           const { data: payments } = await supabase.from('expense_payments').select('expense_id, amount').in('expense_id', expenseIds);
           const paidMap: Record<string, number> = {};
           payments?.forEach(p => {
              paidMap[p.expense_id] = (paidMap[p.expense_id] || 0) + Number(p.amount);
           });
           
           data.forEach(d => {
              d.paid_amount = paidMap[d.id] || 0;
           });
        }
        setExpenses(data);
      }
      if (count !== null) setTotalCount(count);

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExpenses();
  }, [page, pageSize, filterCategory, filterStatus, search]);

  const handleCreateExpense = async () => {
    setCreateError(null);
    const parsedAmount = Number(newAmount);
    if (!parsedAmount || parsedAmount <= 0) {
       setCreateError("Amount must be greater than zero.");
       return;
    }
    setCreateLoading(true);
    try {
      const { error } = await supabase.from('expenses').insert({
         date: newDate,
         category: newCategory,
         expense_type: newType,
         description: newDesc,
         total_amount: parsedAmount,
         status: 'UNPAID'
      });
      if (error) throw error;
      setCreateModalOpen(false);
      setNewDesc('');
      setNewAmount('');
      fetchExpenses();
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create expense');
    } finally {
      setCreateLoading(false);
    }
  };

  const handlePayExpense = async () => {
    setPayError(null);
    const parsedPayAmount = Number(payAmount);
    if (!parsedPayAmount || parsedPayAmount <= 0) {
      setPayError("Payment amount must be greater than zero.");
      return;
    }
    if (!payExpense) return;
    
    setPayLoading(true);
    try {
      const { error } = await supabase.from('expense_payments').insert({
         expense_id: payExpense.id,
         amount: parsedPayAmount,
         payment_date: payDate,
         payment_method: payMethod,
         notes: payNotes
      });
      if (error) throw error;

      // Update expense status
      const totalPaidNow = Number(payExpense.paid_amount) + parsedPayAmount;
      const newStatus = totalPaidNow >= Number(payExpense.total_amount) ? 'PAID' : 'PARTIAL';
      
      await supabase.from('expenses').update({ status: newStatus }).eq('id', payExpense.id);

      setPayModalOpen(false);
      fetchExpenses();
    } catch (err: any) {
      setPayError(err.message || 'Payment failed');
    } finally {
      setPayLoading(false);
    }
  };

  const openPayModal = (expense: any) => {
    setPayExpense(expense);
    setPayAmount(Math.max(0, Number(expense.total_amount) - Number(expense.paid_amount)));
    setPayMethod('CASH');
    setPayNotes('');
    setPayDate(format(new Date(), 'yyyy-MM-dd'));
    setPayError(null);
    setPayModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Expenses</h1>
          <p className="text-sm text-slate-500 mt-1">Manage utility bills, salaries, and personal expenses.</p>
        </div>
        {hasPermission('expenses:manage') && (
          <button 
            onClick={() => setCreateModalOpen(true)}
            className="inline-flex items-center justify-center space-x-2 bg-primary hover:bg-primary-dark text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm shadow-primary/20 hover:shadow-md hover:shadow-primary/30 active:scale-95"
          >
            <Plus size={18} /><span>Add Expense</span>
          </button>
        )}
      </div>

      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col md:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search descriptions..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm font-medium text-slate-700"
          />
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <select
             value={filterCategory}
             onChange={(e) => { setFilterCategory(e.target.value as any); setPage(1); }}
             className="px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 text-slate-700"
          >
             <option value="ALL">All Categories</option>
             <option value="RESTAURANT">Restaurant</option>
             <option value="JAT">JAT</option>
             <option value="PERSONAL">Personal</option>
          </select>
          <select
             value={filterStatus}
             onChange={(e) => { setFilterStatus(e.target.value as any); setPage(1); }}
             className="px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 text-slate-700"
          >
             <option value="ALL">All Statuses</option>
             <option value="UNPAID">Unpaid</option>
             <option value="PARTIAL">Partial</option>
             <option value="PAID">Paid</option>
          </select>
        </div>
      </div>

      <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm card-shadow">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-400 uppercase tracking-wider">
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">Category & Type</th>
                <th className="px-6 py-4">Description</th>
                <th className="px-6 py-4 text-right">Amount</th>
                <th className="px-6 py-4 text-right">Paid</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 text-sm font-medium">
              {loading ? (
                <tr><td colSpan={7} className="text-center py-8 text-slate-400">Loading expenses...</td></tr>
              ) : expenses.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-slate-400">No expenses found matching the criteria.</td></tr>
              ) : (
                expenses.map((expense) => {
                  const isPersonal = expense.category === 'PERSONAL';
                  const isJat = expense.category === 'JAT';
                  return (
                    <tr key={expense.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4">{format(new Date(expense.date), 'MMM dd, yyyy')}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {isPersonal ? <User size={14} className="text-purple-500" /> : isJat ? <Building2 size={14} className="text-amber-500" /> : <Building2 size={14} className="text-blue-500" />}
                          <div className="flex flex-col">
                            <span className={`text-[10px] uppercase font-bold ${isPersonal ? 'text-purple-600' : isJat ? 'text-amber-600' : 'text-blue-600'}`}>
                              {expense.category}
                            </span>
                            <span className="text-slate-800">{expense.expense_type}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-slate-600 max-w-[200px] truncate block" title={expense.description}>
                          {expense.description || '-'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-slate-900">
                        {Number(expense.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-emerald-600">
                        {Number(expense.paid_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-4">
                         <span className={`px-2.5 py-1 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 ${
                          expense.status === 'PAID' ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' :
                          expense.status === 'PARTIAL' ? 'bg-amber-50 text-amber-600 border border-amber-200' :
                          'bg-red-50 text-red-600 border border-red-200'
                        }`}>
                          {expense.status === 'PAID' && <CheckCircle2 size={12} />}
                          {expense.status === 'PARTIAL' && <Clock size={12} />}
                          {expense.status === 'UNPAID' && <AlertCircle size={12} />}
                          {expense.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {expense.status !== 'PAID' && hasPermission('expenses:manage') && (
                          <button 
                            onClick={() => openPayModal(expense)}
                            className="text-primary hover:text-primary-dark font-bold text-xs bg-primary/10 hover:bg-primary/20 px-3 py-1.5 rounded-lg transition-colors"
                          >
                            Pay
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {!loading && expenses.length > 0 && (
          <Pagination
            currentPage={page}
            totalCount={totalCount}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        )}
      </div>

      {/* CREATE EXPENSE MODAL */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-800">Add New Expense</h3>
              <button onClick={() => setCreateModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-full hover:bg-slate-100">
                <Plus className="rotate-45" size={24} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              {createError && (
                <div className="p-3 bg-red-50 text-red-700 text-sm rounded-xl border border-red-100 flex items-center gap-2">
                  <AlertCircle size={16} />{createError}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase">Date</label>
                <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">Category</label>
                  <select value={newCategory} onChange={e => setNewCategory(e.target.value as any)} className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none">
                    <option value="RESTAURANT">Restaurant</option>
                    <option value="JAT">JAT</option>
                    <option value="PERSONAL">Personal</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">Expense Type</label>
                  <select value={newType} onChange={e => setNewType(e.target.value)} className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none">
                    <option value="ELECTRICITY">Electricity Bill</option>
                    <option value="WATER">Water Bill</option>
                    <option value="SALARY">Salary</option>
                    <option value="RENT">Rent</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase">Amount</label>
                <div className="relative">
                  <DollarSign size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="number" min="0" step="0.01" value={newAmount} onChange={e => setNewAmount(e.target.value === '' ? '' : Number(e.target.value))} className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none text-slate-800" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase">Description (Optional)</label>
                <textarea rows={3} placeholder="e.g. June Salary for Chef" value={newDesc} onChange={e => setNewDesc(e.target.value)} className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none resize-none"></textarea>
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 flex justify-end gap-3 bg-slate-50 mt-auto">
              <button onClick={() => setCreateModalOpen(false)} className="px-5 py-2.5 text-slate-600 font-bold text-sm hover:bg-slate-200 rounded-xl transition-colors">
                Cancel
              </button>
              <button onClick={handleCreateExpense} disabled={createLoading} className="px-5 py-2.5 bg-primary hover:bg-primary-dark text-white font-bold text-sm rounded-xl transition-colors shadow-sm disabled:opacity-50">
                {createLoading ? 'Saving...' : 'Save Expense'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RECORD PAYMENT MODAL */}
      {payModalOpen && payExpense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-800">Record Payment</h3>
              <button onClick={() => setPayModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-full hover:bg-slate-100">
                <Plus className="rotate-45" size={24} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-4">
              <div className="bg-slate-50 p-4 rounded-xl space-y-2 border border-slate-100">
                 <p className="text-sm font-bold text-slate-700">{payExpense.expense_type} - {payExpense.category}</p>
                 <div className="flex justify-between text-xs font-bold text-slate-500">
                    <span>Total Amount:</span>
                    <span className="text-slate-800">{Number(payExpense.total_amount).toLocaleString()}</span>
                 </div>
                 <div className="flex justify-between text-xs font-bold text-slate-500">
                    <span>Remaining Balance:</span>
                    <span className="text-red-600">{(Number(payExpense.total_amount) - Number(payExpense.paid_amount)).toLocaleString()}</span>
                 </div>
              </div>

              {payError && (
                <div className="p-3 bg-red-50 text-red-700 text-sm rounded-xl border border-red-100 flex items-center gap-2">
                  <AlertCircle size={16} />{payError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">Payment Date</label>
                  <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none transition-all" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">Payment Method</label>
                  <select value={payMethod} onChange={e => setPayMethod(e.target.value)} className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none">
                    <option value="CASH">Cash</option>
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                    <option value="CHEQUE">Cheque</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase">Payment Amount</label>
                <div className="relative">
                  <DollarSign size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="number" min="0" max={Number(payExpense.total_amount) - Number(payExpense.paid_amount)} step="0.01" value={payAmount} onChange={e => setPayAmount(e.target.value === '' ? '' : Number(e.target.value))} className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none text-slate-800" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase">Notes (Optional)</label>
                <textarea rows={2} value={payNotes} onChange={e => setPayNotes(e.target.value)} className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none resize-none"></textarea>
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 flex justify-end gap-3 bg-slate-50">
              <button onClick={() => setPayModalOpen(false)} className="px-5 py-2.5 text-slate-600 font-bold text-sm hover:bg-slate-200 rounded-xl transition-colors">
                Cancel
              </button>
              <button onClick={handlePayExpense} disabled={payLoading} className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl transition-colors shadow-sm disabled:opacity-50">
                {payLoading ? 'Processing...' : 'Confirm Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
