const { Router } = require('express');

// Not real security — a single shared password gate so the app isn't wide
// open to anyone with the link, and so activity logs can attribute changes
// to a name instead of "someone". Anyone reading the client JS or calling
// the API directly can bypass this; it's an accountability speed bump, not
// an access-control boundary.
function authRouter() {
  const router = Router();

  router.post('/login', (req, res) => {
    const name = (req.body.name || '').trim();
    const password = req.body.password || '';
    if (!name) {
      return res.status(400).json({ error: 'Tên là bắt buộc' });
    }
    const expected = process.env.APP_PASSWORD || 'tuithantai';
    if (password !== expected) {
      return res.status(401).json({ error: 'Sai password' });
    }
    res.json({ ok: true, name });
  });

  return router;
}

module.exports = authRouter;
