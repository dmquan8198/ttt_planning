const { Router } = require('express');
const { asyncHandler } = require('../lib/asyncHandler');
const { isForeignKeyViolation } = require('../lib/dbErrors');
const { requireRole } = require('../lib/requireRole');
const { normalizeDate } = require('../lib/normalizeDate');
const { SUBTASK_STATUSES } = require('../lib/subtaskStatuses');

function normalizeSubtask(s) {
  return { ...s, start_date: normalizeDate(s.start_date), due_date: normalizeDate(s.due_date) };
}

// mounted at /api/tasks/:taskId/subtasks (mergeParams so req.params.taskId
// is visible here) — a task's checklist of smaller, independently
// trackable units of work. Deletion is editor-level, not admin-level like
// deleting the parent task itself: a subtask is a much lower-stakes record.
function subtasksRouter(pool) {
  const router = Router({ mergeParams: true });

  router.get('/', asyncHandler(async (req, res) => {
    const taskId = Number(req.params.taskId);
    if (!Number.isInteger(taskId)) {
      return res.status(400).json({ error: 'taskId không hợp lệ' });
    }
    const { rows } = await pool.query(
      'SELECT * FROM subtasks WHERE task_id=$1 ORDER BY id', [taskId]
    );
    res.json(rows.map(normalizeSubtask));
  }));

  router.post('/', requireRole(pool, 'editor'), asyncHandler(async (req, res) => {
    const taskId = Number(req.params.taskId);
    if (!Number.isInteger(taskId)) {
      return res.status(400).json({ error: 'taskId không hợp lệ' });
    }
    const name = (req.body.name || '').trim();
    if (!name) {
      return res.status(400).json({ error: 'name không được để trống' });
    }
    const status = req.body.status || SUBTASK_STATUSES[0];
    if (!SUBTASK_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'status không hợp lệ' });
    }
    try {
      const { rows } = await pool.query(
        `INSERT INTO subtasks (task_id, name, status, start_date, due_date, pic)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [taskId, name, status, req.body.start_date || null, req.body.due_date || null, (req.body.pic || '').trim() || null]
      );
      res.status(201).json(normalizeSubtask(rows[0]));
    } catch (err) {
      if (isForeignKeyViolation(err)) {
        return res.status(400).json({ error: 'taskId không tồn tại' });
      }
      throw err;
    }
  }));

  // copies every subtask of THIS task (the :taskId in the URL) onto
  // another, already-existing task — additive (appended after whatever
  // subtasks the target already has), not a replace. One INSERT...SELECT
  // so it's atomic — either every subtask copies or none does, no
  // half-cloned state to clean up if something fails mid-way.
  router.post('/clone', requireRole(pool, 'editor'), asyncHandler(async (req, res) => {
    const sourceTaskId = Number(req.params.taskId);
    const targetTaskId = Number(req.body.target_task_id);
    if (!Number.isInteger(sourceTaskId) || !Number.isInteger(targetTaskId)) {
      return res.status(400).json({ error: 'taskId không hợp lệ' });
    }
    if (sourceTaskId === targetTaskId) {
      return res.status(400).json({ error: 'Nghiệp vụ đích phải khác nghiệp vụ hiện tại' });
    }
    const { rows: targetRows } = await pool.query('SELECT id FROM tasks WHERE id=$1', [targetTaskId]);
    if (targetRows.length === 0) {
      return res.status(400).json({ error: 'Nghiệp vụ đích không tồn tại' });
    }
    const { rows } = await pool.query(
      `INSERT INTO subtasks (task_id, name, status, start_date, due_date, pic)
       SELECT $1::integer, name, status, start_date, due_date, pic FROM subtasks WHERE task_id=$2 ORDER BY id
       RETURNING *`,
      [targetTaskId, sourceTaskId]
    );
    if (rows.length === 0) {
      return res.status(400).json({ error: 'Nghiệp vụ này chưa có subtask nào để nhân bản' });
    }
    res.status(201).json(rows.map(normalizeSubtask));
  }));

  // partial update — only the fields actually present in the body get
  // touched (checked via hasOwnProperty, not just truthiness, so
  // "explicitly clear this date" and "didn't send this field" are
  // distinguishable). Matches how the drawer autosaves one subtask field
  // at a time, same "sửa xong rời khỏi cell là lưu" pattern as elsewhere.
  router.put('/:subtaskId', requireRole(pool, 'editor'), asyncHandler(async (req, res) => {
    const taskId = Number(req.params.taskId);
    const subtaskId = Number(req.params.subtaskId);
    if (!Number.isInteger(taskId) || !Number.isInteger(subtaskId)) {
      return res.status(400).json({ error: 'taskId hoặc subtaskId không hợp lệ' });
    }

    const has = (key) => Object.prototype.hasOwnProperty.call(req.body, key);
    const sets = [];
    const values = [];
    let paramIdx = 1;

    if (has('name')) {
      const name = (req.body.name || '').trim();
      if (!name) {
        return res.status(400).json({ error: 'name không được để trống' });
      }
      sets.push(`name=$${paramIdx++}`); values.push(name);
    }
    if (has('status')) {
      if (!SUBTASK_STATUSES.includes(req.body.status)) {
        return res.status(400).json({ error: 'status không hợp lệ' });
      }
      sets.push(`status=$${paramIdx++}`); values.push(req.body.status);
    }
    if (has('start_date')) { sets.push(`start_date=$${paramIdx++}`); values.push(req.body.start_date || null); }
    if (has('due_date')) { sets.push(`due_date=$${paramIdx++}`); values.push(req.body.due_date || null); }
    if (has('pic')) { sets.push(`pic=$${paramIdx++}`); values.push((req.body.pic || '').trim() || null); }

    if (sets.length === 0) {
      return res.status(400).json({ error: 'Không có trường nào để cập nhật' });
    }
    sets.push('updated_at=now()');

    values.push(subtaskId, taskId);
    const { rows } = await pool.query(
      `UPDATE subtasks SET ${sets.join(', ')} WHERE id=$${paramIdx++} AND task_id=$${paramIdx++} RETURNING *`,
      values
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'không tìm thấy subtask' });
    }
    res.json(normalizeSubtask(rows[0]));
  }));

  router.delete('/:subtaskId', requireRole(pool, 'editor'), asyncHandler(async (req, res) => {
    const taskId = Number(req.params.taskId);
    const subtaskId = Number(req.params.subtaskId);
    if (!Number.isInteger(taskId) || !Number.isInteger(subtaskId)) {
      return res.status(400).json({ error: 'taskId hoặc subtaskId không hợp lệ' });
    }
    const { rowCount } = await pool.query(
      'DELETE FROM subtasks WHERE id=$1 AND task_id=$2', [subtaskId, taskId]
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: 'không tìm thấy subtask' });
    }
    res.status(204).end();
  }));

  return router;
}

module.exports = subtasksRouter;
