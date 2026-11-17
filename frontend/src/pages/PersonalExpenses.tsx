import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { format, parseISO, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { 
  UserCheck, 
  Home, 
  User, 
  Clock, 
  CheckCircle2, 
  TrendingUp, 
  DollarSign, 
  Plus, 
  Search, 
  Calendar, 
  CheckSquare, 
  Square, 
  Pencil, 
  Trash2, 
  X, 
  Check, 
  AlertCircle,
  FileText,
  CreditCard,
  Banknote,
  RefreshCw
} from 'lucide-react';

interface PersonalExpenseDesc {
  person_type: 'HOME' | 'OVIN';
  reason?: string;
  is_settled: boolean;
  settled_date?: string | null;
  payment_type?: 'CASH' | 'CHEQUE' | null;
  cheque_realize_date?: string | null;
  settle_notes?: string;
}

interface PersonalExpenseRecord {
  id: string;
  date: string;
  category: string;
  expense_type: string;
  description: string;
  total_amount: number;
  status: 'UNPAID' | 'PAID' | 'PARTIAL';
  created_by?: string | null;
  profiles?: {
    username: string;
  } | null;
  // Parsed fields
  parsedDesc: PersonalExpenseDesc;
}

export const PersonalExpenses: React.FC = () => {
  const { user } = useAuth();

  // Date Filtering State - Default to Current Month
  const now = new Date();
  const [filterPreset, setFilterPreset] = useState<'THIS_MONTH' | 'LAST_MONTH' | 'CUSTOM'>('THIS_MONTH');
  const [startDate, setStartDate] = useState<string>(format(startOfMonth(now), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState<string>(format(endOfMonth(now), 'yyyy-MM-dd'));

  // Data State
  const [loading, setLoading] = useState<boolean>(true);
  const [expenses, setExpenses] = useState<PersonalExpenseRecord[]>([]);
  const [operatingProfit, setOperatingProfit] = useState<number>(0);
  const [pnlDaysCount, setPnlDaysCount] = useState<number>(0);

  // Table Filter & Search
  const [activeTab, setActiveTab] = useState<'ALL' | 'HOME' | 'OVIN_PENDING' | 'OVIN_SETTLED'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Multi-select for Ovin Settlement
  const [selectedOvinIds, setSelectedOvinIds] = useState<string[]>([]);

  // Modals State
  const [addModalOpen, setAddModalOpen] = useState<boolean>(false);
  const [editModalOpen, setEditModalOpen] = useState<boolean>(false);
  const [editingExpense, setEditingExpense] = useState<PersonalExpenseRecord | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState<boolean>(false);
  const [expenseToDelete, setExpenseToDelete] = useState<PersonalExpenseRecord | null>(null);
  const [settleModalOpen, setSettleModalOpen] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Add / Edit Form State
  const [formType, setFormType] = useState<'HOME' | 'OVIN'>('HOME');
  const [formDate, setFormDate] = useState<string>(format(now, 'yyyy-MM-dd'));
  const [formAmount, setFormAmount] = useState<number | ''>('');
  const [formReason, setFormReason] = useState<string>('');

  // Settlement Form State
  const [settleDate, setSettleDate] = useState<string>(format(now, 'yyyy-MM-dd'));
  const [settlePaymentType, setSettlePaymentType] = useState<'CASH' | 'CHEQUE'>('CASH');
  const [chequeRealizeDate, setChequeRealizeDate] = useState<string>('');
  const [settleNotes, setSettleNotes] = useState<string>('');

  // Handle Preset Changes
  const handlePresetChange = (preset: 'THIS_MONTH' | 'LAST_MONTH' | 'CUSTOM') => {
    setFilterPreset(preset);
    const currentDate = new Date();
    if (preset === 'THIS_MONTH') {
      setStartDate(format(startOfMonth(currentDate), 'yyyy-MM-dd'));
      setEndDate(format(endOfMonth(currentDate), 'yyyy-MM-dd'));
    } else if (preset === 'LAST_MONTH') {
      const prev = subMonths(currentDate, 1);
      setStartDate(format(startOfMonth(prev), 'yyyy-MM-dd'));
      setEndDate(format(endOfMonth(prev), 'yyyy-MM-dd'));
    }
  };

  // Helper to safely parse description JSON
  const parseDescription = (descStr: string, expType: string): PersonalExpenseDesc => {
    try {
      const parsed = JSON.parse(descStr || '{}');
      const isOvin = expType === 'PERSONAL_OVIN' || parsed.person_type === 'OVIN';
      return {
        person_type: isOvin ? 'OVIN' : 'HOME',
        reason: parsed.reason || (typeof parsed === 'string' ? parsed : ''),
        is_settled: Boolean(parsed.is_settled),
        settled_date: parsed.settled_date || null,
        payment_type: parsed.payment_type || null,
        cheque_realize_date: parsed.cheque_realize_date || null,
        settle_notes: parsed.settle_notes || ''
      };
    } catch {
      const isOvin = expType === 'PERSONAL_OVIN';
      return {
        person_type: isOvin ? 'OVIN' : 'HOME',
        reason: descStr || '',
        is_settled: false,
        settled_date: null,
        payment_type: null,
        cheque_realize_date: null,
        settle_notes: ''
      };
    }
  };

  // Format currency helper
  const formatCurrency = (val: number) => {
    return Number(val || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  // Fetch all personal expenses and operating profit for the selected range
  const fetchData = async () => {
    setLoading(true);
    setSelectedOvinIds([]);
    try {
      // 1. Fetch personal expenses in date range
      const { data: expData, error: expErr } = await supabase
        .from('expenses')
        .select('*, profiles:created_by(username)')
        .in('expense_type', ['PERSONAL_HOME', 'PERSONAL_OVIN'])
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: false });

      if (expErr) throw expErr;

      const formatted: PersonalExpenseRecord[] = (expData || []).map(row => ({
        ...row,
        parsedDesc: parseDescription(row.description, row.expense_type)
      }));

      setExpenses(formatted);

      // 2. Fetch Daily P&L records for Restaurant Operating Profit
      const { data: pnlData, error: pnlErr } = await supabase
        .from('expenses')
        .select('*')
        .eq('expense_type', 'DAILY_PNL_SUMMARY')
        .gte('date', startDate)
        .lte('date', endDate);

      if (pnlErr) throw pnlErr;

      let totalOpProfit = 0;
      let daysCount = 0;
      (pnlData || []).forEach(row => {
        try {
          const p = JSON.parse(row.description || '{}');
          // Operating Profit = stored netProfit + any historical expensePersonal if it was deducted
          const dayOpProfit = Number(p.netProfit || 0) + (Number(p.expensePersonal) || 0);
          totalOpProfit += dayOpProfit;
          daysCount++;
        } catch (e) {
          console.error('Error parsing P&L row:', row.id, e);
        }
      });

      setOperatingProfit(totalOpProfit);
      setPnlDaysCount(daysCount);

    } catch (err: any) {
      console.error('Failed to fetch personal expenses:', err);
      setNotification({ type: 'error', message: err.message || 'Failed to load personal expenses' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [startDate, endDate]);

  // Dismiss notification after 4 seconds
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Derived KPI Calculations for the selected range
  const { totalHome, totalOvinPending, countOvinPending, totalOvinSettled, countOvinSettled, totalTrueProfit } = useMemo(() => {
    let homeSum = 0;
    let ovinPendingSum = 0;
    let ovinPendingCnt = 0;
    let ovinSettledSum = 0;
    let ovinSettledCnt = 0;

    expenses.forEach(e => {
      const amount = Number(e.total_amount) || 0;
      if (e.parsedDesc.person_type === 'HOME') {
        homeSum += amount;
      } else if (e.parsedDesc.person_type === 'OVIN') {
        if (e.parsedDesc.is_settled || e.status === 'PAID') {
          ovinSettledSum += amount;
          ovinSettledCnt++;
        } else {
          ovinPendingSum += amount;
          ovinPendingCnt++;
        }
      }
    });

    // True Profit Formula: Operating Profit - Home Expenses + Settled Ovin Expenses
    const trueProfit = operatingProfit - homeSum + ovinSettledSum;

    return {
      totalHome: homeSum,
      totalOvinPending: ovinPendingSum,
      countOvinPending: ovinPendingCnt,
      totalOvinSettled: ovinSettledSum,
      countOvinSettled: ovinSettledCnt,
      totalTrueProfit: trueProfit
    };
  }, [expenses, operatingProfit]);

  // Filtered table records
  const filteredExpenses = useMemo(() => {
    return expenses.filter(item => {
      // Tab filter
      if (activeTab === 'HOME' && item.parsedDesc.person_type !== 'HOME') return false;
      if (activeTab === 'OVIN_PENDING' && (item.parsedDesc.person_type !== 'OVIN' || item.parsedDesc.is_settled)) return false;
      if (activeTab === 'OVIN_SETTLED' && (item.parsedDesc.person_type !== 'OVIN' || !item.parsedDesc.is_settled)) return false;

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const reasonMatch = (item.parsedDesc.reason || '').toLowerCase().includes(q);
        const notesMatch = (item.parsedDesc.settle_notes || '').toLowerCase().includes(q);
        const amountMatch = item.total_amount.toString().includes(q);
        const dateMatch = item.date.includes(q);
        return reasonMatch || notesMatch || amountMatch || dateMatch;
      }

      return true;
    });
  }, [expenses, activeTab, searchQuery]);

  // Pending Ovin items available for selection in the currently filtered view
  const pendingOvinInView = useMemo(() => {
    return filteredExpenses.filter(e => e.parsedDesc.person_type === 'OVIN' && !e.parsedDesc.is_settled);
  }, [filteredExpenses]);

  // Total amount of currently selected Ovin items
  const selectedTotalAmount = useMemo(() => {
    return selectedOvinIds.reduce((sum, id) => {
      const item = expenses.find(e => e.id === id);
      return sum + (Number(item?.total_amount) || 0);
    }, 0);
  }, [selectedOvinIds, expenses]);

  // Toggle selection of a single Ovin expense
  const toggleSelectExpense = (id: string) => {
    setSelectedOvinIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  // Toggle select all pending Ovin expenses currently displayed
  const toggleSelectAllPending = () => {
    const allPendingIds = pendingOvinInView.map(e => e.id);
    const areAllSelected = allPendingIds.length > 0 && allPendingIds.every(id => selectedOvinIds.includes(id));
    if (areAllSelected) {
      setSelectedOvinIds(prev => prev.filter(id => !allPendingIds.includes(id)));
    } else {
      setSelectedOvinIds(prev => Array.from(new Set([...prev, ...allPendingIds])));
    }
  };

  // Open Create Modal
  const openCreateModal = () => {
    setFormType('HOME');
    setFormDate(format(new Date(), 'yyyy-MM-dd'));
    setFormAmount('');
    setFormReason('');
    setModalError(null);
    setAddModalOpen(true);
  };

  // Open Edit Modal
  const openEditModal = (item: PersonalExpenseRecord) => {
    setEditingExpense(item);
    setFormType(item.parsedDesc.person_type);
    setFormDate(item.date);
    setFormAmount(item.total_amount);
    setFormReason(item.parsedDesc.reason || '');
    setModalError(null);
    setEditModalOpen(true);
  };

  // Open Settle Modal for multiple items or single item
  const openSettleModal = (specificId?: string) => {
    if (specificId) {
      setSelectedOvinIds([specificId]);
    }
    setSettleDate(format(new Date(), 'yyyy-MM-dd'));
    setSettlePaymentType('CASH');
    setChequeRealizeDate('');
    setSettleNotes('');
    setModalError(null);
    setSettleModalOpen(true);
  };

  // Handle Save (Create) Personal Expense
  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    const amountNum = Number(formAmount);
    if (!amountNum || amountNum <= 0) {
      setModalError('Please enter a valid amount greater than 0');
      return;
    }

    setActionLoading(true);
    try {
      const descriptionPayload: PersonalExpenseDesc = {
        person_type: formType,
        reason: formReason.trim(),
        is_settled: false,
        settled_date: null,
        payment_type: null,
        cheque_realize_date: null,
        settle_notes: ''
      };

      const { error } = await supabase.from('expenses').insert({
        date: formDate,
        category: 'PERSONAL',
        expense_type: formType === 'HOME' ? 'PERSONAL_HOME' : 'PERSONAL_OVIN',
        description: JSON.stringify(descriptionPayload),
        total_amount: amountNum,
        status: 'UNPAID',
        created_by: user?.id || null
      });

      if (error) throw error;

      setAddModalOpen(false);
      setNotification({ type: 'success', message: `${formType === 'HOME' ? 'Home' : 'Ovin'} expense added successfully.` });
      fetchData();
    } catch (err: any) {
      setModalError(err.message || 'Failed to save expense');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Update Personal Expense
  const handleUpdateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExpense) return;
    setModalError(null);

    const amountNum = Number(formAmount);
    if (!amountNum || amountNum <= 0) {
      setModalError('Please enter a valid amount greater than 0');
      return;
    }

    setActionLoading(true);
    try {
      const updatedDesc: PersonalExpenseDesc = {
        ...editingExpense.parsedDesc,
        person_type: formType,
        reason: formReason.trim()
      };

      const { error } = await supabase.from('expenses').update({
        date: formDate,
        expense_type: formType === 'HOME' ? 'PERSONAL_HOME' : 'PERSONAL_OVIN',
        description: JSON.stringify(updatedDesc),
        total_amount: amountNum
      }).eq('id', editingExpense.id);

      if (error) throw error;

      setEditModalOpen(false);
      setEditingExpense(null);
      setNotification({ type: 'success', message: 'Personal expense updated successfully.' });
      fetchData();
    } catch (err: any) {
      setModalError(err.message || 'Failed to update expense');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Delete Personal Expense
  const handleDeleteExpense = async () => {
    if (!expenseToDelete) return;
    setActionLoading(true);
    try {
      const { error } = await supabase.from('expenses').delete().eq('id', expenseToDelete.id);
      if (error) throw error;

      setDeleteModalOpen(false);
      setExpenseToDelete(null);
      setNotification({ type: 'success', message: 'Personal expense deleted successfully.' });
      fetchData();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to delete expense' });
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Batch Settlement of Selected Ovin Expenses
  const handleBatchSettle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedOvinIds.length === 0) return;
    setModalError(null);

    if (settlePaymentType === 'CHEQUE' && !chequeRealizeDate) {
      setModalError('Please provide the Cheque Realize Date.');
      return;
    }

    setActionLoading(true);
    try {
      // Update each selected expense
      for (const id of selectedOvinIds) {
        const item = expenses.find(e => e.id === id);
        if (!item) continue;

        const updatedDesc: PersonalExpenseDesc = {
          ...item.parsedDesc,
          is_settled: true,
          settled_date: settleDate,
          payment_type: settlePaymentType,
          cheque_realize_date: settlePaymentType === 'CHEQUE' ? chequeRealizeDate : null,
          settle_notes: settleNotes.trim()
        };

        const { error } = await supabase.from('expenses').update({
          status: 'PAID',
          description: JSON.stringify(updatedDesc)
        }).eq('id', id);

        if (error) throw error;
      }

      setSettleModalOpen(false);
      setSelectedOvinIds([]);
      setNotification({ 
        type: 'success', 
        message: `Successfully settled ${selectedOvinIds.length} Ovin expense${selectedOvinIds.length > 1 ? 's' : ''} (LKR ${formatCurrency(selectedTotalAmount)}).` 
      });
      fetchData();
    } catch (err: any) {
      setModalError(err.message || 'Failed to settle expenses');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Unsettle / Revert Ovin Expense
  const handleUnsettleExpense = async (item: PersonalExpenseRecord) => {
    setActionLoading(true);
    try {
      const revertedDesc: PersonalExpenseDesc = {
        ...item.parsedDesc,
        is_settled: false,
        settled_date: null,
        payment_type: null,
        cheque_realize_date: null,
        settle_notes: ''
      };

      const { error } = await supabase.from('expenses').update({
        status: 'UNPAID',
        description: JSON.stringify(revertedDesc)
      }).eq('id', item.id);

      if (error) throw error;

      setNotification({ type: 'success', message: 'Expense settlement reverted to pending.' });
      fetchData();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message || 'Failed to revert settlement' });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6 pb-24">
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

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
              <UserCheck className="text-purple-600" />
              Personal Expenses & True Profit
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
              Isolated Tracking
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Record Home & Ovin personal drawings, settle Ovin reimbursements, and calculate True Profit from Restaurant Operating Profit.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => fetchData()}
            disabled={loading}
            className="p-2.5 text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-sm"
            title="Refresh Data"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin text-purple-600' : ''} />
          </button>
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white font-semibold text-sm rounded-xl shadow-sm transition-all shadow-purple-600/20"
          >
            <Plus size={18} />
            <span>Record Personal Expense</span>
          </button>
        </div>
      </div>

      {/* Date Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 w-full md:w-auto">
          <Calendar size={18} className="text-purple-600 shrink-0" />
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Date Period:</span>
          
          <div className="inline-flex bg-slate-100 p-1 rounded-xl border border-slate-200 ml-1">
            <button
              onClick={() => handlePresetChange('THIS_MONTH')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                filterPreset === 'THIS_MONTH' ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              This Month
            </button>
            <button
              onClick={() => handlePresetChange('LAST_MONTH')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                filterPreset === 'LAST_MONTH' ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Last Month
            </button>
            <button
              onClick={() => setFilterPreset('CUSTOM')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                filterPreset === 'CUSTOM' ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Custom
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2 flex-1 md:flex-none">
            <label className="text-xs font-bold text-slate-500">From:</label>
            <input
              type="date"
              value={startDate}
              onChange={e => {
                setStartDate(e.target.value);
                setFilterPreset('CUSTOM');
              }}
              className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none"
            />
          </div>
          <div className="flex items-center gap-2 flex-1 md:flex-none">
            <label className="text-xs font-bold text-slate-500">To:</label>
            <input
              type="date"
              value={endDate}
              onChange={e => {
                setEndDate(e.target.value);
                setFilterPreset('CUSTOM');
              }}
              className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none"
            />
          </div>
        </div>
      </div>

      {/* 4 Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Home Expenses */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-purple-700 uppercase tracking-wider flex items-center gap-1.5">
              <Home size={16} className="text-purple-600" />
              Home Expenses
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
              Personal Draw
            </span>
          </div>
          <p className="text-2xl font-extrabold text-slate-900 mt-2">
            LKR {formatCurrency(totalHome)}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Deducted from True Profit
          </p>
        </div>

        {/* Card 2: Pending Ovin Expenses */}
        <div className="bg-white p-5 rounded-2xl border border-amber-200/80 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-700 uppercase tracking-wider flex items-center gap-1.5">
              <Clock size={16} className="text-amber-600" />
              Pending Ovin
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
              {countOvinPending} pending
            </span>
          </div>
          <p className="text-2xl font-extrabold text-amber-600 mt-2">
            LKR {formatCurrency(totalOvinPending)}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Not yet settled / received
          </p>
        </div>

        {/* Card 3: Settled Ovin Expenses */}
        <div className="bg-white p-5 rounded-2xl border border-emerald-200/80 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 size={16} className="text-emerald-600" />
              Settled Ovin
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              {countOvinSettled} received
            </span>
          </div>
          <p className="text-2xl font-extrabold text-emerald-700 mt-2">
            LKR {formatCurrency(totalOvinSettled)}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Added back to True Profit
          </p>
        </div>

        {/* Card 4: Total True Profit */}
        <div className={`p-5 rounded-2xl border shadow-sm relative overflow-hidden ${
          totalTrueProfit >= 0
            ? 'bg-gradient-to-br from-emerald-600 to-teal-700 text-white border-emerald-500 shadow-emerald-600/10'
            : 'bg-gradient-to-br from-rose-600 to-red-700 text-white border-rose-500 shadow-rose-600/10'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 text-white/90">
              <TrendingUp size={16} /> Total True Profit
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/20 text-white backdrop-blur-sm">
              Reconciled
            </span>
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-white mt-2 tracking-tight">
            {totalTrueProfit < 0 ? '-' : ''}LKR {formatCurrency(Math.abs(totalTrueProfit))}
          </p>
          <div className="mt-2 text-[10px] text-white/80 flex flex-wrap gap-x-2 font-medium">
            <span>Op. Profit: LKR {formatCurrency(operatingProfit)}</span>
            <span>•</span>
            <span>Home: -{formatCurrency(totalHome)}</span>
            <span>•</span>
            <span>Ovin Settle: +{formatCurrency(totalOvinSettled)}</span>
          </div>
        </div>
      </div>

      {/* Floating Multi-Select Settlement Action Bar */}
      {selectedOvinIds.length > 0 && (
        <div className="sticky top-4 z-40 bg-slate-900 text-white px-5 py-3.5 rounded-2xl shadow-xl flex flex-col sm:flex-row items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 border border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-sm border border-amber-500/30">
              {selectedOvinIds.length}
            </div>
            <div>
              <p className="text-sm font-bold">
                {selectedOvinIds.length} Ovin Expense{selectedOvinIds.length > 1 ? 's' : ''} Selected
              </p>
              <p className="text-xs text-slate-300">
                Total Settlement: <span className="font-extrabold text-amber-400">LKR {formatCurrency(selectedTotalAmount)}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              onClick={() => setSelectedOvinIds([])}
              className="px-3.5 py-1.5 text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
            >
              Clear Selection
            </button>
            <button
              onClick={() => openSettleModal()}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-2 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-slate-950 font-bold text-sm rounded-xl transition-all shadow-md shadow-emerald-500/20"
            >
              <CheckCircle2 size={16} />
              <span>Settle Selected ({selectedOvinIds.length})</span>
            </button>
          </div>
        </div>
      )}

      {/* Table Section */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Table Top Toolbar */}
        <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
            <button
              onClick={() => setActiveTab('ALL')}
              className={`px-3.5 py-2 text-xs font-bold rounded-xl transition-all ${
                activeTab === 'ALL'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              All ({expenses.length})
            </button>
            <button
              onClick={() => setActiveTab('HOME')}
              className={`px-3.5 py-2 text-xs font-bold rounded-xl transition-all ${
                activeTab === 'HOME'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Home ({expenses.filter(e => e.parsedDesc.person_type === 'HOME').length})
            </button>
            <button
              onClick={() => setActiveTab('OVIN_PENDING')}
              className={`px-3.5 py-2 text-xs font-bold rounded-xl transition-all ${
                activeTab === 'OVIN_PENDING'
                  ? 'bg-amber-500 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Ovin Pending ({countOvinPending})
            </button>
            <button
              onClick={() => setActiveTab('OVIN_SETTLED')}
              className={`px-3.5 py-2 text-xs font-bold rounded-xl transition-all ${
                activeTab === 'OVIN_SETTLED'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Ovin Settled ({countOvinSettled})
            </button>
          </div>

          {/* Search Box */}
          <div className="relative w-full md:w-72">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by reason, amount..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none"
            />
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="px-4 py-3.5 text-center w-12">
                  {pendingOvinInView.length > 0 ? (
                    <button
                      type="button"
                      onClick={toggleSelectAllPending}
                      className="p-1 hover:bg-slate-200 rounded transition-colors text-slate-600"
                      title="Select / Deselect all pending Ovin expenses"
                    >
                      {pendingOvinInView.every(e => selectedOvinIds.includes(e.id)) ? (
                        <CheckSquare size={16} className="text-purple-600" />
                      ) : (
                        <Square size={16} className="text-slate-400" />
                      )}
                    </button>
                  ) : (
                    <span className="text-slate-300">#</span>
                  )}
                </th>
                <th className="px-4 py-3.5">Date</th>
                <th className="px-4 py-3.5">Category Type</th>
                <th className="px-4 py-3.5">Reason / Description</th>
                <th className="px-4 py-3.5 text-right">Amount (LKR)</th>
                <th className="px-4 py-3.5">Settlement Status</th>
                <th className="px-4 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400">
                    <div className="w-6 h-6 border-2 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    Loading personal expenses...
                  </td>
                </tr>
              ) : filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400">
                    <FileText size={32} className="mx-auto text-slate-300 mb-2" />
                    No personal expenses found for this period. Click <strong>"Record Personal Expense"</strong> above to add one.
                  </td>
                </tr>
              ) : (
                filteredExpenses.map(item => {
                  const isHome = item.parsedDesc.person_type === 'HOME';
                  const isOvin = item.parsedDesc.person_type === 'OVIN';
                  const isSettled = isOvin && (item.parsedDesc.is_settled || item.status === 'PAID');
                  const isSelected = selectedOvinIds.includes(item.id);

                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isSelected ? 'bg-purple-50/50' : ''
                      }`}
                    >
                      {/* Checkbox column */}
                      <td className="px-4 py-3.5 text-center">
                        {isOvin && !isSettled ? (
                          <button
                            type="button"
                            onClick={() => toggleSelectExpense(item.id)}
                            className="p-1 hover:bg-slate-200 rounded transition-colors text-slate-600"
                          >
                            {isSelected ? (
                              <CheckSquare size={16} className="text-purple-600" />
                            ) : (
                              <Square size={16} className="text-slate-400" />
                            )}
                          </button>
                        ) : (
                          <span className="text-slate-300 text-[10px]">—</span>
                        )}
                      </td>

                      {/* Date */}
                      <td className="px-4 py-3.5 font-bold text-slate-800 whitespace-nowrap">
                        {format(parseISO(item.date), 'dd MMM yyyy')}
                      </td>

                      {/* Category Type Badge */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        {isHome ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200">
                            <Home size={12} /> Home
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                            <User size={12} /> Ovin
                          </span>
                        )}
                      </td>

                      {/* Reason / Notes */}
                      <td className="px-4 py-3.5 max-w-xs">
                        <p className="font-semibold text-slate-800 truncate" title={item.parsedDesc.reason}>
                          {item.parsedDesc.reason || <span className="text-slate-400 italic">No reason provided</span>}
                        </p>
                        {item.parsedDesc.settle_notes && (
                          <p className="text-[10px] text-slate-500 truncate" title={item.parsedDesc.settle_notes}>
                            Note: {item.parsedDesc.settle_notes}
                          </p>
                        )}
                      </td>

                      {/* Amount */}
                      <td className="px-4 py-3.5 text-right font-extrabold text-slate-900 whitespace-nowrap text-sm">
                        LKR {formatCurrency(item.total_amount)}
                      </td>

                      {/* Status / Settlement Details */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        {isHome ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                            Personal Drawing
                          </span>
                        ) : isSettled ? (
                          <div className="flex flex-col">
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 w-fit">
                              <CheckCircle2 size={12} /> Settled
                            </span>
                            <span className="text-[10px] text-slate-500 mt-0.5">
                              {item.parsedDesc.payment_type || 'PAID'} • {item.parsedDesc.settled_date ? format(parseISO(item.parsedDesc.settled_date), 'dd MMM') : ''}
                              {item.parsedDesc.payment_type === 'CHEQUE' && item.parsedDesc.cheque_realize_date && (
                                <> (Realize: {format(parseISO(item.parsedDesc.cheque_realize_date), 'dd MMM')})</>
                              )}
                            </span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            <Clock size={12} /> Pending Settlement
                          </span>
                        )}
                      </td>

                      {/* Action Buttons */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {isOvin && !isSettled && (
                            <button
                              onClick={() => openSettleModal(item.id)}
                              className="px-2.5 py-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors flex items-center gap-1"
                              title="Settle this expense"
                            >
                              <Check size={12} /> Settle
                            </button>
                          )}
                          {isOvin && isSettled && (
                            <button
                              onClick={() => handleUnsettleExpense(item)}
                              disabled={actionLoading}
                              className="px-2 py-1 text-[10px] font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                              title="Revert to Pending"
                            >
                              Revert
                            </button>
                          )}
                          <button
                            onClick={() => openEditModal(item)}
                            className="p-1.5 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => {
                              setExpenseToDelete(item);
                              setDeleteModalOpen(true);
                            }}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={14} />
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

      {/* ----------------- CREATE / RECORD MODAL ----------------- */}
      {addModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-purple-50/50">
              <div className="flex items-center gap-2">
                <Plus size={18} className="text-purple-600" />
                <h3 className="font-bold text-base text-slate-800">Record Personal Expense</h3>
              </div>
              <button
                onClick={() => setAddModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateExpense} className="p-6 space-y-4">
              {modalError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold rounded-xl flex items-center gap-2">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              {/* Type Toggle: Home vs Ovin */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
                  Expense Type
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setFormType('HOME')}
                    className={`py-2.5 px-4 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                      formType === 'HOME'
                        ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <Home size={16} />
                    <span>Home</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormType('OVIN')}
                    className={`py-2.5 px-4 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                      formType === 'OVIN'
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <User size={16} />
                    <span>Ovin</span>
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  {formType === 'HOME'
                    ? 'Home drawing (deducted directly from True Profit).'
                    : 'Ovin drawing (can be selected & settled later when received).'}
                </p>
              </div>

              {/* Date */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Date
                </label>
                <input
                  type="date"
                  value={formDate}
                  onChange={e => setFormDate(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none"
                />
              </div>

              {/* Amount */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Amount (LKR)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={formAmount}
                  onChange={e => setFormAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  required
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-extrabold text-slate-900 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none"
                />
              </div>

              {/* Reason / Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Reason / Description (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Grocery purchase, school fees, cash advance..."
                  value={formReason}
                  onChange={e => setFormReason(e.target.value)}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none"
                />
              </div>

              {/* Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAddModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white font-semibold text-xs rounded-xl shadow-sm transition-all shadow-purple-600/20 disabled:opacity-50"
                >
                  {actionLoading ? 'Saving...' : 'Save Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ----------------- EDIT MODAL ----------------- */}
      {editModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-purple-50/50">
              <div className="flex items-center gap-2">
                <Pencil size={18} className="text-purple-600" />
                <h3 className="font-bold text-base text-slate-800">Edit Personal Expense</h3>
              </div>
              <button
                onClick={() => setEditModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleUpdateExpense} className="p-6 space-y-4">
              {modalError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold rounded-xl flex items-center gap-2">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              {/* Type Toggle: Home vs Ovin */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
                  Expense Type
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setFormType('HOME')}
                    className={`py-2.5 px-4 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                      formType === 'HOME'
                        ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <Home size={16} />
                    <span>Home</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormType('OVIN')}
                    className={`py-2.5 px-4 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                      formType === 'OVIN'
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <User size={16} />
                    <span>Ovin</span>
                  </button>
                </div>
              </div>

              {/* Date */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Date
                </label>
                <input
                  type="date"
                  value={formDate}
                  onChange={e => setFormDate(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none"
                />
              </div>

              {/* Amount */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Amount (LKR)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={formAmount}
                  onChange={e => setFormAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  required
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-extrabold text-slate-900 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none"
                />
              </div>

              {/* Reason / Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Reason / Description
                </label>
                <textarea
                  rows={2}
                  value={formReason}
                  onChange={e => setFormReason(e.target.value)}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none"
                />
              </div>

              {/* Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white font-semibold text-xs rounded-xl shadow-sm transition-all shadow-purple-600/20 disabled:opacity-50"
                >
                  {actionLoading ? 'Updating...' : 'Update Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ----------------- BATCH / SINGLE SETTLEMENT MODAL ----------------- */}
      {settleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-emerald-50/60">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={18} className="text-emerald-700" />
                <h3 className="font-bold text-base text-emerald-950">
                  Settle Ovin Expense{selectedOvinIds.length > 1 ? 's' : ''}
                </h3>
              </div>
              <button
                onClick={() => setSettleModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleBatchSettle} className="p-6 space-y-4">
              {modalError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold rounded-xl flex items-center gap-2">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              {/* Settlement Summary Pill */}
              <div className="p-4 rounded-xl bg-emerald-50/80 border border-emerald-200 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider block">
                    Total Amount Being Settled:
                  </span>
                  <span className="text-2xl font-black text-emerald-700">
                    LKR {formatCurrency(selectedTotalAmount)}
                  </span>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-200 text-emerald-900">
                  {selectedOvinIds.length} item{selectedOvinIds.length > 1 ? 's' : ''}
                </span>
              </div>

              {/* Settlement Date */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Settlement Date (Date Received)
                </label>
                <input
                  type="date"
                  value={settleDate}
                  onChange={e => setSettleDate(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
                />
              </div>

              {/* Payment Method */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
                  Payment Method
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setSettlePaymentType('CASH')}
                    className={`py-2.5 px-4 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                      settlePaymentType === 'CASH'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <Banknote size={16} />
                    <span>Cash</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettlePaymentType('CHEQUE')}
                    className={`py-2.5 px-4 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                      settlePaymentType === 'CHEQUE'
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <CreditCard size={16} />
                    <span>Cheque</span>
                  </button>
                </div>
              </div>

              {/* Cheque Realize Date (conditional) */}
              {settlePaymentType === 'CHEQUE' && (
                <div className="p-3.5 bg-blue-50/70 rounded-xl border border-blue-200 space-y-2 animate-in fade-in">
                  <label className="block text-xs font-bold text-blue-900">
                    Cheque Realise Date *
                  </label>
                  <input
                    type="date"
                    value={chequeRealizeDate}
                    onChange={e => setChequeRealizeDate(e.target.value)}
                    required={settlePaymentType === 'CHEQUE'}
                    className="w-full px-3.5 py-2 border border-blue-200 rounded-xl text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none bg-white"
                  />
                  <p className="text-[11px] text-blue-700">
                    Expected date for funds to clear.
                  </p>
                </div>
              )}

              {/* Notes / Reference */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Settlement Notes / Reference (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Cheque #49281, Commercial Bank, Handover note..."
                  value={settleNotes}
                  onChange={e => setSettleNotes(e.target.value)}
                  className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
                />
              </div>

              {/* Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSettleModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-semibold text-xs rounded-xl shadow-sm transition-all shadow-emerald-600/20 disabled:opacity-50"
                >
                  {actionLoading ? 'Processing Settlement...' : `Confirm Settlement (LKR ${formatCurrency(selectedTotalAmount)})`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ----------------- DELETE CONFIRMATION MODAL ----------------- */}
      {deleteModalOpen && expenseToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-sm w-full border border-slate-200 shadow-2xl p-6 space-y-4 animate-in zoom-in-95">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 size={24} />
            </div>
            <div className="text-center">
              <h3 className="font-bold text-base text-slate-800">Delete Personal Expense</h3>
              <p className="text-xs text-slate-500 mt-1">
                Are you sure you want to permanently delete this {expenseToDelete.parsedDesc.person_type} expense of{' '}
                <strong className="text-slate-800">LKR {formatCurrency(expenseToDelete.total_amount)}</strong>?
              </p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteModalOpen(false)}
                className="flex-1 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteExpense}
                disabled={actionLoading}
                className="flex-1 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs rounded-xl transition-colors disabled:opacity-50"
              >
                {actionLoading ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
