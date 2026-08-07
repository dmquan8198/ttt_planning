const { Router } = require('express');
const { asyncHandler } = require('../lib/asyncHandler');
const { isForeignKeyViolation } = require('../lib/dbErrors');

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

  router.post('/', asyncHandler(async (req, res) => {
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

  return router;
}

module.exports = logsRouter;
