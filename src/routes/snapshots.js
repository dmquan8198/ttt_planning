const { Router } = require('express');
const { asyncHandler } = require('../lib/asyncHandler');
const { normalizeDate } = require('../lib/normalizeDate');
const { getTodayVN } = require('../lib/today');
const { computeSnapshotData } = require('../lib/computeSnapshotData');
const { requireRole } = require('../lib/requireRole');

async function loadPhasesAndTasks(pool) {
  const { rows: phasesRaw } = await pool.query(
    'SELECT id, code, name, target_date FROM phases ORDER BY target_date'
  );
  const phases = phasesRaw.map((p) => ({ ...p, target_date: normalizeDate(p.target_date) }));
  const { rows: tasksRaw } = await pool.query(
    'SELECT phase_id, status, due_date FROM tasks'
  );
  const tasks = tasksRaw.map((t) => ({ ...t, due_date: normalizeDate(t.due_date) }));
  return { phases, tasks };
}

function snapshotsRouter(pool) {
  const router = Router();

  // current live numbers, computed with the exact same fixed thresholds a
  // saved snapshot used — lets the frontend show a "so với hôm nay" delta
  // without persisting anything just from viewing the comparison.
  router.get('/current', asyncHandler(async (req, res) => {
    const { phases, tasks } = await loadPhasesAndTasks(pool);
    const today = getTodayVN();
    res.json({ snapshot_date: today, data: computeSnapshotData(phases, tasks, today) });
  }));

  router.get('/', asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      'SELECT id, snapshot_date, data, actor_name, created_at FROM snapshots ORDER BY snapshot_date DESC, id DESC'
    );
    res.json(rows.map((r) => ({ ...r, snapshot_date: normalizeDate(r.snapshot_date) })));
  }));

  router.post('/', requireRole(pool, 'editor'), asyncHandler(async (req, res) => {
    const { phases, tasks } = await loadPhasesAndTasks(pool);
    const today = getTodayVN();
    const data = computeSnapshotData(phases, tasks, today);

    const { rows } = await pool.query(
      'INSERT INTO snapshots (snapshot_date, data, actor_name) VALUES ($1, $2, $3) RETURNING id, snapshot_date, data, actor_name, created_at',
      [today, JSON.stringify(data), req.actorName || null]
    );
    res.status(201).json({ ...rows[0], snapshot_date: normalizeDate(rows[0].snapshot_date) });
  }));

  router.delete('/:id', requireRole(pool, 'admin'), asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'id không hợp lệ' });
    }
    const { rowCount } = await pool.query('DELETE FROM snapshots WHERE id=$1', [id]);
    if (rowCount === 0) {
      return res.status(404).json({ error: 'không tìm thấy snapshot' });
    }
    res.status(204).end();
  }));

  return router;
}

module.exports = snapshotsRouter;
