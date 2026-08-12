const { roleAtLeast } = require('./roles');

// looks up the current actor's role from the users table (never trusts a
// client-asserted role) and rejects with 403 if it's below minRole. Looked
// up by email (the identity Google verified at login), not by the
// free-text display name used for log attribution — an actor with no
// matching row (or no email at all) defaults to 'viewer' — deny-by-default
// rather than accidentally granting write access to an unrecognized email.
function requireRole(pool, minRole) {
  return async function (req, res, next) {
    try {
      const email = req.actorEmail;
      let role = 'viewer';
      if (email) {
        const { rows } = await pool.query('SELECT role FROM users WHERE email=$1', [email]);
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
