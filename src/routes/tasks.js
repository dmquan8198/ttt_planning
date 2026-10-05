const { Router } = require('express');
const { STATUS_CODES, STATUS_TIMESTAMP_COLUMN } = require('../lib/statusCodes');
const { normalizeDate } = require('../lib/normalizeDate');
const { asyncHandler } = require('../lib/asyncHandler');
const { isForeignKeyViolation } = require('../lib/dbErrors');
const { buildDateChangeNote } = require('../lib/dateChangeNote');
const { requireRole } = require('../lib/requireRole');
const { touchTask } = require('../lib/touchTask');

function normalizeTaskDates(t) {
  return {
    ...t,
    start_date: normalizeDate(t.start_date),
    due_date: normalizeDate(t.due_date),
    sprint_start: normalizeDate(t.sprint_start),
    sprint_end: normalizeDate(t.sprint_end)
  };
}

// merged into GET /api/tasks as a separate query + JS join (rather than a
// SQL array_agg) to stay portable across the real Postgres driver and the
// pg-mem in-memory double the test suite runs against.
async function loadResourceRolesByTask(pool) {
  const { rows } = await pool.query('SELECT task_id, role FROM task_resource_roles ORDER BY role');
  const map = {};
  rows.forEach((r) => {
    if (!map[r.task_id]) map[r.task_id] = [];
    map[r.task_id].push(r.role);
  });
  return map;
}

// same join-in-JS approach as resource roles above — Danh sách nghiệp vụ's
// expand/collapse-per-row subtask preview and its JSON/Excel export both
// need every task's subtasks without an N+1 request per row.
async function loadSubtasksByTask(pool) {
  const { rows } = await pool.query('SELECT * FROM subtasks ORDER BY task_id, sort_order, id');
  const map = {};
  rows.forEach((r) => {
    if (!map[r.task_id]) map[r.task_id] = [];
    map[r.task_id].push({ ...r, start_date: normalizeDate(r.start_date), due_date: normalizeDate(r.due_date) });
  });
  return map;
}

function cleanRoles(roles) {
  return Array.from(new Set((roles || []).map((r) => String(r).trim()).filter(Boolean)));
}

async function loadRolesForTask(pool, taskId) {
  const { rows } = await pool.query('SELECT role FROM task_resource_roles WHERE task_id=$1', [taskId]);
  return rows.map((r) => r.role);
}

function sameRoleSet(a, b) {
  const x = [...a].sort();
  const y = [...b].sort();
  return x.length === y.length && x.every((r, i) => r === y[i]);
}

async function replaceTaskResourceRoles(pool, taskId, roles) {
  await pool.query('DELETE FROM task_resource_roles WHERE task_id=$1', [taskId]);
  const clean = cleanRoles(roles);
  for (const role of clean) {
    await pool.query('INSERT INTO task_resource_roles (task_id, role) VALUES ($1, $2)', [taskId, role]);
  }
  return clean;
}

