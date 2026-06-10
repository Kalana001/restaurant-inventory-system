import React, { useState } from 'react';
import { Download, FileText, FileSpreadsheet, FileIcon, Columns } from 'lucide-react';

export interface ExportPanelProps {
  totalCount: number;
  columns: { key: string; header: string }[];
  onExport: (format: 'excel' | 'pdf' | 'csv', selectedCols: string[]) => void;
  exporting: boolean;
}

export const ExportPanel: React.FC<ExportPanelProps> = ({
  totalCount,
  columns,
  onExport,
  exporting
}) => {
  const [format, setFormat] = useState<'excel' | 'pdf' | 'csv'>('excel');
  const [showColSelect, setShowColSelect] = useState(false);
  const [selectedCols, setSelectedCols] = useState<string[]>(columns.map(c => c.key));

  const handleToggleCol = (key: string) => {
    setSelectedCols(prev => 
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  // Sync columns if report type changes and new columns are passed
  React.useEffect(() => {
    setSelectedCols(columns.map(c => c.key));
  }, [columns]);

  return (
    <div className="fixed bottom-0 left-0 lg:left-64 right-0 bg-white border-t border-slate-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-40 px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4 transition-all duration-300">
      
      {/* Column Selection */}
      <div className="flex items-center gap-4 relative">
        <button
          onClick={() => setShowColSelect(!showColSelect)}
          className="flex items-center gap-2 bg-blue-50 px-4 py-2 rounded-lg border border-blue-100 text-primary font-medium hover:bg-blue-100 transition-colors"
        >
          <Columns size={18} />
          <span>Select Columns ({selectedCols.length}/{columns.length})</span>
        </button>

        {showColSelect && (
          <div className="absolute bottom-full mb-2 left-0 w-64 bg-white border border-slate-200 shadow-lg rounded-xl p-3 z-50">
            <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Columns to Export</h4>
            <div className="max-h-60 overflow-y-auto space-y-1">
              {columns.map(col => (
                <label key={col.key} className="flex items-center gap-2 p-1.5 hover:bg-slate-50 rounded cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedCols.includes(col.key)}
                    onChange={() => handleToggleCol(col.key)}
                    className="w-4 h-4 text-primary focus:ring-primary border-slate-300 rounded"
                  />
                  <span className="text-sm font-medium text-slate-700">{col.header}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Export Controls */}
      <div className="flex items-center gap-6">
        <div className="flex items-center bg-slate-50 p-1 rounded-xl border border-slate-200">
          <button
            onClick={() => setFormat('excel')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
              format === 'excel' ? 'bg-white text-green-700 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <FileSpreadsheet size={16} />
            <span className="hidden sm:inline">Excel</span>
          </button>
          <button
            onClick={() => setFormat('pdf')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
              format === 'pdf' ? 'bg-white text-red-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <FileText size={16} />
            <span className="hidden sm:inline">PDF</span>
          </button>
          <button
            onClick={() => setFormat('csv')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
              format === 'csv' ? 'bg-white text-slate-800 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <FileIcon size={16} />
            <span className="hidden sm:inline">CSV</span>
          </button>
        </div>

        <button
          onClick={() => {
            onExport(format, selectedCols);
            setShowColSelect(false);
          }}
          disabled={exporting || totalCount === 0 || selectedCols.length === 0}
          className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white font-bold rounded-xl text-sm transition-all shadow-md hover:bg-opacity-90 disabled:opacity-50 active:scale-95"
        >
          {exporting ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <Download size={18} />
          )}
          <span>
            Export {totalCount} Rows
          </span>
        </button>
      </div>
      
      {/* Click outside overlay to close dropdown */}
      {showColSelect && (
        <div 
          className="fixed inset-0 z-40 bg-transparent"
          onClick={() => setShowColSelect(false)}
        />
      )}
    </div>
  );
};
