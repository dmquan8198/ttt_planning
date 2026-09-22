const crypto = require('crypto');

// constant-time string compare via fixed-length hashes — avoids both a
// short-circuit length leak and the need to pad unequal-length buffers
// before handing them to crypto.timingSafeEqual.
function safeEqual(a, b) {
  const hashA = crypto.createHash('sha256').update(a).digest();
  const hashB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

// gates every request behind one shared username/password when
// BASIC_AUTH_USER/BASIC_AUTH_PASS are set. Exists because requireRole.js
// trusts a client-supplied X-Actor-Email header with no per-request Google
// verification — a fine tradeoff on a trusted LAN, but once this app is
// reachable from the open internet (e.g. a Tailscale Funnel URL) that
// header can be forged by anyone with the link. This is the gate that
// stops them before any route runs. A no-op (both env vars unset) leaves
// local/LAN-only usage exactly as before.
function basicAuth(req, res, next) {
  const user = process.env.BASIC_AUTH_USER;
  const pass = process.env.BASIC_AUTH_PASS;
  if (!user || !pass) return next();

  const header = req.headers.authorization || '';
  const [scheme, encoded] = header.split(' ');
  if (scheme === 'Basic' && encoded) {
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    const sep = decoded.indexOf(':');
    const gotUser = sep === -1 ? decoded : decoded.slice(0, sep);
    const gotPass = sep === -1 ? '' : decoded.slice(sep + 1);
    if (safeEqual(gotUser, user) && safeEqual(gotPass, pass)) {
      return next();
    }
  }

  res.set('WWW-Authenticate', 'Basic realm="Tui Than Tai", charset="UTF-8"');
  res.status(401).send('Authentication required');
}

module.exports = { basicAuth };
