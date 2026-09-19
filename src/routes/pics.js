const { Router } = require('express');
const { asyncHandler } = require('../lib/asyncHandler');
const { isUniqueViolation } = require('../lib/dbErrors');
const { requireRole } = require('../lib/requireRole');

// PIC (người phụ trách) list for subtasks — same shape/rules as
// resourceRoles.js's team list: a real lookup table the user manages
// themselves, with subtask_count computed via a LEFT JOIN + GROUP BY
// (rather than a correlated subquery — pg-mem, the test double, can't
// resolve the outer alias inside that shape) so a delete can block on it.
function picsRouter(pool) {
  const router = Router();

  router.get('/', asyncHandler(async (req, res) => {
    const { rows } = await pool.query(`
      SELECT p.id, p.name, p.created_at, COUNT(s.id)::int AS subtask_count
      FROM pics p
      LEFT JOIN subtasks s ON s.pic = p.name
      GROUP BY p.id, p.name, p.created_at
      ORDER BY p.id
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
        'INSERT INTO pics (name) VALUES ($1) RETURNING id, name, created_at',
        [name]
      );
      res.status(201).json({ ...rows[0], subtask_count: 0 });
    } catch (err) {
      if (isUniqueViolation(err)) {
        return res.status(409).json({ error: 'PIC này đã có trong danh sách' });
      }
      throw err;
    }
  }));

  // renames a PIC everywhere it's assigned. Same non-collision reasoning
  // as PUT /api/resource-roles/:id: the UPDATE on pics.name right above
  // would already have 409'd on a name that's already a PIC, and a name
  // that was never a PIC can't already be sitting in subtasks.pic.
  router.put('/:id', requireRole(pool, 'editor'), asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'id không hợp lệ' });
    }
    const name = (req.body.name || '').trim();
    if (!name) {
      return res.status(400).json({ error: 'name không được để trống' });
    }
    const { rows: existingRows } = await pool.query('SELECT name FROM pics WHERE id=$1', [id]);
    if (existingRows.length === 0) {
      return res.status(404).json({ error: 'không tìm thấy PIC' });
    }
    const oldName = existingRows[0].name;

    let updated;
    try {
      const { rows } = await pool.query(
        'UPDATE pics SET name=$1 WHERE id=$2 RETURNING id, name, created_at',
        [name, id]
      );
      updated = rows[0];
    } catch (err) {
      if (isUniqueViolation(err)) {
        return res.status(409).json({ error: 'PIC này đã có trong danh sách' });
      }
      throw err;
    }

    if (oldName !== name) {
      await pool.query('UPDATE subtasks SET pic=$1 WHERE pic=$2', [name, oldName]);
    }

    const { rows: countRows } = await pool.query(
      'SELECT count(*)::int AS subtask_count FROM subtasks WHERE pic=$1', [name]
    );
    res.json({ ...updated, subtask_count: countRows[0].subtask_count });
  }));

  // deleting a PIC still assigned to subtasks would silently strip it off
  // every one of them — block instead and tell the caller to unassign
  // first, same "explain, don't silently destroy" stance as
  // DELETE /api/resource-roles/:id.
  router.delete('/:id', requireRole(pool, 'admin'), asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'id không hợp lệ' });
    }
    const { rows: existingRows } = await pool.query('SELECT name FROM pics WHERE id=$1', [id]);
    if (existingRows.length === 0) {
      return res.status(404).json({ error: 'không tìm thấy PIC' });
    }
    const { rows: countRows } = await pool.query(
      'SELECT count(*)::int AS subtask_count FROM subtasks WHERE pic=$1', [existingRows[0].name]
    );
    if (countRows[0].subtask_count > 0) {
      return res.status(409).json({
        error: 'Còn ' + countRows[0].subtask_count + ' subtask đang gắn PIC này — gỡ hết trước khi xóa.'
      });
    }
    await pool.query('DELETE FROM pics WHERE id=$1', [id]);
    res.status(204).end();
  }));

  return router;
}

module.exports = picsRouter;
