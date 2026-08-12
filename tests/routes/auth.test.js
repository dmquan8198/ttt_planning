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

test('POST /api/auth/google provisions a brand-new email as viewer', async () => {
  const app = createApp(makeTestPool(), fakeVerifier({ email: 'new.person@gmail.com', name: 'New Person' }));
  const res = await request(app).post('/api/auth/google').send({ credential: 'valid-token' });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true, email: 'new.person@gmail.com', name: 'New Person', role: 'viewer' });
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
