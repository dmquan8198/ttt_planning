const { Router } = require('express');
const { pickCurrentAndNextSprint } = require('../lib/pickCurrentAndNextSprint');
const { asyncHandler } = require('../lib/asyncHandler');

// pg (and pg-mem) return DATE columns as JS Date objects, but
// pickCurrentAndNextSprint compares plain 'YYYY-MM-DD' strings.
function toISODate(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function sprintsRouter(pool) {
  const router = Router();

  router.get('/', asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      'SELECT id, code, start_date, end_date FROM sprints ORDER BY start_date'
    );
    res.json(rows);
  }));

  router.get('/current-next', asyncHandler(async (req, res) => {
    const { rows: sprints } = await pool.query(
      'SELECT id, code, start_date, end_date FROM sprints ORDER BY start_date'
    );
    const today = req.query.today || new Date().toISOString().slice(0, 10);
    const normalizedSprints = sprints.map((s) => ({
      ...s,
      start_date: toISODate(s.start_date),
      end_date: toISODate(s.end_date)
    }));
    const { current, next } = pickCurrentAndNextSprint(normalizedSprints, today);

    const result = { current: null, next: null };
    for (const [key, sprint] of [['current', current], ['next', next]]) {
      if (!sprint) continue;
      const { rows: tasks } = await pool.query(
        `SELECT id, name, category, platform, status
         FROM tasks WHERE sprint_id = $1 ORDER BY stt`,
        [sprint.id]
      );
      result[key] = { ...sprint, tasks };
    }
    res.json(result);
  }));

  return router;
}

module.exports = sprintsRouter;
