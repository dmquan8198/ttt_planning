const { Router } = require('express');
const { asyncHandler } = require('../lib/asyncHandler');
const { isForeignKeyViolation } = require('../lib/dbErrors');
const { requireRole } = require('../lib/requireRole');
const { normalizeDate } = require('../lib/normalizeDate');
const { SUBTASK_STATUSES } = require('../lib/subtaskStatuses');
const { touchTask } = require('../lib/touchTask');

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
      'SELECT * FROM subtasks WHERE task_id=$1 ORDER BY sort_order, id', [taskId]
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
      // lands at the END of this task's manual order
      const { rows } = await pool.query(
        `INSERT INTO subtasks (task_id, name, status, start_date, due_date, pic, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, COALESCE((SELECT MAX(sort_order) FROM subtasks WHERE task_id=$1), 0) + 1)
         RETURNING *`,
        [taskId, name, status, req.body.start_date || null, req.body.due_date || null, (req.body.pic || '').trim() || null]
      );
      await touchTask(pool, taskId, req.actorName);
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
  // subtasks the target already has, in the source's own manual order),
  // not a replace. One multi-row INSERT so it's atomic — either every
  // subtask copies or none does, no half-cloned state to clean up if
  // something fails mid-way.
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
    const { rows: sourceRows } = await pool.query(
      'SELECT name, status, start_date, due_date, pic FROM subtasks WHERE task_id=$1 ORDER BY sort_order, id',
      [sourceTaskId]
    );
    if (sourceRows.length === 0) {
      return res.status(400).json({ error: 'Nghiệp vụ này chưa có subtask nào để nhân bản' });
    }
    const { rows: maxRows } = await pool.query(
      'SELECT COALESCE(MAX(sort_order), 0)::int AS max_order FROM subtasks WHERE task_id=$1',
      [targetTaskId]
    );
    const base = maxRows[0].max_order;
    const params = [targetTaskId];
    const tuples = sourceRows.map((s, i) => {
      params.push(s.name, s.status, s.start_date, s.due_date, s.pic, base + i + 1);
      const p = params.length - 5; // index of this row's name param
      return `($1, $${p}, $${p + 1}, $${p + 2}, $${p + 3}, $${p + 4}, $${p + 5})`;
    });
    const { rows } = await pool.query(
      `INSERT INTO subtasks (task_id, name, status, start_date, due_date, pic, sort_order)
       VALUES ${tuples.join(', ')} RETURNING *`,
      params
    );
    await touchTask(pool, targetTaskId, req.actorName);
    res.status(201).json(rows.map(normalizeSubtask));
  }));

  // rewrites the manual order of ALL this task's subtasks in one go from
  // the full ordered id list — a partial/stale list (a subtask was added or
  // deleted in another tab since the client last loaded) is rejected rather
  // than guessed at, so a reorder can never silently drop or duplicate a
  // row's position. One UPDATE ... CASE, so it's atomic. Declared before
  // '/:subtaskId' so "order" isn't read as a subtask id.
  router.put('/order', requireRole(pool, 'editor'), asyncHandler(async (req, res) => {
    const taskId = Number(req.params.taskId);
    if (!Number.isInteger(taskId)) {
      return res.status(400).json({ error: 'taskId không hợp lệ' });
    }
    const ids = req.body.ids;
    if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => Number.isInteger(id))) {
      return res.status(400).json({ error: 'ids phải là danh sách id subtask' });
    }
    if (new Set(ids).size !== ids.length) {
      return res.status(400).json({ error: 'ids bị trùng' });
    }
    const { rows: existing } = await pool.query('SELECT id FROM subtasks WHERE task_id=$1', [taskId]);
    const existingIds = new Set(existing.map((r) => r.id));
    if (existingIds.size !== ids.length || !ids.every((id) => existingIds.has(id))) {
      return res.status(400).json({ error: 'Danh sách subtask không khớp với nghiệp vụ này — hãy tải lại rồi thử lại' });
    }
    const params = [taskId];
    const whens = ids.map((id, i) => {
      params.push(id, i + 1);
      return `WHEN $${params.length - 1}::int THEN $${params.length}::int`;
    });
    await pool.query(
      `UPDATE subtasks SET sort_order = CASE id ${whens.join(' ')} END WHERE task_id=$1`,
      params
    );
    const { rows } = await pool.query(
      'SELECT * FROM subtasks WHERE task_id=$1 ORDER BY sort_order, id', [taskId]
    );
    res.json(rows.map(normalizeSubtask));
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
    await touchTask(pool, taskId, req.actorName);
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
    await touchTask(pool, taskId, req.actorName);
    res.status(204).end();
  }));

  return router;
}

module.exports = subtasksRouter;
