// One-time importer: reads the legacy "TTT New Planning" Excel workbook and
// loads its "Nghiệp vụ" sheet into the phases / sprints / tasks / activity_logs
// tables. Safe to re-run (all upserts are ON CONFLICT ... DO UPDATE for
// phases/sprints; tasks/activity_logs are plain inserts, so re-running will
// duplicate task/log rows — this is meant to be run once against a fresh DB).
require('dotenv').config();
const path = require('path');
const XLSX = require('xlsx');
const { Pool } = require('pg');
const { parseSprintCell } = require('../src/lib/parseSprintCell');
const { mapExcelStatus } = require('../src/lib/statusCodes');

const SHEET_NAME = 'Nghiệp vụ';
const HEADER_RANGE = 7; // 0-indexed row of the header (1-indexed row 8 is first data row)

// Static phase lookup table, keyed by the short code found at the start of the
// Phase column's free-text cell (e.g. "P1: Lived 10/08" -> code "P1").
const PHASES = [
  { code: 'P1', name: 'Lived', target_date: '2026-08-10' },
  { code: 'P2', name: 'Rollout', target_date: '2026-09-01' },
  { code: 'P3', name: 'Convert', target_date: '2026-11-01' },
  { code: 'P4', name: 'Booming', target_date: '2027-01-01' }
];

// 0-indexed column positions for XLSX.utils.sheet_to_json(sheet, { header: 1, range: HEADER_RANGE }).
const COL = {
  STT: 0,
  CATEGORY: 1,
  NAME: 2,
  PLATFORM: 3,
  PHASE: 4,
  SPRINT: 5,
  STATUS: 6,
  DONE_ANALYST: 7,
  DONE_DEV: 8,
  DONE_UAT: 9,
  DONE_STAGING: 10,
  NOTE_1: 11,
  NOTE_2: 12
};

// The two free-text "Note" columns don't carry per-row dates in the sheet;
// their column header names the single date that applies to every note in
// that column (spot-check note taken on that day), per the task's known mapping.
const NOTE_COLUMNS = [
  { index: COL.NOTE_1, createdAt: '2026-08-03' },
  { index: COL.NOTE_2, createdAt: '2026-07-06' }
];

// Mirrors the raw Excel status strings that src/lib/statusCodes.js's
// EXCEL_STATUS_MAP recognizes. mapExcelStatus() itself is the source of truth
// for the actual mapping (imported above, not reimplemented here) — this list
// exists only so the importer can tell "legitimately mapped to backlog" apart
// from "fell back to backlog because the raw string was unrecognized" for the
// observability warnings below. Keep in sync with statusCodes.js if it changes.
const KNOWN_EXCEL_STATUS_RAW = new Set([
  '0. backlog',
  '1. Ready for Dev',
  '2. inTest',
  '3. Ready for Staging',
  '4. Done'
]);

function isNonEmpty(v) {
  return v !== undefined && v !== null && String(v).trim() !== '';
}

async function upsertPhases(pool) {
  const idByCode = {};
  for (const p of PHASES) {
    const { rows } = await pool.query(
      `INSERT INTO phases (code, name, target_date)
       VALUES ($1, $2, $3)
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, target_date = EXCLUDED.target_date
       RETURNING id, code`,
      [p.code, p.name, p.target_date]
    );
    idByCode[rows[0].code] = rows[0].id;
  }
  return idByCode;
}

function collectSprintCodes(rows) {
  const byCode = new Map();
  for (const row of rows) {
    if (!isNonEmpty(row[COL.NAME])) continue;
    const raw = row[COL.SPRINT];
    if (!isNonEmpty(raw)) continue;
    const parsed = parseSprintCell(raw);
    if (parsed && !parsed.legacy && parsed.code && !byCode.has(parsed.code)) {
      byCode.set(parsed.code, { start: parsed.start, end: parsed.end });
    }
  }
  return byCode;
}

async function upsertSprints(pool, sprintsByCode) {
  const idByCode = {};
  for (const [code, { start, end }] of sprintsByCode) {
    const { rows } = await pool.query(
      `INSERT INTO sprints (code, start_date, end_date)
       VALUES ($1, $2, $3)
       ON CONFLICT (code) DO UPDATE SET start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date
       RETURNING id, code`,
      [code, start, end]
    );
    idByCode[rows[0].code] = rows[0].id;
  }
  return idByCode;
}

function resolvePhaseId(rawPhase, phaseIdByCode, warnings, rowLabel) {
  if (!isNonEmpty(rawPhase)) return null;
  const m = String(rawPhase).match(/^(P\d+)/);
  const code = m ? m[1] : null;
  if (code && phaseIdByCode[code] !== undefined) {
    return phaseIdByCode[code];
  }
  warnings.push(`Row ${rowLabel}: unrecognized phase "${rawPhase}", no phase assigned`);
  return null;
}

