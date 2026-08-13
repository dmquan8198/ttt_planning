const { Router } = require('express');
const { asyncHandler } = require('../lib/asyncHandler');
const { isForeignKeyViolation } = require('../lib/dbErrors');
const { requireRole } = require('../lib/requireRole');
const { isDateChangeNote } = require('../lib/dateChangeNote');

function logsRouter(pool) {
  const router = Router({ mergeParams: true });

  router.get('/', asyncHandler(async (req, res) => {
    const taskId = Number(req.params.taskId);
    if (!Number.isInteger(taskId)) {
      return res.status(400).json({ error: 'taskId không hợp lệ' });
    }
    const { rows } = await pool.query(
      'SELECT id, note, created_at FROM activity_logs WHERE task_id=$1 ORDER BY created_at DESC',
      [taskId]
    );
    res.json(rows);
  }));

  router.post('/', requireRole(pool, 'editor'), asyncHandler(async (req, res) => {
    const taskId = Number(req.params.taskId);
    if (!Number.isInteger(taskId)) {
      return res.status(400).json({ error: 'taskId không hợp lệ' });
    }
    const note = (req.body.note || '').trim();
    if (!note) {
      return res.status(400).json({ error: 'note không được để trống' });
    }
    const finalNote = req.actorName ? `${note} — ${req.actorName}` : note;
    try {
      const { rows } = await pool.query(
        'INSERT INTO activity_logs (task_id, note) VALUES ($1, $2) RETURNING id, note, created_at',
        [taskId, finalNote]
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      if (isForeignKeyViolation(err)) {
        return res.status(400).json({ error: 'taskId không tồn tại' });
      }
      throw err;
    }
  }));

  // editing is limited to manually-typed notes — a date-change note is an
  // auto-generated audit record of what actually happened (see
  // dateChangeNote.js / tasks.js's PUT handler) and stays immutable here.
  router.put('/:logId', requireRole(pool, 'editor'), asyncHandler(async (req, res) => {
    const taskId = Number(req.params.taskId);
    const logId = Number(req.params.logId);
    if (!Number.isInteger(taskId) || !Number.isInteger(logId)) {
      return res.status(400).json({ error: 'taskId hoặc logId không hợp lệ' });
    }
    const note = (req.body.note || '').trim();
    if (!note) {
      return res.status(400).json({ error: 'note không được để trống' });
    }
    const { rows: existing } = await pool.query(
      'SELECT note FROM activity_logs WHERE id=$1 AND task_id=$2',
      [logId, taskId]
    );
    if (existing.length === 0) {
      return res.status(404).json({ error: 'không tìm thấy log' });
    }
    if (isDateChangeNote(existing[0].note)) {
      return res.status(400).json({ error: 'Không thể sửa log tự động ghi nhận thay đổi ngày' });
    }
    const finalNote = req.actorName ? `${note} — ${req.actorName}` : note;
    const { rows } = await pool.query(
      'UPDATE activity_logs SET note=$1 WHERE id=$2 RETURNING id, note, created_at',
      [finalNote, logId]
    );
    res.json(rows[0]);
  }));

  return router;
}

module.exports = logsRouter;
