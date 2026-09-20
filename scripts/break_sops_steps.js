// One-time data-cleanup: the real Excel "Action"/"Hướng xử lý" text mostly
// already writes its steps out as "B1. ...", "B2. ..." (sometimes "B3:"
// with a colon) — this script detects that existing convention (or, failing
// that, a top-level "1. "/"2. " numbering, or "- " bullets as a last
// resort) and rewrites the sops.steps column into the app's canonical
// "Bước 1: ...\nBước 2: ..." format, so the drawer's step-list editor shows
// each one as its own row instead of the whole column as a single "Bước 1"
// blob. Best-effort: a row with none of these markers is left as one step
// — there's no reliable way to guess boundaries in plain prose.
require('dotenv').config();
const { Pool } = require('pg');

function splitOnMarker(text, markerRe) {
  const lines = text.split('\n');
  const chunks = [];
  let current = [];
  for (const line of lines) {
    if (markerRe.test(line)) {
      if (current.length) chunks.push(current.join('\n').trim());
      current = [line.replace(markerRe, '')];
    } else {
      current.push(line);
    }
  }
  if (current.length) chunks.push(current.join('\n').trim());
  return chunks.filter((c) => c.length > 0);
}

function autoBreakSteps(text) {
  if (!text || !text.trim()) return [];
  const bParts = splitOnMarker(text, /^B\s*\d+\s*[.:]\s*/);
  if (bParts.length > 1) return bParts;
  const numParts = splitOnMarker(text, /^\d+\.\s+/);
  if (numParts.length > 1) return numParts;
  const dashParts = splitOnMarker(text, /^-\s+/);
  if (dashParts.length > 1) return dashParts;
  return [text.trim()];
}

// must match sopsStepsListToText in public/app.js exactly, so the drawer's
// sopsStepsTextToList parses this back into the same step rows.
function toCanonicalStepsText(list) {
  const nonEmpty = list.map((s) => s.trim()).filter(Boolean);
  return nonEmpty.map((s, i) => `Bước ${i + 1}: ${s}`).join('\n');
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  try {
    const { rows } = await pool.query('SELECT id, title, steps FROM sops ORDER BY id');
    let changed = 0;
    for (const row of rows) {
      if (!row.steps) continue;
      const list = autoBreakSteps(row.steps);
      const newText = toCanonicalStepsText(list);
      if (newText === row.steps) continue;
      changed++;
      console.log(`--- #${row.id} ${row.title} (${list.length} bước) ---`);
      if (dryRun) {
        console.log(newText.length > 400 ? newText.slice(0, 400) + '...' : newText);
      } else {
        await pool.query('UPDATE sops SET steps=$1, updated_at=now() WHERE id=$2', [newText, row.id]);
      }
    }
    console.log(`${dryRun ? '[DRY RUN] ' : ''}Updated ${changed}/${rows.length} rows.`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
