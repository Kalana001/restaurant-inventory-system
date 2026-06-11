import React, { useState } from 'react';
import ExcelJS from 'exceljs';
import { supabase } from '../lib/supabase';
import { Upload, Download, AlertCircle, FileSpreadsheet, X, CheckCircle2 } from 'lucide-react';

interface BulkImportModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export const BulkImportModal: React.FC<BulkImportModalProps> = ({ onClose, onSuccess }) => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const downloadTemplate = async () => {
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('InventoryImport');

    ws.columns = [
      { header: 'SKU',              key: 'SKU',              width: 15 },
      { header: 'Name',             key: 'Name',             width: 30 },
      { header: 'Description',      key: 'Description',      width: 40 },
      { header: 'Category',         key: 'Category',         width: 22 },
      { header: 'Subcategory',      key: 'Subcategory',      width: 22 },
      { header: 'BaseUnit',         key: 'BaseUnit',         width: 15 },
      { header: 'CostPrice',        key: 'CostPrice',        width: 15 },
      { header: 'ReorderLevel',     key: 'ReorderLevel',     width: 15 },
      { header: 'TrackBatches',     key: 'TrackBatches',     width: 15 },
      { header: 'TrackExpiration',  key: 'TrackExpiration',  width: 17 },
    ];

