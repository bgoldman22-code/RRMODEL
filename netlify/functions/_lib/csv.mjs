
export function parseCSV(text) {
  const rows = [];
  let i = 0, field = '', row = [], inQuotes = false;
  while (i <= text.length) {
    const c = text[i] ?? '\n'; // force flush at end
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        // handle CRLF or LF; flush row only on LF or last char
        if (c === '\r' && text[i+1] !== '\n') {
          // ignore bare CR
        } else {
          row.push(field); field = '';
          if (row.length > 1 || (row.length === 1 && row[0] !== '')) rows.push(row);
          row = [];
          if (c === '\r' && text[i+1] === '\n') i++; // skip LF in CRLF
        }
      } else { field += c; }
    }
    i++;
  }
  if (row.length) rows.push(row);
  const header = rows.shift() || [];
  const index = Object.fromEntries(header.map((h, idx) => [h.trim(), idx]));
  const objects = rows.map(r => {
    const o = {};
    for (const [k, idx] of Object.entries(index)) o[k] = r[idx] ?? '';
    return o;
  });
  return { header, rows: objects };
}
