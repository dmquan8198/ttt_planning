const { Router } = require('express');
const { asyncHandler } = require('../lib/asyncHandler');

// Google sign-in is the login gate (proves the caller controls a real
// Google account with a verified email) — but like the shared-password
// scheme it replaced, it's not a full session system: every request after
// login just carries the verified email back in a header (see
// src/app.js's X-Actor-Email decode) with nothing cryptographically tying
// later requests to this login. Same accountability-speed-bump tradeoff as
// before, now gated by "owns this Google account" instead of "knows the
// shared password".
//
// verifyGoogleToken is injected (defaults to the real google-auth-library
// wrapper) so tests can substitute a fake verifier without hitting Google
// or needing a real signed token.
function authRouter(pool, verifyGoogleToken) {
  const router = Router();

  router.post('/auth/google', asyncHandler(async (req, res) => {
    const credential = req.body.credential;
    if (!credential) {
      return res.status(400).json({ error: 'credential là bắt buộc' });
    }

    let identity;
    try {
      identity = await verifyGoogleToken(credential);
    } catch (err) {
      return res.status(401).json({ error: 'Xác thực Google thất bại' });
    }

    // new email -> auto-provisioned as viewer (deny-by-default for anyone
    // an admin hasn't already recognized); existing email -> role
    // untouched, only the display name refreshes to whatever Google has
    // for them now.
    const { rows } = await pool.query(
      `INSERT INTO users (email, name, role) VALUES ($1, $2, 'viewer')
       ON CONFLICT (email) DO UPDATE SET name=EXCLUDED.name
       RETURNING email, name, role`,
      [identity.email, identity.name]
    );
    res.json({ ok: true, email: rows[0].email, name: rows[0].name, role: rows[0].role });
  }));

  return router;
}

module.exports = authRouter;
