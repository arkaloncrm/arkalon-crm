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
