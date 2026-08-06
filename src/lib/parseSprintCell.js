function toISODate(raw) {
  const parts = raw.split('/');
  if (parts.length === 3) {
    const [d, mo, y] = parts;
    return `20${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  if (parts.length !== 2) {
    return null;
  }
  // 2-part dd/mm dates omit the year; the source sheet only ever uses this
  // for 2026 dates (cross-year sprints use an explicit dd/mm/yy end date,
  // e.g. S25's "01/01/27"). Re-verify if the sheet is reused for another year.
  const [d, mo] = parts;
  return `2026-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function parseSprintCell(cell) {
  if (cell instanceof Date) {
    // SheetJS (with cellDates: true) constructs Date objects using local-timezone
    // Y/M/D, the same pattern real `pg` uses for DATE columns (see src/lib/normalizeDate.js
    // and the Task 9 timezone bug it fixed) — so we must read the LOCAL calendar
    // components back out, not convert through UTC via toISOString().
    const y = cell.getFullYear();
    const m = String(cell.getMonth() + 1).padStart(2, '0');
    const d = String(cell.getDate()).padStart(2, '0');
    const iso = `${y}-${m}-${d}`;
    return { code: null, start: iso, end: iso, legacy: true };
  }
  const m = String(cell).match(/^(S\d+)\s*\(([\d/]+)\s*-\s*([\d/]+)\)$/);
  if (!m) return null;
  const [, code, startRaw, endRaw] = m;
  const start = toISODate(startRaw);
  const end = toISODate(endRaw);
  if (start === null || end === null) return null;
  return { code, start, end, legacy: false };
}

module.exports = { parseSprintCell, toISODate };
