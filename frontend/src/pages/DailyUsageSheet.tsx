import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Download, CalendarDays, X } from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

interface SheetItem {
  id: string;
  customName: string;
}

export const DailyUsageSheet: React.FC = () => {
  const [items, setItems] = useState<SheetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [dates, setDates] = useState(['', '', '']);
  const [monthInput, setMonthInput] = useState('');
  const [dateRangeInput, setDateRangeInput] = useState('');

  useEffect(() => {
    const fetchItems = async () => {
      try {
        const { data, error } = await supabase
          .from('inventory_items')
          .select('id, name, categories(name), units:units!inventory_items_base_unit_id_fkey(abbreviation)')
          .eq('status', 'ACTIVE')
          .order('name');
          
        if (error) throw error;
        
        // Filter out boxes, bags, packaging, etc.
        const filtered = (data || []).filter((item: any) => {
          const cat = (item.categories?.name || '').toLowerCase();
          const unit = (item.units?.abbreviation || '').toLowerCase();
          const name = (item.name || '').toLowerCase();
          
          if (cat.includes('box') || cat.includes('bag') || cat.includes('pack')) return false;
          if (unit.includes('box') || unit.includes('bag') || unit.includes('pack')) return false;
          if (name.includes('box') || name.includes('bag')) return false;
          
          return true;
        }).map(item => ({ id: item.id, customName: item.name }));

        setItems(filtered);
      } catch (err) {
        console.error('Failed to load items:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchItems();
  }, []);

  const handleExportPDF = async () => {
    const element = document.getElementById('pdf-area');
    if (!element) return;
    
    setExporting(true);
    // Wait for React to re-render inputs as spans
    await new Promise(resolve => setTimeout(resolve, 100));
    
    try {
      const canvas = await html2canvas(element, { 
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff'
      });
      const imgData = canvas.toDataURL('image/png');
      
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });
      
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      const ratio = Math.min(pdfWidth / canvas.width, pdfHeight / canvas.height);
      const imgWidth = canvas.width * ratio;
      const imgHeight = canvas.height * ratio;
      
      // Center horizontally, align top
      pdf.addImage(imgData, 'PNG', (pdfWidth - imgWidth) / 2, 0, imgWidth, imgHeight);
      pdf.save('Daily_Usage_Sheet.pdf');
    } catch (err) {
      console.error('PDF export failed:', err);
      alert('Failed to export PDF.');
    } finally {
      setExporting(false);
    }
  };

  const handleNameChange = (id: string, newName: string) => {
    setItems(items.map(item => item.id === id ? { ...item, customName: newName } : item));
  };

  const handleRemove = (id: string) => {
    setItems(items.filter(item => item.id !== id));
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // We now render a single vertical table as requested
  const renderTable = (tableItems: SheetItem[]) => (
    <table className="w-full text-[10px] border-collapse border border-slate-300 print:text-[9px]">
      <thead>
        <tr className="bg-slate-100">
          <th className="border border-slate-300 p-1.5 text-left" rowSpan={2}>Item Name</th>
          {[0, 1, 2].map(dayIndex => (
            <th key={dayIndex} className="border border-slate-300 p-1 text-center" colSpan={2}>
              {exporting ? (
                <span className="font-bold">{dates[dayIndex]}</span>
              ) : (
                <input 
                  type="text" 
                  value={dates[dayIndex]} 
                  onChange={e => {
                    const newDates = [...dates];
                    newDates[dayIndex] = e.target.value;
                    setDates(newDates);
                  }}
                  className="w-full text-center bg-transparent outline-none font-bold"
                />
              )}
            </th>
          ))}
        </tr>
        <tr className="bg-slate-50">
          {[1, 2, 3].map(day => (
            <React.Fragment key={`sub-${day}`}>
              <th className="border border-slate-300 p-1 text-center font-semibold text-orange-700 bg-orange-50/50 w-10">JAT</th>
              <th className="border border-slate-300 p-1 text-center font-semibold text-blue-700 bg-blue-50/50 w-10">Sigiri</th>
            </React.Fragment>
          ))}
        </tr>
      </thead>
      <tbody>
        {tableItems.map((item, idx) => (
          <tr key={item.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'} group`}>
            <td className="border border-slate-300 p-0 relative">
              <div className="flex items-center w-full">
                {exporting ? (
                  <span className="w-full p-1.5 font-medium text-slate-800">{item.customName}</span>
                ) : (
                  <input
                    type="text"
                    value={item.customName}
                    onChange={(e) => handleNameChange(item.id, e.target.value)}
                    className="w-full p-1.5 bg-transparent outline-none font-medium text-slate-800"
                  />
                )}
                {!exporting && (
                  <button
                    onClick={() => handleRemove(item.id)}
                    className="print:hidden absolute right-1 p-0.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-all"
                    title="Remove from list"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </td>
            {[1, 2, 3].map(day => (
              <React.Fragment key={`cell-${day}`}>
                <td className="border border-slate-300 p-1.5"></td>
                <td className="border border-slate-300 p-1.5"></td>
              </React.Fragment>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div className="space-y-6 print:space-y-0 print:m-0 print:p-0">
      {/* Screen Only Header */}
      <div className="print:hidden flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <CalendarDays className="text-primary" /> Daily Usage Sheet
          </h2>
          <p className="text-sm text-slate-500 mt-1">Customize your items, remove rows, and print for manual tracking.</p>
        </div>
        <button
          onClick={handleExportPDF}
          disabled={exporting}
          className="px-6 py-2.5 bg-primary text-white font-bold rounded-xl shadow-md hover:bg-opacity-90 flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50"
        >
          <Download size={18} /> {exporting ? 'Generating PDF...' : 'Export to PDF'}
        </button>
      </div>

      {/* Printable Area */}
      <div id="pdf-area" className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 print:shadow-none print:border-none print:p-0 print:m-0 w-full overflow-hidden">
        {/* Print Header */}
        <div className="mb-4 flex justify-between items-end">
          <div>
            <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight">Daily Usage Sheet (3 Days)</h1>
            <p className="text-xs font-semibold text-slate-500 mt-1">Sigiri Catering Services</p>
          </div>
          <div className="flex gap-6 text-xs font-bold text-slate-700 items-center">
            <div className="flex items-center gap-2">
              Month: 
              {exporting ? (
                <span className="w-24 border-b border-slate-300 border-dotted inline-block">{monthInput}</span>
              ) : (
                <input 
                  type="text" 
                  value={monthInput}
                  onChange={e => setMonthInput(e.target.value)}
                  className="w-24 border-b border-slate-300 border-dotted outline-none bg-transparent" 
                />
              )}
            </div>
            <div className="flex items-center gap-2">
              Date Range: 
              {exporting ? (
                <span className="w-32 border-b border-slate-300 border-dotted inline-block">{dateRangeInput}</span>
              ) : (
                <input 
                  type="text" 
                  value={dateRangeInput}
                  onChange={e => setDateRangeInput(e.target.value)}
                  className="w-32 border-b border-slate-300 border-dotted outline-none bg-transparent" 
                />
              )}
            </div>
          </div>
        </div>

        {/* Single Table */}
        <div className="w-full">
          {renderTable(items)}
        </div>
        
        {/* Print Footer */}
        <div className="mt-6 flex justify-between text-[10px] font-bold text-slate-500">
          <div>Prepared By: _____________________</div>
          <div>Checked By: _____________________</div>
        </div>
      </div>
      
      {/* Print Styles */}
      <style>{`
        @media print {
          @page { size: landscape; margin: 8mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background-color: white !important; }
          /* Hide Sidebar and Navbar when printing */
          nav, aside { display: none !important; }
          main { margin-left: 0 !important; padding: 0 !important; }
          .print\\:hidden { display: none !important; }
          input { border: none !important; padding: 0 !important; margin: 0 !important; background: transparent !important; color: black !important; font-size: 9px !important; }
        }
      `}</style>
    </div>
  );
};

export default DailyUsageSheet;