// does this full-replace PUT actually change anything a person would call
// "an update to the task"? Every field except stt (manual order) counts —
// the Timeline's drag-to-reorder PUTs every shifted task with only stt
// different, and that must not mark them all as freshly edited. Compared
// loosely (String()) so an id arriving as "2" vs 2 isn't a phantom change.
function taskContentChanged(beforeRow, beforeRoles, b, newRoles) {
  const same = (x, y) => (x == null && y == null) || (x != null && y != null && String(x) === String(y));
  const next = {
    category: b.category, name: b.name, platform: b.platform, status: b.status,
    phase_id: b.phase_id || null, sprint_id: b.sprint_id || null,
    done_analyst: !!b.done_analyst, done_dev: !!b.done_dev, done_uat: !!b.done_uat, done_staging: !!b.done_staging,
    start_date: normalizeDate(b.start_date), due_date: normalizeDate(b.due_date),
    date_overridden: !!b.date_overridden, why: (b.why || '').trim() || null
  };
  const fieldChanged = Object.keys(next).some((k) => {
    const prev = k === 'start_date' || k === 'due_date' ? normalizeDate(beforeRow[k]) : beforeRow[k];
    return !same(prev, next[k]);
  });
  return fieldChanged || !sameRoleSet(beforeRoles, newRoles);
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
    const rolesByTask = await loadResourceRolesByTask(pool);
    const subtasksByTask = await loadSubtasksByTask(pool);
    res.json(rows.map((r) => ({
      ...normalizeTaskDates(r), resource_roles: rolesByTask[r.id] || [], subtasks: subtasksByTask[r.id] || []
    })));
  }));

  // cheap poll target for "someone else just edited a task": only the id/
  // name/editor/time of tasks edited AFTER `since` (not the whole task list
  // with every subtask, which is what GET / costs). `now` is the DATABASE's
  // clock — the client uses it as the next `since` and to offset its own
  // clock, so a client with a skewed clock can neither miss nor invent
  // edits. Without `since` it just returns `now` (used to take a baseline).
  router.get('/recent-edits', asyncHandler(async (req, res) => {
    const { rows: nowRows } = await pool.query('SELECT now() AS now');
    const nowValue = nowRows[0].now;
    const now = nowValue instanceof Date ? nowValue.toISOString() : String(nowValue);
    if (!req.query.since) return res.json({ now, edits: [] });
    const since = new Date(req.query.since);
    if (Number.isNaN(since.getTime())) {
      return res.status(400).json({ error: 'since không hợp lệ' });
    }
    const { rows } = await pool.query(
      'SELECT id, name, last_edited_at, last_edited_by FROM tasks WHERE last_edited_at > $1 ORDER BY last_edited_at',
      [since.toISOString()]
    );
    res.json({ now, edits: rows });
  }));

  router.post('/', requireRole(pool, 'editor'), asyncHandler(async (req, res) => {
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
            done_analyst, done_dev, done_uat, done_staging, start_date, due_date, date_overridden, why,
            last_edited_at, last_edited_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, now(), $16)
         RETURNING *`,
        [
          b.stt || null, b.category, b.name, b.platform, b.phase_id || null, b.sprint_id || null,
          b.status || STATUS_CODES[0], !!b.done_analyst, !!b.done_dev, !!b.done_uat, !!b.done_staging,
          b.start_date, b.due_date, !!b.date_overridden, (b.why || '').trim() || null,
          req.actorName || null
        ]
      );
      // a task created straight into a non-Backlog status counts as having
      // entered it now (same rule as the status-changing PUT).
      const stampCol = STATUS_TIMESTAMP_COLUMN[rows[0].status];
      if (stampCol) {
        const stamped = await pool.query(`UPDATE tasks SET ${stampCol}=now() WHERE id=$1 RETURNING *`, [rows[0].id]);
        rows[0] = stamped.rows[0];
      }
      const resource_roles = await replaceTaskResourceRoles(pool, rows[0].id, b.resource_roles);
      res.status(201).json({ ...normalizeTaskDates(rows[0]), resource_roles });
    } catch (err) {
      if (isForeignKeyViolation(err)) {
        return res.status(400).json({ error: 'phase_id hoặc sprint_id không tồn tại' });
      }
      throw err;
    }
  }));

  router.put('/:id', requireRole(pool, 'editor'), asyncHandler(async (req, res) => {
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
      const { rows: beforeRows } = await pool.query('SELECT * FROM tasks WHERE id=$1', [id]);
      if (beforeRows.length === 0) {
        return res.status(404).json({ error: 'không tìm thấy nghiệp vụ' });
      }
      const before = {
        start_date: normalizeDate(beforeRows[0].start_date),
        due_date: normalizeDate(beforeRows[0].due_date)
      };
      const beforeRoles = await loadRolesForTask(pool, id);
      const contentChanged = taskContentChanged(beforeRows[0], beforeRoles, b, cleanRoles(b.resource_roles));

      // stamp "entered this status at" when the status actually changes
      // (re-entering overwrites with the latest time). The column name
      // comes from a fixed whitelist keyed by the new status — a miss
      // (Backlog, or no change) means no stamp.
      const stampCol = beforeRows[0].status !== b.status ? STATUS_TIMESTAMP_COLUMN[b.status] : null;
      const stampSet = stampCol ? `, ${stampCol}=now()` : '';

      const params = [
        b.category, b.name, b.platform, b.phase_id || null, b.sprint_id || null, b.status,
        !!b.done_analyst, !!b.done_dev, !!b.done_uat, !!b.done_staging,
        b.start_date, b.due_date, !!b.date_overridden, b.stt != null ? b.stt : null,
        (b.why || '').trim() || null, id
      ];
      // only a real content change counts as "edited by <actor>" — a PUT that
      // changes just stt (Timeline reorder) or nothing at all leaves the
      // last-edited stamp alone
      let editedSet = '';
      if (contentChanged) {
        params.push(req.actorName || null);
        editedSet = `, last_edited_at=now(), last_edited_by=$${params.length}`;
      }

      const { rows } = await pool.query(
        `UPDATE tasks SET
           category=$1, name=$2, platform=$3, phase_id=$4, sprint_id=$5, status=$6,
           done_analyst=$7, done_dev=$8, done_uat=$9, done_staging=$10,
           start_date=$11, due_date=$12, date_overridden=$13, stt=$14, why=$15, updated_at=now()${stampSet}${editedSet}
         WHERE id=$16
         RETURNING *`,
        params
      );
      if (rows.length === 0) {
        return res.status(404).json({ error: 'không tìm thấy nghiệp vụ' });
      }
      const after = normalizeTaskDates(rows[0]);

      const dateChangeNote = buildDateChangeNote(before, { start_date: after.start_date, due_date: after.due_date }, req.actorName);
      if (dateChangeNote) {
        await pool.query('INSERT INTO activity_logs (task_id, note) VALUES ($1, $2)', [id, dateChangeNote]);
      }

      // full-replace, same as every other field on this PUT: every caller
      // must pass the task's current resource_roles or they get cleared
      // (see updateTaskDates/updateTaskSprint/buildGroupChangeBody, which
      // all carry it through from the cached task for this reason).
      const resource_roles = await replaceTaskResourceRoles(pool, id, b.resource_roles);

      res.json({ ...after, resource_roles });
    } catch (err) {
      if (isForeignKeyViolation(err)) {
        return res.status(400).json({ error: 'phase_id hoặc sprint_id không tồn tại' });
      }
      throw err;
    }
  }));

  // lightweight, junction-table-only endpoint for the Resource matrix view:
  // ticking a cell there shouldn't have to reconstruct and re-validate the
  // entire task body (name/category/platform/status/dates) like the main
  // PUT requires, and doing so on every tick would risk silently
  // overwriting a field another user just changed with a stale cached copy.
  router.put('/:id/resources', requireRole(pool, 'editor'), asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'id không hợp lệ' });
    }
    const exists = await pool.query('SELECT 1 FROM tasks WHERE id=$1', [id]);
    if (exists.rowCount === 0) {
      return res.status(404).json({ error: 'không tìm thấy nghiệp vụ' });
    }
    const beforeRoles = await loadRolesForTask(pool, id);
    const resource_roles = await replaceTaskResourceRoles(pool, id, req.body.roles);
    if (!sameRoleSet(beforeRoles, resource_roles)) await touchTask(pool, id, req.actorName);
    res.json({ id, resource_roles });
  }));

  router.delete('/:id', requireRole(pool, 'admin'), asyncHandler(async (req, res) => {
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
