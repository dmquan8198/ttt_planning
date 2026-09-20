// One-time importer: reads "[TTT] Operation.xlsx" (3 sheets — Vận hành,
// Xử lý ticket, Marketing Overall — each laid out differently) and loads
// them all into the flat `sops` table. Not safe to blindly re-run: every
// insert here is a plain INSERT, so re-running duplicates rows (same
// non-idempotency as scripts/import_excel.js — check row counts first).
require('dotenv').config();
const XLSX = require('xlsx');
const { Pool } = require('pg');

function isNonEmpty(v) {
  return v !== undefined && v !== null && String(v).trim() !== '';
}
function s(v) {
  return isNonEmpty(v) ? String(v).trim() : null;
}

// The source sheet's Timing cell mixes "how often" and "how long it takes"
// as separate lines in one cell (e.g. "- Quarterly\n- Khoảng 5-7 ngày làm
// việc") — best-effort split: first line is frequency, the rest (if any)
// is duration. Rows with just one line (no duration mentioned) leave
// duration null rather than guessing.
function splitTimingDuration(raw) {
  if (!isNonEmpty(raw)) return { timing: null, duration: null };
  const lines = String(raw).split('\n').map((l) => l.replace(/^-\s*/, '').trim()).filter(Boolean);
  return {
    timing: lines[0] || null,
    duration: lines.length > 1 ? lines.slice(1).join('\n') : null
  };
}

// Sheet "1. Vận hành": Category, Task, Context/Objective, Timing, Action,
// Stakeholders, Reference, PIC HandOver (columns confirmed via a raw
// header:1 dump of the real file — see the PR/commit this script shipped
// with for the dump this mapping was built from).
function mapVanHanh(row) {
  const { timing, duration } = splitTimingDuration(row[3]);
  return {
    group_name: 'Vận hành',
    category: s(row[0]),
    title: s(row[1]),
    context: s(row[2]),
    timing,
    duration,
    steps: s(row[4]),
    stakeholders: s(row[5]),
    reference: s(row[6]),
    pic: s(row[7]),
    next_action: null
  };
}

// Sheet "2. Xử lý ticket": Category, Đầu mục, Context/Root Cause, Hướng xử
// lý hiện tại, Propose hướng enhance/Next Action, then 4 columns with no
// header text in the sheet at all (confirmed via openpyxl: row 1 genuinely
// blank in F–I, not a parsing artifact) holding, sparsely: Stakeholders,
// Reference, PIC, and — only on the Napas-refund row — a single stray
// technical-followup note with nowhere else to go, folded into
// next_action rather than adding a column just for one cell.
function mapXuLyTicket(row) {
  const proposeNextAction = s(row[4]);
  const strayNote = s(row[8]);
  return {
    group_name: 'Xử lý ticket',
    category: s(row[0]),
    title: s(row[1]),
    context: s(row[2]),
    timing: null,
    duration: null,
    steps: s(row[3]),
    stakeholders: s(row[5]),
    reference: s(row[6]),
    pic: s(row[7]),
    next_action: strayNote ? [proposeNextAction, strayNote].filter(Boolean).join('\n\n') : proposeNextAction
  };
}

// Sheet "3. Marketing Overall": Task, Context/Objective, Action,
// Stakeholders, Reference, PIC HandOver — no Category or Timing column at all.
function mapMarketing(row) {
  return {
    group_name: 'Marketing',
    category: null,
    title: s(row[0]),
    context: s(row[1]),
    timing: null,
    duration: null,
    steps: s(row[2]),
    stakeholders: s(row[3]),
    reference: s(row[4]),
    pic: s(row[5]),
    next_action: null
  };
}

const SHEETS = [
  { name: '1. Vận hành', map: mapVanHanh, titleCol: 1 },
  { name: '2. Xử lý ticket', map: mapXuLyTicket, titleCol: 1 },
  { name: '3. Marketing Overall', map: mapMarketing, titleCol: 0 }
];

async function runImport(pool, sourcePath) {
  const wb = XLSX.readFile(sourcePath, { cellDates: true });
  let total = 0;
  for (const { name, map, titleCol } of SHEETS) {
    const sheet = wb.Sheets[name];
    if (!sheet) {
      throw new Error(`Sheet "${name}" not found in workbook at ${sourcePath}`);
    }
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, range: 1, defval: null });
    for (const row of rows) {
      if (!isNonEmpty(row[titleCol])) continue; // trailing blank rows at the end of a sheet
      const sop = map(row);
      await pool.query(
        `INSERT INTO sops (group_name, category, title, context, steps, next_action, timing, duration, stakeholders, reference, pic)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [sop.group_name, sop.category, sop.title, sop.context, sop.steps, sop.next_action, sop.timing, sop.duration, sop.stakeholders, sop.reference, sop.pic]
      );
      total++;
    }
  }
  return total;
}

async function main() {
  const sourcePath = process.env.SOPS_EXCEL_SOURCE;
  if (!sourcePath) {
    console.error(
      'SOPS_EXCEL_SOURCE is not set. Add SOPS_EXCEL_SOURCE=<absolute path to "[TTT] Operation.xlsx"> to your .env and retry.'
    );
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const total = await runImport(pool, sourcePath);
    console.log(`Imported ${total} quy trình vào bảng sops.`);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { runImport, mapVanHanh, mapXuLyTicket, mapMarketing };
