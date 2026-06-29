import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Pagination } from '../ui/Pagination';

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
  sortConfig?: { key: string; direction: 'asc' | 'desc' } | null;
  onSort?: (key: string) => void;
}

export const ReportTable: React.FC<ReportTableProps> = ({
  columns,
  data,
  loading,
  sortConfig,
  onSort
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const startIndex = (currentPage - 1) * pageSize;
  const paginatedData = data.slice(startIndex, startIndex + pageSize);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col mb-24">
      <div className="overflow-x-auto flex-1">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 sticky top-0 z-10">
            <tr>
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
                <td colSpan={columns.length} className="px-6 py-12 text-center text-slate-500">
                  <div className="flex flex-col items-center justify-center">
                    <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mb-3" />
                    Fetching report data...
                  </div>
                </td>
              </tr>
            ) : paginatedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-6 py-16 text-center">
                  <div className="flex flex-col items-center justify-center text-slate-500">
                    <img src="/logo.png" alt="Empty" className="w-16 h-16 opacity-20 grayscale mb-4" />
                    <p className="font-semibold text-lg text-slate-700">No records found</p>
                    <p className="text-sm mt-1">Try adjusting your filters or search criteria.</p>
                  </div>
                </td>
              </tr>
            ) : (
              paginatedData.map((row, index) => {
                return (
                  <tr 
                    key={row.id || index} 
                    className={`transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'} hover:bg-slate-50`}
                  >
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
        <Pagination
          currentPage={currentPage}
          totalCount={data.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      )}
    </div>
  );
};
