import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Users, 
  UserPlus, 
  Calendar, 
  DollarSign, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Coffee, 
  Search, 
  Save, 
  X, 
  Trash2, 
  ChevronRight, 
  CreditCard,
  Building2,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { format, parseISO } from 'date-fns';

export interface StaffMember {
  id: string;
  name: string;
  role: string;
  default_daily_rate: number | null;
  is_active: boolean;
  created_at?: string;
}

export interface AttendanceRecord {
  id: string;
  staff_id: string;
  date: string;
  status: 'PRESENT' | 'HALF_DAY' | 'ABSENT' | 'LEAVE';
  notes: string | null;
}

export interface SalaryRecord {
  id: string;
  staff_id: string;
  date: string;
  amount: number;
  payment_method: 'CASH' | 'BANK_TRANSFER' | 'RESTAURANT';
  reason_type: 'DAILY_WAGE' | 'ADVANCE' | 'MONTHLY_SALARY' | 'OTHER';
  reason_details: string | null;
  created_at: string;
}

export const StaffManagement: React.FC = () => {
  // Navigation tabs: 'ATTENDANCE' | 'SALARIES' | 'STAFF'
  const [activeTab, setActiveTab] = useState<'ATTENDANCE' | 'SALARIES' | 'STAFF'>('ATTENDANCE');

  // Shared state
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Selected date for attendance & salary payments
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));

  // Selected staff member for Summary Drawer
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
  const [staffHistoryLoading, setStaffHistoryLoading] = useState<boolean>(false);
  const [staffAttendanceHistory, setStaffAttendanceHistory] = useState<AttendanceRecord[]>([]);
  const [staffSalaryHistory, setStaffSalaryHistory] = useState<SalaryRecord[]>([]);

  // -------------------------------------------------------------
  // TAB 1: ATTENDANCE STATE
  // -------------------------------------------------------------
  const [dailyAttendance, setDailyAttendance] = useState<Record<string, 'PRESENT' | 'HALF_DAY' | 'ABSENT' | 'LEAVE'>>({});
  const [savingAttendance, setSavingAttendance] = useState<boolean>(false);

  // -------------------------------------------------------------
  // TAB 2: SALARY ENTRY STATE
  // -------------------------------------------------------------
  const [salaryStaffId, setSalaryStaffId] = useState<string>('');
  const [salaryAmount, setSalaryAmount] = useState<number | ''>('');
  const [salaryPaymentMethod, setSalaryPaymentMethod] = useState<'CASH' | 'BANK_TRANSFER' | 'RESTAURANT'>('CASH');
  const [salaryReasonType, setSalaryReasonType] = useState<'DAILY_WAGE' | 'ADVANCE' | 'MONTHLY_SALARY' | 'OTHER'>('DAILY_WAGE');
  const [salaryReasonDetails, setSalaryReasonDetails] = useState<string>('');
  const [savingSalary, setSavingSalary] = useState<boolean>(false);
  const [recentSalaries, setRecentSalaries] = useState<(SalaryRecord & { staff_members?: { name: string; role: string } })[]>([]);

  // -------------------------------------------------------------
  // TAB 3: NEW STAFF MEMBER MODAL
  // -------------------------------------------------------------
  const [isStaffModalOpen, setIsStaffModalOpen] = useState<boolean>(false);
  const [newStaffName, setNewStaffName] = useState<string>('');
  const [newStaffRole, setNewStaffRole] = useState<string>('');
  const [newStaffDailyRate, setNewStaffDailyRate] = useState<number | ''>('');
  const [savingNewStaff, setSavingNewStaff] = useState<boolean>(false);

  // Currency Formatter
  const formatLKR = (val: number) => {
    return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Helper for flash notifications
  const notifySuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3500);
  };

  // 1. Fetch Staff List
  const fetchStaff = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('staff_members')
        .select('*')
        .order('is_active', { ascending: false })
        .order('name', { ascending: true });

      if (error) throw error;
      setStaffList(data || []);
      if (!salaryStaffId && data && data.length > 0) {
        setSalaryStaffId(data[0].id);
        if (data[0].default_daily_rate) {
          setSalaryAmount(data[0].default_daily_rate);
        }
      }
    } catch (err: any) {
      console.error('Failed to load staff list:', err);
      setErrorMsg(err.message || 'Failed to load staff members');
    } finally {
      setLoading(false);
    }
  };

  // 2. Fetch Daily Attendance for selected date
  const fetchAttendanceForDate = async (targetDate: string) => {
    try {
      const { data, error } = await supabase
        .from('staff_attendance')
        .select('*')
        .eq('date', targetDate);

      if (error) throw error;
      const map: Record<string, 'PRESENT' | 'HALF_DAY' | 'ABSENT' | 'LEAVE'> = {};
      (data || []).forEach(row => {
        map[row.staff_id] = row.status;
      });
      setDailyAttendance(map);
    } catch (err: any) {
      console.error('Failed to load attendance:', err);
    }
  };

  // 3. Fetch Recent Salaries for selected date / month
  const fetchSalaries = async (targetDate: string) => {
    try {
      const { data, error } = await supabase
        .from('staff_salaries')
        .select('*, staff_members(name, role)')
        .eq('date', targetDate)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRecentSalaries(data || []);
    } catch (err: any) {
      console.error('Failed to load salaries:', err);
    }
  };

  useEffect(() => {
    fetchStaff();
  }, []);

  useEffect(() => {
    if (selectedDate) {
      fetchAttendanceForDate(selectedDate);
      fetchSalaries(selectedDate);
    }
  }, [selectedDate]);

  // Handle staff selection in Salary Tab - auto fill rate if blank
  const handleSelectStaffForSalary = (staffId: string) => {
    setSalaryStaffId(staffId);
    const worker = staffList.find(s => s.id === staffId);
    if (worker && worker.default_daily_rate) {
      setSalaryAmount(worker.default_daily_rate);
    }
  };

  // -------------------------------------------------------------
  // ATTENDANCE ACTIONS
  // -------------------------------------------------------------
  const handleMarkAll = (status: 'PRESENT' | 'ABSENT') => {
    const next: Record<string, 'PRESENT' | 'HALF_DAY' | 'ABSENT' | 'LEAVE'> = { ...dailyAttendance };
    staffList.filter(s => s.is_active).forEach(s => {
      next[s.id] = status;
    });
    setDailyAttendance(next);
  };

  const handleSaveAttendance = async () => {
    setSavingAttendance(true);
    setErrorMsg(null);
    try {
      const activeStaff = staffList.filter(s => s.is_active);
      const rows = activeStaff
        .filter(s => dailyAttendance[s.id])
        .map(s => ({
          staff_id: s.id,
          date: selectedDate,
          status: dailyAttendance[s.id],
          notes: null
        }));

      if (rows.length === 0) {
        notifySuccess('No attendance to save.');
        return;
      }

      const { error } = await supabase
        .from('staff_attendance')
        .upsert(rows, { onConflict: 'staff_id,date' });

      if (error) throw error;
      notifySuccess(`Attendance saved for ${rows.length} staff members.`);
    } catch (err: any) {
      console.error('Error saving attendance:', err);
      setErrorMsg(err.message || 'Failed to save attendance');
    } finally {
      setSavingAttendance(false);
    }
  };

  // -------------------------------------------------------------
  // SALARY ACTIONS
  // -------------------------------------------------------------
  const handleSaveSalary = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!salaryStaffId) {
      setErrorMsg('Please select a staff member');
      return;
    }
    if (!salaryAmount || Number(salaryAmount) <= 0) {
      setErrorMsg('Please enter a valid salary amount');
      return;
    }

    setSavingSalary(true);
    setErrorMsg(null);
    try {
      const payload = {
        staff_id: salaryStaffId,
        date: selectedDate,
        amount: Number(salaryAmount),
        payment_method: salaryPaymentMethod,
        reason_type: salaryReasonType,
        reason_details: salaryReasonType === 'OTHER' ? salaryReasonDetails.trim() || null : null
      };

      const { error } = await supabase
        .from('staff_salaries')
        .insert(payload);

      if (error) throw error;

      notifySuccess('Salary payment recorded successfully!');
      setSalaryAmount('');
      setSalaryReasonDetails('');
      fetchSalaries(selectedDate);
    } catch (err: any) {
      console.error('Failed to record salary:', err);
      setErrorMsg(err.message || 'Failed to record salary');
    } finally {
      setSavingSalary(false);
    }
  };

  // Delete a salary payment
  const handleDeleteSalary = async (id: string) => {
    if (!confirm('Are you sure you want to delete this payment record?')) return;
    try {
      const { error } = await supabase.from('staff_salaries').delete().eq('id', id);
      if (error) throw error;
      notifySuccess('Salary payment deleted.');
      fetchSalaries(selectedDate);
    } catch (err: any) {
      alert(err.message || 'Failed to delete payment');
    }
  };

  // -------------------------------------------------------------
  // STAFF MEMBER ACTIONS
  // -------------------------------------------------------------
  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStaffName.trim() || !newStaffRole.trim()) {
      setErrorMsg('Staff name and role are required');
      return;
    }

    setSavingNewStaff(true);
    setErrorMsg(null);
    try {
      const payload = {
        name: newStaffName.trim(),
        role: newStaffRole.trim(),
        default_daily_rate: newStaffDailyRate !== '' ? Number(newStaffDailyRate) : null,
        is_active: true
      };

      const { data, error } = await supabase
        .from('staff_members')
        .insert(payload)
        .select()
        .single();

      if (error) throw error;
      notifySuccess(`Staff member "${data.name}" added successfully.`);
      setIsStaffModalOpen(false);
      setNewStaffName('');
      setNewStaffRole('');
      setNewStaffDailyRate('');
      fetchStaff();
    } catch (err: any) {
      console.error('Failed to add staff:', err);
      setErrorMsg(err.message || 'Failed to add staff');
    } finally {
      setSavingNewStaff(false);
    }
  };

  const handleToggleStaffStatus = async (staff: StaffMember) => {
    try {
      const { error } = await supabase
        .from('staff_members')
        .update({ is_active: !staff.is_active })
        .eq('id', staff.id);

      if (error) throw error;
      setStaffList(prev => prev.map(s => s.id === staff.id ? { ...s, is_active: !s.is_active } : s));
    } catch (err: any) {
      alert(err.message || 'Failed to update staff status');
    }
  };

  // -------------------------------------------------------------
  // WORKER PROFILE SUMMARY DRAWER
  // -------------------------------------------------------------
  const handleOpenStaffSummary = async (staff: StaffMember) => {
    setSelectedStaff(staff);
    setStaffHistoryLoading(true);
    try {
      const [attRes, salRes] = await Promise.all([
        supabase
          .from('staff_attendance')
          .select('*')
          .eq('staff_id', staff.id)
          .order('date', { ascending: false })
          .limit(30),
        supabase
          .from('staff_salaries')
          .select('*')
          .eq('staff_id', staff.id)
          .order('date', { ascending: false })
          .limit(50)
      ]);

      setStaffAttendanceHistory(attRes.data || []);
      setStaffSalaryHistory(salRes.data || []);
    } catch (err: any) {
      console.error('Failed to load staff details:', err);
    } finally {
      setStaffHistoryLoading(false);
    }
  };

  // Quick stats for selected staff member
  const staffStats = useMemo(() => {
    const totalPaid = staffSalaryHistory.reduce((sum, s) => sum + Number(s.amount), 0);
    const presentDays = staffAttendanceHistory.filter(a => a.status === 'PRESENT').length;
    const halfDays = staffAttendanceHistory.filter(a => a.status === 'HALF_DAY').length;
    const absentDays = staffAttendanceHistory.filter(a => a.status === 'ABSENT').length;
    const leaveDays = staffAttendanceHistory.filter(a => a.status === 'LEAVE').length;

    // Wage calculation based on daily rate
    const dailyRate = selectedStaff?.default_daily_rate ?? 0;
    const wagesEarned = (presentDays * dailyRate) + (halfDays * dailyRate * 0.5);
    const balanceDue = Math.max(0, wagesEarned - totalPaid);

    return { totalPaid, presentDays, halfDays, absentDays, leaveDays, dailyRate, wagesEarned, balanceDue };
  }, [staffSalaryHistory, staffAttendanceHistory, selectedStaff]);

  // Total daily salaries for selected date
  const totalSalariesForDate = useMemo(() => {
    return recentSalaries.reduce((sum, s) => sum + Number(s.amount), 0);
  }, [recentSalaries]);

  return (
    <div className="space-y-6 pb-20">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
              <Users className="text-primary" />
              Staff Management & Payroll
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
              Live Tracker
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Track daily attendance, issue salaries and advances, and sync daily labor costs directly into your P&L.
          </p>
        </div>

        {/* Global Action / Date Picker */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-sm text-sm font-semibold text-slate-700">
            <Calendar size={16} className="text-primary" />
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="outline-none bg-transparent cursor-pointer font-bold text-slate-800"
            />
          </div>

          <button
            onClick={() => setIsStaffModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-xl text-xs font-bold shadow-sm transition-all active:scale-95"
          >
            <UserPlus size={16} />
            Add Worker
          </button>
        </div>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div className="flex items-center gap-2 p-3 bg-emerald-50 text-emerald-800 text-xs font-bold rounded-xl border border-emerald-200 animate-in fade-in">
          <CheckCircle2 size={16} className="text-emerald-600" />
          {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className="flex items-center gap-2 p-3 bg-rose-50 text-rose-800 text-xs font-bold rounded-xl border border-rose-200 animate-in fade-in">
          <AlertCircle size={16} className="text-rose-600" />
          {errorMsg}
        </div>
      )}

      {/* Quick KPI Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Active Staff</span>
            <p className="text-2xl font-extrabold text-slate-800 mt-1">
              {staffList.filter(s => s.is_active).length} / {staffList.length}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Users size={20} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Present Today</span>
            <p className="text-2xl font-extrabold text-emerald-700 mt-1">
              {Object.values(dailyAttendance).filter(st => st === 'PRESENT').length} Workers
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 size={20} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Salaries Paid ({format(parseISO(selectedDate), 'dd MMM')})</span>
            <p className="text-2xl font-extrabold text-rose-600 mt-1">
              LKR {formatLKR(totalSalariesForDate)}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
            <DollarSign size={20} />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('ATTENDANCE')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
            activeTab === 'ATTENDANCE'
              ? 'bg-primary text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Calendar size={15} />
          Daily Attendance
        </button>

        <button
          onClick={() => setActiveTab('SALARIES')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
            activeTab === 'SALARIES'
              ? 'bg-primary text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <DollarSign size={15} />
          Staff Salaries & Advances
        </button>

        <button
          onClick={() => setActiveTab('STAFF')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
            activeTab === 'STAFF'
              ? 'bg-primary text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Users size={15} />
          Workers Roster ({staffList.length})
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: ATTENDANCE (BULK + SINGLE ROW) */}
      {/* ========================================================================= */}
      {activeTab === 'ATTENDANCE' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Controls Bar */}
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-xs font-bold text-slate-700">Quick Bulk Actions:</span>
              <button
                type="button"
                onClick={() => handleMarkAll('PRESENT')}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-100 text-emerald-800 hover:bg-emerald-200 transition-colors"
              >
                Mark All Present
              </button>
              <button
                type="button"
                onClick={() => handleMarkAll('ABSENT')}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-100 text-rose-800 hover:bg-rose-200 transition-colors"
              >
                Mark All Absent
              </button>
            </div>

            <button
              onClick={handleSaveAttendance}
              disabled={savingAttendance || staffList.length === 0}
              className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all disabled:opacity-50"
            >
              <Save size={16} />
              {savingAttendance ? 'Saving Attendance...' : 'Save Daily Attendance'}
            </button>
          </div>

          {/* Attendance Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100/70 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3">Worker Name</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3 text-center">Attendance Status</th>
                  <th className="px-4 py-3 text-right">Default Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {staffList.filter(s => s.is_active).length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-10 text-slate-400">
                      No active staff found. Click "+ Add Worker" above to add staff members.
                    </td>
                  </tr>
                ) : (
                  staffList.filter(s => s.is_active).map(worker => {
                    const status = dailyAttendance[worker.id] || 'PRESENT';

                    return (
                      <tr key={worker.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-5 py-3.5 font-bold text-slate-800">
                          <button
                            type="button"
                            onClick={() => handleOpenStaffSummary(worker)}
                            className="hover:text-primary hover:underline flex items-center gap-1.5"
                          >
                            {worker.name}
                            <ChevronRight size={13} className="text-slate-400" />
                          </button>
                        </td>
                        <td className="px-4 py-3.5 text-slate-600 font-medium">
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px] font-semibold">
                            {worker.role}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <div className="inline-flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                            <button
                              type="button"
                              onClick={() => setDailyAttendance({ ...dailyAttendance, [worker.id]: 'PRESENT' })}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                                status === 'PRESENT'
                                  ? 'bg-emerald-600 text-white shadow-sm'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              Present
                            </button>
                            <button
                              type="button"
                              onClick={() => setDailyAttendance({ ...dailyAttendance, [worker.id]: 'HALF_DAY' })}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                                status === 'HALF_DAY'
                                  ? 'bg-amber-500 text-white shadow-sm'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              Half Day
                            </button>
                            <button
                              type="button"
                              onClick={() => setDailyAttendance({ ...dailyAttendance, [worker.id]: 'ABSENT' })}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                                status === 'ABSENT'
                                  ? 'bg-rose-600 text-white shadow-sm'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              Absent
                            </button>
                            <button
                              type="button"
                              onClick={() => setDailyAttendance({ ...dailyAttendance, [worker.id]: 'LEAVE' })}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                                status === 'LEAVE'
                                  ? 'bg-blue-600 text-white shadow-sm'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              Leave
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-right font-semibold text-slate-700">
                          {worker.default_daily_rate ? `LKR ${formatLKR(Number(worker.default_daily_rate))}` : '—'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: STAFF SALARIES & PAYMENTS */}
      {/* ========================================================================= */}
      {activeTab === 'SALARIES' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Payment Form */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm h-fit">
            <h3 className="font-bold text-sm text-slate-800 mb-4 flex items-center gap-2">
              <DollarSign size={18} className="text-emerald-600" />
              Issue Salary / Advance Payment
            </h3>

            <form onSubmit={handleSaveSalary} className="space-y-4 text-xs">
              {/* Worker Dropdown */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Select Worker *</label>
                <select
                  value={salaryStaffId}
                  onChange={e => handleSelectStaffForSalary(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-primary/20 bg-white"
                  required
                >
                  <option value="">-- Choose Staff Member --</option>
                  {staffList.filter(s => s.is_active).map(w => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.role}) {w.default_daily_rate ? ` - LKR ${formatLKR(Number(w.default_daily_rate))}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Salary Amount */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Salary Amount (LKR) *</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={salaryAmount}
                  onChange={e => setSalaryAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-primary/20"
                  required
                />
              </div>

              {/* Payment Method */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Payment Method *</label>
                <select
                  value={salaryPaymentMethod}
                  onChange={e => setSalaryPaymentMethod(e.target.value as any)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-primary/20 bg-white"
                >
                  <option value="CASH">Cash</option>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                  <option value="RESTAURANT">Restaurant (Till / Cash Register)</option>
                </select>
              </div>

              {/* Reason Dropdown */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Payment Reason *</label>
                <select
                  value={salaryReasonType}
                  onChange={e => setSalaryReasonType(e.target.value as any)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-primary/20 bg-white"
                >
                  <option value="DAILY_WAGE">Daily Wage</option>
                  <option value="ADVANCE">Advance</option>
                  <option value="MONTHLY_SALARY">Monthly Salary</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              {/* Dynamic Other Details (if OTHER selected) */}
              {salaryReasonType === 'OTHER' && (
                <div className="animate-in fade-in">
                  <label className="block font-bold text-slate-700 mb-1">
                    Other Details <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Festival bonus, Overtime hours, Medical support"
                    value={salaryReasonDetails}
                    onChange={e => setSalaryReasonDetails(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs text-slate-800 outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={savingSalary}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-sm transition-all active:scale-95 disabled:opacity-50"
              >
                {savingSalary ? 'Recording Payment...' : 'Record Salary Payment'}
              </button>
            </form>
          </div>

          {/* Right: Payments Log for Date */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm text-slate-800">
                  Payments Issued on {format(parseISO(selectedDate), 'dd MMMM yyyy')}
                </h3>
                <span className="text-xs text-slate-400">
                  Automatically syncs into P&L "Daily Staff Salary"
                </span>
              </div>
              <span className="text-xs font-extrabold text-rose-600 bg-rose-50 px-3 py-1 rounded-xl border border-rose-200">
                Total: LKR {formatLKR(totalSalariesForDate)}
              </span>
            </div>

            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Worker</th>
                    <th className="px-4 py-3">Reason</th>
                    <th className="px-4 py-3">Method</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentSalaries.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-12 text-slate-400">
                        No salary payments recorded for this date.
                      </td>
                    </tr>
                  ) : (
                    recentSalaries.map(sal => (
                      <tr key={sal.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-4 py-3 font-bold text-slate-800">
                          {sal.staff_members?.name || 'Worker'}
                          <span className="block text-[11px] font-normal text-slate-400">
                            {sal.staff_members?.role}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-bold text-[10px] border border-blue-200">
                            {sal.reason_type.replace('_', ' ')}
                          </span>
                          {sal.reason_details && (
                            <p className="text-[11px] text-slate-500 mt-0.5">{sal.reason_details}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-600 font-semibold text-[11px]">
                          {sal.payment_method.replace('_', ' ')}
                        </td>
                        <td className="px-4 py-3 text-right font-extrabold text-slate-800">
                          LKR {formatLKR(Number(sal.amount))}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleDeleteSalary(sal.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                            title="Delete payment"
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
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: WORKERS ROSTER & DIRECTORY */}
      {/* ========================================================================= */}
      {activeTab === 'STAFF' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sm text-slate-800">Staff Members Directory</h3>
              <p className="text-xs text-slate-400">Click any worker name to view their full attendance & salary history</p>
            </div>
            <button
              onClick={() => setIsStaffModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-bold"
            >
              <UserPlus size={14} /> Add Worker
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3">Name</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3 text-right">Default Daily Rate</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {staffList.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-12 text-slate-400">
                      No staff members found. Click "+ Add Worker" to add your first employee.
                    </td>
                  </tr>
                ) : (
                  staffList.map(worker => (
                    <tr key={worker.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-5 py-3.5 font-bold text-slate-800">
                        <button
                          type="button"
                          onClick={() => handleOpenStaffSummary(worker)}
                          className="hover:text-primary hover:underline flex items-center gap-1.5"
                        >
                          {worker.name}
                          <ChevronRight size={13} className="text-slate-400" />
                        </button>
                      </td>
                      <td className="px-4 py-3.5 text-slate-600 font-medium">
                        {worker.role}
                      </td>
                      <td className="px-4 py-3.5 text-right font-semibold text-slate-700">
                        {worker.default_daily_rate ? `LKR ${formatLKR(Number(worker.default_daily_rate))}` : '—'}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          worker.is_active ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {worker.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleStaffStatus(worker)}
                          className="text-[11px] font-bold text-slate-500 hover:text-primary hover:underline"
                        >
                          {worker.is_active ? 'Set Inactive' : 'Set Active'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ADD NEW STAFF MEMBER */}
      {/* ========================================================================= */}
      {isStaffModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl border border-slate-100 max-w-md w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setIsStaffModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
            >
              <X size={18} />
            </button>

            <h3 className="text-base font-bold text-slate-800 mb-1 flex items-center gap-2">
              <UserPlus size={18} className="text-primary" />
              Add New Staff Member
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Enter worker details to track daily attendance and payments.
            </p>

            <form onSubmit={handleCreateStaff} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Full Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Sunil Perera"
                  value={newStaffName}
                  onChange={e => setNewStaffName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-primary/20"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Role / Designation *</label>
                <input
                  type="text"
                  placeholder="e.g. Chef, Kitchen Helper, Cashier, Steward"
                  value={newStaffRole}
                  onChange={e => setNewStaffRole(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-primary/20"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Default Daily Rate (LKR) <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="e.g. 3500.00"
                  value={newStaffDailyRate}
                  onChange={e => setNewStaffDailyRate(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-primary/20"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Auto-suggests this amount when paying daily wages.
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsStaffModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingNewStaff}
                  className="px-5 py-2 bg-primary hover:bg-primary-dark text-white rounded-xl text-xs font-bold shadow-sm transition-all"
                >
                  {savingNewStaff ? 'Adding...' : 'Add Worker'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* DRAWER / MODAL: WORKER PROFILE SUMMARY */}
      {/* ========================================================================= */}
      {selectedStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl border border-slate-100 w-full max-w-2xl max-h-[90vh] shadow-2xl flex flex-col overflow-hidden">
            {/* Header */}
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 text-primary font-extrabold flex items-center justify-center text-base">
                  {selectedStaff.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-800">{selectedStaff.name}</h3>
                  <span className="text-xs font-medium text-slate-500">
                    {selectedStaff.role} • {selectedStaff.default_daily_rate ? `Daily Rate: LKR ${formatLKR(Number(selectedStaff.default_daily_rate))}` : 'No Daily Rate'}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedStaff(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X size={20} />
              </button>
            </div>

            {/* Quick Stats Banner */}
            <div className="p-4 bg-slate-100/50 border-b border-slate-200 grid grid-cols-5 gap-2 text-center text-xs">
              <div className="bg-white p-2 rounded-xl border border-slate-200">
                <span className="text-[10px] text-slate-400 font-bold uppercase">Total Paid</span>
                <p className="font-extrabold text-emerald-700 mt-0.5">LKR {formatLKR(staffStats.totalPaid)}</p>
              </div>
              <div className="bg-white p-2 rounded-xl border border-slate-200">
                <span className="text-[10px] text-slate-400 font-bold uppercase">Present</span>
                <p className="font-extrabold text-slate-800 mt-0.5">{staffStats.presentDays} days</p>
              </div>
              <div className="bg-white p-2 rounded-xl border border-slate-200">
                <span className="text-[10px] text-slate-400 font-bold uppercase">Half Days</span>
                <p className="font-extrabold text-amber-600 mt-0.5">{staffStats.halfDays} days</p>
              </div>
              <div className="bg-white p-2 rounded-xl border border-slate-200">
                <span className="text-[10px] text-slate-400 font-bold uppercase">Absent</span>
                <p className="font-extrabold text-rose-600 mt-0.5">{staffStats.absentDays} days</p>
              </div>
              <div className="bg-white p-2 rounded-xl border border-slate-200">
                <span className="text-[10px] text-slate-400 font-bold uppercase">Leave</span>
                <p className="font-extrabold text-blue-600 mt-0.5">{staffStats.leaveDays} days</p>
              </div>
            </div>

            {/* Wage Calculation Summary */}
            {staffStats.dailyRate > 0 && (
              <div className="px-4 py-3 bg-amber-50/70 border-b border-amber-200/60">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 text-xs text-amber-800 font-semibold">
                    <DollarSign size={15} className="text-amber-600 shrink-0" />
                    <span>
                      Wage Calculation (Last 30 Days) —&nbsp;
                      <span className="font-bold">LKR {formatLKR(staffStats.dailyRate)} / day</span>
                      {staffStats.halfDays > 0 && (
                        <span className="text-amber-600 ml-1">
                          · {staffStats.presentDays} full + {staffStats.halfDays} half days
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs font-bold flex-wrap">
                    <div className="text-right">
                      <span className="text-slate-500 font-semibold block text-[10px] uppercase tracking-wider">Wages Earned</span>
                      <span className="text-slate-800 text-sm">LKR {formatLKR(staffStats.wagesEarned)}</span>
                    </div>
                    <div className="text-slate-300 text-lg font-light">−</div>
                    <div className="text-right">
                      <span className="text-slate-500 font-semibold block text-[10px] uppercase tracking-wider">Total Paid</span>
                      <span className="text-emerald-700 text-sm">LKR {formatLKR(staffStats.totalPaid)}</span>
                    </div>
                    <div className="text-slate-300 text-lg font-light">=</div>
                    <div className={`text-right px-3 py-1.5 rounded-xl border ${staffStats.balanceDue > 0 ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200'}`}>
                      <span className="text-slate-500 font-semibold block text-[10px] uppercase tracking-wider">Balance Due</span>
                      <span className={`text-sm font-black ${staffStats.balanceDue > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                        LKR {formatLKR(staffStats.balanceDue)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {staffStats.dailyRate === 0 && (
              <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 text-[11px] text-slate-400 italic flex items-center gap-1.5">
                <AlertCircle size={13} />
                No daily rate set for this worker — wage calculation unavailable.
              </div>
            )}

            {/* Content: Salary & Attendance History */}
            <div className="p-5 overflow-y-auto space-y-6 flex-1 text-xs">
              {staffHistoryLoading ? (
                <div className="text-center py-10 text-slate-400">Loading worker records...</div>
              ) : (
                <>
                  {/* Salary History */}
                  <div>
                    <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-1.5">
                      <DollarSign size={15} className="text-primary" />
                      Salary & Advance History
                    </h4>
                    {staffSalaryHistory.length === 0 ? (
                      <p className="text-slate-400 italic">No salary payments recorded for this worker.</p>
                    ) : (
                      <div className="border border-slate-200 rounded-xl overflow-hidden">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase">
                            <tr>
                              <th className="px-3 py-2">Date</th>
                              <th className="px-3 py-2">Reason</th>
                              <th className="px-3 py-2">Method</th>
                              <th className="px-3 py-2 text-right">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {staffSalaryHistory.map(h => (
                              <tr key={h.id} className="hover:bg-slate-50/70">
                                <td className="px-3 py-2 font-semibold text-slate-700">
                                  {format(parseISO(h.date), 'dd MMM yyyy')}
                                </td>
                                <td className="px-3 py-2">
                                  <span className="font-bold text-blue-700">
                                    {h.reason_type.replace('_', ' ')}
                                  </span>
                                  {h.reason_details && (
                                    <span className="text-slate-400 block text-[10px]">
                                      {h.reason_details}
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-slate-600">{h.payment_method.replace('_', ' ')}</td>
                                <td className="px-3 py-2 text-right font-extrabold text-slate-800">
                                  LKR {formatLKR(Number(h.amount))}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Attendance History */}
                  <div>
                    <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-1.5">
                      <Calendar size={15} className="text-primary" />
                      Recent Attendance (Last 30 Days)
                    </h4>
                    {staffAttendanceHistory.length === 0 ? (
                      <p className="text-slate-400 italic">No attendance records found.</p>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {staffAttendanceHistory.map(att => (
                          <div key={att.id} className="p-2.5 rounded-xl border border-slate-200 flex items-center justify-between bg-slate-50/50">
                            <span className="font-semibold text-slate-700 text-[11px]">
                              {format(parseISO(att.date), 'dd MMM (EEE)')}
                            </span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              att.status === 'PRESENT' ? 'bg-emerald-100 text-emerald-800' :
                              att.status === 'HALF_DAY' ? 'bg-amber-100 text-amber-800' :
                              att.status === 'LEAVE' ? 'bg-blue-100 text-blue-800' :
                              'bg-rose-100 text-rose-800'
                            }`}>
                              {att.status.replace('_', ' ')}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
