// One-time data fix: in the source Excel's "2. Xử lý ticket" sheet, 4 rows
// (all Category=Túi+) have "Hướng xử lý hiện tại" and "Propose hướng
// enhance/Next Action" swapped — the cell that reads like actual B1/B2...
// handling steps sits under "Next Action" while "Hướng xử lý hiện tại"
// just holds frequency info ("Tần suất không cố định..."). Swaps steps<->
// next_action back for exactly these 4 rows, then re-applies the same
// step-marker auto-break used in break_sops_steps.js to the (now correct)
// steps text, since the content moving into steps was never step-split.
require('dotenv').config();
const { Pool } = require('pg');

const TITLES = [
  'Xử lý giao dịch pending mua Túi+',
  'Chi bù xu hàng loạt cho user trong trường hợp xảy ra issue về xu',
  'Xử lý các case liên quan đến quyền lợi rút tiền miễn phí của Túi theo luồng Napas',
  'Hoàn tiền cho user thuộc Merchant/Blacklist Riskhub mua Túi+'
];

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
function toCanonicalStepsText(list) {
  const nonEmpty = list.map((s) => s.trim()).filter(Boolean);
  return nonEmpty.map((s, i) => `Bước ${i + 1}: ${s}`).join('\n');
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  try {
    for (const title of TITLES) {
      const { rows } = await pool.query('SELECT id, steps, next_action FROM sops WHERE title=$1', [title]);
      if (rows.length === 0) {
        console.warn(`Not found: ${title}`);
        continue;
      }
      const row = rows[0];
      const newSteps = toCanonicalStepsText(autoBreakSteps(row.next_action || ''));
      const newNextAction = row.steps;
      await pool.query('UPDATE sops SET steps=$1, next_action=$2, updated_at=now() WHERE id=$3', [
        newSteps, newNextAction, row.id
      ]);
      console.log(`#${row.id} ${title} — swapped (${autoBreakSteps(row.next_action || '').length} bước)`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
