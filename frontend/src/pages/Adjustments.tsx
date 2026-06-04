import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Check, X, AlertCircle, RefreshCw, Layers } from 'lucide-react';

export const Adjustments: React.FC = () => {
  const { user, hasPermission } = useAuth();
  
  // List States
  const [movements, setMovements] = useState<any[]>([]);
  const [pendingMovements, setPendingMovements] = useState<any[]>([]);
  const [reasons, setReasons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal Form States
  const [modalOpen, setModalOpen] = useState(false);
  const [catalogItems, setCatalogItems] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);

  // Selection Inputs
  const [selectedItemId, setSelectedItemId] = useState('');
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [type, setType] = useState('STOCK_OUT'); // STOCK_IN, STOCK_OUT
  const [quantity, setQuantity] = useState('1');
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [selectedReasonId, setSelectedReasonId] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Movements Logs
      const { data: moves, error: movesErr } = await supabase
        .from('stock_movements')
        .select(`
          id,
          movement_number,
          type,
          quantity,
          status,
          created_at,
          inventory_items ( name, sku, base_unit:units!inventory_items_base_unit_id_fkey ( abbreviation ) ),
          movement_reasons ( name ),
          profiles:created_by ( username )
        `)
        .order('created_at', { ascending: false });

      if (!movesErr && moves) setMovements(moves);

      // 2. Fetch Pending Queue if User is Manager/Admin
      if (hasPermission('stock:approve')) {
        const response = await api.get('/stock/movements/pending');
        if (response.data?.status === 'success') {
          setPendingMovements(response.data.data.movements);
        }
      }

      // 3. Fetch Reasons and items helper
      if (reasons.length === 0) {
        const { data: reas } = await supabase.from('movement_reasons').select('*');
        if (reas) setReasons(reas);

        const { data: items } = await supabase.from('inventory_items').select('*').eq('status', 'ACTIVE');
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

  useEffect(() => {
    fetchData();
  }, []);

  // When item changes in form, query active stock batches and map selectable units (P / I / B)
  const handleItemSelect = async (itemId: string) => {
    setSelectedItemId(itemId);
    setSelectedBatchId('');
    setFormError(null);
    if (!itemId) {
      setBatches([]);
      return;
    }

    try {
      const matchItem = catalogItems.find(i => i.id === itemId);
      
      // Load active UOMs
      if (matchItem) {
        setSelectedUnitId(matchItem.issue_unit_id); // Default UOM = Issue UOM
      }

      // Load active batches for that item
      const { data: itemBatches, error } = await supabase
        .from('batches')
        .select('id, batch_number, available_qty, inventory_items( base_unit:units!inventory_items_base_unit_id_fkey ( abbreviation ) )')
        .eq('item_id', itemId)
        .gt('available_qty', 0)
        .eq('status', 'ACTIVE');

      if (!error && itemBatches) {
        setBatches(itemBatches);
        if (itemBatches.length > 0) {
          setSelectedBatchId(itemBatches[0].id);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenModal = () => {
    setFormError(null);
    if (catalogItems.length > 0) {
      handleItemSelect(catalogItems[0].id);
      setSelectedReasonId(reasons.find(r => r.type === 'STOCK_OUT')?.id || '');
    }
    setModalOpen(true);
  };

  // Submit Adjustment to Express Backend
  const handleSubmitAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    if (!selectedItemId || !selectedUnitId || !selectedReasonId) {
      setFormError('Item, unit, and reason are required.');
      setSubmitting(false);
      return;
    }

    const item = catalogItems.find(i => i.id === selectedItemId);
    if (item?.is_batch_tracked && !selectedBatchId) {
      setFormError('Selected item is batch-tracked. Please choose an active batch.');
      setSubmitting(false);
      return;
    }

    try {
      const payload = {
        itemId: selectedItemId,
        batchId: selectedBatchId || null,
        type,
        quantity: Number(quantity),
        unitId: selectedUnitId,
        reasonId: selectedReasonId
      };

      const response = await api.post('/stock/movements', payload);

      if (response.data.status === 'success') {
        setModalOpen(false);
        fetchData();
      }
    } catch (err: any) {
      setFormError(err.response?.data?.message || 'Failed to submit stock adjustment.');
    } finally {
      setSubmitting(false);
    }
  };

  // Approve stock adjustment (Express backend call)
  const handleApprove = async (id: string, approve: boolean) => {
    try {
      const response = await api.patch(`/stock/movements/${id}/approve`, { approve });
      if (response.data.status === 'success') {
        fetchData();
      }
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to authorize adjustment.');
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Stock Adjustments</h2>
          <p className="text-sm text-slate-500">Record manual issues, spoilage, or post corrections</p>
        </div>
        {hasPermission('stock:adjust') && (
          <button
            onClick={handleOpenModal}
            className="btn-primary flex items-center justify-center space-x-2"
          >
            <Plus size={18} />
            <span>Create Adjustment</span>
          </button>
        )}
      </div>

      {/* Pending approvals section for Manager/Admin */}
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
                    <span className="font-bold text-amber-600">{item.type.toLowerCase()}</span> adjustment of{' '}
                    <span className="font-bold text-slate-900">{item.quantity} {item.inventory_items?.base_unit?.abbreviation}</span> for{' '}
                    <span className="font-bold text-primary">{item.inventory_items?.name}</span>.
                  </p>
                  <p className="text-[10px] text-slate-400 font-medium">
                    Batch: {item.batches?.batch_number || 'N/A'} | Reason: {item.movement_reasons?.name} | Issued: {new Date(item.created_at).toLocaleString()}
                  </p>
                </div>
                
                <div className="flex items-center space-x-3 shrink-0 self-end md:self-auto">
                  <button
                    onClick={() => handleApprove(item.id, false)}
                    className="px-3.5 py-1.5 border border-red-200 text-red-600 hover:bg-red-50 font-bold rounded-lg text-xs transition-all inline-flex items-center space-x-1"
                  >
                    <X size={14} />
                    <span>Reject</span>
                  </button>
                  <button
                    onClick={() => handleApprove(item.id, true)}
                    className="px-3.5 py-1.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg text-xs transition-all inline-flex items-center space-x-1 active:scale-95"
                  >
                    <Check size={14} />
                    <span>Approve</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Adjustments history table */}
      <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm card-shadow">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-400 uppercase tracking-wider">
                <th className="px-6 py-4">STK Number</th>
                <th className="px-6 py-4">Item Name</th>
                <th className="px-6 py-4">Movement Type</th>
                <th className="px-6 py-4">Base Qty</th>
                <th className="px-6 py-4">Reason</th>
                <th className="px-6 py-4">Issued By</th>
                <th className="px-6 py-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-400">Loading stock logs...</td>
                </tr>
              ) : movements.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-400">No stock movements found.</td>
                </tr>
              ) : (
                movements.map((move) => (
                  <tr key={move.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 font-semibold text-slate-800">{move.movement_number}</td>
                    <td className="px-6 py-4 font-medium">{move.inventory_items?.name}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold uppercase
                        ${move.type === 'STOCK_IN' ? 'bg-green-50 text-green-700' : ''}
                        ${move.type === 'STOCK_OUT' ? 'bg-rose-50 text-rose-700' : ''}
                        ${move.type === 'ADJUSTMENT' ? 'bg-amber-50 text-amber-700' : ''}
                      `}>
                        {move.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-semibold">
                      {move.quantity} {move.inventory_items?.base_unit?.abbreviation}
                    </td>
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

      {/* Creation Modal Form */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900 bg-opacity-40 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-100 w-full max-w-lg p-6 space-y-6 card-shadow">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h3 className="text-lg font-bold text-slate-800">Draft Stock Adjustment</h3>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-slate-600">Cancel</button>
            </div>

            {formError && (
              <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-xl flex items-start space-x-3">
                <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={18} />
                <div className="text-xs font-semibold text-red-700">{formError}</div>
              </div>
            )}

            <form onSubmit={handleSubmitAdjustment} className="space-y-4">
              
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase">Select Catalog Item</label>
                <select
                  value={selectedItemId}
                  onChange={(e) => handleItemSelect(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm bg-white"
                >
                  {catalogItems.map(item => (
                    <option key={item.id} value={item.id}>{item.name} ({item.sku})</option>
                  ))}
                </select>
              </div>

              {/* Batch list */}
              {batches.length > 0 ? (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">Select Stock Batch</label>
                  <select
                    value={selectedBatchId}
                    onChange={(e) => setSelectedBatchId(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm bg-white"
                  >
                    {batches.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.batch_number} (Avail: {b.available_qty} {b.inventory_items?.base_unit?.abbreviation})
                      </option>
                    ))}
                  </select>
                </div>
              ) : selectedItemId && catalogItems.find(i => i.id === selectedItemId)?.is_batch_tracked ? (
                <div className="bg-rose-50 border border-rose-100 p-3.5 rounded-xl text-xs text-rose-700 font-semibold">
                  Warning: Selected item is batch-tracked, but no active batches with available quantities were found!
                </div>
              ) : null}

              {/* Type toggle */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">Adjustment Type</label>
                  <select
                    value={type}
                    onChange={(e) => {
                      setType(e.target.value);
                      setSelectedReasonId(reasons.find(r => r.type === e.target.value)?.id || '');
                    }}
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm bg-white"
                  >
                    <option value="STOCK_OUT">STOCK OUT (Deduction)</option>
                    <option value="STOCK_IN">STOCK IN (Addition)</option>
                    <option value="ADJUSTMENT">ADJUSTMENT (Variance correction)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">Reason Code</label>
                  <select
                    value={selectedReasonId}
                    onChange={(e) => setSelectedReasonId(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm bg-white"
                  >
                    {reasons.filter(r => r.type === type || r.type === 'ADJUSTMENT').map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Quantity and units */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">Adjust Quantity</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                  />
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">Select UOM Unit</label>
                  <select
                    value={selectedUnitId}
                    onChange={(e) => setSelectedUnitId(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm bg-white"
                  >
                    {selectedItemId && (
                      <>
                        {/* Render purchase, issue, base units */}
                        {(() => {
                          const item = catalogItems.find(i => i.id === selectedItemId);
                          if (!item) return null;
                          const purchaseUnit = units.find(u => u.id === item.purchase_unit_id);
                          const issueUnit = units.find(u => u.id === item.issue_unit_id);
                          const baseUnit = units.find(u => u.id === item.base_unit_id);
                          
                          return (
                            <>
                              {purchaseUnit && <option value={purchaseUnit.id}>Purchase: {purchaseUnit.name}</option>}
                              {issueUnit && <option value={issueUnit.id}>Issue: {issueUnit.name}</option>}
                              {baseUnit && <option value={baseUnit.id}>Base: {baseUnit.name}</option>}
                            </>
                          );
                        })()}
                      </>
                    )}
                  </select>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-5 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold rounded-xl text-sm transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 bg-primary text-white hover:bg-opacity-90 font-semibold rounded-xl text-sm transition-all shadow-sm active:scale-95 disabled:opacity-50"
                >
                  {submitting ? 'Submitting...' : 'Post Adjustment'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
};
export default Adjustments;
