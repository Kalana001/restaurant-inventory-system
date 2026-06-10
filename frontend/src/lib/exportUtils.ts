import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Type for a column definition
export interface ExportColumn {
  header: string;
  key: string;
  width?: number; // For Excel
}

// Generates a CSV Blob
export const generateCSV = (
  columns: ExportColumn[],
  data: any[],
  filename: string
) => {
  // Add UTF-8 BOM so Excel opens it correctly
  const BOM = '\uFEFF';
  
  // Create header row
  const headerRow = columns.map(c => `"${c.header.replace(/"/g, '""')}"`).join(',');
  
  // Create data rows
  const dataRows = data.map(row => {
    return columns.map(c => {
      const val = row[c.key] !== undefined && row[c.key] !== null ? String(row[c.key]) : '';
      return `"${val.replace(/"/g, '""')}"`;
    }).join(',');
  });

  const csvContent = BOM + [headerRow, ...dataRows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  
  triggerDownload(blob, `${filename}.csv`);
};

// Generates an Excel File
export const generateExcel = async (
  columns: ExportColumn[],
  data: any[],
  filename: string,
  title: string
) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Report', {
    views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }] // freeze header
  });

  // Setup columns
  worksheet.columns = columns.map(c => ({
    header: c.header,
    key: c.key,
    width: c.width || 20
  }));

  // Style header row
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFEFEFEF' }
  };

  // Add data rows
  data.forEach((row, index) => {
    const newRow = worksheet.addRow(row);
    // Alternate row colors (zebra striping)
    if (index % 2 !== 0) {
      newRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF9FAFB' }
      };
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  
  triggerDownload(blob, `${filename}.xlsx`);
};

// Generates a PDF File
export const generatePDF = (
  columns: ExportColumn[],
  data: any[],
  filename: string,
  title: string
) => {
  const doc = new jsPDF('landscape');

  // Title
  doc.setFontSize(18);
  doc.text('Sigiri Catering and Food Centre', 14, 20);
  
  doc.setFontSize(14);
  doc.setTextColor(100);
  doc.text(title, 14, 28);
  
  doc.setFontSize(10);
  doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 34);

  // Map data to table rows
  const tableData = data.map(row => columns.map(c => {
      const val = row[c.key];
      return val !== undefined && val !== null ? String(val) : '';
  }));

  const headers = columns.map(c => c.header);

  autoTable(doc, {
    startY: 40,
    head: [headers],
    body: tableData,
    theme: 'striped',
    headStyles: { fillColor: [41, 128, 185] },
    styles: { fontSize: 8 },
    didDrawPage: (dataArg) => {
      // Footer page number
      const pageCount = doc.getNumberOfPages();
      doc.setFontSize(8);
      doc.text(
        `Page ${dataArg.pageNumber} of ${pageCount}`,
        dataArg.settings.margin.left,
        doc.internal.pageSize.height - 10
      );
    }
  });

  doc.save(`${filename}.pdf`);
};

// Helper function to trigger browser download
const triggerDownload = (blob: Blob, fileName: string) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};
