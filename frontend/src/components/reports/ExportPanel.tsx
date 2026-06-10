import React, { useState } from 'react';
import { Download, FileText, FileSpreadsheet, FileIcon } from 'lucide-react';

export interface ExportPanelProps {
  selectedCount: number;
  totalCount: number;
  onSelectAllPages: () => void;
  onExport: (format: 'excel' | 'pdf' | 'csv', selectedOnly: boolean) => void;
  exporting: boolean;
}

export const ExportPanel: React.FC<ExportPanelProps> = ({
  selectedCount,
  totalCount,
  onSelectAllPages,
  onExport,
  exporting
}) => {
  const [format, setFormat] = useState<'excel' | 'pdf' | 'csv'>('excel');

  return (
    <div className="fixed bottom-0 left-0 lg:left-64 right-0 bg-white border-t border-slate-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-40 px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4 transition-all duration-300">
      
      {/* Selection Summary */}
      <div className="flex items-center gap-4">
        <div className="bg-blue-50 px-4 py-2 rounded-lg border border-blue-100">
          <span className="font-bold text-primary">{selectedCount}</span>
          <span className="text-slate-600 text-sm font-medium ml-1">rows selected</span>
        </div>
        
        {selectedCount > 0 && selectedCount < totalCount && (
          <button 
            onClick={onSelectAllPages}
            className="text-sm font-semibold text-primary hover:text-blue-800 underline underline-offset-2 transition-colors"
          >
            Select all {totalCount} results
          </button>
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
          onClick={() => onExport(format, selectedCount > 0)}
          disabled={exporting || (selectedCount === 0 && totalCount === 0)}
          className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white font-bold rounded-xl text-sm transition-all shadow-md hover:bg-opacity-90 disabled:opacity-50 active:scale-95"
        >
          {exporting ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <Download size={18} />
          )}
          <span>
            Export {selectedCount > 0 ? selectedCount : totalCount} Rows
          </span>
        </button>
      </div>
    </div>
  );
};
