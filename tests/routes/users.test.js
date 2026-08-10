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
function asActor(req, name) {
  return req.set('X-Actor-Name', encodeURIComponent(name));
}

test('GET /api/users lists the seeded fixed-list users with their roles', async () => {
  const app = createApp(makeTestPool());
  const res = await request(app).get('/api/users');
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 6);
  const byName = Object.fromEntries(res.body.map((u) => [u.name, u.role]));
  assert.equal(byName['quan.dang1'], 'admin');
  assert.equal(byName['anh.nguyen80'], 'editor');
  assert.equal(byName['toan.han'], 'editor');
});

test('POST /api/users as admin creates a new user', async () => {
  const app = createApp(makeTestPool());
  const res = await asActor(request(app).post('/api/users'), ADMIN).send({ name: 'new.person', role: 'viewer' });
  assert.equal(res.status, 201);
  assert.equal(res.body.name, 'new.person');
  assert.equal(res.body.role, 'viewer');

  const list = await request(app).get('/api/users');
  assert.equal(list.body.length, 7);
});

test('POST /api/users as editor is rejected', async () => {
  const app = createApp(makeTestPool());
  const res = await asActor(request(app).post('/api/users'), EDITOR).send({ name: 'new.person', role: 'viewer' });
  assert.equal(res.status, 403);
});

test('POST /api/users as viewer (or no actor at all) is rejected', async () => {
  const app = createApp(makeTestPool());
  const res = await request(app).post('/api/users').send({ name: 'new.person', role: 'viewer' });
  assert.equal(res.status, 403);
});

test('POST /api/users rejects a duplicate name', async () => {
  const app = createApp(makeTestPool());
  const res = await asActor(request(app).post('/api/users'), ADMIN).send({ name: 'quan.dang1', role: 'viewer' });
  assert.equal(res.status, 409);
});

test('POST /api/users rejects an invalid role', async () => {
  const app = createApp(makeTestPool());
  const res = await asActor(request(app).post('/api/users'), ADMIN).send({ name: 'new.person', role: 'superadmin' });
  assert.equal(res.status, 400);
});

test('POST /api/users rejects a missing name or role', async () => {
  const app = createApp(makeTestPool());
  const res = await asActor(request(app).post('/api/users'), ADMIN).send({ name: 'new.person' });
  assert.equal(res.status, 400);
});

test('PUT /api/users/:id as admin changes a user\'s role', async () => {
  const app = createApp(makeTestPool());
  const list = await request(app).get('/api/users');
  const target = list.body.find((u) => u.name === 'toan.han');

  const res = await asActor(request(app).put(`/api/users/${target.id}`), ADMIN).send({ role: 'admin' });
  assert.equal(res.status, 200);
  assert.equal(res.body.role, 'admin');
});

test('PUT /api/users/:id as editor is rejected', async () => {
  const app = createApp(makeTestPool());
  const list = await request(app).get('/api/users');
  const target = list.body.find((u) => u.name === 'toan.han');

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
