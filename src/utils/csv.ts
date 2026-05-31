// DATA-001 — generic CSV helpers. Used by the sold-items export and any
// future bookkeeping exports.
//
// RFC-4180-ish escaping:
//   - wrap in double-quotes when the value contains comma, quote, CR, LF, or
//     leading/trailing whitespace
//   - double up any embedded double-quote
//
// Returns a string with CRLF line endings so Excel on Windows opens it
// without prompting for a delimiter.

export type CsvCell = string | number | boolean | null | undefined;

export function escapeCsvCell(value: CsvCell): string {
  if (value === null || value === undefined) return '';
  let s = typeof value === 'string' ? value : String(value);
  const needsQuotes = /[",\r\n]/.test(s) || /^\s|\s$/.test(s);
  if (needsQuotes) {
    s = '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export function buildCsv(headers: string[], rows: CsvCell[][]): string {
  const lines: string[] = [];
  lines.push(headers.map(escapeCsvCell).join(','));
  for (const row of rows) {
    lines.push(row.map(escapeCsvCell).join(','));
  }
  return lines.join('\r\n');
}

// Trigger a browser download. Prepends a UTF-8 byte-order mark (\uFEFF) so
// Excel detects UTF-8. `filename` should include the .csv extension.
export function downloadCsv(filename: string, csv: string): void {
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revoke so the browser has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
