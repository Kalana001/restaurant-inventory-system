import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Search, Eye, AlertCircle, FileText, Calendar } from 'lucide-react';
import { format } from 'date-fns';

export const GRNs: React.FC = () => {
  const { hasPermission } = useAuth();
  
  // List States
  const [grns, setGrns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Creation Wizard States
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [approvedPOs, setApprovedPOs] = useState<any[]>([]);
  const [selectedPoId, setSelectedPoId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [remarks, setRemarks] = useState('');
  const [grnItems, setGrnItems] = useState<any[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Detail Modal States
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedGrn, setSelectedGrn] = useState<any | null>(null);
  const [detailItems, setDetailItems] = useState<any[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchGRNs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('grns')
        .select(`
          *,
          suppliers ( name, code ),
          purchase_orders ( po_number ),
          profiles:received_by ( username )
        `)
        .order('received_date', { ascending: false });

      if (!error && data) {
        setGrns(data);
      }

      // Load approved POs on modal request
      const { data: pos } = await supabase
        .from('purchase_orders')
        .select('*, suppliers(id, name)')
        .eq('status', 'APPROVED');
      
      if (pos) {
        setApprovedPOs(pos);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGRNs();
  }, []);

  // When user selects a PO in create wizard, populate item fields
  const handleSelectPO = async (poId: string) => {
    setSelectedPoId(poId);
    setFormError(null);
    if (!poId) {
      setGrnItems([]);
      return;
    }

    try {
      const { data: poLines, error } = await supabase
        .from('purchase_order_items')
        .select(`
          quantity,
          cost_price,
          item_id,
          inventory_items (
            name,
            sku,
            units:units!inventory_items_purchase_unit_id_fkey ( abbreviation )
          )
        `)
        .eq('po_id', poId);

      if (error) throw error;

      if (poLines) {
        // Map lines to input structure
        const mapped = poLines.map((line: any) => ({
          itemId: line.item_id,
          sku: line.inventory_items?.sku,
          name: line.inventory_items?.name,
          unit: line.inventory_items?.units?.abbreviation || 'pcs',
          poQty: Number(line.quantity),
          quantity: Number(line.quantity), // Default to full PO load
          costPrice: Number(line.cost_price),
          batchNumber: `B-${line.inventory_items?.sku}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`,
          expiryDate: format(new Date(), 'yyyy-MM-dd')
        }));
        setGrnItems(mapped);
      }
    } catch (err: any) {
      setFormError('Failed to load purchase order lines.');
    }
  };

  const handleUpdateItemField = (idx: number, field: string, value: any) => {
    const updated = [...grnItems];
    updated[idx] = {
      ...updated[idx],
      [field]: value
    };
    setGrnItems(updated);
  };

  // Submit GRN (Triggers Railway Custom API)
  const handleSubmitGRN = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    const po = approvedPOs.find(p => p.id === selectedPoId);
    if (!po) {
      setFormError('Please select a valid Purchase Order');
      setSubmitting(false);
      return;
    }

    // Verify all items have batch number
    if (grnItems.some(i => !i.batchNumber.trim())) {
      setFormError('All received items must be assigned a batch number.');
      setSubmitting(false);
      return;
    }

    try {
      // Calculate total amount
      const totalAmount = grnItems.reduce((acc, curr) => acc + (Number(curr.quantity) * Number(curr.costPrice)), 0);

      // Build payload matching controllers/grn.controller.ts
      const payload = {
        poId: selectedPoId,
        supplierId: po.supplier_id,
        invoiceNumber: invoiceNumber.trim() || null,
        totalAmount,
        remarks: remarks.trim(),
        items: grnItems.map(item => ({
          itemId: item.itemId,
          quantity: Number(item.quantity),
          costPrice: Number(item.costPrice),
          batchNumber: item.batchNumber.trim(),
          expiryDate: item.expiryDate || null
        }))
      };

      const response = await api.post('/grns', payload);

      if (response.data.status === 'success') {
        setCreateModalOpen(false);
        fetchGRNs();
      }
    } catch (err: any) {
      setFormError(err.response?.data?.message || 'Failed to submit Goods Received Note.');
    } finally {
      setSubmitting(false);
    }
  };

  const openDetailModal = async (grn: any) => {
    setSelectedGrn(grn);
    setDetailLoading(true);
    setDetailModalOpen(true);

    try {
      const { data: lines, error } = await supabase
        .from('grn_items')
        .select(`
          id,
          quantity,
          cost_price,
          total_cost,
          inventory_items (
            name,
            sku,
            units:units!inventory_items_purchase_unit_id_fkey ( abbreviation )
          ),
          batches (
            batch_number,
            expiry_date
          )
        `)
        .eq('grn_id', grn.id);

      if (!error && lines) {
        setDetailItems(lines);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Goods Received Notes (GRN)</h2>
          <p className="text-sm text-slate-500">Record incoming stock items and assign batch expiry details</p>
        </div>
        {hasPermission('grn:create') && (
          <button
            onClick={() => {
              setGrnItems([]);
              setSelectedPoId('');
              setInvoiceNumber('');
              setRemarks('');
              setFormError(null);
              setCreateModalOpen(true);
            }}
            className="btn-primary flex items-center justify-center space-x-2"
          >
            <Plus size={18} />
            <span>Receive Goods</span>
          </button>
        )}
      </div>

      {/* GRN list logs */}
      <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm card-shadow">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-400 uppercase tracking-wider">
                <th className="px-6 py-4">GRN Number</th>
                <th className="px-6 py-4">PO Code</th>
                <th className="px-6 py-4">Supplier</th>
                <th className="px-6 py-4">Invoice #</th>
                <th className="px-6 py-4">Total Value</th>
                <th className="px-6 py-4">Received Date</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-400">Loading GRN log...</td>
                </tr>
              ) : grns.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-400">No goods received notes found.</td>
                </tr>
              ) : (
                grns.map((grn) => (
                  <tr key={grn.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 font-semibold text-slate-800">{grn.grn_number}</td>
                    <td className="px-6 py-4 text-slate-500">{grn.purchase_orders?.po_number || 'Direct Log'}</td>
                    <td className="px-6 py-4 font-medium">{grn.suppliers?.name}</td>
                    <td className="px-6 py-4 font-medium text-slate-500">{grn.invoice_number || 'N/A'}</td>
                    <td className="px-6 py-4 font-bold text-slate-800">LKR {Number(grn.total_amount).toFixed(2)}</td>
                    <td className="px-6 py-4 text-slate-400">{new Date(grn.received_date).toLocaleDateString()}</td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => openDetailModal(grn)}
                        className="p-1.5 text-slate-400 hover:text-primary hover:bg-blue-50 rounded-lg transition-all"
                      >
                        <Eye size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Receive Goods intake Wizard Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900 bg-opacity-40 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-100 w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6 space-y-6 card-shadow">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h3 className="text-lg font-bold text-slate-800">Goods Receipt Voucher (GRN)</h3>
              <button onClick={() => setCreateModalOpen(false)} className="text-slate-400 hover:text-slate-600">Cancel</button>
            </div>

            {formError && (
              <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-xl flex items-start space-x-3">
                <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={18} />
                <div className="text-xs font-semibold text-red-700">{formError}</div>
              </div>
            )}

            <form onSubmit={handleSubmitGRN} className="space-y-6">
              
              {/* Header selection */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">Select Approved PO</label>
                  <select
                    value={selectedPoId}
                    onChange={(e) => handleSelectPO(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm bg-white"
                  >
                    <option value="">-- Choose PO --</option>
                    {approvedPOs.map(po => (
                      <option key={po.id} value={po.id}>{po.po_number} ({po.suppliers?.name})</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">Invoice / Reference #</label>
                  <input
                    type="text"
                    required
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    placeholder="e.g. INV-102394"
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase">Voucher Remarks</label>
                  <input
                    type="text"
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder="Received in good condition..."
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                  />
                </div>
              </div>

              {/* Line items editor */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-slate-700 uppercase">Verify Incoming Item Lines & Batches</h4>
                
                {grnItems.length === 0 ? (
                  <div className="text-center py-6 text-slate-400 border border-dashed border-slate-200 rounded-xl">
                    Please select an approved Purchase Order above to load item details.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {grnItems.map((item, idx) => (
                      <div key={idx} className="border border-slate-100 bg-slate-50/50 p-4 rounded-xl space-y-3">
                        <div className="flex items-center justify-between text-sm">
                          <p className="font-bold text-slate-800">{item.name} <span className="text-xs text-slate-400">({item.sku})</span></p>
                          <span className="text-xs font-semibold bg-blue-50 text-primary px-2 py-0.5 rounded">Ordered: {item.poQty} {item.unit}</span>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Qty Received ({item.unit})</label>
                            <input
                              type="number"
                              step="any"
                              required
                              value={item.quantity}
                              onChange={(e) => handleUpdateItemField(idx, 'quantity', e.target.value)}
                              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white"
                            />
                          </div>
                          
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Actual Cost (LKR)</label>
                            <input
                              type="number"
                              step="0.01"
                              required
                              value={item.costPrice}
                              onChange={(e) => handleUpdateItemField(idx, 'costPrice', e.target.value)}
                              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Batch Number</label>
                            <input
                              type="text"
                              required
                              value={item.batchNumber}
                              onChange={(e) => handleUpdateItemField(idx, 'batchNumber', e.target.value)}
                              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">Expiry Date</label>
                            <input
                              type="date"
                              value={item.expiryDate}
                              onChange={(e) => handleUpdateItemField(idx, 'expiryDate', e.target.value)}
                              className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-600"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-5 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold rounded-xl text-sm transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || grnItems.length === 0}
                  className="px-5 py-2.5 bg-primary text-white hover:bg-opacity-90 font-semibold rounded-xl text-sm transition-all shadow-sm disabled:opacity-50 active:scale-95"
                >
                  {submitting ? 'Processing Ledger...' : 'Commit Voucher & Update Stock'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* GRN Detail Modal */}
      {detailModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900 bg-opacity-40 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-100 w-full max-w-2xl p-6 space-y-6 card-shadow">
            
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h3 className="text-lg font-bold text-slate-800">Voucher Details: {selectedGrn?.grn_number}</h3>
              <button onClick={() => setDetailModalOpen(false)} className="text-slate-400 hover:text-slate-600">Close</button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs bg-slate-50 p-4 rounded-xl font-medium text-slate-600">
              <div>
                <p className="text-slate-400 uppercase text-[10px]">Vendor Supplier</p>
                <p className="font-bold text-slate-800 mt-0.5">{selectedGrn?.suppliers?.name}</p>
              </div>
              <div>
                <p className="text-slate-400 uppercase text-[10px]">Invoice Number</p>
                <p className="font-bold text-slate-800 mt-0.5">{selectedGrn?.invoice_number || 'N/A'}</p>
              </div>
              <div>
                <p className="text-slate-400 uppercase text-[10px]">Grand Total</p>
                <p className="font-extrabold text-slate-800 mt-0.5">LKR {Number(selectedGrn?.total_amount).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-slate-400 uppercase text-[10px]">Received By</p>
                <p className="font-bold text-slate-800 mt-0.5">{selectedGrn?.profiles?.username || 'System'}</p>
              </div>
            </div>

            {/* Item listing */}
            <div className="border border-slate-100 rounded-xl overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50 border-b border-slate-100 text-slate-400 font-bold uppercase">
                  <tr>
                    <th className="px-4 py-2.5">SKU</th>
                    <th className="px-4 py-2.5">Item Name</th>
                    <th className="px-4 py-2.5">Batch Code</th>
                    <th className="px-4 py-2.5">Qty Loaded</th>
                    <th className="px-4 py-2.5">Cost (LKR)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {detailLoading ? (
                    <tr>
                      <td colSpan={5} className="text-center py-4 text-slate-400">Loading details...</td>
                    </tr>
                  ) : (
                    detailItems.map((item) => (
                      <tr key={item.id}>
                        <td className="px-4 py-3 font-semibold">{item.inventory_items?.sku}</td>
                        <td className="px-4 py-3">{item.inventory_items?.name}</td>
                        <td className="px-4 py-3 text-slate-500 font-medium">
                          <span className="flex items-center space-x-1">
                            <span>{item.batches?.batch_number}</span>
                            {item.batches?.expiry_date && (
                              <span className="text-[10px] bg-amber-50 text-amber-600 px-1 rounded flex items-center">
                                <Calendar size={10} className="mr-0.5" />
                                {item.batches.expiry_date}
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="px-4 py-3">{item.quantity} {item.inventory_items?.units?.abbreviation}</td>
                        <td className="px-4 py-3 font-bold text-slate-800">LKR {Number(item.total_cost).toFixed(2)}</td>
                      </tr>
                    ))
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
export default GRNs;
