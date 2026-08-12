const { OAuth2Client } = require('google-auth-library');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// verifies the ID token's signature/audience/expiry against Google's own
// public keys (network call to fetch/cache them) — never trust a client-
// decoded JWT payload directly, since that skips signature verification
// entirely and lets anyone forge an identity.
async function verifyGoogleToken(idToken) {
  const ticket = await client.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_CLIENT_ID
  });
  const payload = ticket.getPayload();
  if (!payload || !payload.email || !payload.email_verified) {
    throw new Error('Google token missing a verified email');
  }
  return { email: payload.email, name: payload.name || payload.email };
}

module.exports = { verifyGoogleToken };
