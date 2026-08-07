const { Router } = require('express');
const { STATUS_CODES } = require('../lib/statusCodes');
const { normalizeDate } = require('../lib/normalizeDate');
const { asyncHandler } = require('../lib/asyncHandler');
const { isForeignKeyViolation } = require('../lib/dbErrors');
const { buildDateChangeNote } = require('../lib/dateChangeNote');

function normalizeTaskDates(t) {
  return {
    ...t,
    start_date: normalizeDate(t.start_date),
    due_date: normalizeDate(t.due_date),
    sprint_start: normalizeDate(t.sprint_start),
    sprint_end: normalizeDate(t.sprint_end)
  };
}

function tasksRouter(pool) {
  const router = Router();

  router.get('/', asyncHandler(async (req, res) => {
    const { rows } = await pool.query(`
      SELECT t.*, p.code AS phase_code, s.code AS sprint_code,
             s.start_date AS sprint_start, s.end_date AS sprint_end
      FROM tasks t
      LEFT JOIN phases p ON p.id = t.phase_id
      LEFT JOIN sprints s ON s.id = t.sprint_id
      ORDER BY t.stt NULLS LAST, t.id
    `);
    res.json(rows.map(normalizeTaskDates));
  }));

  router.post('/', asyncHandler(async (req, res) => {
    const b = req.body;
    if (!b.name || !b.category || !b.platform || !b.start_date || !b.due_date) {
      return res.status(400).json({ error: 'name, category, platform, start_date, due_date là bắt buộc' });
    }
    if (b.status && !STATUS_CODES.includes(b.status)) {
      return res.status(400).json({ error: 'status không hợp lệ' });
    }
    try {
      const { rows } = await pool.query(
        `INSERT INTO tasks
           (stt, category, name, platform, phase_id, sprint_id, status,
            done_analyst, done_dev, done_uat, done_staging, start_date, due_date, date_overridden)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         RETURNING *`,
        [
          b.stt || null, b.category, b.name, b.platform, b.phase_id || null, b.sprint_id || null,
          b.status || STATUS_CODES[0], !!b.done_analyst, !!b.done_dev, !!b.done_uat, !!b.done_staging,
          b.start_date, b.due_date, !!b.date_overridden
        ]
      );
      res.status(201).json(normalizeTaskDates(rows[0]));
    } catch (err) {
      if (isForeignKeyViolation(err)) {
        return res.status(400).json({ error: 'phase_id hoặc sprint_id không tồn tại' });
      }
      throw err;
    }
  }));

  router.put('/:id', asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'id không hợp lệ' });
    }
    const b = req.body;
    if (!b.name || !b.category || !b.platform || !b.status || !b.start_date || !b.due_date) {
      return res.status(400).json({ error: 'name, category, platform, status, start_date, due_date là bắt buộc' });
    }
    if (!STATUS_CODES.includes(b.status)) {
      return res.status(400).json({ error: 'status không hợp lệ' });
    }
    try {
      // captured before the UPDATE so the date-change log below can diff
      // against what the row actually had, regardless of which caller (the
      // edit drawer or a Timeline drag/resize) triggered this PUT.
      const { rows: beforeRows } = await pool.query(
        'SELECT start_date, due_date FROM tasks WHERE id=$1', [id]
      );
      if (beforeRows.length === 0) {
        return res.status(404).json({ error: 'không tìm thấy nghiệp vụ' });
      }
      const before = {
        start_date: normalizeDate(beforeRows[0].start_date),
        due_date: normalizeDate(beforeRows[0].due_date)
      };

      const { rows } = await pool.query(
        `UPDATE tasks SET
           category=$1, name=$2, platform=$3, phase_id=$4, sprint_id=$5, status=$6,
           done_analyst=$7, done_dev=$8, done_uat=$9, done_staging=$10,
           start_date=$11, due_date=$12, date_overridden=$13, updated_at=now()
         WHERE id=$14
         RETURNING *`,
        [
          b.category, b.name, b.platform, b.phase_id || null, b.sprint_id || null, b.status,
          !!b.done_analyst, !!b.done_dev, !!b.done_uat, !!b.done_staging,
          b.start_date, b.due_date, !!b.date_overridden, id
        ]
      );
      if (rows.length === 0) {
        return res.status(404).json({ error: 'không tìm thấy nghiệp vụ' });
      }
      const after = normalizeTaskDates(rows[0]);

      const dateChangeNote = buildDateChangeNote(before, { start_date: after.start_date, due_date: after.due_date });
      if (dateChangeNote) {
        await pool.query('INSERT INTO activity_logs (task_id, note) VALUES ($1, $2)', [id, dateChangeNote]);
      }

      res.json(after);
    } catch (err) {
      if (isForeignKeyViolation(err)) {
        return res.status(400).json({ error: 'phase_id hoặc sprint_id không tồn tại' });
      }
      throw err;
    }
  }));

  router.delete('/:id', asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'id không hợp lệ' });
    }
    const { rowCount } = await pool.query('DELETE FROM tasks WHERE id=$1', [id]);
    if (rowCount === 0) {
      return res.status(404).json({ error: 'không tìm thấy nghiệp vụ' });
    }
    res.status(204).end();
  }));

  return router;
}

module.exports = tasksRouter;
