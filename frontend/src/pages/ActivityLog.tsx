import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Activity, Search, Calendar as CalendarIcon, Filter, ArrowUpRight, ArrowDownRight, Edit3 } from 'lucide-react';
import { format } from 'date-fns';
import { Pagination } from '../components/ui/Pagination';

export const ActivityLog: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<any[]>([]);

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalCount, setTotalCount] = useState(0);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState('');
  const [selectedType, setSelectedType] = useState('');

  const fetchLogs = async () => {
    setLoading(true);
    try {
      // Fetch users for the filter dropdown (only if not loaded)
      if (users.length === 0) {
        const { data: usersData } = await supabase.from('profiles').select('id, username').order('username');
        if (usersData) setUsers(usersData);
      }

      // Base query for stock movements
      let query = supabase
        .from('stock_movements')
        .select(`
          *,
          profiles:created_by (username),
          inventory_items (name, units:units!inventory_items_base_unit_id_fkey(abbreviation)),
          movement_reasons (name)
        `, { count: 'exact' })
        .order('created_at', { ascending: false });

      if (selectedUser) {
        query = query.eq('created_by', selectedUser);
      }
      if (selectedType) {
        query = query.eq('type', selectedType);
      }
      if (search) {
        // Simple search on movement_number. For related tables, it's harder to do in one query without a view, but we can do our best or rely on exact matches.
        // PostgREST ilike on nested tables is tricky. If they want search on items, it might be better to do server-side text search if configured, but let's just do movement_number here.
        query = query.ilike('movement_number', `%${search}%`);
      }

      // Pagination
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      const { data, count, error } = await query;

      if (error) throw error;
      
      setLogs(data || []);
      if (count !== null) setTotalCount(count);
    } catch (err) {
      console.error('Error fetching activity log:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [selectedUser, selectedType, page, pageSize, search]); 


  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'STOCK_IN': return <ArrowUpRight className="text-green-500" size={16} />;
      case 'STOCK_OUT': return <ArrowDownRight className="text-red-500" size={16} />;
      case 'ADJUSTMENT': return <Edit3 className="text-orange-500" size={16} />;
      default: return <Activity className="text-slate-500" size={16} />;
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'STOCK_IN': return 'bg-green-100 text-green-700 border-green-200';
      case 'STOCK_OUT': return 'bg-red-100 text-red-700 border-red-200';
      case 'ADJUSTMENT': return 'bg-orange-100 text-orange-700 border-orange-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <Activity className="text-primary" />
            Activity Log
          </h2>
          <p className="text-sm text-slate-500 mt-1">Comprehensive audit trail of all stock movements and user actions.</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 card-shadow flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-slate-400" />
          </div>
          <input
            type="text"
            placeholder="Search items, reasons, or reference..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="block w-full pl-10 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
          />
        </div>
        
        <div className="w-full md:w-48 relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Filter className="h-4 w-4 text-slate-400" />
          </div>
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="block w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary focus:border-transparent appearance-none bg-white"
          >
            <option value="">All Action Types</option>
            <option value="STOCK_IN">Stock In</option>
            <option value="STOCK_OUT">Stock Out</option>
            <option value="ADJUSTMENT">Adjustment</option>
          </select>
        </div>

        <div className="w-full md:w-48 relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Filter className="h-4 w-4 text-slate-400" />
          </div>
          <select
            value={selectedUser}
            onChange={(e) => setSelectedUser(e.target.value)}
            className="block w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary focus:border-transparent appearance-none bg-white"
          >
            <option value="">All Users</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.username}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="px-6 py-4 font-semibold">Date & Time</th>
                <th className="px-6 py-4 font-semibold">User</th>
                <th className="px-6 py-4 font-semibold">Action</th>
                <th className="px-6 py-4 font-semibold">Item</th>
                <th className="px-6 py-4 font-semibold text-right">Qty Changed</th>
                <th className="px-6 py-4 font-semibold">Reason / Reference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center">
                      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mb-2" />
                      Loading activity logs...
                    </div>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500 font-medium">
                    No activity logs found for the selected filters.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center text-slate-700">
                        <CalendarIcon size={14} className="mr-2 text-slate-400" />
                        <span className="font-medium">{format(new Date(log.created_at), 'MMM dd, yyyy')}</span>
                        <span className="text-slate-400 ml-2 text-xs">{format(new Date(log.created_at), 'hh:mm a')}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold">
                          {log.profiles?.username?.substring(0, 2).toUpperCase()}
                        </div>
                        <span className="font-semibold text-slate-800">{log.profiles?.username || 'Unknown'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold ${getTypeBadge(log.type)}`}>
                        {getTypeIcon(log.type)}
                        {log.type.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-semibold text-slate-800">{log.inventory_items?.name}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className={`font-bold ${log.type === 'STOCK_OUT' ? 'text-red-600' : 'text-green-600'}`}>
                        {log.type === 'STOCK_OUT' ? '-' : '+'}{Number(log.quantity).toLocaleString()}
                      </span>
                      <span className="text-xs text-slate-500 ml-1.5">{log.inventory_items?.units?.abbreviation}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-medium text-slate-700">{log.movement_reasons?.name || 'N/A'}</span>
                        <span className="text-xs text-slate-400">{log.movement_number}</span>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!loading && logs.length > 0 && (
          <Pagination
            currentPage={page}
            totalCount={totalCount}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        )}
      </div>
    </div>
  );
};

export default ActivityLog;
