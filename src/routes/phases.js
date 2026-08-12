const { Router } = require('express');
const { computePhaseRollup } = require('../lib/phaseRollup');
const { asyncHandler } = require('../lib/asyncHandler');
const { normalizeDate } = require('../lib/normalizeDate');
const { getTodayVN } = require('../lib/today');
const { requireRole } = require('../lib/requireRole');

function phasesRouter(pool) {
  const router = Router();

  router.get('/', asyncHandler(async (req, res) => {
    const { rows: phasesRaw } = await pool.query(
      'SELECT id, code, name, target_date, updated_at FROM phases ORDER BY target_date'
    );
    const phases = phasesRaw.map((p) => ({ ...p, target_date: normalizeDate(p.target_date) }));
    const { rows: tasks } = await pool.query(
      'SELECT phase_id, status FROM tasks'
    );
    const today = getTodayVN();

    const result = phases.map((phase) => {
      const phaseTasks = tasks.filter((t) => t.phase_id === phase.id);
      return computePhaseRollup(phase, phaseTasks, today);
    });

    res.json(result);
  }));

  // admin-only, so phase go-live dates stay a deliberate, tracked change
  // rather than something any editor can slide around. updated_at is the
  // caller's last-seen value (from GET /api/phases) — if someone else
  // already changed the date since then, the WHERE clause matches zero
  // rows and we return 409 instead of silently clobbering their edit.
  // Relies on the phases.updated_at column being TIMESTAMPTZ(3) (see
  // migrations/001_init.sql) so the value round-trips through the client
  // (JS Date → JSON, millisecond precision) without ever losing precision
  // the plain equality check below would notice.
  router.put('/:id', requireRole(pool, 'admin'), asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'id không hợp lệ' });
    }
    const { target_date, updated_at } = req.body;
    if (!target_date || !updated_at) {
      return res.status(400).json({ error: 'target_date và updated_at là bắt buộc' });
    }

    const { rows } = await pool.query(
      `UPDATE phases SET target_date=$1, updated_at=now()
       WHERE id=$2 AND updated_at=$3
       RETURNING id, code, name, target_date, updated_at`,
      [target_date, id, updated_at]
    );
    if (rows.length === 0) {
      const { rows: exists } = await pool.query('SELECT id FROM phases WHERE id=$1', [id]);
      if (exists.length === 0) {
        return res.status(404).json({ error: 'không tìm thấy phase' });
      }
      return res.status(409).json({ error: 'Phase này vừa được người khác cập nhật. Vui lòng tải lại trang rồi sửa lại.' });
    }
    res.json({ ...rows[0], target_date: normalizeDate(rows[0].target_date) });
  }));

  return router;
}

module.exports = phasesRouter;
