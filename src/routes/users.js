const { Router } = require('express');
const { asyncHandler } = require('../lib/asyncHandler');
const { isUniqueViolation } = require('../lib/dbErrors');
const { requireRole } = require('../lib/requireRole');
const { ROLES } = require('../lib/roles');

function usersRouter(pool) {
  const router = Router();

  router.get('/', asyncHandler(async (req, res) => {
    const { rows } = await pool.query('SELECT id, name, role, created_at FROM users ORDER BY name');
    res.json(rows);
  }));

  router.post('/', requireRole(pool, 'admin'), asyncHandler(async (req, res) => {
    const name = (req.body.name || '').trim();
    const role = req.body.role;
    if (!name || !role) {
      return res.status(400).json({ error: 'name và role là bắt buộc' });
    }
    if (!ROLES.includes(role)) {
      return res.status(400).json({ error: 'role không hợp lệ' });
    }
    try {
      const { rows } = await pool.query(
        'INSERT INTO users (name, role) VALUES ($1,$2) RETURNING id, name, role, created_at',
        [name, role]
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      if (isUniqueViolation(err)) {
        return res.status(409).json({ error: 'Tên này đã có trong danh sách' });
      }
      throw err;
    }
  }));

  router.put('/:id', requireRole(pool, 'admin'), asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'id không hợp lệ' });
    }
    const role = req.body.role;
    if (!ROLES.includes(role)) {
      return res.status(400).json({ error: 'role không hợp lệ' });
    }
    const { rows } = await pool.query(
      'UPDATE users SET role=$1 WHERE id=$2 RETURNING id, name, role, created_at',
      [role, id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'không tìm thấy user' });
    }
    res.json(rows[0]);
  }));

  return router;
}

module.exports = usersRouter;
