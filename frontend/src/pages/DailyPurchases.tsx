import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { ShoppingBag, Plus, Trash2, Calendar, Save, ClipboardList } from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import { Pagination } from '../components/ui/Pagination';

interface DailyPurchase {
  id: string;
  date: string;
  item_name: string;
  quantity: number;
  total_cost: number;
  department: string;
  created_at: string;
}

interface BulkItem {
  id: string;
  item_name: string;
  quantity: string;
  unit_price: string;
  total_cost: string;
  department: 'JAT' | 'KITCHEN';
}

const COMMON_ITEMS = [
  'Carrots',
  'Leeks',
  'Cabbage',
  'Beans',
  'Tomatoes',
  'Big Onions',
  'Red Onions',
  'Potatoes',
  'Green Chilies',
  'Garlic',
  'Ginger'
];

export const DailyPurchases: React.FC = () => {
  const { user } = useAuth();
  const [purchases, setPurchases] = useState<DailyPurchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  
  // Bulk Entry State
  const [bulkItems, setBulkItems] = useState<BulkItem[]>([
    { id: Date.now().toString(), item_name: '', quantity: '', unit_price: '', total_cost: '', department: 'JAT' }
  ]);
  const [submitting, setSubmitting] = useState(false);

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalCount, setTotalCount] = useState(0);
  const [totalJat, setTotalJat] = useState(0);
  const [totalKitchen, setTotalKitchen] = useState(0);

  useEffect(() => {
    fetchPurchases();
  }, [selectedDate, page, pageSize]);

  const fetchPurchases = async () => {
    setLoading(true);
    try {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      // 1. Fetch paginated data
      const { data, count, error } = await supabase
        .from('daily_purchases')
        .select('*', { count: 'exact' })
        .eq('date', selectedDate)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error && error.code !== 'PGRST205') console.error(error);
      setPurchases(data || []);
      if (count !== null) setTotalCount(count);

      // 2. Fetch totals for the day (unpaginated for accurate summary)
      const { data: allData } = await supabase
        .from('daily_purchases')
        .select('department, total_cost')
        .eq('date', selectedDate);
        
      if (allData) {
        setTotalJat(allData.filter(p => p.department === 'JAT').reduce((sum, p) => sum + Number(p.total_cost), 0));
        setTotalKitchen(allData.filter(p => p.department === 'KITCHEN').reduce((sum, p) => sum + Number(p.total_cost), 0));
      } else {
        setTotalJat(0);
        setTotalKitchen(0);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const addRow = () => {
    setBulkItems([...bulkItems, { id: Date.now().toString() + Math.random(), item_name: '', quantity: '', unit_price: '', total_cost: '', department: 'JAT' }]);
  };

  const removeRow = (id: string) => {
    setBulkItems(bulkItems.filter(item => item.id !== id));
  };

  const updateRow = (id: string, field: keyof BulkItem, value: string) => {
    setBulkItems(bulkItems.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const loadTemplate = (department: 'JAT' | 'KITCHEN') => {
    const templateItems = COMMON_ITEMS.map((name, index) => ({
      id: Date.now().toString() + index,
      item_name: name,
      quantity: '',
      unit_price: '',
      total_cost: '',
      department
    }));
    
    // If the only row is empty, replace it. Otherwise, append.
    if (bulkItems.length === 1 && !bulkItems[0].item_name && !bulkItems[0].quantity && !bulkItems[0].total_cost) {
      setBulkItems(templateItems);
    } else {
      setBulkItems([...bulkItems, ...templateItems]);
    }
  };

  const handleSaveBulk = async () => {
    // Filter out completely empty rows
    const validItems = bulkItems.filter(i => i.item_name.trim() || i.quantity || i.total_cost);
    
    if (validItems.length === 0) {
      alert("Please enter at least one item.");
      return;
    }

    // Validate
    const invalidItem = validItems.find(i => !i.item_name.trim() || !i.quantity || !i.total_cost);
    if (invalidItem) {
      alert("Please ensure all filled rows have a name, quantity, and cost.");
      return;
    }

    setSubmitting(true);
    try {
      const rowsToInsert = validItems.map(item => ({
        date: selectedDate,
        item_name: item.item_name.trim(),
        quantity: Number(item.quantity),
        total_cost: Number(item.total_cost),
        department: item.department,
        created_by: user?.id
      }));

      const { error } = await supabase.from('daily_purchases').insert(rowsToInsert);
      if (error) throw error;
      
      // Reset form to one empty row
      setBulkItems([{ id: Date.now().toString(), item_name: '', quantity: '', unit_price: '', total_cost: '', department: 'JAT' }]);
      fetchPurchases();
    } catch (err: any) {
      console.error('Error adding purchases:', err);
      alert(err.message || 'Failed to save bulk purchases. Please try again.');
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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <ShoppingBag className="text-primary" /> Daily Market Purchases
        </h2>
        <p className="text-sm text-slate-500 mt-1">Add items in bulk using templates or blank rows.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left Col: Bulk Entry Form (wider now) */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 xl:col-span-7">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <Plus size={18} className="text-primary" /> Bulk Entry
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

          <div className="flex gap-2 mb-4">
            <button
              type="button"
              onClick={() => loadTemplate('JAT')}
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 bg-orange-50 text-orange-700 hover:bg-orange-100 rounded-lg transition-colors border border-orange-200"
            >
              <ClipboardList size={14} /> Load JAT Template
            </button>
            <button
              type="button"
              onClick={() => loadTemplate('KITCHEN')}
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg transition-colors border border-blue-200"
            >
              <ClipboardList size={14} /> Load Kitchen Template
            </button>
          </div>
          
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-bold text-slate-500 uppercase">
                  <th className="pb-2 pr-2">Item Name</th>
                  <th className="pb-2 pr-2 w-20">Qty</th>
                  <th className="pb-2 pr-2 w-24">Unit Price</th>
                  <th className="pb-2 pr-2 w-24">Total Cost</th>
                  <th className="pb-2 pr-2 w-28">Used For</th>
                  <th className="pb-2 w-10 text-center"></th>
                </tr>
              </thead>
              <tbody>
                {bulkItems.map((item, index) => (
                  <tr key={item.id} className="group">
                    <td className="py-2 pr-2">
                      <input 
                        type="text" 
                        placeholder="Item name"
                        value={item.item_name}
                        onChange={e => updateRow(item.id, 'item_name', e.target.value)}
                        className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <input 
                        type="number" 
                        placeholder="Qty"
                        step="0.01" min="0"
                        value={item.quantity}
                        onChange={e => {
                          const val = e.target.value;
                          const newTotal = val && item.unit_price ? (Number(val) * Number(item.unit_price)).toFixed(2) : item.total_cost;
                          setBulkItems(bulkItems.map(i => i.id === item.id ? { ...i, quantity: val, total_cost: newTotal } : i));
                        }}
                        className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <input 
                        type="number" 
                        placeholder="Price"
                        step="0.01" min="0"
                        value={item.unit_price}
                        onChange={e => {
                          const val = e.target.value;
                          const newTotal = val && item.quantity ? (Number(val) * Number(item.quantity)).toFixed(2) : item.total_cost;
                          setBulkItems(bulkItems.map(i => i.id === item.id ? { ...i, unit_price: val, total_cost: newTotal } : i));
                        }}
                        className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <input 
                        type="number" 
                        placeholder="Total"
                        step="0.01" min="0"
                        value={item.total_cost}
                        onChange={e => updateRow(item.id, 'total_cost', e.target.value)}
                        className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none bg-slate-50"
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <select
                        value={item.department}
                        onChange={e => updateRow(item.id, 'department', e.target.value)}
                        className={`w-full px-2 py-1.5 text-sm font-semibold border rounded outline-none transition-colors ${item.department === 'JAT' ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}
                      >
                        <option value="JAT">JAT</option>
                        <option value="KITCHEN">KITCHEN</option>
                      </select>
                    </td>
                    <td className="py-2 text-center">
                      <button
                        type="button"
                        onClick={() => removeRow(item.id)}
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
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

          <div className="flex justify-between items-center mt-4 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={addRow}
              className="flex items-center gap-1.5 text-sm font-bold text-slate-600 hover:text-primary transition-colors"
            >
              <Plus size={16} /> Add Blank Row
            </button>

            <button
              onClick={handleSaveBulk}
              disabled={submitting}
              className="flex items-center gap-2 bg-primary text-white font-bold py-2 px-6 rounded-lg shadow-md hover:bg-primary-dark transition-colors disabled:opacity-50"
            >
              <Save size={18} />
              {submitting ? 'Saving...' : 'Save All Purchases'}
            </button>
          </div>
        </div>

        {/* Right Col: List & Summary */}
        <div className="xl:col-span-5 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-orange-50 rounded-2xl p-4 border border-orange-100">
              <p className="text-sm font-semibold text-orange-700 uppercase tracking-wide">JAT Total Cost</p>
              <p className="text-2xl font-black text-orange-900 mt-1">LKR {totalJat.toLocaleString()}</p>
            </div>
            <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100">
              <p className="text-sm font-semibold text-blue-700 uppercase tracking-wide">Kitchen Total Cost</p>
              <p className="text-2xl font-black text-blue-900 mt-1">LKR {totalKitchen.toLocaleString()}</p>
            </div>
          </div>

          <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Calendar size={18} className="text-slate-400" /> Saved on {selectedDate}
              </h3>
            </div>
            
            {loading ? (
              <div className="p-8 text-center text-slate-400">Loading purchases...</div>
            ) : purchases.length === 0 ? (
              <div className="p-8 text-center flex flex-col items-center">
                <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mb-3">
                  <ShoppingBag size={20} className="text-slate-300" />
                </div>
                <p className="text-slate-500 text-sm">No purchases added for this date yet.</p>
              </div>
            ) : (
              <div className="max-h-[500px] overflow-y-auto">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-white shadow-sm">
                    <tr className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wider">
                      <th className="px-4 py-3">Item</th>
                      <th className="px-4 py-3 text-right">Cost</th>
                      <th className="px-4 py-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {purchases.map(p => (
                      <tr key={p.id} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-800">{p.item_name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-slate-500">Qty: {Number(p.quantity).toLocaleString()}</span>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${p.department === 'JAT' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                              {p.department}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-slate-700 align-top">
                          {Number(p.total_cost).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-center align-top">
                          <button
                            onClick={() => handleDelete(p.id)}
                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!loading && purchases.length > 0 && (
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
      </div>
    </div>
  );
};
