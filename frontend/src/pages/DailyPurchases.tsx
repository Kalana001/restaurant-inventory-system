import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { ShoppingBag, Plus, Trash2, Edit2, Calendar } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface DailyPurchase {
  id: string;
  date: string;
  item_name: string;
  quantity: number;
  total_cost: number;
  department: string;
  created_at: string;
}

export const DailyPurchases: React.FC = () => {
  const { user } = useAuth();
  const [purchases, setPurchases] = useState<DailyPurchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  
  // Form State
  const [itemName, setItemName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [totalCost, setTotalCost] = useState('');
  const [department, setDepartment] = useState<'JAT' | 'KITCHEN'>('JAT');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchPurchases();
  }, [selectedDate]);

  const fetchPurchases = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('daily_purchases')
        .select('*')
        .eq('date', selectedDate)
        .order('created_at', { ascending: false });

      if (error) {
        // Table might not exist yet, suppress error if it's PGRST205
        if (error.code !== 'PGRST205') console.error(error);
        setPurchases([]);
      } else {
        setPurchases(data || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemName.trim() || !quantity || !totalCost || !user) return;

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('daily_purchases')
        .insert({
          date: selectedDate,
          item_name: itemName.trim(),
          quantity: Number(quantity),
          total_cost: Number(totalCost),
          department,
          created_by: user.id
        });

      if (error) throw error;
      
      // Reset form
      setItemName('');
      setQuantity('');
      setTotalCost('');
      
      fetchPurchases();
    } catch (err) {
      console.error('Error adding purchase:', err);
      alert('Failed to add purchase. Ensure the database table exists.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this purchase?')) return;
    
    try {
      const { error } = await supabase.from('daily_purchases').delete().eq('id', id);
      if (error) throw error;
      fetchPurchases();
    } catch (err) {
      console.error('Error deleting:', err);
    }
  };

  const totalJat = purchases.filter(p => p.department === 'JAT').reduce((sum, p) => sum + Number(p.total_cost), 0);
  const totalKitchen = purchases.filter(p => p.department === 'KITCHEN').reduce((sum, p) => sum + Number(p.total_cost), 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <ShoppingBag className="text-primary" /> Daily Market Purchases
        </h2>
        <p className="text-sm text-slate-500 mt-1">Record daily cash purchases like vegetables without tracking stock.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Col: Entry Form */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 lg:col-span-1">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Plus size={18} className="text-primary" /> Add New Purchase
          </h3>
          
          <form onSubmit={handleAddPurchase} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Date</label>
              <input 
                type="date" 
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                required
              />
            </div>
            
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Item Name</label>
              <input 
                type="text" 
                placeholder="e.g. Carrots, Cabbage"
                value={itemName}
                onChange={e => setItemName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                required
              />
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Quantity</label>
                <input 
                  type="number" 
                  step="0.01"
                  min="0"
                  placeholder="e.g. 5"
                  value={quantity}
                  onChange={e => setQuantity(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Total Cost (LKR)</label>
                <input 
                  type="number" 
                  step="0.01"
                  min="0"
                  placeholder="e.g. 2500"
                  value={totalCost}
                  onChange={e => setTotalCost(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Used For</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDepartment('JAT')}
                  className={`py-2 rounded-lg font-bold text-sm transition-colors ${department === 'JAT' ? 'bg-orange-100 text-orange-700 border-2 border-orange-500' : 'bg-slate-50 text-slate-500 border-2 border-transparent hover:bg-slate-100'}`}
                >
                  JAT
                </button>
                <button
                  type="button"
                  onClick={() => setDepartment('KITCHEN')}
                  className={`py-2 rounded-lg font-bold text-sm transition-colors ${department === 'KITCHEN' ? 'bg-blue-100 text-blue-700 border-2 border-blue-500' : 'bg-slate-50 text-slate-500 border-2 border-transparent hover:bg-slate-100'}`}
                >
                  KITCHEN
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full mt-4 bg-primary text-white font-bold py-3 rounded-xl shadow-md hover:bg-primary-dark transition-colors disabled:opacity-50"
            >
              {submitting ? 'Adding...' : 'Add Purchase'}
            </button>
          </form>
        </div>

        {/* Right Col: List & Summary */}
        <div className="lg:col-span-2 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-orange-50 rounded-2xl p-4 border border-orange-100 flex justify-between items-center">
              <div>
                <p className="text-sm font-semibold text-orange-700 uppercase tracking-wide">JAT Total Cost</p>
                <p className="text-2xl font-black text-orange-900 mt-1">LKR {totalJat.toLocaleString()}</p>
              </div>
            </div>
            <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100 flex justify-between items-center">
              <div>
                <p className="text-sm font-semibold text-blue-700 uppercase tracking-wide">Kitchen Total Cost</p>
                <p className="text-2xl font-black text-blue-900 mt-1">LKR {totalKitchen.toLocaleString()}</p>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Calendar size={18} className="text-slate-400" /> Purchases on {selectedDate}
              </h3>
            </div>
            
            {loading ? (
              <div className="p-8 text-center text-slate-400">Loading purchases...</div>
            ) : purchases.length === 0 ? (
              <div className="p-12 text-center flex flex-col items-center">
                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                  <ShoppingBag size={24} className="text-slate-300" />
                </div>
                <h3 className="text-lg font-bold text-slate-700 mb-1">No Purchases Found</h3>
                <p className="text-slate-500 text-sm">You haven't added any market buys for this date.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wider">
                      <th className="px-6 py-3">Item Name</th>
                      <th className="px-6 py-3 text-right">Qty</th>
                      <th className="px-6 py-3 text-center">Department</th>
                      <th className="px-6 py-3 text-right">Total Cost</th>
                      <th className="px-6 py-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {purchases.map(p => (
                      <tr key={p.id} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="px-6 py-3 font-semibold text-slate-800">{p.item_name}</td>
                        <td className="px-6 py-3 text-right text-slate-600 font-medium">{Number(p.quantity).toLocaleString()}</td>
                        <td className="px-6 py-3 text-center">
                          <span className={`text-xs font-bold px-2 py-1 rounded-full ${p.department === 'JAT' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                            {p.department}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-right font-bold text-slate-700">LKR {Number(p.total_cost).toLocaleString()}</td>
                        <td className="px-6 py-3 text-center">
                          <button
                            onClick={() => handleDelete(p.id)}
                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                            title="Delete"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
