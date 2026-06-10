import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

export interface ColumnDef {
  key: string;
  header: string;
  render?: (row: any) => React.ReactNode;
  sortable?: boolean;
}

export interface ReportTableProps {
  columns: ColumnDef[];
  data: any[];
  loading: boolean;
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  sortConfig?: { key: string; direction: 'asc' | 'desc' } | null;
  onSort?: (key: string) => void;
}

export const ReportTable: React.FC<ReportTableProps> = ({
  columns,
  data,
  loading,
  selectedIds,
  onSelectionChange,
  sortConfig,
  onSort
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 25;

  const totalPages = Math.ceil(data.length / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const paginatedData = data.slice(startIndex, startIndex + rowsPerPage);

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      // Select all visible on current page
      const newIds = new Set([...selectedIds, ...paginatedData.map(r => r.id)]);
      onSelectionChange(Array.from(newIds));
    } else {
      // Deselect all visible on current page
      const visibleIds = paginatedData.map(r => r.id);
      onSelectionChange(selectedIds.filter(id => !visibleIds.includes(id)));
    }
  };

  const handleSelectRow = (id: string, checked: boolean) => {
    if (checked) {
      onSelectionChange([...selectedIds, id]);
    } else {
      onSelectionChange(selectedIds.filter(sid => sid !== id));
    }
  };

  const isAllVisibleSelected = paginatedData.length > 0 && paginatedData.every(r => selectedIds.includes(r.id));

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col mb-24">
      <div className="overflow-x-auto flex-1">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 sticky top-0 z-10">
            <tr>
              <th className="px-6 py-4 w-12 text-center">
                <input 
                  type="checkbox" 
                  checked={isAllVisibleSelected}
                  onChange={handleSelectAll}
                  className="w-4 h-4 text-primary focus:ring-primary border-slate-300 rounded"
                />
              </th>
              {columns.map((col) => (
                <th 
                  key={col.key} 
                  className={`px-6 py-4 font-semibold ${col.sortable ? 'cursor-pointer hover:bg-slate-100 transition-colors select-none' : ''}`}
                  onClick={() => col.sortable && onSort && onSort(col.key)}
                >
                  <div className="flex items-center gap-1.5">
                    {col.header}
                    {col.sortable && (
                      <span className="text-slate-400">
                        {sortConfig?.key === col.key ? (
                          sortConfig.direction === 'asc' ? <ArrowUp size={14} className="text-primary" /> : <ArrowDown size={14} className="text-primary" />
                        ) : (
                          <ArrowUpDown size={14} />
                        )}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={columns.length + 1} className="px-6 py-12 text-center text-slate-500">
                  <div className="flex flex-col items-center justify-center">
                    <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mb-3" />
                    Fetching report data...
                  </div>
                </td>
              </tr>
            ) : paginatedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="px-6 py-16 text-center">
                  <div className="flex flex-col items-center justify-center text-slate-500">
                    <img src="/logo.png" alt="Empty" className="w-16 h-16 opacity-20 grayscale mb-4" />
                    <p className="font-semibold text-lg text-slate-700">No records found</p>
                    <p className="text-sm mt-1">Try adjusting your filters or search criteria.</p>
                  </div>
                </td>
              </tr>
            ) : (
              paginatedData.map((row, index) => {
                const isSelected = selectedIds.includes(row.id);
                return (
                  <tr 
                    key={row.id || index} 
                    className={`transition-colors ${isSelected ? 'bg-blue-50/50' : index % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'} hover:bg-slate-50`}
                  >
                    <td className="px-6 py-4 text-center border-r border-slate-50">
                      <input 
                        type="checkbox" 
                        checked={isSelected}
                        onChange={(e) => handleSelectRow(row.id, e.target.checked)}
                        className="w-4 h-4 text-primary focus:ring-primary border-slate-300 rounded"
                      />
                    </td>
                    {columns.map(col => (
                      <td key={col.key} className="px-6 py-4 text-slate-700">
                        {col.render ? col.render(row) : row[col.key] || '-'}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {!loading && data.length > 0 && (
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-slate-600 font-medium">
            Showing <span className="font-bold text-slate-800">{startIndex + 1}</span> to <span className="font-bold text-slate-800">{Math.min(startIndex + rowsPerPage, data.length)}</span> of <span className="font-bold text-slate-800">{data.length}</span> results
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-white transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="text-sm font-semibold text-slate-700 px-2">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-white transition-colors"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
