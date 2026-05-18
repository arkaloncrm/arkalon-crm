import * as XLSX from 'xlsx';

export const exportToCsv = (filename, rows, columns) => {
  if (!rows || rows.length === 0) return;

  const escapeCell = (val) => {
    if (val === null || val === undefined) return '';
    let str = String(val);
    // Prevent CSV formula injection (cells starting with =, +, -, @)
    if (/^[=+\-@]/.test(str)) str = `'${str}`;
    // Escape commas, quotes and newlines
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headers = columns.map(col => escapeCell(col.label)).join(',');

  const data = rows.map(row =>
    columns.map(col => {
      // Support both key-based and accessor-based columns
      const val = col.getValue ? col.getValue(row) : row[col.key];
      return escapeCell(val);
    }).join(',')
  ).join('\n');

  // UTF-8 BOM prefix so Excel opens correctly without encoding issues
  const BOM = '﻿';
  const csv = `${BOM}${headers}\n${data}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const exportToXlsx = (filename, rows, columns) => {
  if (!rows || rows.length === 0) return;

  // Build data array
  const headers = columns.map(col => col.label);
  const data = rows.map(row =>
    columns.map(col => col.getValue ? col.getValue(row) : (row[col.key] ?? ''))
  );

  const wsData = [headers, ...data];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Auto column widths based on content
  const colWidths = columns.map((col, i) => {
    const maxLen = Math.max(
      col.label.length,
      ...rows.map(row => {
        const val = col.getValue ? col.getValue(row) : (row[col.key] ?? '');
        return String(val).length;
      })
    );
    return { wch: Math.min(maxLen + 4, 50) };
  });
  ws['!cols'] = colWidths;

  // Apply currency format to currency columns
  const currencyColIndexes = columns
    .map((col, i) => col.currency ? i : -1)
    .filter(i => i >= 0);

  const range = XLSX.utils.decode_range(ws['!ref']);
  for (let R = 1; R <= range.e.r; R++) {
    for (const C of currencyColIndexes) {
      const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
      if (ws[cellRef]) {
        ws[cellRef].t = 'n';
        ws[cellRef].z = '"$"#,##0.00';
      }
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Report');
  XLSX.writeFile(wb, `${filename}_${new Date().toISOString().slice(0, 10)}.xlsx`);
};