    ws.getRow(1).eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });
    ws.getRow(1).height = 22;

    ws.addRow({
      SKU: 'ITM-001',
      Name: 'Example Item',
      Description: 'Optional description here',
      Category: 'Beverages',
      Subcategory: 'Cold Drinks',
      BaseUnit: 'Litres',
      CostPrice: '150.00',
      ReorderLevel: '20',
      TrackBatches: 'No',
      TrackExpiration: 'No',
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'inventory_import_template.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  };

  const processImport = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(arrayBuffer);
      const ws = workbook.worksheets[0];
      if (!ws) throw new Error('Could not read the spreadsheet. Is it a valid .xlsx file?');

      const headers: string[] = [];
      ws.getRow(1).eachCell(cell => headers.push(String(cell.value || '').trim()));

      const required = ['Name', 'Category', 'BaseUnit'];
      for (const col of required) {
        if (!headers.includes(col)) throw new Error(`Missing required column: "${col}". Please use the provided template.`);
      }

      const rows: Record<string, string>[] = [];
      ws.eachRow((row, idx) => {
        if (idx === 1) return;
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => {
          const cell = row.getCell(i + 1);
          obj[h] = cell.value != null ? String(cell.value).trim() : '';
        });
        if (Object.values(obj).some(v => v !== '')) rows.push(obj);
      });

      if (rows.length === 0) throw new Error('No data rows found. Please add items to the template.');

      const [catRes, unitRes] = await Promise.all([
        supabase.from('categories').select('id, name, subcategories(id, name)'),
        supabase.from('units').select('id, name, abbreviation'),
      ]);
      if (catRes.error) throw catRes.error;
      if (unitRes.error) throw unitRes.error;

      let localCategories = [...(catRes.data || [])];
      const units = unitRes.data || [];
      const validationErrors: string[] = [];
      const itemsToInsert: any[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2;

        if (!row.Name) { validationErrors.push(`Row ${rowNum}: "Name" is required.`); continue; }

        const unit = units.find(u => u.name.toLowerCase() === row.BaseUnit.toLowerCase() || u.abbreviation?.toLowerCase() === row.BaseUnit.toLowerCase());
        if (!unit) { validationErrors.push(`Row ${rowNum}: BaseUnit "${row.BaseUnit}" not found.`); continue; }

        // Find or create category on the fly
        const categoryName = (row.Category || '').trim();
        if (!categoryName) { validationErrors.push(`Row ${rowNum}: "Category" is required.`); continue; }

        let category = localCategories.find(c => c.name.toLowerCase() === categoryName.toLowerCase());
        if (!category) {
          try {
            const { data: newCat, error: catError } = await supabase
              .from('categories')
              .insert({ name: categoryName })
              .select('id, name')
              .single();
            if (catError) throw catError;
            category = { id: newCat.id, name: newCat.name, subcategories: [] };
            localCategories.push(category);
          } catch (err: any) {
            validationErrors.push(`Row ${rowNum}: Failed to create category "${categoryName}" (${err.message}).`);
            continue;
          }
        }

        let subcatId: string | null = null;
        if (row.Subcategory && row.Subcategory.trim()) {
          const subcatName = row.Subcategory.trim();
          let subcat = (category.subcategories as any[])?.find((s: any) => s.name.toLowerCase() === subcatName.toLowerCase());
          
          if (!subcat) {
            try {
              const { data: newSub, error: subError } = await supabase
                .from('subcategories')
                .insert({ name: subcatName, category_id: category.id })
                .select('id, name')
                .single();
              if (subError) throw subError;
              subcat = { id: newSub.id, name: newSub.name };
              if (!category.subcategories) {
                category.subcategories = [];
              }
              (category.subcategories as any[]).push(subcat);
            } catch (err: any) {
              validationErrors.push(`Row ${rowNum}: Failed to create subcategory "${subcatName}" under "${category.name}" (${err.message}).`);
              continue;
            }
          }
          subcatId = subcat.id;
        }

        itemsToInsert.push({
          sku: row.SKU || `IMP-${i + 1}`,
          name: row.Name,
          description: row.Description || null,
          category_id: category.id,
          subcategory_id: subcatId,
          base_unit_id: unit.id,
          purchase_unit_id: unit.id,
          issue_unit_id: unit.id,
          purchase_to_base_factor: 1,
          issue_to_base_factor: 1,
          is_batch_tracked: row.TrackBatches?.toLowerCase() === 'yes',
          is_expiry_tracked: row.TrackExpiration?.toLowerCase() === 'yes',
          cost_price: Number(row.CostPrice) || 0,
          reorder_level: Number(row.ReorderLevel) || 0,
          status: 'ACTIVE',
        });
      }

      if (validationErrors.length > 0) throw new Error('Validation errors:\n' + validationErrors.join('\n'));
      if (itemsToInsert.length === 0) throw new Error('No valid items to import.');

      const { error: insertError } = await supabase.from('inventory_items').insert(itemsToInsert);
      if (insertError) throw insertError;

      setSuccess(`✓ Successfully imported ${itemsToInsert.length} item${itemsToInsert.length !== 1 ? 's' : ''}!`);
      setTimeout(() => onSuccess(), 2000);

    } catch (err: any) {
      setError(err.message || 'An error occurred during import.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-2xl border border-slate-100 w-full max-w-lg card-shadow flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-100 p-6 shrink-0">
          <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <FileSpreadsheet className="text-primary" size={20} />
            Bulk Import Items
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>

        <div className="p-6 space-y-6">
          <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl space-y-3">
            <h4 className="font-semibold text-blue-800 text-sm">Import Instructions</h4>
            <ol className="list-decimal pl-4 text-xs text-blue-700 space-y-1">
              <li>Download the Excel template.</li>
              <li><strong>Category</strong> and <strong>BaseUnit</strong> must match exactly.</li>
              <li>Leave <strong>SKU</strong> blank to auto-generate.</li>
            </ol>
            <button onClick={downloadTemplate} className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-blue-200 text-blue-700 rounded-lg text-xs font-semibold hover:bg-blue-50 transition-colors shadow-sm">
              <Download size={14} /> Download Template
            </button>
          </div>

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

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700">Upload Excel File</label>
            <div className="relative border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:bg-slate-50 transition-colors group cursor-pointer">
              <input type="file" accept=".xlsx" onChange={(e) => { setFile(e.target.files?.[0] || null); setError(null); }} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
              <div className="flex flex-col items-center gap-2 pointer-events-none">
                <Upload size={32} className={`transition-colors ${file ? 'text-primary' : 'text-slate-400 group-hover:text-primary'}`} />
                {file ? <p className="text-sm font-semibold text-primary">{file.name}</p> : <p className="text-sm font-medium text-slate-500">Drag & drop or click to select</p>}
                <p className="text-xs text-slate-400">Supports .xlsx only</p>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-slate-100 shrink-0 flex justify-end gap-3 bg-slate-50 rounded-b-2xl">
          <button onClick={onClose} className="px-5 py-2.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold rounded-xl text-sm transition-all shadow-sm">Cancel</button>
          <button onClick={processImport} disabled={!file || loading || !!success} className="px-6 py-2.5 bg-primary text-white hover:bg-opacity-90 font-semibold rounded-xl text-sm transition-all shadow-sm active:scale-95 disabled:opacity-60 flex items-center gap-2">
            {loading ? 'Importing...' : 'Upload & Import'}
          </button>
        </div>
      </div>
    </div>
  );
};
