import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Printer, CalendarDays } from 'lucide-react';

export const DailyUsageSheet: React.FC = () => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchItems = async () => {
      try {
        const { data, error } = await supabase
          .from('inventory_items')
          .select('id, name, units:units!inventory_items_base_unit_id_fkey(abbreviation)')
          .eq('status', 'ACTIVE')
          .order('name');
          
        if (error) throw error;
        setItems(data || []);
      } catch (err) {
        console.error('Failed to load items:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchItems();
  }, []);

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 print:space-y-0 print:m-0 print:p-0">
      {/* Screen Only Header */}
      <div className="print:hidden flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <CalendarDays className="text-primary" /> Daily Usage Sheet
          </h2>
          <p className="text-sm text-slate-500 mt-1">Print a blank template for daily stock and usage tracking.</p>
        </div>
        <button
          onClick={handlePrint}
          className="px-6 py-2.5 bg-primary text-white font-bold rounded-xl shadow-md hover:bg-opacity-90 flex items-center gap-2 transition-all active:scale-95"
        >
          <Printer size={18} /> Print Sheet
        </button>
      </div>

      {/* Printable Area */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 print:shadow-none print:border-none print:p-0 print:m-0 w-full overflow-x-auto">
        {/* Print Header */}
        <div className="mb-6 flex justify-between items-end">
          <div>
            <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Daily Usage Sheet</h1>
            <p className="text-sm font-semibold text-slate-500 mt-1">Sigiri Catering Services</p>
          </div>
          <div className="flex gap-8 text-sm font-bold text-slate-700">
            <div>Month: <span className="inline-block w-32 border-b-2 border-slate-300 border-dotted" /></div>
            <div>Date Range: <span className="inline-block w-40 border-b-2 border-slate-300 border-dotted" /></div>
          </div>
        </div>

        {/* Table */}
        <table className="w-full text-xs border-collapse border border-slate-300 print:text-[10px]">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-300 p-2 text-left w-64" rowSpan={2}>Item Name</th>
              {[1, 2, 3, 4, 5, 6, 7].map(day => (
                <th key={day} className="border border-slate-300 p-2 text-center" colSpan={2}>Day {day}</th>
              ))}
            </tr>
            <tr className="bg-slate-50">
              {[1, 2, 3, 4, 5, 6, 7].map(day => (
                <React.Fragment key={`sub-${day}`}>
                  <th className="border border-slate-300 p-1.5 text-center font-semibold text-orange-700 bg-orange-50/50 w-16">JAT</th>
                  <th className="border border-slate-300 p-1.5 text-center font-semibold text-blue-700 bg-blue-50/50 w-16">Rest.</th>
                </React.Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => (
              <tr key={item.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}>
                <td className="border border-slate-300 p-1.5 font-medium text-slate-800">
                  {item.name} <span className="text-[9px] text-slate-400 ml-1">({item.units?.abbreviation})</span>
                </td>
                {[1, 2, 3, 4, 5, 6, 7].map(day => (
                  <React.Fragment key={`cell-${day}`}>
                    <td className="border border-slate-300 p-1.5"></td>
                    <td className="border border-slate-300 p-1.5"></td>
                  </React.Fragment>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        
        {/* Print Footer */}
        <div className="mt-8 flex justify-between text-xs font-bold text-slate-500 hidden print:flex">
          <div>Prepared By: _____________________</div>
          <div>Checked By: _____________________</div>
        </div>
      </div>
      
      {/* Print Styles */}
      <style>{`
        @media print {
          @page { size: landscape; margin: 10mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background-color: white !important; }
          /* Hide Sidebar and Navbar when printing */
          nav, aside { display: none !important; }
          main { margin-left: 0 !important; padding: 0 !important; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  );
};

export default DailyUsageSheet;
