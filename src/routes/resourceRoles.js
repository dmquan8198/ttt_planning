const { Router } = require('express');
const { asyncHandler } = require('../lib/asyncHandler');
const { isUniqueViolation } = require('../lib/dbErrors');
const { requireRole } = require('../lib/requireRole');

function resourceRolesRouter(pool) {
  const router = Router();

  // LEFT JOIN + GROUP BY rather than a correlated subquery in the SELECT
  // list — pg-mem (the in-memory double the test suite runs against) can't
  // resolve the outer alias inside that shape, while this plain join works
  // on both it and real Postgres.
  router.get('/', asyncHandler(async (req, res) => {
    const { rows } = await pool.query(`
      SELECT r.id, r.name, r.created_at, COUNT(t.task_id)::int AS task_count
      FROM resource_roles r
      LEFT JOIN task_resource_roles t ON t.role = r.name
      GROUP BY r.id, r.name, r.created_at
      ORDER BY r.id
    `);
    res.json(rows);
  }));

  router.post('/', requireRole(pool, 'editor'), asyncHandler(async (req, res) => {
    const name = (req.body.name || '').trim();
    if (!name) {
      return res.status(400).json({ error: 'name không được để trống' });
    }
    try {
      const { rows } = await pool.query(
        'INSERT INTO resource_roles (name) VALUES ($1) RETURNING id, name, created_at',
        [name]
      );
      res.status(201).json({ ...rows[0], task_count: 0 });
    } catch (err) {
      if (isUniqueViolation(err)) {
        return res.status(409).json({ error: 'Team này đã có trong danh sách' });
      }
      throw err;
    }
  }));

  // renames a team everywhere it's used. The plain UPDATE below can never
  // hit the (task_id, role) primary key on a collision, because the new
  // name is guaranteed not to already be assigned to any task: the UPDATE
  // on resource_roles.name (right above it) would already have failed with
  // a 409 unique-violation if that name existed as a team, and a name that
  // was never a team can't already be sitting in task_resource_roles.
  router.put('/:id', requireRole(pool, 'editor'), asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'id không hợp lệ' });
    }
    const name = (req.body.name || '').trim();
    if (!name) {
      return res.status(400).json({ error: 'name không được để trống' });
    }
    const { rows: existingRows } = await pool.query('SELECT name FROM resource_roles WHERE id=$1', [id]);
    if (existingRows.length === 0) {
      return res.status(404).json({ error: 'không tìm thấy team' });
    }
    const oldName = existingRows[0].name;

    let updated;
    try {
      const { rows } = await pool.query(
        'UPDATE resource_roles SET name=$1 WHERE id=$2 RETURNING id, name, created_at',
        [name, id]
      );
      updated = rows[0];
    } catch (err) {
      if (isUniqueViolation(err)) {
        return res.status(409).json({ error: 'Team này đã có trong danh sách' });
      }
      throw err;
    }

    if (oldName !== name) {
      await pool.query('UPDATE task_resource_roles SET role=$1 WHERE role=$2', [name, oldName]);
    }

    const { rows: countRows } = await pool.query(
      'SELECT count(*)::int AS task_count FROM task_resource_roles WHERE role=$1', [name]
    );
    res.json({ ...updated, task_count: countRows[0].task_count });
  }));

  // deleting a team in active use would silently strip it off every task
  // that has it — block instead and tell the caller to unassign first,
  // same "explain, don't silently destroy" stance as everywhere else
  // destructive actions happen in this app.
  router.delete('/:id', requireRole(pool, 'admin'), asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'id không hợp lệ' });
    }
    const { rows: existingRows } = await pool.query('SELECT name FROM resource_roles WHERE id=$1', [id]);
    if (existingRows.length === 0) {
      return res.status(404).json({ error: 'không tìm thấy team' });
    }
    const { rows: countRows } = await pool.query(
      'SELECT count(*)::int AS task_count FROM task_resource_roles WHERE role=$1', [existingRows[0].name]
    );
    if (countRows[0].task_count > 0) {
      return res.status(409).json({
        error: 'Còn ' + countRows[0].task_count + ' task đang gắn team này — gỡ hết trước khi xóa.'
      });
    }
    await pool.query('DELETE FROM resource_roles WHERE id=$1', [id]);
    res.status(204).end();
  }));

  return router;
}

module.exports = resourceRolesRouter;
