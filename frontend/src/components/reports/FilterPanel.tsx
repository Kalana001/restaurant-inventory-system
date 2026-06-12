import React from 'react';
import { Filter } from 'lucide-react';

export interface FilterPanelProps {
  reportType: string;
  filters: any;
  setFilters: (filters: any) => void;
  onApply: () => void;
  onReset: () => void;
  categories: any[];
  suppliers: any[];
  users: any[];
  poPaymentMethods?: string[];
  jatKitchenTotals?: { jat: number, kitchen: number };
}

export const FilterPanel: React.FC<FilterPanelProps> = ({
  reportType,
  filters,
  setFilters,
  onApply,
  onReset,
  categories,
  suppliers,
  users,
  poPaymentMethods = [],
  jatKitchenTotals
}) => {
  const handleChange = (key: string, value: any) => {
    const updated = { ...filters, [key]: value };
    setFilters(updated);
    // JAT reports auto-apply on filter change (no button click needed)
    if (reportType === 'jat_kitchen' || reportType === 'jat_transactions') {
      setTimeout(() => onApply(), 0);
    }
  };

  const renderValuationFilters = () => (
    <>
      <div className="space-y-1">
        <label className="text-xs font-bold text-slate-500 uppercase">Category</label>
        <select
          value={filters.categoryId || ''}
          onChange={(e) => handleChange('categoryId', e.target.value)}
          className="w-full p-2 border border-slate-200 rounded-lg text-sm"
        >
          <option value="">All Categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-bold text-slate-500 uppercase">Stock Status</label>
        <select
          value={filters.stockStatus || 'all'}
          onChange={(e) => handleChange('stockStatus', e.target.value)}
          className="w-full p-2 border border-slate-200 rounded-lg text-sm"
        >
          <option value="all">All</option>
          <option value="in_stock">In Stock Only</option>
          <option value="low_stock">Low Stock Only</option>
          <option value="out_of_stock">Out of Stock</option>
        </select>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-bold text-slate-500 uppercase">Search Item</label>
        <input
          type="text"
          placeholder="Search by item name..."
          value={filters.search || ''}
          onChange={(e) => handleChange('search', e.target.value)}
          className="w-full p-2 border border-slate-200 rounded-lg text-sm"
        />
      </div>
    </>
  );

  const renderExpiryFilters = () => (
    <>
      <div className="space-y-1">
        <label className="text-xs font-bold text-slate-500 uppercase">Warning Threshold</label>
        <select
          value={filters.days || '30'}
          onChange={(e) => handleChange('days', e.target.value)}
          className="w-full p-2 border border-slate-200 rounded-lg text-sm"
        >
          <option value="7">Expiring within 7 days</option>
          <option value="14">Expiring within 14 days</option>
          <option value="30">Expiring within 30 days</option>
          <option value="60">Expiring within 60 days</option>
          <option value="all">All Expiry Dates</option>
        </select>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-bold text-slate-500 uppercase">Category</label>
        <select
          value={filters.categoryId || ''}
          onChange={(e) => handleChange('categoryId', e.target.value)}
          className="w-full p-2 border border-slate-200 rounded-lg text-sm"
        >
          <option value="">All Categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-bold text-slate-500 uppercase">Show Expired</label>
        <select
          value={filters.showExpired || 'yes'}
          onChange={(e) => handleChange('showExpired', e.target.value)}
          className="w-full p-2 border border-slate-200 rounded-lg text-sm"
        >
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-bold text-slate-500 uppercase">Sort By</label>
        <select
          value={filters.sortBy || 'date_asc'}
          onChange={(e) => handleChange('sortBy', e.target.value)}
          className="w-full p-2 border border-slate-200 rounded-lg text-sm"
        >
          <option value="date_asc">Expiry Date (Soonest First)</option>
          <option value="name">Item Name</option>
        </select>
      </div>
    </>
  );

  const renderOutstandingFilters = () => (
    <>
      <div className="space-y-1">
        <label className="text-xs font-bold text-slate-500 uppercase">Supplier</label>
        <select
          value={filters.supplierId || ''}
          onChange={(e) => handleChange('supplierId', e.target.value)}
          className="w-full p-2 border border-slate-200 rounded-lg text-sm"
        >
          <option value="">All Suppliers</option>
          {suppliers.map(s => (
            <option key={s.id} value={s.id}>
              {s.name} {s.status === 'INACTIVE' ? '(Archived)' : ''}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-bold text-slate-500 uppercase">Balance Status</label>
        <select
          value={filters.status || 'all'}
          onChange={(e) => handleChange('status', e.target.value)}
          className="w-full p-2 border border-slate-200 rounded-lg text-sm"
        >
          <option value="all">All</option>
          <option value="overdue">Overdue Only</option>
          <option value="partial">Partially Paid</option>
          <option value="outstanding">Fully Outstanding</option>
        </select>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-bold text-slate-500 uppercase">Sort By</label>
        <select
          value={filters.sortBy || 'amount_desc'}
          onChange={(e) => handleChange('sortBy', e.target.value)}
          className="w-full p-2 border border-slate-200 rounded-lg text-sm"
        >
          <option value="amount_desc">Outstanding Amount (High→Low)</option>
          <option value="name">Supplier Name</option>
          <option value="date_asc">Due Date</option>
        </select>
      </div>
    </>
  );

  const renderPurchaseOrderFilters = () => (
    <>
      <div className="space-y-1">
        <label className="text-xs font-bold text-slate-500 uppercase">Supplier</label>
        <select
          value={filters.supplierId || ''}
          onChange={(e) => handleChange('supplierId', e.target.value)}
          className="w-full p-2 border border-slate-200 rounded-lg text-sm"
        >
          <option value="">All Suppliers</option>
          {suppliers.map(s => (
            <option key={s.id} value={s.id}>
              {s.name} {s.status === 'INACTIVE' ? '(Archived)' : ''}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-bold text-slate-500 uppercase">Payment Method</label>
        <select
          value={filters.paymentMethod || ''}
          onChange={(e) => handleChange('paymentMethod', e.target.value)}
          className="w-full p-2 border border-slate-200 rounded-lg text-sm"
        >
          <option value="">All Payment Methods</option>
          {poPaymentMethods.map(method => (
            <option key={method} value={method}>{method}</option>
          ))}
          {/* Fallbacks if list is empty */}
          {poPaymentMethods.length === 0 && (
            <>
              <option value="Cash">Cash</option>
              <option value="Cheque">Cheque</option>
              <option value="Bank Transfer">Bank Transfer</option>
            </>
          )}
        </select>
      </div>
    </>
  );

  const renderMovementsFilters = () => (
    <>
      <div className="space-y-1">
        <label className="text-xs font-bold text-slate-500 uppercase">Movement Type</label>
        <select
          value={filters.type || ''}
          onChange={(e) => handleChange('type', e.target.value)}
          className="w-full p-2 border border-slate-200 rounded-lg text-sm"
        >
          <option value="">All Types</option>
          <option value="STOCK_IN">Stock In (Addition)</option>
          <option value="STOCK_OUT">Stock Out (Issue/Wastage)</option>
          <option value="ADJUSTMENT">Adjustment</option>
        </select>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-bold text-slate-500 uppercase">Item Name</label>
        <input
          type="text"
          placeholder="Search item..."
          value={filters.search || ''}
          onChange={(e) => handleChange('search', e.target.value)}
          className="w-full p-2 border border-slate-200 rounded-lg text-sm"
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-bold text-slate-500 uppercase">Staff Member</label>
        <select
          value={filters.userId || ''}
          onChange={(e) => handleChange('userId', e.target.value)}
          className="w-full p-2 border border-slate-200 rounded-lg text-sm"
        >
          <option value="">All Staff</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
        </select>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-bold text-slate-500 uppercase">Sort By</label>
        <select
          value={filters.sortBy || 'date_desc'}
          onChange={(e) => handleChange('sortBy', e.target.value)}
          className="w-full p-2 border border-slate-200 rounded-lg text-sm"
        >
          <option value="date_desc">Date (Newest First)</option>
          <option value="name">Item Name</option>
          <option value="type">Movement Type</option>
        </select>
      </div>
    </>
  );

  const renderJatKitchenFilters = () => (
    <>
      <div className="space-y-1">
        <label className="text-xs font-bold text-slate-500 uppercase">Month</label>
        <input 
          type="month" 
          value={filters.month || ''} 
          onChange={(e) => handleChange('month', e.target.value)}
          className="w-full p-2 border border-slate-200 rounded-lg text-sm"
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-bold text-slate-500 uppercase flex items-center justify-between">
          <span>Specific Day</span>
          {filters.day && (
            <button
              type="button"
              onClick={() => handleChange('day', '')}
              className="text-rose-400 hover:text-rose-600 text-[10px] font-bold uppercase ml-2"
            >
              ✕ Clear
            </button>
          )}
        </label>
        <input 
          type="date" 
          value={filters.day || ''} 
          onChange={(e) => handleChange('day', e.target.value)}
          className="w-full p-2 border border-slate-200 rounded-lg text-sm"
        />
        {filters.day && (
          <p className="text-[10px] text-slate-400">Showing only: <span className="font-bold text-slate-600">{(() => { const [y,m,d] = filters.day.split('-'); return `${d}/${m}/${y}`; })()}</span></p>
        )}
      </div>

      {jatKitchenTotals && (
        <div className="md:col-span-2 flex gap-4 ml-0 md:ml-auto w-full">
          <div className="bg-orange-50 text-orange-700 px-4 py-2 rounded-xl flex-1 flex flex-col justify-center border border-orange-100">
            <span className="text-[10px] uppercase font-bold opacity-70">JAT Total</span>
            <span className="font-black text-lg">LKR {jatKitchenTotals.jat.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="bg-blue-50 text-blue-700 px-4 py-2 rounded-xl flex-1 flex flex-col justify-center border border-blue-100">
            <span className="text-[10px] uppercase font-bold opacity-70">Kitchen Total</span>
            <span className="font-black text-lg">LKR {jatKitchenTotals.kitchen.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
      <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
        <Filter className="text-slate-400" size={18} />
        <h3 className="font-bold text-slate-700">Report Filters</h3>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 items-end bg-slate-50 p-4 rounded-xl">
        {reportType === 'valuation' && renderValuationFilters()}
        {reportType === 'expiry' && renderExpiryFilters()}
        {reportType === 'outstanding' && renderOutstandingFilters()}
        {reportType === 'movements' && renderMovementsFilters()}
        {reportType === 'purchase_orders' && renderPurchaseOrderFilters()}
        {(reportType === 'jat_kitchen' || reportType === 'jat_transactions') && renderJatKitchenFilters()}
      </div>

      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          onClick={onReset}
          className="text-sm font-semibold text-slate-500 hover:text-slate-800 transition-colors"
        >
          Reset Filters
        </button>
        <button
          onClick={onApply}
          className="px-6 py-2.5 bg-primary text-white font-bold rounded-xl text-sm transition-all hover:bg-opacity-90 shadow-md shadow-blue-500/20 active:scale-95"
        >
          Apply Filters
        </button>
      </div>
    </div>
  );
};
