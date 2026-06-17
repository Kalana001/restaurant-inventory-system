import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Truck, Plus, Trash2, Calendar, Save, ClipboardList } from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';

interface TransportCost {
  id: string;
  date: string;
  reason: string;
  cost: number;
  department: string;
  created_at: string;
}

interface BulkItem {
  id: string;
  reason: string;
  cost: string;
  department: 'JAT' | 'KITCHEN';
}

export const Transportation: React.FC = () => {
  const { user } = useAuth();
  const [costs, setCosts] = useState<TransportCost[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  
  // Bulk Entry State
  const [bulkItems, setBulkItems] = useState<BulkItem[]>([
    { id: Date.now().toString(), reason: '', cost: '', department: 'JAT' }
  ]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchCosts();
  }, [selectedDate]);

  const fetchCosts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('transportation_costs')
        .select('*')
        .eq('date', selectedDate)
        .order('created_at', { ascending: false });

      if (error) {
        if (error.code !== 'PGRST205') console.error(error);
        setCosts([]);
      } else {
        setCosts(data || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const addRow = () => {
    setBulkItems([...bulkItems, { id: Date.now().toString() + Math.random(), reason: '', cost: '', department: 'JAT' }]);
  };

  const removeRow = (id: string) => {
    setBulkItems(bulkItems.filter(item => item.id !== id));
  };

  const updateRow = (id: string, field: keyof BulkItem, value: string) => {
    setBulkItems(bulkItems.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const handleSaveBulk = async () => {
    // Filter out completely empty rows
    const validItems = bulkItems.filter(i => i.reason.trim() || i.cost);
    
    if (validItems.length === 0) {
      alert("Please enter at least one transport cost.");
      return;
    }

    // Validate
    const invalidItem = validItems.find(i => !i.reason.trim() || !i.cost);
    if (invalidItem) {
      alert("Please ensure all filled rows have a reason and cost.");
      return;
    }

    setSubmitting(true);
    try {
      const rowsToInsert = validItems.map(item => ({
        date: selectedDate,
        reason: item.reason.trim(),
        cost: Number(item.cost),
        department: item.department,
        created_by: user?.id
      }));

      const { error } = await supabase.from('transportation_costs').insert(rowsToInsert);
      if (error) throw error;
      
      // Reset form to one empty row
      setBulkItems([{ id: Date.now().toString(), reason: '', cost: '', department: 'JAT' }]);
      fetchCosts();
    } catch (err: any) {
      console.error('Error adding transportation costs:', err);
      alert(err.message || 'Failed to save transportation costs. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this record?')) return;
    try {
      const { error } = await supabase.from('transportation_costs').delete().eq('id', id);
      if (error) throw error;
      fetchCosts();
    } catch (err) {
      console.error('Error deleting:', err);
    }
  };

  const totalJat = costs.filter(p => p.department === 'JAT').reduce((sum, p) => sum + Number(p.cost), 0);
  const totalKitchen = costs.filter(p => p.department === 'KITCHEN').reduce((sum, p) => sum + Number(p.cost), 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Truck className="text-primary" /> Transportation Costs
        </h2>
        <p className="text-sm text-slate-500 mt-1">Record transport expenses like Three-wheelers, buses, or delivery fees.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left Col: Bulk Entry Form */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 xl:col-span-7">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <Plus size={18} className="text-primary" /> Enter Costs
            </h3>
            <div className="flex gap-2">
              <input 
                type="date" 
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                required
              />
            </div>
          </div>
          
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-bold text-slate-500 uppercase">
                  <th className="pb-2 pr-2">Reason (e.g. Three-wheeler)</th>
                  <th className="pb-2 pr-2 w-32">Price (LKR)</th>
                  <th className="pb-2 pr-2 w-36">Used For</th>
                  <th className="pb-2 w-10 text-center"></th>
                </tr>
              </thead>
              <tbody>
                {bulkItems.map((item, index) => (
                  <tr key={item.id} className="group">
                    <td className="py-2 pr-2">
                      <input 
                        type="text" 
                        placeholder="Transport reason..."
                        value={item.reason}
                        onChange={e => updateRow(item.id, 'reason', e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <input 
                        type="number" 
                        placeholder="Cost"
                        step="0.01" min="0"
                        value={item.cost}
                        onChange={e => updateRow(item.id, 'cost', e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <select
                        value={item.department}
                        onChange={e => updateRow(item.id, 'department', e.target.value)}
                        className={`w-full px-3 py-2 text-sm font-semibold border rounded-lg outline-none transition-colors ${item.department === 'JAT' ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}
                      >
                        <option value="JAT">JAT</option>
                        <option value="KITCHEN">KITCHEN</option>
                      </select>
                    </td>
                    <td className="py-2 text-center">
                      <button
                        type="button"
                        onClick={() => removeRow(item.id)}
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="Remove row"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-between items-center mt-6 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={addRow}
              className="flex items-center gap-1.5 text-sm font-bold text-slate-600 hover:text-primary transition-colors"
            >
              <Plus size={16} /> Add Another Row
            </button>

            <button
              onClick={handleSaveBulk}
              disabled={submitting}
              className="flex items-center gap-2 bg-primary text-white font-bold py-2.5 px-6 rounded-xl shadow-md shadow-primary/20 hover:bg-primary-dark transition-all active:scale-95 disabled:opacity-50"
            >
              <Save size={18} />
              {submitting ? 'Saving...' : 'Save Costs'}
            </button>
          </div>
        </div>

        {/* Right Col: List & Summary */}
        <div className="xl:col-span-5 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-orange-50 rounded-2xl p-4 border border-orange-100 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10"><Truck size={48} className="text-orange-900" /></div>
              <p className="text-sm font-bold text-orange-700 uppercase tracking-wide">JAT Transport</p>
              <p className="text-2xl font-black text-orange-900 mt-1 relative z-10">LKR {totalJat.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
            </div>
            <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10"><Truck size={48} className="text-blue-900" /></div>
              <p className="text-sm font-bold text-blue-700 uppercase tracking-wide">Kitchen Transport</p>
              <p className="text-2xl font-black text-blue-900 mt-1 relative z-10">LKR {totalKitchen.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
            </div>
          </div>

          <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Calendar size={18} className="text-slate-400" /> Saved on {selectedDate}
              </h3>
            </div>
            
            {loading ? (
              <div className="p-8 text-center text-slate-400">Loading...</div>
            ) : costs.length === 0 ? (
              <div className="p-10 text-center flex flex-col items-center">
                <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mb-3">
                  <Truck size={20} className="text-slate-300" />
                </div>
                <p className="text-slate-500 text-sm">No transport costs added for this date yet.</p>
              </div>
            ) : (
              <div className="max-h-[500px] overflow-y-auto">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-white/95 backdrop-blur shadow-sm">
                    <tr className="bg-slate-50/80 text-xs font-bold text-slate-500 uppercase tracking-wider">
                      <th className="px-4 py-3">Reason</th>
                      <th className="px-4 py-3 text-right">Cost</th>
                      <th className="px-4 py-3 text-center w-12"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {costs.map(p => (
                      <tr key={p.id} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="px-4 py-3">
                          <p className="font-bold text-slate-800">{p.reason}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${p.department === 'JAT' ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
                              {p.department}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-black text-slate-700 align-top">
                          {Number(p.cost).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 text-center align-top">
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
