import React, { useState } from 'react';
import api from '../services/api';
import { FileDown, Calendar, FileText, BarChart3, AlertCircle } from 'lucide-react';

export const Reports: React.FC = () => {
  const [reportType, setReportType] = useState('valuation');
  const [format, setFormat] = useState('excel');
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reportsList = [
    {
      id: 'valuation',
      title: 'Inventory Valuation Report',
      description: 'Calculates the total monetary value of current available stock in base units using cost price.',
      icon: <BarChart3 size={24} className="text-green-500" />
    },
    {
      id: 'expiry',
      title: 'Inventory Expiry Warning Report',
      description: 'Lists all active batches that contain expiry dates, sorted by closest warning thresholds.',
      icon: <Calendar size={24} className="text-orange-500" />
    },
    {
      id: 'outstanding',
      title: 'Supplier Outstanding Balances',
      description: 'Summarizes payment ledger values and current outstanding balances across suppliers.',
      icon: <FileText size={24} className="text-purple-500" />
    },
    {
      id: 'movements',
      title: 'Stock Movements Log',
      description: 'Detailed list of stock logs representing additions, issues, and adjustments.',
      icon: <FileText size={24} className="text-blue-500" />
    }
  ];

  const handleExport = async () => {
    setDownloading(true);
    setError(null);

    try {
      const response = await api.get('/reports/export', {
        params: { reportType, format },
        responseType: 'blob' // Essential to parse binary PDF/Excel streams
      });

      // Construct file download attachment in browser
      const blob = new Blob([response.data], {
        type: response.headers['content-type']
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      const extensionMap: Record<string, string> = {
        csv: 'csv',
        excel: 'xlsx',
        pdf: 'pdf'
      };
      
      link.setAttribute('download', `${reportType}-report.${extensionMap[format]}`);
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error(err);
      setError('Failed to download report files. Verify that data exists.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Analytics & Reports</h2>
        <p className="text-sm text-slate-500">Compile and export active inventory audit files in various formats</p>
      </div>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-xl flex items-start space-x-3 max-w-2xl">
          <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={18} />
          <div className="text-xs font-semibold text-red-700">{error}</div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Report Type Selector */}
        <div className="lg:col-span-2 space-y-4">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Select Report Type</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {reportsList.map((rep) => {
              const isSelected = reportType === rep.id;
              return (
                <div
                  key={rep.id}
                  onClick={() => setReportType(rep.id)}
                  className={`
                    p-6 rounded-2xl border transition-all cursor-pointer card-shadow flex flex-col justify-between h-44
                    ${isSelected 
                      ? 'border-primary bg-blue-50/20 ring-2 ring-blue-500/10' 
                      : 'border-slate-100 bg-white hover:border-slate-200'}
                  `}
                >
                  <div className="space-y-2">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-slate-50 rounded-xl border border-slate-100">{rep.icon}</div>
                      <h4 className="font-bold text-slate-800 text-sm sm:text-base">{rep.title}</h4>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed font-medium">{rep.description}</p>
                  </div>
                  
                  <div className="flex items-center space-x-2 text-xs font-semibold text-primary">
                    <span className={isSelected ? 'underline' : ''}>
                      {isSelected ? 'Active Selection' : 'Click to Select'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Export properties */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100 card-shadow h-fit space-y-6">
          <h3 className="font-bold text-slate-800">Export Parameters</h3>
          
          {/* Format selector */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">File Format</label>
            <div className="space-y-2">
              {[
                { id: 'excel', label: 'Microsoft Excel (.xlsx)', desc: 'Full spreadsheet layout with auto-sized columns' },
                { id: 'pdf', label: 'PDF Document (.pdf)', desc: 'Clean, printable layout with branding headers' },
                { id: 'csv', label: 'CSV Comma Delimited (.csv)', desc: 'Raw data columns encoded in UTF-8 format' }
              ].map((form) => {
                const isSelected = format === form.id;
                return (
                  <label 
                    key={form.id}
                    className={`
                      flex items-start space-x-3 p-3.5 rounded-xl border cursor-pointer transition-all
                      ${isSelected 
                        ? 'border-primary bg-blue-50/10 ring-2 ring-blue-500/5' 
                        : 'border-slate-100 hover:border-slate-200'}
                    `}
                  >
                    <input
                      type="radio"
                      name="format"
                      checked={isSelected}
                      onChange={() => setFormat(form.id)}
                      className="mt-1 h-4 w-4 text-primary focus:ring-primary border-slate-200"
                    />
                    <div className="space-y-0.5">
                      <span className="text-xs font-bold text-slate-800">{form.label}</span>
                      <p className="text-[10px] text-slate-400 font-medium leading-relaxed">{form.desc}</p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <button
            onClick={handleExport}
            disabled={downloading}
            className="w-full flex items-center justify-center space-x-2 py-3 bg-primary text-primary-foreground font-bold rounded-xl text-sm transition-all shadow-md shadow-blue-500/10 hover:bg-opacity-95 disabled:opacity-50 active:scale-98"
          >
            {downloading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Compiling data streams...</span>
              </>
            ) : (
              <>
                <FileDown size={18} />
                <span>Export Report Document</span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};
export default Reports;
