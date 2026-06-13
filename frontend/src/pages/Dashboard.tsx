import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { supabase } from '../lib/supabase';
import { 
  TrendingUp,
  TrendingDown, 
  AlertTriangle, 
  PackageMinus, 
  CalendarDays, 
  Wallet, 
  Boxes,
  RefreshCw
} from 'lucide-react';

interface Metrics {
  total_items: number;
  total_inventory_value: number;
  low_stock_items: number;
  out_of_stock_items: number;
  expiring_items_30_days: number;
  total_supplier_outstanding: number;
}

export const Dashboard: React.FC = () => {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [activities, setActivities] = useState<any[]>([]);
  const [jatTotal, setJatTotal] = useState(0);
  const [jatUnsettled, setJatUnsettled] = useState(0);
  const [kitchenMonthTotal, setKitchenMonthTotal] = useState(0);
  const [kitchenDailyTotal, setKitchenDailyTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [realTimeInventoryValue, setRealTimeInventoryValue] = useState(0);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      // Fetch Dashboard Metrics
      const { data: metricsData, error: metricsErr } = await supabase
        .from('dashboard_metrics_view')
        .select('*')
        .single();

      if (!metricsErr && metricsData) {
        setMetrics(metricsData as Metrics);
      }

      // Manually calculate true Total Inventory Value in real-time
      const { data: batchesData } = await supabase
        .from('batches')
        .select('available_qty, inventory_items!inner(cost_price, status)')
        .eq('status', 'ACTIVE')
        .gt('available_qty', 0);
        
      if (batchesData) {
        const trueTotalValue = batchesData.reduce((sum, b: any) => {
          if (b.inventory_items?.status === 'ACTIVE') {
            return sum + ((Number(b.available_qty) || 0) * (Number(b.inventory_items.cost_price) || 0));
          }
          return sum;
        }, 0);
        setRealTimeInventoryValue(trueTotalValue);
      }

      // Fetch JAT & Kitchen Stats
      const { data: reasonsData } = await supabase.from('movement_reasons').select('id, name').in('name', ['JAT', 'Kitchen Usage']);
      if (reasonsData) {
        const jatReason = reasonsData.find(r => r.name === 'JAT');
        const kitchenReason = reasonsData.find(r => r.name === 'Kitchen Usage');

        const [ { data: jatMoves }, { data: settledJatData }, { data: kitchenMoves }, { data: dailyPurchases }, { data: transCosts } ] = await Promise.all([
          jatReason ? supabase.from('stock_movements').select('quantity, cost_price').eq('type', 'STOCK_OUT').eq('reason_id', jatReason.id) : Promise.resolve({ data: [] }),
          supabase.from('jat_settlements').select('amount').neq('status', 'BOUNCED'),
          kitchenReason ? supabase.from('stock_movements').select('quantity, cost_price, created_at').eq('type', 'STOCK_OUT').eq('reason_id', kitchenReason.id) : Promise.resolve({ data: [] }),
          supabase.from('daily_purchases').select('total_cost, department, date'),
          supabase.from('transportation_costs').select('cost, department, date')
        ]);
        
        let totalJat = jatMoves?.reduce((sum, row) => sum + (Number(row.quantity) * Number(row.cost_price)), 0) || 0;
        const settled = settledJatData?.reduce((sum, row) => sum + (Number(row.amount) || 0), 0) || 0;
        
        // Add JAT purchases and trans costs to totalJat
        if (dailyPurchases) {
          totalJat += dailyPurchases
            .filter(dp => dp.department === 'JAT')
            .reduce((sum, dp) => sum + (Number(dp.total_cost) || 0), 0);
        }
        if (transCosts) {
          totalJat += transCosts
            .filter(tc => tc.department === 'JAT')
            .reduce((sum, tc) => sum + (Number(tc.cost) || 0), 0);
        }

        setJatTotal(totalJat);
        setJatUnsettled(Math.max(0, totalJat - settled));

        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        
        // For DP and TC, dates are stored as YYYY-MM-DD
        const todayStr = format(now, 'yyyy-MM-dd');
        const monthStartStr = todayStr.substring(0, 8) + '01'; // YYYY-MM-01

        let mTotalKitchen = 0;
        let dTotalKitchen = 0;

        if (kitchenMoves) {
          kitchenMoves.forEach(m => {
            const cost = Number(m.quantity) * Number(m.cost_price);
            if (m.created_at >= monthStart) mTotalKitchen += cost;
            if (m.created_at >= todayStart) dTotalKitchen += cost;
          });
        }
        
        if (dailyPurchases) {
          dailyPurchases.forEach(dp => {
            if (dp.department === 'KITCHEN') {
              const cost = Number(dp.total_cost) || 0;
              if (dp.date >= monthStartStr) mTotalKitchen += cost;
              if (dp.date === todayStr) dTotalKitchen += cost;
            }
          });
        }
        
        if (transCosts) {
          transCosts.forEach(tc => {
            if (tc.department === 'KITCHEN') {
              const cost = Number(tc.cost) || 0;
              if (tc.date >= monthStartStr) mTotalKitchen += cost;
              if (tc.date === todayStr) dTotalKitchen += cost;
            }
          });
        }

        setKitchenMonthTotal(mTotalKitchen);
        setKitchenDailyTotal(dTotalKitchen);
      }

      const { data: moves, error: moveErr } = await supabase
        .from('stock_movements')
        .select(`
          id,
          movement_number,
          type,
          quantity,
          created_at,
          inventory_items ( name, base_unit:units!inventory_items_base_unit_id_fkey ( abbreviation ) )
        `)
        .order('created_at', { ascending: false })
        .limit(10);

      if (!moveErr && moves) {
        setActivities(moves);
      }
    } catch (err) {
      console.error('Error fetching dashboard content:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  if (loading && !metrics) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const statCards = [
    {
      title: 'Total Items Cataloged',
      value: metrics?.total_items || 0,
      icon: <Boxes size={24} className="text-blue-500" />,
      bg: 'bg-blue-50 border-blue-100',
    },
    {
      title: 'Total Inventory Value',
      value: `LKR ${Number(realTimeInventoryValue).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`,
      icon: <TrendingUp size={24} className="text-green-500" />,
      bg: 'bg-green-50 border-green-100',
    },
    {
      title: 'Low Stock Alerts',
      value: metrics?.low_stock_items || 0,
      icon: <AlertTriangle size={24} className="text-amber-500" />,
      bg: 'bg-amber-50 border-amber-100',
    },
    {
      title: 'Out of Stock Items',
      value: metrics?.out_of_stock_items || 0,
      icon: <PackageMinus size={24} className="text-rose-500" />,
      bg: 'bg-rose-50 border-rose-100',
    },
    {
      title: 'Expiring Soon (30 Days)',
      value: metrics?.expiring_items_30_days || 0,
      icon: <CalendarDays size={24} className="text-orange-500" />,
      bg: 'bg-orange-50 border-orange-100',
    },
    {
      title: 'Supplier Balance Outstanding',
      value: `LKR ${Number(metrics?.total_supplier_outstanding || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      icon: <Wallet size={24} className="text-indigo-500" />,
      bg: 'bg-indigo-50 border-indigo-100',
    },
    {
      title: 'JAT Unsettled Balance',
      value: `LKR ${jatUnsettled.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      icon: <AlertTriangle size={24} className="text-pink-500" />,
      bg: 'bg-pink-50 border-pink-100',
    },
    {
      title: 'Kitchen Cost (Month)',
      value: `LKR ${kitchenMonthTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      icon: <TrendingDown size={24} className="text-sky-500" />,
      bg: 'bg-sky-50 border-sky-100',
    },
    {
      title: 'Kitchen Cost (Today)',
      value: `LKR ${kitchenDailyTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      icon: <TrendingDown size={24} className="text-cyan-500" />,
      bg: 'bg-cyan-50 border-cyan-100',
    }
  ];

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">System Summary</h2>
          <p className="text-sm text-slate-500">Real-time status overview of Sigiri Catering and Food Centre inventory</p>
        </div>
        <button 
          onClick={fetchDashboardData}
          className="flex items-center space-x-2 px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold rounded-xl text-sm transition-all"
        >
          <RefreshCw size={16} />
          <span>Refresh</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {statCards.map((card, idx) => (
          <div key={idx} className={`p-6 rounded-2xl border flex items-center justify-between shadow-sm card-shadow bg-white ${card.bg}`}>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{card.title}</p>
              <h3 className="text-xl font-extrabold text-slate-800">{card.value}</h3>
            </div>
            <div className="p-3 bg-white rounded-xl shadow-sm border border-slate-50">
              {card.icon}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm card-shadow space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <h3 className="font-bold text-slate-800">Recent Stock Movements</h3>
        </div>
        <div className="divide-y divide-slate-100">
          {activities.length === 0 ? (
            <p className="text-slate-400 text-sm py-4">No recent stock movements found.</p>
          ) : (
            activities.map((move) => (
              <div key={move.id} className="py-3.5 flex items-center justify-between first:pt-0 last:pb-0">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-slate-800">{move.inventory_items?.name}</p>
                  <div className="flex items-center space-x-2 text-xs text-slate-400 font-medium">
                    <span>{move.movement_number}</span>
                    <span>•</span>
                    <span>{new Date(move.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold uppercase
                    ${move.type === 'STOCK_IN' ? 'bg-green-50 text-green-700' : ''}
                    ${move.type === 'STOCK_OUT' ? 'bg-rose-50 text-rose-700' : ''}
                    ${move.type === 'ADJUSTMENT' ? 'bg-amber-50 text-amber-700' : ''}
                  `}>
                    {move.type === 'STOCK_IN' ? (
                      <span className="flex items-center gap-1"><TrendingUp size={12}/> IN: {move.quantity} {move.inventory_items?.base_unit?.abbreviation}</span>
                    ) : move.type === 'STOCK_OUT' ? (
                      <span className="flex items-center gap-1"><TrendingDown size={12}/> OUT: {move.quantity} {move.inventory_items?.base_unit?.abbreviation}</span>
                    ) : (
                      <span>{move.quantity} {move.inventory_items?.base_unit?.abbreviation}</span>
                    )}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
export default Dashboard;

