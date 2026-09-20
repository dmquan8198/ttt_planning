const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { newDb } = require('pg-mem');
const fs = require('node:fs');
const path = require('node:path');
const createApp = require('../../src/app');

function makeTestPool() {
  const db = newDb();
  const sql = fs.readFileSync(path.join(__dirname, '..', '..', 'migrations', '001_init.sql'), 'utf8');
  db.public.none(sql);
  const { Pool } = db.adapters.createPg();
  return new Pool();
}

// createApp's second argument replaces the real google-auth-library
// verifier, so these tests never hit Google or need a real signed token —
// they only exercise what routes/auth.js does with an already-verified
// identity.
function fakeVerifier(identity) {
  return async (credential) => {
    if (credential !== 'valid-token') throw new Error('invalid token');
    return identity;
  };
}

test('POST /api/auth/google provisions a brand-new @mservice.com.vn email as viewer', async () => {
  const app = createApp(makeTestPool(), fakeVerifier({ email: 'new.person@mservice.com.vn', name: 'New Person' }));
  const res = await request(app).post('/api/auth/google').send({ credential: 'valid-token' });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true, email: 'new.person@mservice.com.vn', name: 'New Person', role: 'viewer' });
});

test('POST /api/auth/google rejects a brand-new sign-in outside @mservice.com.vn', async () => {
  const app = createApp(makeTestPool(), fakeVerifier({ email: 'new.person@gmail.com', name: 'New Person' }));
  const res = await request(app).post('/api/auth/google').send({ credential: 'valid-token' });
  assert.equal(res.status, 403);

  const listed = await request(app).get('/api/users');
  assert.equal(listed.body.some((u) => u.email === 'new.person@gmail.com'), false); // never provisioned
});

// the domain gate only blocks a NEW sign-in — an email the migration
// already seeded (dmquan8198@gmail.com, admin) keeps working even though
// it isn't @mservice.com.vn, same as the "refreshes name" test above
// already relies on for a non-mservice email.
test('POST /api/auth/google still allows a known non-@mservice.com.vn email to log in', async () => {
  const app = createApp(makeTestPool(), fakeVerifier({ email: 'dmquan8198@gmail.com', name: 'Quan Dang' }));
  const res = await request(app).post('/api/auth/google').send({ credential: 'valid-token' });
  assert.equal(res.status, 200);
  assert.equal(res.body.role, 'admin');
});

test('POST /api/auth/google returns the seeded role for a known email, unchanged', async () => {
  const app = createApp(makeTestPool(), fakeVerifier({ email: 'dmquan8198@gmail.com', name: 'Quan Dang' }));
  const res = await request(app).post('/api/auth/google').send({ credential: 'valid-token' });
  assert.equal(res.status, 200);
  assert.equal(res.body.role, 'admin');
  assert.equal(res.body.email, 'dmquan8198@gmail.com');
});

test('POST /api/auth/google refreshes the display name but never the role, on repeat login', async () => {
  const pool = makeTestPool();
  const app = createApp(pool, fakeVerifier({ email: 'dmquan8198@gmail.com', name: 'Renamed On Google' }));
  const res = await request(app).post('/api/auth/google').send({ credential: 'valid-token' });
  assert.equal(res.status, 200);
  assert.equal(res.body.name, 'Renamed On Google');
  assert.equal(res.body.role, 'admin');

  const { rows } = await pool.query("SELECT role FROM users WHERE email='dmquan8198@gmail.com'");
  assert.equal(rows[0].role, 'admin'); // never downgraded by a login
});

test('POST /api/auth/google rejects an invalid/unverifiable token', async () => {
  const app = createApp(makeTestPool(), fakeVerifier({ email: 'x@gmail.com', name: 'X' }));
  const res = await request(app).post('/api/auth/google').send({ credential: 'not-the-valid-token' });
  assert.equal(res.status, 401);
});

test('POST /api/auth/google rejects a missing credential', async () => {
  const app = createApp(makeTestPool(), fakeVerifier({ email: 'x@gmail.com', name: 'X' }));
  const res = await request(app).post('/api/auth/google').send({});
  assert.equal(res.status, 400);
});
