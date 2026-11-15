import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { 
  format, 
  parseISO, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  subDays,
  addDays
} from 'date-fns';
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  Calendar, 
  Save, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  ChevronLeft, 
  ChevronRight, 
  FileText,
  CreditCard,
  Truck,
  ShoppingBag,
  Building2,
  Users,
  Percent,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  Edit3,
  RotateCcw
} from 'lucide-react';

export interface DailyPnLRecord {
  id?: string;
  date: string;
  // Income
  incomeCash: number;
  incomeCard: number;
  incomePickme: number;
  incomeSpecial: number;
  incomeSpecialNote: string;
  totalIncome: number;
  // Expenses
  expenseStockOut: number;
  expenseDailyPurchases: number;
  expenseTransport: number;
  expenseGeneral: number;
  expensePersonal: number;
  expenseBankCharges: number;
  expenseSalary: number;
  expenseEpfEtf: number;
  totalExpenses: number;
  expenseNotes: string;
  // Profit
  netProfit: number;
}

export const ProfitAndLoss: React.FC = () => {
  const { user } = useAuth();

  // Mode: 'DAILY' | 'MONTHLY'
  const [activeTab, setActiveTab] = useState<'DAILY' | 'MONTHLY'>('DAILY');
  
  // Date states
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [selectedMonth, setSelectedMonth] = useState<string>(format(new Date(), 'yyyy-MM'));

  // Loading & Saving states
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Auto-calculated defaults from DB for the selected date
  const [autoSystemCost, setAutoSystemCost] = useState({
    stockOut: 0,
    dailyPurchases: 0,
    transport: 0,
    generalExpenses: 0,
    personalExpenses: 0,
    staffSalary: 0
  });

  // Current Form State for the selected day
  const [recordId, setRecordId] = useState<string | null>(null);
  const [incomeCash, setIncomeCash] = useState<number | ''>('');
  const [incomeCard, setIncomeCard] = useState<number | ''>('');
  const [incomePickme, setIncomePickme] = useState<number | ''>('');
  const [incomeSpecial, setIncomeSpecial] = useState<number | ''>('');
  const [incomeSpecialNote, setIncomeSpecialNote] = useState<string>('');

  const [expenseStockOut, setExpenseStockOut] = useState<number | ''>('');
  const [expenseDailyPurchases, setExpenseDailyPurchases] = useState<number | ''>('');
  const [expenseTransport, setExpenseTransport] = useState<number | ''>('');
  const [expenseGeneral, setExpenseGeneral] = useState<number | ''>('');
  const [expensePersonal, setExpensePersonal] = useState<number | ''>('');
  const [expenseBankCharges, setExpenseBankCharges] = useState<number | ''>('');
  const [expenseSalary, setExpenseSalary] = useState<number | ''>('');
  const [expenseEpfEtf, setExpenseEpfEtf] = useState<number | ''>('');
  const [expenseNotes, setExpenseNotes] = useState<string>('');

  // Monthly state
  const [monthlyRecords, setMonthlyRecords] = useState<Record<string, DailyPnLRecord>>({});
  const [monthlyLoading, setMonthlyLoading] = useState<boolean>(false);

  // Calculated Real-time Totals
  const totalIncome = useMemo(() => {
    return (
      (Number(incomeCash) || 0) +
      (Number(incomeCard) || 0) +
      (Number(incomePickme) || 0) +
      (Number(incomeSpecial) || 0)
    );
  }, [incomeCash, incomeCard, incomePickme, incomeSpecial]);

  const totalExpenses = useMemo(() => {
    return (
      (Number(expenseStockOut) || 0) +
      (Number(expenseDailyPurchases) || 0) +
      (Number(expenseTransport) || 0) +
      (Number(expenseGeneral) || 0) +
      (Number(expensePersonal) || 0) +
      (Number(expenseBankCharges) || 0) +
      (Number(expenseSalary) || 0) +
      (Number(expenseEpfEtf) || 0)
    );
  }, [
    expenseStockOut,
    expenseDailyPurchases,
    expenseTransport,
    expenseGeneral,
    expensePersonal,
    expenseBankCharges,
    expenseSalary,
    expenseEpfEtf
  ]);

  const netProfit = useMemo(() => {
    return totalIncome - totalExpenses;
  }, [totalIncome, totalExpenses]);

  const profitMargin = useMemo(() => {
    if (totalIncome <= 0) return 0;
    return (netProfit / totalIncome) * 100;
  }, [netProfit, totalIncome]);

  // Helper to format currency consistently to exactly 2 decimal places
  const formatCurrency = (amount: number) => {
    return amount.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  // Auto-calculate suggested bank charge when card sales change (default ~2.5% if blank)
  const handleCardSalesChange = (val: number | '') => {
    setIncomeCard(val);
    if (val !== '' && Number(val) > 0 && expenseBankCharges === '') {
      const suggested = Math.round(Number(val) * 0.025);
      setExpenseBankCharges(suggested);
    }
  };

  // 1. Fetch system records & auto-aggregations for selectedDate
  const fetchDayData = async (targetDate: string) => {
    setLoading(true);
    setErrorMsg(null);
    setSaveSuccess(false);

    try {
      const dayStart = `${targetDate}T00:00:00.000Z`;
      const dayEnd = `${targetDate}T23:59:59.999Z`;

      // Parallel fetch:
      // A. Existing Saved P&L summary record (stored in expenses with expense_type = 'DAILY_PNL_SUMMARY')
      // B. Stock out movements for the date (Strictly Kitchen: Kitchen Usage & Missed Kitchen Usage)
      // C. Daily Purchases for the date (Strictly KITCHEN department, excluding JAT)
      // D. Transportation costs for the date (Strictly KITCHEN department, excluding JAT)
      // E. General restaurant expenses for the date (Strictly RESTAURANT, excluding JAT)
      // F. Personal expenses for the date (category = 'PERSONAL', excluding JAT)
      // G. Staff salaries for the date (from staff_salaries)
      // H. Kitchen movement reasons
      const [
        pnlRes,
        reasonsRes,
        purchasesRes,
        transportRes,
        generalExpRes,
        personalExpRes,
        staffSalariesRes
      ] = await Promise.all([
        supabase
          .from('expenses')
          .select('*')
          .eq('date', targetDate)
          .eq('expense_type', 'DAILY_PNL_SUMMARY')
          .maybeSingle(),

        supabase
          .from('movement_reasons')
          .select('id, name')
          .in('name', ['Kitchen Usage', 'Missed Kitchen Usage']),

        supabase
          .from('daily_purchases')
          .select('total_cost, department')
          .eq('date', targetDate)
          .eq('department', 'KITCHEN'),

        supabase
          .from('transportation_costs')
          .select('cost, department')
          .eq('date', targetDate)
          .eq('department', 'KITCHEN'),

        supabase
          .from('expenses')
          .select('total_amount, category')
          .eq('date', targetDate)
          .neq('expense_type', 'DAILY_PNL_SUMMARY')
          .eq('category', 'RESTAURANT'),

        supabase
          .from('expenses')
          .select('total_amount, category')
          .eq('date', targetDate)
          .neq('expense_type', 'DAILY_PNL_SUMMARY')
          .eq('category', 'PERSONAL'),

        supabase
          .from('staff_salaries')
          .select('amount')
          .eq('date', targetDate)
      ]);

      const kitchenReasonIds = (reasonsRes.data || []).map(r => r.id);

      // Fetch stock movements strictly for Kitchen reasons
      let sysStockOut = 0;
      if (kitchenReasonIds.length > 0) {
        const { data: movementsData } = await supabase
          .from('stock_movements')
          .select('quantity, cost_price, reason_id')
          .eq('type', 'STOCK_OUT')
          .in('reason_id', kitchenReasonIds)
          .gte('created_at', dayStart)
          .lte('created_at', dayEnd);

        sysStockOut = (movementsData || []).reduce(
          (sum, m) => sum + (Number(m.quantity) || 0) * (Number(m.cost_price) || 0),
          0
        );
      }

      const sysPurchases = (purchasesRes.data || []).reduce(
        (sum, p) => sum + (Number(p.total_cost) || 0),
        0
      );
      const sysTransport = (transportRes.data || []).reduce(
        (sum, t) => sum + (Number(t.cost) || 0),
        0
      );
      const sysGeneralExp = (generalExpRes.data || []).reduce(
        (sum, e) => sum + (Number(e.total_amount) || 0),
        0
      );
      const sysPersonalExp = (personalExpRes.data || []).reduce(
        (sum, e) => sum + (Number(e.total_amount) || 0),
        0
      );
      const sysStaffSalary = (staffSalariesRes.data || []).reduce(
        (sum, s) => sum + (Number(s.amount) || 0),
        0
      );

      setAutoSystemCost({
        stockOut: Math.round(sysStockOut * 100) / 100,
        dailyPurchases: Math.round(sysPurchases * 100) / 100,
        transport: Math.round(sysTransport * 100) / 100,
        generalExpenses: Math.round(sysGeneralExp * 100) / 100,
        personalExpenses: Math.round(sysPersonalExp * 100) / 100,
        staffSalary: Math.round(sysStaffSalary * 100) / 100
      });

      // If a saved P&L summary exists for this day, populate from it
      if (pnlRes.data) {
        setRecordId(pnlRes.data.id);
        let parsedData: any = {};
        try {
          parsedData = JSON.parse(pnlRes.data.description || '{}');
        } catch {
          parsedData = {};
        }

        setIncomeCash(parsedData.incomeCash ?? '');
        setIncomeCard(parsedData.incomeCard ?? '');
        setIncomePickme(parsedData.incomePickme ?? '');
        setIncomeSpecial(parsedData.incomeSpecial ?? '');
        setIncomeSpecialNote(parsedData.incomeSpecialNote || '');

        setExpenseStockOut(parsedData.expenseStockOut ?? (sysStockOut > 0 ? sysStockOut : ''));
        setExpenseDailyPurchases(parsedData.expenseDailyPurchases ?? (sysPurchases > 0 ? sysPurchases : ''));
        setExpenseTransport(parsedData.expenseTransport ?? (sysTransport > 0 ? sysTransport : ''));
        setExpenseGeneral(parsedData.expenseGeneral ?? (sysGeneralExp > 0 ? sysGeneralExp : ''));
        setExpensePersonal(parsedData.expensePersonal ?? (sysPersonalExp > 0 ? sysPersonalExp : ''));
        setExpenseBankCharges(parsedData.expenseBankCharges ?? '');
        setExpenseSalary(parsedData.expenseSalary ?? (sysStaffSalary > 0 ? sysStaffSalary : ''));
        setExpenseEpfEtf(parsedData.expenseEpfEtf ?? '');
        setExpenseNotes(parsedData.expenseNotes || '');
      } else {
        // No saved record yet: Default auto-fetched system values into the inputs
        setRecordId(null);
        setIncomeCash('');
        setIncomeCard('');
        setIncomePickme('');
        setIncomeSpecial('');
        setIncomeSpecialNote('');

        setExpenseStockOut(sysStockOut > 0 ? sysStockOut : '');
        setExpenseDailyPurchases(sysPurchases > 0 ? sysPurchases : '');
        setExpenseTransport(sysTransport > 0 ? sysTransport : '');
        setExpenseGeneral(sysGeneralExp > 0 ? sysGeneralExp : '');
        setExpensePersonal(sysPersonalExp > 0 ? sysPersonalExp : '');
        setExpenseBankCharges('');
        setExpenseSalary(sysStaffSalary > 0 ? sysStaffSalary : '');
        setExpenseEpfEtf('');
        setExpenseNotes('');
      }
    } catch (err: any) {
      console.error('Error fetching daily P&L data:', err);
      setErrorMsg(err.message || 'Failed to load day data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDayData(selectedDate);
  }, [selectedDate]);

  // 2. Fetch Monthly Overview Data
  const fetchMonthlyData = async (monthStr: string) => {
    setMonthlyLoading(true);
    try {
      const monthDate = parseISO(`${monthStr}-01`);
      const start = format(startOfMonth(monthDate), 'yyyy-MM-dd');
      const end = format(endOfMonth(monthDate), 'yyyy-MM-dd');

      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .eq('expense_type', 'DAILY_PNL_SUMMARY')
        .gte('date', start)
        .lte('date', end);

      if (error) throw error;

      const map: Record<string, DailyPnLRecord> = {};
      (data || []).forEach(row => {
        try {
          const p = JSON.parse(row.description || '{}');
          map[row.date] = {
            id: row.id,
            date: row.date,
            incomeCash: Number(p.incomeCash) || 0,
            incomeCard: Number(p.incomeCard) || 0,
            incomePickme: Number(p.incomePickme) || 0,
            incomeSpecial: Number(p.incomeSpecial) || 0,
            incomeSpecialNote: p.incomeSpecialNote || '',
            totalIncome: Number(p.totalIncome) || 0,
            expenseStockOut: Number(p.expenseStockOut) || 0,
            expenseDailyPurchases: Number(p.expenseDailyPurchases) || 0,
            expenseTransport: Number(p.expenseTransport) || 0,
            expenseGeneral: Number(p.expenseGeneral) || 0,
            expensePersonal: Number(p.expensePersonal) || 0,
            expenseBankCharges: Number(p.expenseBankCharges) || 0,
            expenseSalary: Number(p.expenseSalary) || 0,
            expenseEpfEtf: Number(p.expenseEpfEtf) || 0,
            totalExpenses: Number(p.totalExpenses) || 0,
            expenseNotes: p.expenseNotes || '',
            netProfit: Number(p.netProfit) || 0
          };
        } catch (e) {
          console.error('JSON parse error for row:', row.id, e);
        }
      });

      setMonthlyRecords(map);
    } catch (err: any) {
      console.error('Failed to load monthly P&L records:', err);
    } finally {
      setMonthlyLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'MONTHLY') {
      fetchMonthlyData(selectedMonth);
    }
  }, [selectedMonth, activeTab]);

  // 3. Save / Upsert Daily Record
  const handleSaveDailyRecord = async () => {
    setSaving(true);
    setErrorMsg(null);
    setSaveSuccess(false);

    try {
      const summaryPayload = {
        incomeCash: Number(incomeCash) || 0,
        incomeCard: Number(incomeCard) || 0,
        incomePickme: Number(incomePickme) || 0,
        incomeSpecial: Number(incomeSpecial) || 0,
        incomeSpecialNote,
        totalIncome,

        expenseStockOut: Number(expenseStockOut) || 0,
        expenseDailyPurchases: Number(expenseDailyPurchases) || 0,
        expenseTransport: Number(expenseTransport) || 0,
        expenseGeneral: Number(expenseGeneral) || 0,
        expensePersonal: Number(expensePersonal) || 0,
        expenseBankCharges: Number(expenseBankCharges) || 0,
        expenseSalary: Number(expenseSalary) || 0,
        expenseEpfEtf: Number(expenseEpfEtf) || 0,
        totalExpenses,
        expenseNotes,

        netProfit,
        profitMargin
      };

      const payload = {
        date: selectedDate,
        category: 'RESTAURANT',
        expense_type: 'DAILY_PNL_SUMMARY',
        description: JSON.stringify(summaryPayload),
        total_amount: totalExpenses,
        status: 'PAID',
        created_by: user?.id || null
      };

      if (recordId) {
        // Update existing record
        const { error } = await supabase
          .from('expenses')
          .update(payload)
          .eq('id', recordId);

        if (error) throw error;
      } else {
        // Insert new record
        const { data, error } = await supabase
          .from('expenses')
          .insert(payload)
          .select()
          .single();

        if (error) throw error;
        if (data) setRecordId(data.id);
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3500);
    } catch (err: any) {
      console.error('Failed to save daily P&L record:', err);
      setErrorMsg(err.message || 'Failed to save summary.');
    } finally {
      setSaving(false);
    }
  };

  // Day navigation helpers
  const handlePrevDay = () => {
    try {
      const prev = subDays(parseISO(selectedDate), 1);
      setSelectedDate(format(prev, 'yyyy-MM-dd'));
    } catch (e) {
      console.error(e);
    }
  };

  const handleNextDay = () => {
    try {
      const next = addDays(parseISO(selectedDate), 1);
      setSelectedDate(format(next, 'yyyy-MM-dd'));
    } catch (e) {
      console.error(e);
    }
  };

  // Month navigation helpers
  const handlePrevMonth = () => {
    const current = parseISO(`${selectedMonth}-01`);
    const prev = subDays(startOfMonth(current), 1);
    setSelectedMonth(format(prev, 'yyyy-MM'));
  };

  const handleNextMonth = () => {
    const current = parseISO(`${selectedMonth}-01`);
    const next = endOfMonth(current);
    const nextMonth = new Date(next.getFullYear(), next.getMonth() + 1, 1);
    setSelectedMonth(format(nextMonth, 'yyyy-MM'));
  };

  // Monthly aggregated totals
  const monthlyAggregates = useMemo(() => {
    const records = Object.values(monthlyRecords);
    const totalRev = records.reduce((s, r) => s + r.totalIncome, 0);
    const totalExp = records.reduce((s, r) => s + r.totalExpenses, 0);
    const net = totalRev - totalExp;
    const margin = totalRev > 0 ? (net / totalRev) * 100 : 0;
    const daysReconciled = records.length;

    // Breakdown
    const cash = records.reduce((s, r) => s + r.incomeCash, 0);
    const card = records.reduce((s, r) => s + r.incomeCard, 0);
    const pickme = records.reduce((s, r) => s + r.incomePickme, 0);
    const special = records.reduce((s, r) => s + r.incomeSpecial, 0);

    const stockOut = records.reduce((s, r) => s + r.expenseStockOut, 0);
    const purchases = records.reduce((s, r) => s + r.expenseDailyPurchases, 0);
    const transport = records.reduce((s, r) => s + r.expenseTransport, 0);
    const general = records.reduce((s, r) => s + r.expenseGeneral, 0);
    const personal = records.reduce((s, r) => s + (r.expensePersonal || 0), 0);
    const salary = records.reduce((s, r) => s + r.expenseSalary, 0);
    const epfEtf = records.reduce((s, r) => s + r.expenseEpfEtf, 0);
    const bankCharges = records.reduce((s, r) => s + r.expenseBankCharges, 0);

    return {
      totalRev,
      totalExp,
      net,
      margin,
      daysReconciled,
      cash,
      card,
      pickme,
      special,
      stockOut,
      purchases,
      transport,
      general,
      personal,
      salary,
      epfEtf,
      bankCharges
    };
  }, [monthlyRecords]);

  // Calendar days array for the selected month
  const monthDaysList = useMemo(() => {
    try {
      const monthDate = parseISO(`${selectedMonth}-01`);
      return eachDayOfInterval({
        start: startOfMonth(monthDate),
        end: endOfMonth(monthDate)
      });
    } catch {
      return [];
    }
  }, [selectedMonth]);

  return (
    <div className="space-y-6 pb-20">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
              <DollarSign className="text-emerald-600" />
              Daily Sales, Expenses & Profit (P&L)
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              Live Reconciliation
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Track daily revenue (Cash, Card, PickMe, Events), deduct cost of sales and overheads, and see real-time net profitability.
          </p>
        </div>

        {/* Tab Switcher: Daily vs Monthly */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
          <button
            onClick={() => setActiveTab('DAILY')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'DAILY'
                ? 'bg-white text-primary shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Daily Day-Close
          </button>
          <button
            onClick={() => setActiveTab('MONTHLY')}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'MONTHLY'
                ? 'bg-white text-primary shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Monthly Overview
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: DAILY DAY-CLOSE ENTRY VIEW */}
      {/* ========================================================================= */}
      {activeTab === 'DAILY' && (
        <div className="space-y-6">
          {/* Date Selector & Action Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
              <button
                type="button"
                onClick={handlePrevDay}
                className="p-1.5 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors text-slate-600"
                title="Previous Day"
              >
                <ChevronLeft size={16} />
              </button>

              <div className="flex items-center gap-2 text-sm font-bold text-slate-700 bg-slate-50 px-2.5 py-1 rounded-xl border border-slate-100">
                <Calendar size={16} className="text-primary" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={e => setSelectedDate(e.target.value)}
                  className="bg-transparent text-sm font-bold text-slate-800 outline-none cursor-pointer"
                />
              </div>

              <button
                type="button"
                onClick={handleNextDay}
                className="p-1.5 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors text-slate-600"
                title="Next Day"
              >
                <ChevronRight size={16} />
              </button>

              {selectedDate !== format(new Date(), 'yyyy-MM-dd') && (
                <button
                  type="button"
                  onClick={() => setSelectedDate(format(new Date(), 'yyyy-MM-dd'))}
                  className="px-2.5 py-1 rounded-lg text-xs font-bold text-primary bg-primary/10 hover:bg-primary/20 transition-colors"
                >
                  Jump to Today
                </button>
              )}

              <button
                onClick={() => fetchDayData(selectedDate)}
                className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"
                title="Reload from system"
              >
                <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
              {saveSuccess && (
                <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 animate-in fade-in">
                  <CheckCircle2 size={14} /> Saved Successfully
                </span>
              )}
              {errorMsg && (
                <span className="flex items-center gap-1.5 text-xs font-bold text-rose-600 bg-rose-50 px-3 py-1.5 rounded-lg border border-rose-200 animate-in fade-in">
                  <AlertCircle size={14} /> {errorMsg}
                </span>
              )}
              <button
                onClick={handleSaveDailyRecord}
                disabled={saving || loading}
                className={`flex items-center gap-2 px-5 py-2.5 text-white rounded-xl text-xs font-bold shadow-sm transition-all active:scale-95 disabled:opacity-50 ${
                  recordId ? 'bg-amber-600 hover:bg-amber-700' : 'bg-primary hover:bg-primary-dark'
                }`}
              >
                {recordId ? <Edit3 size={15} /> : <Save size={15} />}
                {saving ? 'Saving...' : recordId ? 'Update Day-Close' : 'Save Day-Close'}
              </button>
            </div>
          </div>

          {/* Edit Mode Notice if editing existing day-close */}
          {recordId && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-amber-50/80 border border-amber-200 rounded-xl text-xs text-amber-900 animate-in fade-in">
              <div className="flex items-center gap-2">
                <Edit3 size={15} className="text-amber-600 shrink-0" />
                <span>
                  <strong>Editing Saved Day-Close:</strong> You are viewing previously reconciled numbers for <strong>{format(parseISO(selectedDate), 'dd MMMM yyyy')}</strong>. You can freely edit any numbers or notes below and click <strong>Update Day-Close</strong> to save the adjustments.
                </span>
              </div>
              <button
                type="button"
                onClick={() => fetchDayData(selectedDate)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold transition-colors shrink-0"
              >
                <RotateCcw size={12} /> Revert Changes
              </button>
            </div>
          )}

          {/* Top 3 KPI Cards: Total Income, Total Expenses, Net Profit */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* 1. Total Income */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-1.5">
                  <ArrowUpRight size={16} className="text-emerald-500" /> Total Revenue
                </span>
                <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200">
                  Income
                </span>
              </div>
              <p className="text-2xl sm:text-3xl font-extrabold text-slate-800 mt-2">
                LKR {formatCurrency(totalIncome)}
              </p>
              <p className="text-xs text-slate-400 mt-1">Cash + Card + PickMe + Occasions</p>
            </div>

            {/* 2. Total Expenses */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-rose-700 uppercase tracking-wider flex items-center gap-1.5">
                  <ArrowDownRight size={16} className="text-rose-500" /> Total Expenses & Cost
                </span>
                <span className="text-[10px] font-bold bg-rose-50 text-rose-700 px-2 py-0.5 rounded-full border border-rose-200">
                  Outflows
                </span>
              </div>
              <p className="text-2xl sm:text-3xl font-extrabold text-slate-800 mt-2">
                LKR {formatCurrency(totalExpenses)}
              </p>
              <p className="text-xs text-slate-400 mt-1">COGS + Purchases + Trans + Overheads</p>
            </div>

            {/* 3. Net Profit / Margin */}
            <div className={`p-5 rounded-2xl border shadow-sm relative overflow-hidden ${
              netProfit >= 0
                ? 'bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-300'
                : 'bg-gradient-to-br from-rose-50 to-red-50 border-rose-300'
            }`}>
              <div className="flex items-center justify-between">
                <span className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                  netProfit >= 0 ? 'text-emerald-800' : 'text-rose-800'
                }`}>
                  <TrendingUp size={16} /> Net Daily Profit
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  netProfit >= 0
                    ? 'bg-emerald-200 text-emerald-900'
                    : 'bg-rose-200 text-rose-900'
                }`}>
                  Margin: {profitMargin.toFixed(1)}%
                </span>
              </div>
              <p className={`text-2xl sm:text-3xl font-extrabold mt-2 ${
                netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'
              }`}>
                {netProfit < 0 ? '-' : ''}LKR {formatCurrency(Math.abs(netProfit))}
              </p>
              <p className={`text-xs mt-1 ${netProfit >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                {netProfit >= 0 ? 'Profitable day' : 'Operating at a loss for this day'}
              </p>
            </div>
          </div>

          {/* Form Breakdown: Income on Left, Expenses on Right */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* ---------------- SECTION A: INCOME ---------------- */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              <div className="bg-emerald-50/70 border-b border-emerald-100 px-5 py-3.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <DollarSign size={18} className="text-emerald-700" />
                  <h3 className="font-bold text-sm text-emerald-900 uppercase tracking-wide">
                    1. Daily Income Breakdown
                  </h3>
                </div>
                <span className="text-xs font-bold text-emerald-800">
                  Total: LKR {formatCurrency(totalIncome)}
                </span>
              </div>

              <div className="p-5 space-y-4 flex-1">
                {/* Cash Sales */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    💵 Cash Sales (LKR)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={incomeCash}
                    onChange={e => setIncomeCash(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
                  />
                  <span className="text-[11px] text-slate-400">Physical drawer cash from register</span>
                </div>

                {/* Card Sales */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    💳 Card Payments / POS (LKR)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={incomeCard}
                    onChange={e => handleCardSalesChange(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
                  />
                  <span className="text-[11px] text-slate-400">Visa / Mastercard / Credit card settlements</span>
                </div>

                {/* PickMe Food */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    🛵 PickMe / Delivery Platforms (LKR)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={incomePickme}
                    onChange={e => setIncomePickme(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
                  />
                  <span className="text-[11px] text-slate-400">Online delivery orders total</span>
                </div>

                {/* Special Occasion / Events */}
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-slate-700">
                      🎉 Special Occasions & Catering (LKR)
                    </label>
                    <span className="text-[10px] text-slate-400">Parties, buffets, orders</span>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={incomeSpecial}
                    onChange={e => setIncomeSpecial(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-emerald-500/20 outline-none bg-white"
                  />
                  <input
                    type="text"
                    placeholder="Optional reason / event name (e.g. Wedding Hall Booking, Birthday Buffet)"
                    value={incomeSpecialNote}
                    onChange={e => setIncomeSpecialNote(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-700 focus:ring-2 focus:ring-emerald-500/20 outline-none bg-white"
                  />
                </div>
              </div>
            </div>

            {/* ---------------- SECTION B: EXPENSES & COSTS ---------------- */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              <div className="bg-rose-50/70 border-b border-rose-100 px-5 py-3.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingDown size={18} className="text-rose-700" />
                  <h3 className="font-bold text-sm text-rose-900 uppercase tracking-wide">
                    2. Expenses & Kitchen Costs
                  </h3>
                </div>
                <span className="text-xs font-bold text-rose-800">
                  Total: LKR {formatCurrency(totalExpenses)}
                </span>
              </div>

              <div className="p-5 space-y-4 flex-1">
                {/* 1. Kitchen Stock Out (COGS) */}
                <div className="border-b border-slate-100 pb-3">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-700">
                      🥩 Kitchen Stock-Out Cost (COGS)
                    </label>
                    {autoSystemCost.stockOut > 0 ? (
                      <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                        ⚡ Kitchen System: LKR {formatCurrency(autoSystemCost.stockOut)}
                      </span>
                    ) : (
                      <span className="text-[10px] font-medium text-slate-400">
                        (Excludes JAT)
                      </span>
                    )}
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={expenseStockOut}
                    onChange={e => setExpenseStockOut(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-rose-500/20 outline-none"
                  />
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[11px] text-slate-400">Raw kitchen ingredients depleted (Kitchen Usage only)</span>
                    {autoSystemCost.stockOut > 0 && (
                      <button
                        type="button"
                        onClick={() => setExpenseStockOut(autoSystemCost.stockOut)}
                        className="text-[11px] text-primary hover:underline font-semibold"
                      >
                        Reset to system value
                      </button>
                    )}
                  </div>
                </div>

                {/* 2. Daily Market Purchases */}
                <div className="border-b border-slate-100 pb-3">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-700">
                      🛒 Daily Market Purchases (Kitchen Dept Only)
                    </label>
                    {autoSystemCost.dailyPurchases > 0 ? (
                      <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                        ⚡ Kitchen System: LKR {formatCurrency(autoSystemCost.dailyPurchases)}
                      </span>
                    ) : (
                      <span className="text-[10px] font-medium text-slate-400">
                        (Excludes JAT)
                      </span>
                    )}
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={expenseDailyPurchases}
                    onChange={e => setExpenseDailyPurchases(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-rose-500/20 outline-none"
                  />
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[11px] text-slate-400">Cash vegetable/meat purchases for KITCHEN</span>
                    {autoSystemCost.dailyPurchases > 0 && (
                      <button
                        type="button"
                        onClick={() => setExpenseDailyPurchases(autoSystemCost.dailyPurchases)}
                        className="text-[11px] text-primary hover:underline font-semibold"
                      >
                        Reset to system value
                      </button>
                    )}
                  </div>
                </div>

                {/* 3. Transportation Costs */}
                <div className="border-b border-slate-100 pb-3">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-700">
                      🚚 Transportation Costs (Kitchen Dept Only)
                    </label>
                    {autoSystemCost.transport > 0 ? (
                      <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                        ⚡ Kitchen System: LKR {formatCurrency(autoSystemCost.transport)}
                      </span>
                    ) : (
                      <span className="text-[10px] font-medium text-slate-400">
                        (Excludes JAT)
                      </span>
                    )}
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={expenseTransport}
                    onChange={e => setExpenseTransport(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-rose-500/20 outline-none"
                  />
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[11px] text-slate-400">Gas, market transport trips for KITCHEN</span>
                    {autoSystemCost.transport > 0 && (
                      <button
                        type="button"
                        onClick={() => setExpenseTransport(autoSystemCost.transport)}
                        className="text-[11px] text-primary hover:underline font-semibold"
                      >
                        Reset to system value
                      </button>
                    )}
                  </div>
                </div>

                {/* 4. General Restaurant Expenses */}
                <div className="border-b border-slate-100 pb-3">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-700">
                      🧾 General Restaurant Expenses
                    </label>
                    {autoSystemCost.generalExpenses > 0 ? (
                      <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                        ⚡ System: LKR {formatCurrency(autoSystemCost.generalExpenses)}
                      </span>
                    ) : (
                      <span className="text-[10px] font-medium text-slate-400">
                        (Excludes JAT)
                      </span>
                    )}
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={expenseGeneral}
                    onChange={e => setExpenseGeneral(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-rose-500/20 outline-none"
                  />
                  <span className="text-[11px] text-slate-400">Kitchen supplies, restaurant repairs, consumables (Excludes JAT)</span>
                </div>

                {/* 5. Personal Expenses (Shown Separately) */}
                <div className="border-b border-slate-100 pb-3 bg-purple-50/50 p-3 rounded-xl border border-purple-100">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-purple-900 flex items-center gap-1.5">
                      👤 Personal Expenses
                    </label>
                    {autoSystemCost.personalExpenses > 0 ? (
                      <span className="text-[10px] font-semibold text-purple-700 bg-purple-100 px-2 py-0.5 rounded border border-purple-200">
                        ⚡ System: LKR {formatCurrency(autoSystemCost.personalExpenses)}
                      </span>
                    ) : (
                      <span className="text-[10px] font-medium text-purple-400">
                        (Category = PERSONAL)
                      </span>
                    )}
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={expensePersonal}
                    onChange={e => setExpensePersonal(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full px-3.5 py-2 border border-purple-200 rounded-xl text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-purple-500/20 outline-none bg-white"
                  />
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[11px] text-purple-600">Personal owner drawings & personal expenses (Excludes JAT)</span>
                    {autoSystemCost.personalExpenses > 0 && (
                      <button
                        type="button"
                        onClick={() => setExpensePersonal(autoSystemCost.personalExpenses)}
                        className="text-[11px] text-purple-700 hover:underline font-semibold"
                      >
                        Reset to system value
                      </button>
                    )}
                  </div>
                </div>

                {/* 6. Labor & Overheads Grid: Bank charges, Salary, EPF/ETF */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      🏦 Bank Card Fee
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={expenseBankCharges}
                      onChange={e => setExpenseBankCharges(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-rose-500/20 outline-none"
                    />
                    <span className="text-[10px] text-slate-400">POS merchant rate</span>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-bold text-slate-700">
                        💼 Daily Staff Salary
                      </label>
                      {autoSystemCost.staffSalary > 0 && (
                        <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200" title="Calculated from Staff Payroll records">
                          ⚡ Payroll: LKR {formatCurrency(autoSystemCost.staffSalary)}
                        </span>
                      )}
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={expenseSalary}
                      onChange={e => setExpenseSalary(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-rose-500/20 outline-none"
                    />
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[10px] text-slate-400">Daily labor cost</span>
                      {autoSystemCost.staffSalary > 0 && (
                        <button
                          type="button"
                          onClick={() => setExpenseSalary(autoSystemCost.staffSalary)}
                          className="text-[10px] text-primary hover:underline font-semibold"
                        >
                          Reset to payroll
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      🏛️ EPF / ETF
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={expenseEpfEtf}
                      onChange={e => setExpenseEpfEtf(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-rose-500/20 outline-none"
                    />
                    <span className="text-[10px] text-slate-400">Statutory funds</span>
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    📝 Shift Notes / Expense Details
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Any notes about today's expenses, price fluctuations, or extra staff..."
                    value={expenseNotes}
                    onChange={e => setExpenseNotes(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-700 focus:ring-2 focus:ring-rose-500/20 outline-none"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: MONTHLY OVERVIEW & CALENDAR VIEW */}
      {/* ========================================================================= */}
      {activeTab === 'MONTHLY' && (
        <div className="space-y-6">
          {/* Month Selector Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={handlePrevMonth}
                className="p-2 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors text-slate-600"
                title="Previous Month"
              >
                <ChevronLeft size={16} />
              </button>
              <div className="flex items-center gap-2">
                <Calendar size={18} className="text-primary" />
                <span className="text-base font-extrabold text-slate-800">
                  {format(parseISO(`${selectedMonth}-01`), 'MMMM yyyy')}
                </span>
              </div>
              <button
                onClick={handleNextMonth}
                className="p-2 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors text-slate-600"
                title="Next Month"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <div className="text-xs text-slate-500 font-medium">
              <span className="font-bold text-slate-800">{monthlyAggregates.daysReconciled}</span> days closed this month
            </div>
          </div>

          {/* Monthly KPI Overview */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Total Revenue</span>
              <p className="text-xl sm:text-2xl font-extrabold text-slate-800 mt-2">
                LKR {formatCurrency(monthlyAggregates.totalRev)}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">Cash, Card, Delivery & Events</p>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <span className="text-xs font-bold text-rose-700 uppercase tracking-wider">Total Cost & Expenses</span>
              <p className="text-xl sm:text-2xl font-extrabold text-slate-800 mt-2">
                LKR {formatCurrency(monthlyAggregates.totalExp)}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">Kitchen + Purchases + Overheads</p>
            </div>

            <div className={`p-4 rounded-2xl border shadow-sm ${
              monthlyAggregates.net >= 0 ? 'bg-emerald-50/50 border-emerald-300' : 'bg-rose-50/50 border-rose-300'
            }`}>
              <span className={`text-xs font-bold uppercase tracking-wider ${
                monthlyAggregates.net >= 0 ? 'text-emerald-800' : 'text-rose-800'
              }`}>
                Net Monthly Profit
              </span>
              <p className={`text-xl sm:text-2xl font-extrabold mt-2 ${
                monthlyAggregates.net >= 0 ? 'text-emerald-700' : 'text-rose-700'
              }`}>
                {monthlyAggregates.net < 0 ? '-' : ''}LKR {formatCurrency(Math.abs(monthlyAggregates.net))}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">Bottom-line profit for {format(parseISO(`${selectedMonth}-01`), 'MMM yyyy')}</p>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <span className="text-xs font-bold text-blue-700 uppercase tracking-wider">Net Profit Margin</span>
              <p className="text-xl sm:text-2xl font-extrabold text-blue-900 mt-2">
                {monthlyAggregates.margin.toFixed(2)}%
              </p>
              <p className="text-[11px] text-slate-400 mt-1">Profit percentage of sales</p>
            </div>
          </div>

          {/* Monthly Day-by-Day Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-800">
                Daily Breakdown for {format(parseISO(`${selectedMonth}-01`), 'MMMM yyyy')}
              </h3>
              <span className="text-xs text-slate-400">Click any row to open and edit that day's entry</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3 text-right">Cash</th>
                    <th className="px-4 py-3 text-right">Card</th>
                    <th className="px-4 py-3 text-right">PickMe</th>
                    <th className="px-4 py-3 text-right">Total Revenue</th>
                    <th className="px-4 py-3 text-right">Kitchen & Expenses</th>
                    <th className="px-4 py-3 text-right">Net Profit</th>
                    <th className="px-4 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {monthlyLoading ? (
                    <tr>
                      <td colSpan={8} className="text-center py-12 text-slate-400">
                        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                        Loading monthly numbers...
                      </td>
                    </tr>
                  ) : monthDaysList.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-8 text-slate-400">
                        No calendar days found.
                      </td>
                    </tr>
                  ) : (
                    monthDaysList.map(d => {
                      const dateKey = format(d, 'yyyy-MM-dd');
                      const rec = monthlyRecords[dateKey];
                      const isToday = dateKey === format(new Date(), 'yyyy-MM-dd');

                      return (
                        <tr
                          key={dateKey}
                          onClick={() => {
                            setSelectedDate(dateKey);
                            setActiveTab('DAILY');
                          }}
                          className={`hover:bg-slate-50/80 cursor-pointer transition-colors ${
                            isToday ? 'bg-blue-50/30' : ''
                          }`}
                        >
                          <td className="px-4 py-3 font-bold text-slate-800">
                            {format(d, 'dd MMM (EEE)')}
                            {isToday && (
                              <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                                Today
                              </span>
                            )}
                          </td>

                          <td className="px-4 py-3 text-right text-slate-600">
                            {rec ? `LKR ${formatCurrency(rec.incomeCash)}` : '—'}
                          </td>

                          <td className="px-4 py-3 text-right text-slate-600">
                            {rec ? `LKR ${formatCurrency(rec.incomeCard)}` : '—'}
                          </td>

                          <td className="px-4 py-3 text-right text-slate-600">
                            {rec ? `LKR ${formatCurrency(rec.incomePickme)}` : '—'}
                          </td>

                          <td className="px-4 py-3 text-right font-extrabold text-emerald-700">
                            {rec ? `LKR ${formatCurrency(rec.totalIncome)}` : '—'}
                          </td>

                          <td className="px-4 py-3 text-right font-extrabold text-rose-600">
                            {rec ? `LKR ${formatCurrency(rec.totalExpenses)}` : '—'}
                          </td>

                          <td className="px-4 py-3 text-right font-extrabold">
                            {rec ? (
                              <span className={rec.netProfit >= 0 ? 'text-emerald-700' : 'text-rose-600'}>
                                {rec.netProfit < 0 ? '-' : ''}LKR {formatCurrency(Math.abs(rec.netProfit))}
                              </span>
                            ) : (
                              <span className="text-slate-400 italic font-normal">Not Reconciled</span>
                            )}
                          </td>

                          <td className="px-4 py-3 text-center">
                            {rec ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <CheckCircle2 size={11} /> Reconciled
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedDate(dateKey);
                                  setActiveTab('DAILY');
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition-colors"
                              >
                                <Edit3 size={10} /> Enter Day
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
          </div>
        </div>
      )}
    </div>
  );
};
