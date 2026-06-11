import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Check, X, AlertCircle, Layers, Trash2, PackageOpen, PackagePlus } from 'lucide-react';

interface BulkLine {
  id: string; // temp local id
  itemId: string;
  batchId: string;
  quantity: string;
  price?: string; // Optional price for STOCK_IN
  batches: any[];
  unitLabel: string;
  searchQuery: string; // Added searchable autocomplete
  showDropdown?: boolean; // Toggle dropdown suggestion visibility
}

const newLine = (): BulkLine => ({
  id: Math.random().toString(36).slice(2),
  itemId: '',
  batchId: '',
  quantity: '1',
  price: '',
  batches: [],
  unitLabel: '',
  searchQuery: '',
  showDropdown: false,
});

export const Adjustments: React.FC = () => {
  const { user, hasPermission } = useAuth();

  // List States
  const [movements, setMovements] = useState<any[]>([]);
  const [pendingMovements, setPendingMovements] = useState<any[]>([]);
  const [reasons, setReasons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [catalogItems, setCatalogItems] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);

  // Bulk form state
  const [movementType, setMovementType] = useState<'STOCK_IN' | 'STOCK_OUT'>('STOCK_OUT');
  const [selectedReasonId, setSelectedReasonId] = useState('');
  const [lines, setLines] = useState<BulkLine[]>([newLine()]);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: moves } = await supabase
        .from('stock_movements')
        .select(`
          id, movement_number, type, quantity, status, created_at,
          inventory_items ( name, sku, base_unit:units!inventory_items_base_unit_id_fkey ( abbreviation ) ),
          movement_reasons ( name ),
          profiles:created_by ( username )
        `)
        .order('created_at', { ascending: false });

      if (moves) setMovements(moves);

      if (hasPermission('stock:approve')) {
        try {
          const response = await api.get('/stock/movements/pending');
          if (response.data?.status === 'success') {
            setPendingMovements(response.data.data.movements);
          }
        } catch {}
      }

      if (reasons.length === 0) {
        const { data: reas } = await supabase.from('movement_reasons').select('*').order('name');
        if (reas) setReasons(reas);

        const { data: items } = await supabase.from('inventory_items').select('*').eq('status', 'ACTIVE').order('name');
        if (items) setCatalogItems(items);

        const { data: uns } = await supabase.from('units').select('*');
        if (uns) setUnits(uns);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // When movement type changes, auto-select first matching reason
  useEffect(() => {
    const match = reasons.find(r => r.type === movementType);
    if (match) setSelectedReasonId(match.id);
  }, [movementType, reasons]);

  const handleOpenModal = () => {
    setLines([newLine()]);
    setMovementType('STOCK_OUT');
    setFormError(null);
    const firstOut = reasons.find(r => r.type === 'STOCK_OUT');
    if (firstOut) setSelectedReasonId(firstOut.id);
    setModalOpen(true);
  };

  const loadBatchesForLine = async (lineId: string, itemId: string) => {
    if (!itemId) {
      setLines(prev => prev.map(l => l.id === lineId ? { ...l, itemId, batchId: '', batches: [], unitLabel: '' } : l));
      return;
    }
    const item = catalogItems.find(i => i.id === itemId);
    const unit = units.find(u => u.id === item?.base_unit_id);
    const { data: itemBatches } = await supabase
      .from('batches')
      .select('id, batch_number, available_qty, expiry_date')
      .eq('item_id', itemId)
      .order('received_date', { ascending: false });

    setLines(prev => prev.map(l => l.id === lineId ? {
      ...l,
      itemId,
      batchId: itemBatches?.[0]?.id || '',
      batches: itemBatches || [],
      unitLabel: unit?.abbreviation || '',
    } : l));
  };

  const updateLine = (lineId: string, field: keyof BulkLine, value: any) => {
    setLines(prev => prev.map(l => l.id === lineId ? { ...l, [field]: value } : l));
  };

  const addLine = () => setLines(prev => [...prev, newLine()]);
  const removeLine = (lineId: string) => setLines(prev => prev.filter(l => l.id !== lineId));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const validLines = lines.filter(l => l.itemId && Number(l.quantity) > 0);
    if (validLines.length === 0) {
      setFormError('Please add at least one item with a valid quantity.');
      return;
    }
    if (!selectedReasonId) {
      setFormError('Please select a reason.');
      return;
    }

    setSubmitting(true);
    const errors: string[] = [];

    try {
      for (const line of validLines) {
        const item = catalogItems.find(i => i.id === line.itemId);
        if (movementType !== 'STOCK_IN' && item?.is_batch_tracked && !line.batchId) {
          errors.push(`${item.name}: batch-tracked item requires a batch selection.`);
          continue;
        }
        try {
          const payload = {
            itemId: line.itemId,
            batchId: movementType === 'STOCK_IN' ? null : (line.batchId || null),
            type: movementType,
            quantity: Number(line.quantity),
            unitId: item?.base_unit_id,
            reasonId: selectedReasonId,
            price: movementType === 'STOCK_IN' && line.price ? Number(line.price) : undefined
          };
          await api.post('/stock/movements', payload);
        } catch (err: any) {
          const itemName = item?.name || line.itemId;
          errors.push(`${itemName}: ${err.response?.data?.message || 'Failed'}`);
        }
      }

      if (errors.length > 0) {
        setFormError(`Some items failed:\n${errors.join('\n')}`);
      } else {
        setModalOpen(false);
        fetchData();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async (id: string, approve: boolean) => {
    try {
      const response = await api.patch(`/stock/movements/${id}/approve`, { approve });
      if (response.data.status === 'success') fetchData();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to authorize adjustment.');
    }
  };

  const filteredReasons = reasons.filter(r => r.type === movementType).sort((a, b) => {
    if (movementType === 'STOCK_OUT') {
      const aName = (a.name || '').toLowerCase();
      const bName = (b.name || '').toLowerCase();
      const aIsTop = aName === 'jat' || aName === 'kitchen usage';
      const bIsTop = bName === 'jat' || bName === 'kitchen usage';
      if (aIsTop && !bIsTop) return -1;
      if (!aIsTop && bIsTop) return 1;
      if (aIsTop && bIsTop) {
        if (aName === 'kitchen usage') return -1;
        if (bName === 'kitchen usage') return 1;
      }
    }
    return (a.name || '').localeCompare(b.name || '');
  });

  const canAdjust = hasPermission('stock:adjust') || ['admin','owner','manager'].includes((user?.role?.name || '').toLowerCase());

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Stock Movements</h2>
          <p className="text-sm text-slate-500">Record bulk stock in / stock out across multiple items at once</p>
        </div>
        {canAdjust && (
          <button
            onClick={handleOpenModal}
            className="btn-primary flex items-center justify-center space-x-2"
          >
            <Plus size={18} />
            <span>Stock Movement</span>
          </button>
        )}
      </div>

      {/* Pending approvals */}
      {hasPermission('stock:approve') && pendingMovements.length > 0 && (
        <div className="bg-amber-50/50 border border-amber-200 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-amber-200/50 pb-3">
            <h3 className="text-amber-800 font-bold flex items-center space-x-2">
              <Layers size={18} />
              <span>Pending Stock Approvals Queue</span>
            </h3>
            <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2 py-0.5 rounded-full">
              {pendingMovements.length} pending
            </span>
          </div>
          <div className="space-y-3">
            {pendingMovements.map((item) => (
              <div key={item.id} className="bg-white p-4 rounded-xl border border-amber-100 flex flex-col md:flex-row md:items-center justify-between gap-4 card-shadow">
                <div className="text-xs sm:text-sm text-slate-700 space-y-1.5">
                  <p>
                    User <span className="font-bold text-slate-800">{item.profiles?.username}</span> requested a{' '}
                    <span className="font-bold text-amber-600">{item.type?.toLowerCase()}</span> of{' '}
                    <span className="font-bold text-slate-900">{item.quantity} {item.inventory_items?.base_unit?.abbreviation}</span> for{' '}
                    <span className="font-bold text-primary">{item.inventory_items?.name}</span>.
                  </p>
                  <p className="text-[10px] text-slate-400 font-medium">
                    Reason: {item.movement_reasons?.name} | {new Date(item.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center space-x-3 shrink-0">
                  <button onClick={() => handleApprove(item.id, false)} className="px-3.5 py-1.5 border border-red-200 text-red-600 hover:bg-red-50 font-bold rounded-lg text-xs transition-all inline-flex items-center space-x-1">
                    <X size={14} /><span>Reject</span>
                  </button>
                  <button onClick={() => handleApprove(item.id, true)} className="px-3.5 py-1.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg text-xs transition-all inline-flex items-center space-x-1 active:scale-95">
                    <Check size={14} /><span>Approve</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* History Table */}
      <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm card-shadow">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-400 uppercase tracking-wider">
                <th className="px-6 py-4">STK Number</th>
                <th className="px-6 py-4">Item Name</th>
                <th className="px-6 py-4">Type</th>
                <th className="px-6 py-4">Qty</th>
                <th className="px-6 py-4">Reason</th>
                <th className="px-6 py-4">By</th>
                <th className="px-6 py-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 text-sm">
              {loading ? (
                <tr><td colSpan={7} className="text-center py-8 text-slate-400">Loading stock logs...</td></tr>
              ) : movements.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-slate-400">No stock movements found.</td></tr>
              ) : (
                movements.map((move) => (
                  <tr key={move.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 font-semibold text-slate-800 font-mono text-xs">{move.movement_number}</td>
                    <td className="px-6 py-4 font-medium">{move.inventory_items?.name}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold uppercase
                        ${move.type === 'STOCK_IN' ? 'bg-green-50 text-green-700' : ''}
                        ${move.type === 'STOCK_OUT' ? 'bg-rose-50 text-rose-700' : ''}
                        ${move.type === 'ADJUSTMENT' ? 'bg-amber-50 text-amber-700' : ''}
                      `}>
                        {move.type === 'STOCK_IN' ? '▲ IN' : move.type === 'STOCK_OUT' ? '▼ OUT' : '⇄ ADJ'}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-semibold">{move.quantity} {move.inventory_items?.base_unit?.abbreviation}</td>
                    <td className="px-6 py-4 text-slate-500 font-medium">{move.movement_reasons?.name}</td>
                    <td className="px-6 py-4 text-slate-400">{move.profiles?.username || 'System'}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase
                        ${move.status === 'APPROVED' ? 'bg-green-50 text-green-700' : ''}
                        ${move.status === 'PENDING' ? 'bg-amber-50 text-amber-600 animate-pulse' : ''}
                        ${move.status === 'REJECTED' ? 'bg-red-50 text-red-600' : ''}
                      `}>
                        {move.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bulk Movement Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-slate-900 bg-opacity-50 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-100 w-full max-w-3xl my-6 card-shadow flex flex-col">

            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 shrink-0">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Bulk Stock Movement</h3>
                <p className="text-xs text-slate-500 mt-0.5">Add multiple items to a single stock in / stock out entry</p>
              </div>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-sm font-semibold">✕ Close</button>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto">

              {formError && (
                <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-xl flex items-start space-x-3">
                  <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={18} />
                  <pre className="text-xs font-semibold text-red-700 whitespace-pre-wrap">{formError}</pre>
                </div>
              )}

              {/* Movement Type + Reason Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Type Selector */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">Movement Type</label>
                  <div className="flex rounded-xl overflow-hidden border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setMovementType('STOCK_OUT')}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold transition-all ${
                        movementType === 'STOCK_OUT'
                          ? 'bg-rose-600 text-white'
                          : 'bg-white text-slate-500 hover:bg-slate-50'
                      }`}
                    >
                      <PackageOpen size={16} />
                      Stock OUT
                    </button>
                    <button
                      type="button"
                      onClick={() => setMovementType('STOCK_IN')}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold transition-all ${
                        movementType === 'STOCK_IN'
                          ? 'bg-green-600 text-white'
                          : 'bg-white text-slate-500 hover:bg-slate-50'
                      }`}
                    >
                      <PackagePlus size={16} />
                      Stock IN
                    </button>
                  </div>
                </div>

                {/* Reason */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">Reason <span className="text-red-500">*</span></label>
                  <select
                    value={selectedReasonId}
                    onChange={(e) => setSelectedReasonId(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm bg-white"
                  >
                    <option value="">Select reason...</option>
                    {filteredReasons.map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Item Lines */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-500 uppercase">Items</label>
                  <span className="text-xs text-slate-400">{lines.length} line{lines.length !== 1 ? 's' : ''}</span>
                </div>

                {/* Header row */}
                <div className="hidden md:grid grid-cols-12 gap-2 px-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  <div className="col-span-5">Item</div>
                  <div className="col-span-3">{movementType === 'STOCK_IN' ? 'Price (LKR)' : 'Batch'}</div>
                  <div className="col-span-3">Quantity</div>
                  <div className="col-span-1"></div>
                </div>

                {lines.map((line, idx) => (
                  <div key={line.id} className="grid grid-cols-12 gap-2 items-start bg-slate-50 rounded-xl p-3 border border-slate-100">
                     {/* Item Search & Select Autocomplete */}
                     <div className="col-span-12 md:col-span-5 relative">
                       <input
                         type="text"
                         placeholder="Type item name or SKU..."
                         value={line.searchQuery}
                         onChange={(e) => {
                           const val = e.target.value;
                           updateLine(line.id, 'searchQuery', val);
                           updateLine(line.id, 'showDropdown', true);
                           if (val.trim() === '') {
                             updateLine(line.id, 'itemId', '');
                             updateLine(line.id, 'batchId', '');
                             updateLine(line.id, 'batches', []);
                             updateLine(line.id, 'unitLabel', '');
                           }
                         }}
                         onFocus={() => updateLine(line.id, 'showDropdown', true)}
                         onBlur={() => setTimeout(() => updateLine(line.id, 'showDropdown', false), 200)}
                         className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm bg-white"
                         autoComplete="off"
                       />
                       {line.showDropdown && (
                         <ul className="absolute z-[60] left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                           {catalogItems
                             .filter(item => 
                               item.name.toLowerCase().includes(line.searchQuery.toLowerCase()) ||
                               item.sku.toLowerCase().includes(line.searchQuery.toLowerCase())
                             )
                             .slice(0, 10)
                             .map(item => (
                               <li
                                 key={item.id}
                                 onMouseDown={() => {
                                   updateLine(line.id, 'itemId', item.id);
                                   updateLine(line.id, 'searchQuery', item.name);
                                   updateLine(line.id, 'showDropdown', false);
                                   loadBatchesForLine(line.id, item.id);
                                 }}
                                 className="px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 hover:text-primary transition-colors border-b border-slate-50 last:border-0"
                               >
                                 <span className="font-semibold">{item.name}</span>{' '}
                                 <span className="text-xs text-slate-400">({item.sku})</span>
                               </li>
                             ))}
                           {catalogItems.filter(item => 
                             item.name.toLowerCase().includes(line.searchQuery.toLowerCase()) ||
                             item.sku.toLowerCase().includes(line.searchQuery.toLowerCase())
                           ).length === 0 && (
                             <li className="px-3 py-2 text-xs text-slate-400 text-center italic">No items found</li>
                           )}
                         </ul>
                       )}
                     </div>

                    {/* Batch / Price Select */}
                    <div className="col-span-12 md:col-span-3">
                      {movementType === 'STOCK_IN' ? (
                        <input
                          type="number"
                          step="0.001"
                          min="0"
                          placeholder="Optional price..."
                          value={line.price || ''}
                          onChange={(e) => updateLine(line.id, 'price', e.target.value)}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                        />
                      ) : line.batches.length > 0 ? (
                        <select
                          value={line.batchId}
                          onChange={(e) => updateLine(line.id, 'batchId', e.target.value)}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm bg-white"
                        >
                          <option value="">Select batch...</option>
                          {line.batches.map(b => (
                            <option key={b.id} value={b.id}>
                              {b.batch_number} (avail: {b.available_qty}){b.expiry_date ? ` [Exp: ${b.expiry_date}]` : ''}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className="w-full px-3 py-2 border border-dashed border-slate-200 rounded-lg text-xs text-slate-400 text-center">
                          {line.itemId ? 'No batches' : 'Pick item first'}
                        </div>
                      )}
                    </div>

                    {/* Quantity */}
                    <div className="col-span-10 md:col-span-3 flex items-center gap-2">
                      <input
                        type="number"
                        min="0.001"
                        step="any"
                        value={line.quantity}
                        onChange={(e) => updateLine(line.id, 'quantity', e.target.value)}
                        placeholder="Qty"
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                      />
                      {line.unitLabel && (
                        <span className="text-xs font-bold text-slate-400 shrink-0">{line.unitLabel}</span>
                      )}
                    </div>

                    {/* Remove */}
                    <div className="col-span-2 md:col-span-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() => removeLine(line.id)}
                        disabled={lines.length === 1}
                        className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-30"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={addLine}
                  className="w-full py-2.5 border-2 border-dashed border-slate-200 text-slate-400 hover:border-primary hover:text-primary rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2"
                >
                  <Plus size={16} />
                  Add Another Item
                </button>
              </div>

              {/* Summary */}
              {lines.some(l => l.itemId && Number(l.quantity) > 0) && (
                <div className={`rounded-xl p-4 border text-sm font-semibold flex items-center gap-3 ${
                  movementType === 'STOCK_OUT' ? 'bg-rose-50 border-rose-100 text-rose-700' : 'bg-green-50 border-green-100 text-green-700'
                }`}>
                  {movementType === 'STOCK_OUT' ? <PackageOpen size={18} /> : <PackagePlus size={18} />}
                  <span>
                    {movementType === 'STOCK_OUT' ? 'Removing' : 'Adding'}{' '}
                    {lines.filter(l => l.itemId).length} item line{lines.filter(l => l.itemId).length !== 1 ? 's' : ''} from stock
                    {selectedReasonId ? ` · Reason: ${reasons.find(r => r.id === selectedReasonId)?.name}` : ''}
                  </span>
                </div>
              )}
            </div>

            {/* Footer Buttons */}
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex items-center justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-5 py-2.5 border border-slate-200 hover:bg-white text-slate-700 font-semibold rounded-xl text-sm transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className={`px-6 py-2.5 text-white font-bold rounded-xl text-sm transition-all shadow-sm active:scale-95 disabled:opacity-50 ${
                  movementType === 'STOCK_OUT' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-green-600 hover:bg-green-700'
                }`}
              >
                {submitting ? 'Processing...' : `Post ${movementType === 'STOCK_OUT' ? 'Stock Out' : 'Stock In'}`}
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};
export default Adjustments;
