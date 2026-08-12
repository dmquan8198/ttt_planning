const { Router } = require('express');
const { asyncHandler } = require('../lib/asyncHandler');
const { isUniqueViolation } = require('../lib/dbErrors');
const { requireRole } = require('../lib/requireRole');
const { ROLES } = require('../lib/roles');

function usersRouter(pool) {
  const router = Router();

  router.get('/', asyncHandler(async (req, res) => {
    const { rows } = await pool.query('SELECT id, email, name, role, created_at FROM users ORDER BY email');
    res.json(rows);
  }));

  // pre-provisions someone by email before they've ever logged in, so an
  // admin can hand out editor/admin up front instead of everyone landing
  // as viewer on first Google sign-in — name is optional and fills in
  // automatically (via routes/auth.js's ON CONFLICT ... DO UPDATE) the
  // first time that email actually signs in.
  router.post('/', requireRole(pool, 'admin'), asyncHandler(async (req, res) => {
    const email = (req.body.email || '').trim();
    const name = (req.body.name || '').trim() || null;
    const role = req.body.role;
    if (!email || !role) {
      return res.status(400).json({ error: 'email và role là bắt buộc' });
    }
    if (!ROLES.includes(role)) {
      return res.status(400).json({ error: 'role không hợp lệ' });
    }
    try {
      const { rows } = await pool.query(
        'INSERT INTO users (email, name, role) VALUES ($1,$2,$3) RETURNING id, email, name, role, created_at',
        [email, name, role]
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      if (isUniqueViolation(err)) {
        return res.status(409).json({ error: 'Email này đã có trong danh sách' });
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
      'UPDATE users SET role=$1 WHERE id=$2 RETURNING id, email, name, role, created_at',
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
