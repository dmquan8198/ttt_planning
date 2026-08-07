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

test('POST /api/login accepts the correct password and returns the name', async () => {
  const app = createApp(makeTestPool());
  const res = await request(app).post('/api/login').send({ name: 'Quân', password: 'tuithantai' });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true, name: 'Quân' });
});

test('POST /api/login rejects a wrong password', async () => {
  const app = createApp(makeTestPool());
  const res = await request(app).post('/api/login').send({ name: 'Quân', password: 'wrong' });
  assert.equal(res.status, 401);
});

test('POST /api/login rejects a missing name', async () => {
  const app = createApp(makeTestPool());
  const res = await request(app).post('/api/login').send({ password: 'tuithantai' });
  assert.equal(res.status, 400);
});

test('POST /api/login honors APP_PASSWORD when set', async () => {
  const original = process.env.APP_PASSWORD;
  process.env.APP_PASSWORD = 'customPass';
  try {
    const app = createApp(makeTestPool());
    const wrong = await request(app).post('/api/login').send({ name: 'Quân', password: 'tuithantai' });
    assert.equal(wrong.status, 401);
    const right = await request(app).post('/api/login').send({ name: 'Quân', password: 'customPass' });
    assert.equal(right.status, 200);
  } finally {
    process.env.APP_PASSWORD = original;
  }
});
