const { roleAtLeast } = require('./roles');

// looks up the current actor's role from the users table (never trusts a
// client-asserted role) and rejects with 403 if it's below minRole. An
// actor with no matching row (or no name at all) defaults to 'viewer' —
// deny-by-default rather than accidentally granting write access to an
// unrecognized name.
function requireRole(pool, minRole) {
  return async function (req, res, next) {
    try {
      const name = req.actorName;
      let role = 'viewer';
      if (name) {
        const { rows } = await pool.query('SELECT role FROM users WHERE name=$1', [name]);
        if (rows.length > 0) role = rows[0].role;
      }
      req.actorRole = role;
      if (!roleAtLeast(role, minRole)) {
        return res.status(403).json({ error: 'Bạn không có quyền thực hiện hành động này' });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { requireRole };
