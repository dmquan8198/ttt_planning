const { Router } = require('express');
const { asyncHandler } = require('../lib/asyncHandler');

// Not real security — a single shared password gate so the app isn't wide
// open to anyone with the link, and so activity logs can attribute changes
// to a name instead of "someone". Anyone reading the client JS or calling
// the API directly can bypass this; it's an accountability speed bump, not
// an access-control boundary. The role returned here is looked up from the
// users table so the client can show/hide controls, but it is NOT what
// actually enforces permissions — every mutating route re-checks the role
// server-side via requireRole, since a client-reported role can't be trusted.
function authRouter(pool) {
  const router = Router();

  router.post('/login', asyncHandler(async (req, res) => {
    const name = (req.body.name || '').trim();
    const password = req.body.password || '';
    if (!name) {
      return res.status(400).json({ error: 'Tên là bắt buộc' });
    }
    const expected = process.env.APP_PASSWORD || 'tuithantai';
    if (password !== expected) {
      return res.status(401).json({ error: 'Sai password' });
    }
    const { rows } = await pool.query('SELECT role FROM users WHERE name=$1', [name]);
    const role = rows.length > 0 ? rows[0].role : 'viewer';
    res.json({ ok: true, name, role });
  }));

  return router;
}

module.exports = authRouter;
