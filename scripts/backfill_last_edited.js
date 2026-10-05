// One-time backfill for tasks.last_edited_at / last_edited_by (see
// migrations/001_init.sql). Those columns only start filling in as people
// edit AFTER the feature shipped, so every older task showed "—" in
// Danh sách nghiệp vụ's "Sửa lần cuối" column. This estimates a value for
// each such task from the history that already exists:
//
//   time = the latest of: tasks.updated_at (last time anyone saved it),
//          the newest subtasks.updated_at under it, its newest activity log.
//   by   = the actor named in the newest activity log (date-change notes carry
//          "(Tên)", manual notes a "— Tên" suffix), but ONLY when that log was
//          written within 30s of `time` — i.e. in the same save. Otherwise the
//          name genuinely isn't known and stays empty rather than guessed.
//
// Estimates, not truth: tasks.updated_at also moves on a Timeline
// drag-reorder, so a task that was only shifted by someone else's drag can
// show that time. Only rows whose last_edited_at IS NULL are touched, so a
// real stamp is never overwritten and the script is safe to re-run.
//
//   node scripts/backfill_last_edited.js --dry    # show what it would write
//   node scripts/backfill_last_edited.js          # write it
require('dotenv').config();
const { Pool } = require('pg');

const SAME_SAVE_MS = 30 * 1000;

// mirrors parseActorFromNote in public/app.js
function actorFromNote(note) {
  const dateChange = note.match(/^(?:Dịch ngày|Đổi ngày)\s*\(([^)]+)\):/);
  if (dateChange) return dateChange[1];
  const suffix = note.match(/—\s*([^—]+)$/);
  return suffix ? suffix[1].trim() : null;
}

async function main() {
  const dry = process.argv.includes('--dry');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  try {
    const { rows: tasks } = await pool.query('SELECT id, updated_at FROM tasks WHERE last_edited_at IS NULL');
    const { rows: subs } = await pool.query('SELECT task_id, max(updated_at) AS at FROM subtasks GROUP BY task_id');
    const { rows: logs } = await pool.query('SELECT task_id, note, created_at FROM activity_logs ORDER BY created_at DESC, id DESC');

    const subAt = new Map(subs.map((s) => [s.task_id, s.at]));
    const newestLog = new Map(); // first seen per task = newest, since ordered DESC
    logs.forEach((l) => { if (!newestLog.has(l.task_id)) newestLog.set(l.task_id, l); });

    const ids = [], ats = [], bys = [];
    let named = 0;
    tasks.forEach((t) => {
      const log = newestLog.get(t.id);
      const candidates = [t.updated_at, subAt.get(t.id), log && log.created_at].filter(Boolean).map((d) => new Date(d));
      if (candidates.length === 0) return;
      const at = new Date(Math.max(...candidates.map((d) => d.getTime())));
      let by = null;
      if (log && Math.abs(new Date(log.created_at).getTime() - at.getTime()) <= SAME_SAVE_MS) {
        by = actorFromNote(log.note);
      }
      if (by) named += 1;
      ids.push(t.id); ats.push(at.toISOString()); bys.push(by);
    });

    console.log(`${tasks.length} tasks without a stamp -> ${ids.length} to fill (${named} with a known editor, ${ids.length - named} time-only)`);
    if (ids.length) {
      const sorted = ats.slice().sort();
      console.log(`estimated times range ${sorted[0]} .. ${sorted[sorted.length - 1]}`);
    }
    if (dry) { console.log('--dry: nothing written'); return; }
    if (!ids.length) return;

    const res = await pool.query(
      `UPDATE tasks t SET last_edited_at = v.at, last_edited_by = v.by
       FROM (SELECT unnest($1::int[]) AS id, unnest($2::timestamptz[]) AS at, unnest($3::text[]) AS by) v
       WHERE t.id = v.id AND t.last_edited_at IS NULL`,
      [ids, ats, bys]
    );
    console.log(`updated ${res.rowCount} tasks`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
