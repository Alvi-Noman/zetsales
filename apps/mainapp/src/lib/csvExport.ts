export interface CsvColumn {
  key: string;
  header: string;
}

// A cell containing a comma, quote, or newline breaks a naive CSV unless quoted — and any quote it
// already contains must itself be doubled per the format, or the file corrupts starting at that cell.
function escapeCsvCell(value: string | number): string {
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildCsv(columns: CsvColumn[], rows: Record<string, string | number>[]): string {
  const header = columns.map((c) => escapeCsvCell(c.header)).join(',');
  const lines = rows.map((row) => columns.map((c) => escapeCsvCell(row[c.key] ?? '')).join(','));
  // Leading BOM so Excel (still the most common opener) detects UTF-8 instead of guessing the
  // system codepage and mangling non-ASCII customer/product names.
  return '﻿' + [header, ...lines].join('\r\n');
}

export function downloadCsv(filename: string, columns: CsvColumn[], rows: Record<string, string | number>[]) {
  const csv = buildCsv(columns, rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
