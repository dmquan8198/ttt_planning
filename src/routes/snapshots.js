const { Router } = require('express');
const { asyncHandler } = require('../lib/asyncHandler');
const { normalizeDate } = require('../lib/normalizeDate');
const { getTodayVN } = require('../lib/today');
const { buildSnapshot } = require('../lib/buildSnapshot');

async function loadSnapshotInputs(pool) {
  const { rows: sprintsRaw } = await pool.query('SELECT id, code, start_date, end_date FROM sprints ORDER BY start_date');
  const sprints = sprintsRaw.map((s) => ({
    ...s, start_date: normalizeDate(s.start_date), end_date: normalizeDate(s.end_date)
  }));
  const { rows: tasks } = await pool.query('SELECT id, category, status, sprint_id FROM tasks');
  return { tasks, sprints };
}

// real pg returns NUMERIC columns as strings (to avoid float precision
// loss) while pg-mem (tests) returns a plain number — coerce so the API's
// JSON shape is the same regardless of which one is behind the pool.
function normalizeSnapshotRow(row) {
  return { ...row, snapshot_date: normalizeDate(row.snapshot_date), completion_rate: Number(row.completion_rate) };
}

function snapshotsRouter(pool) {
  const router = Router();

  // machine-to-machine only (a nightly GitHub Actions cron — see
  // .github/workflows/nightly-snapshot.yml — since this app's Render free
  // plan sleeps when idle and can't run an in-process scheduler
  // reliably). No Google-signed-in actor is involved, so auth is a shared
  // secret rather than requireRole. Deny-by-default if the server itself
  // has no secret configured, rather than accepting an unauthenticated
  // request just because nobody set one up yet.
  router.post('/run', asyncHandler(async (req, res) => {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
      return res.status(500).json({ error: 'CRON_SECRET chưa được cấu hình trên server' });
    }
    if (req.headers['x-cron-secret'] !== secret) {
      return res.status(401).json({ error: 'Không có quyền' });
    }

    const { tasks, sprints } = await loadSnapshotInputs(pool);
    const snapshotDate = getTodayVN();
    const s = buildSnapshot(tasks, sprints, snapshotDate);

    const { rows } = await pool.query(
      `INSERT INTO daily_snapshots (snapshot_date, total_tasks, completed_tasks, completion_rate, by_status, by_category, sprint_now, sprint_next)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (snapshot_date) DO UPDATE SET
         total_tasks=EXCLUDED.total_tasks, completed_tasks=EXCLUDED.completed_tasks,
         completion_rate=EXCLUDED.completion_rate, by_status=EXCLUDED.by_status,
         by_category=EXCLUDED.by_category, sprint_now=EXCLUDED.sprint_now, sprint_next=EXCLUDED.sprint_next
       RETURNING *`,
      [
        snapshotDate, s.total_tasks, s.completed_tasks, s.completion_rate,
        JSON.stringify(s.by_status), JSON.stringify(s.by_category),
        s.sprint_now ? JSON.stringify(s.sprint_now) : null,
        s.sprint_next ? JSON.stringify(s.sprint_next) : null
      ]
    );
    res.status(201).json(normalizeSnapshotRow(rows[0]));
  }));

  // read-only aggregate data, same "any signed-in viewer can see it" level
  // as sprints/phases — nothing here is more sensitive than what's already
  // visible elsewhere in the app.
  router.get('/', asyncHandler(async (req, res) => {
    const { rows } = await pool.query('SELECT * FROM daily_snapshots ORDER BY snapshot_date ASC');
    res.json(rows.map(normalizeSnapshotRow));
  }));

  return router;
}

module.exports = snapshotsRouter;