function resolveSprintAndDates(rawSprint, sprintIdByCode, warnings, rowLabel) {
  const result = { sprintId: null, startDate: null, dueDate: null, dateOverridden: false };
  if (!isNonEmpty(rawSprint)) return result;

  const parsed = parseSprintCell(rawSprint);
  if (parsed === null) {
    warnings.push(`Row ${rowLabel}: unrecognized sprint cell "${rawSprint}", no sprint assigned`);
    return result;
  }
  if (parsed.legacy) {
    // Legacy Date-object cells carry no sprint code — treat as a manual override.
    result.startDate = parsed.start;
    result.dueDate = parsed.end;
    result.dateOverridden = true;
    return result;
  }
  result.sprintId = sprintIdByCode[parsed.code] || null;
  return result;
}

function resolveStatus(rawStatus, warnings, rowLabel) {
  const status = mapExcelStatus(rawStatus);
  if (isNonEmpty(rawStatus) && !KNOWN_EXCEL_STATUS_RAW.has(rawStatus)) {
    warnings.push(`Row ${rowLabel}: unrecognized status "${rawStatus}", defaulted to backlog`);
  }
  return status;
}

async function insertTasksAndLogs(pool, rows, phaseIdByCode, sprintIdByCode, warnings) {
  let taskCount = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const name = row[COL.NAME];
    if (!isNonEmpty(name)) continue;

    const sttRaw = row[COL.STT];
    const stt = isNonEmpty(sttRaw) && Number.isFinite(Number(sttRaw)) ? Number(sttRaw) : null;
    const rowLabel = stt !== null ? stt : `index ${i}`;

    const category = row[COL.CATEGORY];
    const platform = row[COL.PLATFORM];

    const phaseId = resolvePhaseId(row[COL.PHASE], phaseIdByCode, warnings, rowLabel);
    const { sprintId, startDate, dueDate, dateOverridden } = resolveSprintAndDates(
      row[COL.SPRINT], sprintIdByCode, warnings, rowLabel
    );
    const status = resolveStatus(row[COL.STATUS], warnings, rowLabel);

    const { rows: inserted } = await pool.query(
      `INSERT INTO tasks
         (stt, category, name, platform, phase_id, sprint_id, status,
          done_analyst, done_dev, done_uat, done_staging, start_date, due_date, date_overridden)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING id`,
      [
        stt, category, String(name).trim(), platform, phaseId, sprintId, status,
        !!row[COL.DONE_ANALYST], !!row[COL.DONE_DEV], !!row[COL.DONE_UAT], !!row[COL.DONE_STAGING],
        startDate, dueDate, dateOverridden
      ]
    );
    const taskId = inserted[0].id;
    taskCount++;

    for (const { index, createdAt } of NOTE_COLUMNS) {
      const rawNote = row[index];
      if (!isNonEmpty(rawNote)) continue;
      await pool.query(
        `INSERT INTO activity_logs (task_id, note, created_at) VALUES ($1, $2, $3)`,
        [taskId, String(rawNote).trim(), createdAt]
      );
    }
  }
  return taskCount;
}

async function runImport(pool, sourcePath) {
  const warnings = [];
  const wb = XLSX.readFile(sourcePath, { cellDates: true });
  const sheet = wb.Sheets[SHEET_NAME];
  if (!sheet) {
    throw new Error(`Sheet "${SHEET_NAME}" not found in workbook at ${sourcePath}`);
  }
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, range: HEADER_RANGE });

  const phaseIdByCode = await upsertPhases(pool);
  const sprintsByCode = collectSprintCodes(rows);
  const sprintIdByCode = await upsertSprints(pool, sprintsByCode);
  const taskCount = await insertTasksAndLogs(pool, rows, phaseIdByCode, sprintIdByCode, warnings);

  return {
    taskCount,
    sprintCount: sprintsByCode.size,
    phaseCount: PHASES.length,
    warnings
  };
}

async function main() {
  const sourcePath = process.env.EXCEL_SOURCE;
  if (!sourcePath) {
    console.error(
      'EXCEL_SOURCE is not set. Add EXCEL_SOURCE=<absolute path to the "[TTT New] Planning.xlsx" file> to your .env and retry.'
    );
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const { taskCount, sprintCount, phaseCount, warnings } = await runImport(pool, sourcePath);
    console.log(`Imported ${taskCount} nghiệp vụ, ${sprintCount} sprint(s), ${phaseCount} phase(s).`);
    if (warnings.length > 0) {
      console.warn(`\n${warnings.length} data-quality warning(s):`);
      for (const w of warnings) console.warn(`  - ${w}`);
    }
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

module.exports = { runImport, PHASES, COL, NOTE_COLUMNS };
