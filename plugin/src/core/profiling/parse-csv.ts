/**
 * Minimal RFC-4180 CSV split — quote-aware (single-line quoted fields).
 *
 * Ported 1:1 from `profiling-report/src/adapters/parseCsv.ts`. Strips a leading
 * BOM; trims cell whitespace; skips blank lines. Behavior-identical to the old
 * naive split for quote-free tables.
 *
 * Quoted fields must not span lines (no multi-line records) — the line pre-pass
 * splits on CR/LF before the quote scanner runs, so a quoted field containing a
 * bare newline would be truncated. None of the known producer tables need
 * multi-line records (HintMessages row 1 is the only quoted field in the
 * committed fixtures, and it is single-line).
 */
export function parseCsv(text: string): { headers: string[];
  rows: Record<string, string>[] } {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return {
      headers: [],
      rows: [],
    };
  }

  const headers = splitCsvLine(lines[0])
    .map((h) => h.trim());
  const rows = lines.slice(1)
    .map((line) => {
      const cols = splitCsvLine(line);
      const row: Record<string, string> = {};

      headers.forEach((h, i) => {
        row[h] = (cols[i] ?? '').trim();
      });

      return row;
    });

  return {
    headers,
    rows,
  };
}

/**
 * Split one CSV line into fields, honoring double-quoted fields (RFC-4180):
 * quotes protect embedded commas; `""` inside a quoted field is a literal
 * quote. A quote only opens a field when the field is empty so far, so
 * quote-free lines split exactly like `line.split(',')`.
 */
function splitCsvLine(line: string): string[] {
  if (!line.includes('"')) {
    return line.split(',');
  }

  const fields: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const c = line[i];

    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        }
        else {
          inQuotes = false;
        }
      }
      else {
        field += c;
      }
    }
    else if (c === '"' && field === '') {
      inQuotes = true;
    }
    else if (c === ',') {
      fields.push(field);
      field = '';
    }
    else {
      field += c;
    }
  }

  fields.push(field);

  return fields;
}
