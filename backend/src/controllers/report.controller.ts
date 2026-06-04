import { Request, Response, NextFunction } from 'express';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { supabase } from '../config/supabase';
import { BadRequestError } from '../utils/errors';

export const exportReport = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reportType, format } = req.query;

    if (!reportType || !format) {
      throw new BadRequestError('reportType and format are required parameters.');
    }

    if (!['csv', 'excel', 'pdf'].includes(format as string)) {
      throw new BadRequestError('Invalid export format. Must be csv, excel, or pdf.');
    }

    // 1. Gather Report Data
    let data: any[] = [];
    let headers: string[] = [];
    let title = '';

    if (reportType === 'valuation') {
      title = 'Inventory Valuation Report';
      headers = ['SKU', 'Item Name', 'Category', 'Batch Code', 'Available Qty', 'Cost Price (LKR)', 'Total Valuation (LKR)'];
      
      const { data: dbData, error } = await supabase
        .from('batches')
        .select(`
          batch_number,
          available_qty,
          inventory_items (
            sku,
            name,
            cost_price,
            categories ( name )
          )
        `)
        .gt('available_qty', 0)
        .eq('status', 'ACTIVE');

      if (error) throw new BadRequestError(error.message);

      data = (dbData || []).map((row: any) => {
        const item = row.inventory_items;
        const totalVal = Number(row.available_qty) * Number(item?.cost_price || 0);
        return [
          item?.sku || '',
          item?.name || '',
          item?.categories?.name || '',
          row.batch_number,
          row.available_qty,
          Number(item?.cost_price || 0).toFixed(2),
          totalVal.toFixed(2)
        ];
      });
    } else if (reportType === 'expiry') {
      title = 'Inventory Expiry Warning Report';
      headers = ['SKU', 'Item Name', 'Batch Code', 'Expiry Date', 'Available Qty', 'Status'];
      
      const { data: dbData, error } = await supabase
        .from('batches')
        .select(`
          batch_number,
          expiry_date,
          available_qty,
          status,
          inventory_items (
            sku,
            name
          )
        `)
        .is('expiry_date', 'not.null')
        .eq('status', 'ACTIVE')
        .order('expiry_date', { ascending: true });

      if (error) throw new BadRequestError(error.message);

      data = (dbData || []).map((row: any) => {
        const item = row.inventory_items;
        return [
          item?.sku || '',
          item?.name || '',
          row.batch_number,
          row.expiry_date,
          row.available_qty,
          row.status
        ];
      });
    } else if (reportType === 'outstanding') {
      title = 'Supplier Outstanding Balance Report';
      headers = ['Supplier Code', 'Supplier Name', 'Phone', 'Outstanding Balance (LKR)', 'Credit Limit (LKR)', 'Status'];
      
      const { data: dbData, error } = await supabase
        .from('suppliers')
        .select('code, name, phone, outstanding_balance, credit_limit, status')
        .order('outstanding_balance', { ascending: false });

      if (error) throw new BadRequestError(error.message);

      data = (dbData || []).map((row: any) => [
        row.code,
        row.name,
        row.phone || 'N/A',
        Number(row.outstanding_balance).toFixed(2),
        Number(row.credit_limit).toFixed(2),
        row.status
      ]);
    } else if (reportType === 'movements') {
      title = 'Inventory Stock Movements Log';
      headers = ['Movement Code', 'SKU', 'Item Name', 'Type', 'Base Qty', 'Reason', 'User', 'Date'];
      
      const { data: dbData, error } = await supabase
        .from('stock_movements')
        .select(`
          movement_number,
          type,
          quantity,
          created_at,
          inventory_items ( sku, name ),
          movement_reasons ( name ),
          profiles!stock_movements_created_by_fkey ( username )
        `)
        .order('created_at', { ascending: false });

      if (error) throw new BadRequestError(error.message);

      data = (dbData || []).map((row: any) => [
        row.movement_number,
        row.inventory_items?.sku || '',
        row.inventory_items?.name || '',
        row.type,
        row.quantity,
        row.movement_reasons?.name || '',
        row.profiles?.username || 'System',
        new Date(row.created_at).toLocaleDateString()
      ]);
    } else {
      throw new BadRequestError('Unknown reportType requested.');
    }

    // 2. Export compiles
    if (format === 'csv') {
      let csvContent = `\uFEFF${title}\n\n`; // Add BOM for excel support
      csvContent += headers.join(',') + '\n';
      data.forEach((row) => {
        const escapedRow = row.map((val: any) => `"${String(val).replace(/"/g, '""')}"`);
        csvContent += escapedRow.join(',') + '\n';
      });

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${reportType}-report.csv"`);
      return res.status(200).send(csvContent);
    } 

    if (format === 'excel') {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet(reportType as string);

      // Title Block
      worksheet.mergeCells('A1:G1');
      worksheet.getCell('A1').value = title;
      worksheet.getCell('A1').font = { size: 16, bold: true };
      worksheet.getCell('A1').alignment = { horizontal: 'center' };
      
      worksheet.addRow([]); // Blank spacer row

      // Headers row
      worksheet.addRow(headers);
      const headerRowIndex = 3;
      worksheet.getRow(headerRowIndex).font = { bold: true };
      worksheet.getRow(headerRowIndex).getCell(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFEAEAEA' }
      };

      // Add Data
      data.forEach((row) => worksheet.addRow(row));

      // Auto-fit columns
      worksheet.columns.forEach((column) => {
        let maxLength = 0;
        column.eachCell?.({ includeEmpty: true }, (cell) => {
          const columnLength = cell.value ? String(cell.value).length : 0;
          if (columnLength > maxLength) {
            maxLength = columnLength;
          }
        });
        column.width = maxLength < 12 ? 12 : maxLength + 3;
      });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${reportType}-report.xlsx"`);
      
      await workbook.xlsx.write(res);
      return res.end();
    }

    if (format === 'pdf') {
      const doc = new PDFDocument({ margin: 30, size: 'A4' });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${reportType}-report.pdf"`);
      doc.pipe(res);

      // Header Block
      doc.fontSize(18).text('Lanka Spices Restaurant Group', { align: 'center' });
      doc.fontSize(14).text(title, { align: 'center' });
      doc.fontSize(8).text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
      doc.moveDown(2);

      // Simple Table layout
      const tableX = 30;
      let currentY = doc.y;
      const colWidths = [60, 110, 80, 80, 50, 60, 60]; // Map approximate column space

      // Render Headers
      doc.fontSize(8).font('Helvetica-Bold');
      let currentX = tableX;
      headers.slice(0, 7).forEach((header, index) => {
        doc.text(header, currentX, currentY, { width: colWidths[index], align: 'left' });
        currentX += colWidths[index];
      });
      doc.moveDown(0.5);
      
      // Horizontal Line below header
      doc.moveTo(tableX, doc.y).lineTo(570, doc.y).strokeColor('#ccc').lineWidth(1).stroke();
      doc.moveDown(0.5);

      // Render Rows
      doc.font('Helvetica').fontSize(7);
      data.forEach((row) => {
        // Break page check
        if (doc.y > 750) {
          doc.addPage();
          currentY = 40;
          doc.fontSize(8).font('Helvetica-Bold');
          let headerX = tableX;
          headers.slice(0, 7).forEach((header, idx) => {
            doc.text(header, headerX, currentY, { width: colWidths[idx], align: 'left' });
            headerX += colWidths[idx];
          });
          doc.moveTo(tableX, doc.y + 10).lineTo(570, doc.y + 10).stroke();
          doc.y = currentY + 15;
          doc.font('Helvetica').fontSize(7);
        }

        currentY = doc.y;
        let dataX = tableX;
        row.slice(0, 7).forEach((cell: any, idx: number) => {
          doc.text(String(cell), dataX, currentY, { width: colWidths[idx], align: 'left' });
          dataX += colWidths[idx];
        });
        doc.moveDown(0.8);
      });

      doc.end();
      return;
    }
  } catch (error) {
    next(error);
  }
};
