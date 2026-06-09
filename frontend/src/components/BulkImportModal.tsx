import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import { Upload, Download, AlertCircle, FileSpreadsheet, X, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface BulkImportModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export const BulkImportModal: React.FC<BulkImportModalProps> = ({ onClose, onSuccess }) => {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const downloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([
      {
        SKU: 'ITM-001',
        Name: 'Test Item',
        Description: 'Optional description',
        Category: 'Beverages',
        Subcategory: 'Cold Drinks',
        BaseUnit: 'Litres',
        CostPrice: 150.00,
        SellingPrice: 200.00,
        MinStock: 10,
        MaxStock: 100,
        ReorderLevel: 20
      }
    ]);
    
    // Auto-size columns slightly
    const wscols = [
      {wch: 15}, {wch: 25}, {wch: 30}, {wch: 20}, {wch: 20}, 
      {wch: 15}, {wch: 15}, {wch: 15}, {wch: 12}, {wch: 12}, {wch: 15}
    ];
    ws['!cols'] = wscols;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'InventoryTemplate');
    XLSX.writeFile(wb, 'inventory_import_template.xlsx');
  };

  const processImport = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // 1. Read file
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(worksheet);

      if (rows.length === 0) {
        throw new Error("The uploaded file is empty.");
      }

      // 2. Fetch required lookup data (Categories, Units)
      const [catRes, unitRes] = await Promise.all([
        supabase.from('categories').select('id, name, subcategories(id, name)'),
        supabase.from('units').select('id, name, abbreviation')
      ]);

      if (catRes.error) throw catRes.error;
      if (unitRes.error) throw unitRes.error;

      const categories = catRes.data || [];
      const units = unitRes.data || [];

      // 3. Process and map rows
      const itemsToInsert = [];
      const errors = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2; // +1 for 0-index, +1 for header

        // Lookup Base Unit
        const unit = units.find(u => 
          u.name.toLowerCase() === String(row.BaseUnit || '').toLowerCase() || 
          u.abbreviation.toLowerCase() === String(row.BaseUnit || '').toLowerCase()
        );
        if (!unit) {
          errors.push(`Row ${rowNum}: BaseUnit '${row.BaseUnit}' not found in system.`);
          continue;
        }

        // Lookup Category
        const category = categories.find(c => c.name.toLowerCase() === String(row.Category || '').toLowerCase());
        if (!category) {
          errors.push(`Row ${rowNum}: Category '${row.Category}' not found in system.`);
          continue;
        }

        // Lookup Subcategory (Optional)
        let subcatId = null;
        if (row.Subcategory) {
          const subcat = category.subcategories?.find((s: any) => s.name.toLowerCase() === String(row.Subcategory).toLowerCase());
          if (subcat) {
            subcatId = subcat.id;
          } else {
            errors.push(`Row ${rowNum}: Subcategory '${row.Subcategory}' not found in Category '${category.name}'.`);
            continue;
          }
        }

        // Validate numbers
        const costPrice = parseFloat(row.CostPrice);
        if (isNaN(costPrice)) { errors.push(`Row ${rowNum}: Invalid CostPrice`); continue; }

        itemsToInsert.push({
          sku: row.SKU,
          name: row.Name,
          description: row.Description || null,
          category_id: category.id,
          subcategory_id: subcatId,
          base_unit_id: unit.id,
          cost_price: costPrice,
          selling_price: parseFloat(row.SellingPrice) || costPrice,
          min_stock_level: parseInt(row.MinStock) || 0,
          max_stock_level: parseInt(row.MaxStock) || null,
          reorder_level: parseInt(row.ReorderLevel) || 0,
          status: 'ACTIVE',
          created_by: user?.id
        });
      }

      if (errors.length > 0) {
        throw new Error("Validation failed:\n" + errors.join('\n'));
      }

      if (itemsToInsert.length === 0) {
        throw new Error("No valid items found to import.");
      }

      // 4. Bulk Insert
      const { error: insertError } = await supabase
        .from('inventory_items')
        .insert(itemsToInsert);

      if (insertError) throw insertError;

      setSuccess(`Successfully imported ${itemsToInsert.length} items.`);
      setTimeout(() => {
        onSuccess();
      }, 2000);

    } catch (err: any) {
      console.error('Import error:', err);
      setError(err.message || "An error occurred during import.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-2xl border border-slate-100 w-full max-w-lg card-shadow flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-100 p-6 shrink-0">
          <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <FileSpreadsheet className="text-primary" />
            Bulk Import Items
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Instructions */}
          <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl space-y-3">
            <h4 className="font-semibold text-blue-800 text-sm">How to import:</h4>
            <ol className="list-decimal pl-4 text-xs text-blue-700 space-y-1">
              <li>Download the Excel template.</li>
              <li>Fill in your items. <strong>Category</strong> and <strong>BaseUnit</strong> names must exactly match existing records in the system.</li>
              <li>Upload the completed file below.</li>
            </ol>
            <button 
              onClick={downloadTemplate}
              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-blue-200 text-blue-700 rounded-lg text-xs font-semibold hover:bg-blue-50 transition-colors shadow-sm"
            >
              <Download size={14} />
              Download Template
            </button>
          </div>

          {/* Messages */}
          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-xl flex items-start gap-3">
              <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={18} />
              <p className="text-xs font-medium text-red-700 whitespace-pre-line">{error}</p>
            </div>
          )}

          {success && (
            <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded-r-xl flex items-start gap-3">
              <CheckCircle2 className="text-green-500 shrink-0 mt-0.5" size={18} />
              <p className="text-xs font-medium text-green-700">{success}</p>
            </div>
          )}

          {/* Upload Area */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700">Upload Excel File</label>
            <div className="relative border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:bg-slate-50 transition-colors group cursor-pointer">
              <input 
                type="file" 
                accept=".xlsx, .xls"
                onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <div className="flex flex-col items-center justify-center gap-2 pointer-events-none">
                <Upload size={32} className={`transition-colors ${file ? 'text-primary' : 'text-slate-400 group-hover:text-primary'}`} />
                {file ? (
                  <p className="text-sm font-semibold text-primary">{file.name}</p>
                ) : (
                  <p className="text-sm font-medium text-slate-500">Drag and drop or click to select</p>
                )}
                <p className="text-xs text-slate-400">Supports .xlsx and .xls</p>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-slate-100 shrink-0 flex justify-end gap-3 bg-slate-50 rounded-b-2xl">
          <button
            onClick={onClose}
            className="px-5 py-2.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold rounded-xl text-sm transition-all shadow-sm"
          >
            Cancel
          </button>
          <button
            onClick={processImport}
            disabled={!file || loading || !!success}
            className="px-6 py-2.5 bg-primary text-white hover:bg-opacity-90 font-semibold rounded-xl text-sm transition-all shadow-sm shadow-blue-500/20 active:scale-95 disabled:opacity-60 flex items-center gap-2"
          >
            {loading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
            {loading ? 'Importing...' : 'Upload & Import'}
          </button>
        </div>
      </div>
    </div>
  );
};
