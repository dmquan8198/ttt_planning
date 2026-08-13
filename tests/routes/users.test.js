const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const fs = require('node:fs');
const path = require('node:path');
const { newDb } = require('pg-mem');
const createApp = require('../../src/app');

function makeTestPool() {
  const db = newDb();
  const sql = fs.readFileSync(path.join(__dirname, '..', '..', 'migrations', '001_init.sql'), 'utf8');
  db.public.none(sql);
  const { Pool } = db.adapters.createPg();
  return new Pool();
}

const ADMIN = 'quan.dang1';
const EDITOR = 'anh.nguyen80';
// role lookup is by email now (see src/lib/requireRole.js); these match
// migrations/001_init.sql's seed.
const KNOWN_EMAILS = { 'quan.dang1': 'dmquan8198@gmail.com', 'anh.nguyen80': 'anh.nguyen80@gmail.com' };
function asActor(req, name) {
  const email = KNOWN_EMAILS[name] || (name.replace(/\s+/g, '.') + '@example.com');
  return req
    .set('X-Actor-Name', encodeURIComponent(name))
    .set('X-Actor-Email', encodeURIComponent(email));
}

test('GET /api/users lists the seeded fixed-list users with their roles', async () => {
  const app = createApp(makeTestPool());
  const res = await request(app).get('/api/users');
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 6);
  const byEmail = Object.fromEntries(res.body.map((u) => [u.email, u.role]));
  assert.equal(byEmail['dmquan8198@gmail.com'], 'admin');
  assert.equal(byEmail['anh.nguyen80@gmail.com'], 'editor');
  assert.equal(byEmail['toan.han@gmail.com'], 'editor');
});

test('POST /api/users as admin pre-provisions a new email', async () => {
  const app = createApp(makeTestPool());
  const res = await asActor(request(app).post('/api/users'), ADMIN).send({ email: 'new.person@gmail.com', role: 'viewer' });
  assert.equal(res.status, 201);
  assert.equal(res.body.email, 'new.person@gmail.com');
  assert.equal(res.body.role, 'viewer');
  assert.equal(res.body.name, null); // fills in automatically on that email's first real login

  const list = await request(app).get('/api/users');
  assert.equal(list.body.length, 7);
});

test('POST /api/users as editor is rejected', async () => {
  const app = createApp(makeTestPool());
  const res = await asActor(request(app).post('/api/users'), EDITOR).send({ email: 'new.person@gmail.com', role: 'viewer' });
  assert.equal(res.status, 403);
});

test('POST /api/users as viewer (or no actor at all) is rejected', async () => {
  const app = createApp(makeTestPool());
  const res = await request(app).post('/api/users').send({ email: 'new.person@gmail.com', role: 'viewer' });
  assert.equal(res.status, 403);
});

test('POST /api/users rejects a duplicate email', async () => {
  const app = createApp(makeTestPool());
  const res = await asActor(request(app).post('/api/users'), ADMIN).send({ email: 'dmquan8198@gmail.com', role: 'viewer' });
  assert.equal(res.status, 409);
});

test('POST /api/users rejects an invalid role', async () => {
  const app = createApp(makeTestPool());
  const res = await asActor(request(app).post('/api/users'), ADMIN).send({ email: 'new.person@gmail.com', role: 'superadmin' });
  assert.equal(res.status, 400);
});

test('POST /api/users rejects a missing email or role', async () => {
  const app = createApp(makeTestPool());
  const res = await asActor(request(app).post('/api/users'), ADMIN).send({ email: 'new.person@gmail.com' });
  assert.equal(res.status, 400);
});

test('PUT /api/users/:id as admin changes a user\'s role', async () => {
  const app = createApp(makeTestPool());
  const list = await request(app).get('/api/users');
  const target = list.body.find((u) => u.email === 'toan.han@gmail.com');

  const res = await asActor(request(app).put(`/api/users/${target.id}`), ADMIN).send({ role: 'admin' });
  assert.equal(res.status, 200);
  assert.equal(res.body.role, 'admin');
});

test('PUT /api/users/:id as editor is rejected', async () => {
  const app = createApp(makeTestPool());
  const list = await request(app).get('/api/users');
  const target = list.body.find((u) => u.email === 'toan.han@gmail.com');

  const res = await asActor(request(app).put(`/api/users/${target.id}`), EDITOR).send({ role: 'admin' });
  assert.equal(res.status, 403);
});

test('PUT /api/users/:id on a non-existent id returns 404', async () => {
  const app = createApp(makeTestPool());
  const res = await asActor(request(app).put('/api/users/9999'), ADMIN).send({ role: 'admin' });
  assert.equal(res.status, 404);
});

test('PUT /api/users/:id rejects an invalid role', async () => {
  const app = createApp(makeTestPool());
  const list = await request(app).get('/api/users');
  const target = list.body[0];
  const res = await asActor(request(app).put(`/api/users/${target.id}`), ADMIN).send({ role: 'nope' });
  assert.equal(res.status, 400);
});

test('DELETE /api/users/:id as admin removes the user', async () => {
  const app = createApp(makeTestPool());
  const list = await request(app).get('/api/users');
  const target = list.body.find((u) => u.email === 'toan.han@gmail.com');

  const res = await asActor(request(app).delete(`/api/users/${target.id}`), ADMIN);
  assert.equal(res.status, 204);

  const after = await request(app).get('/api/users');
  assert.equal(after.body.length, 5);
  assert.ok(!after.body.some((u) => u.email === 'toan.han@gmail.com'));
});

test('DELETE /api/users/:id as editor is rejected', async () => {
  const app = createApp(makeTestPool());
  const list = await request(app).get('/api/users');
  const target = list.body.find((u) => u.email === 'toan.han@gmail.com');

  const res = await asActor(request(app).delete(`/api/users/${target.id}`), EDITOR);
  assert.equal(res.status, 403);
});

test('DELETE /api/users/:id on a non-existent id returns 404', async () => {
  const app = createApp(makeTestPool());
  const res = await asActor(request(app).delete('/api/users/9999'), ADMIN);
  assert.equal(res.status, 404);
});

test('DELETE /api/users/:id with a non-numeric id returns 400', async () => {
  const app = createApp(makeTestPool());
  const res = await asActor(request(app).delete('/api/users/abc'), ADMIN);
  assert.equal(res.status, 400);
});
