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
const VIEWER_NAME = 'no.such.actor'; // not seeded — defaults to viewer
const KNOWN_EMAILS = { 'quan.dang1': 'dmquan8198@gmail.com', 'anh.nguyen80': 'anh.nguyen80@gmail.com' };

function asActor(req, name) {
  const email = KNOWN_EMAILS[name] || (name.replace(/\s+/g, '.') + '@example.com');
  return req
    .set('X-Actor-Name', encodeURIComponent(name))
    .set('X-Actor-Email', encodeURIComponent(email));
}

const SAMPLE = {
  group_name: 'Vận hành',
  category: 'Contract',
  title: 'Trình ký hợp đồng',
  context: 'Bối cảnh ký hợp đồng hàng quý',
  steps: 'Bước 1: soạn thảo\nBước 2: trình ký',
  next_action: 'Đề xuất tự động hoá bước nhắc ký',
  timing: 'Hàng quý',
  duration: 'Khoảng 5-7 ngày làm việc',
  stakeholders: 'Legal, BU Ops',
  reference: 'Link mail mẫu',
  pic: 'anh.nguyen80'
};

test('GET /api/sops starts empty and is open to anyone (no auth headers)', async () => {
  const app = createApp(makeTestPool());
  const res = await request(app).get('/api/sops');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, []);
});

test('POST /api/sops as editor creates a row; viewer is rejected', async () => {
  const pool = makeTestPool();
  const app = createApp(pool);

  const asViewer = await asActor(request(app).post('/api/sops'), VIEWER_NAME).send(SAMPLE);
  assert.equal(asViewer.status, 403);

  const asEditor = await asActor(request(app).post('/api/sops'), EDITOR).send(SAMPLE);
  assert.equal(asEditor.status, 201);
  assert.equal(asEditor.body.title, SAMPLE.title);
  assert.equal(asEditor.body.group_name, SAMPLE.group_name);
  assert.equal(asEditor.body.steps, SAMPLE.steps);
  assert.equal(asEditor.body.duration, SAMPLE.duration);

  const listed = await request(app).get('/api/sops');
  assert.equal(listed.body.length, 1);
});

test('POST /api/sops rejects missing group_name or title', async () => {
  const pool = makeTestPool();
  const app = createApp(pool);

  const noGroup = await asActor(request(app).post('/api/sops'), EDITOR).send({ ...SAMPLE, group_name: '  ' });
  assert.equal(noGroup.status, 400);

  const noTitle = await asActor(request(app).post('/api/sops'), EDITOR).send({ ...SAMPLE, title: '' });
  assert.equal(noTitle.status, 400);
});

test('PUT /api/sops/:id full-replaces a row; viewer is rejected; missing id is 404', async () => {
  const pool = makeTestPool();
  const app = createApp(pool);
  const created = await asActor(request(app).post('/api/sops'), EDITOR).send(SAMPLE);
  const id = created.body.id;

  const asViewer = await asActor(request(app).put(`/api/sops/${id}`), VIEWER_NAME).send(SAMPLE);
  assert.equal(asViewer.status, 403);

  const updated = { ...SAMPLE, title: 'Trình ký hợp đồng (updated)', pic: 'quan.dang1', reference: '' };
  const res = await asActor(request(app).put(`/api/sops/${id}`), EDITOR).send(updated);
  assert.equal(res.status, 200);
  assert.equal(res.body.title, updated.title);
  assert.equal(res.body.pic, 'quan.dang1');
  assert.equal(res.body.reference, null);

  const missing = await asActor(request(app).put('/api/sops/9999'), EDITOR).send(SAMPLE);
  assert.equal(missing.status, 404);
});

test('PUT /api/sops/:id rejects an invalid id and missing required fields', async () => {
  const pool = makeTestPool();
  const app = createApp(pool);
  const created = await asActor(request(app).post('/api/sops'), EDITOR).send(SAMPLE);
  const id = created.body.id;

  const badId = await asActor(request(app).put('/api/sops/not-a-number'), EDITOR).send(SAMPLE);
  assert.equal(badId.status, 400);

  const badBody = await asActor(request(app).put(`/api/sops/${id}`), EDITOR).send({ ...SAMPLE, title: '' });
  assert.equal(badBody.status, 400);
});

test('DELETE /api/sops/:id succeeds for editor (not admin-only); viewer is rejected; missing id is 404', async () => {
  const pool = makeTestPool();
  const app = createApp(pool);
  const created = await asActor(request(app).post('/api/sops'), EDITOR).send(SAMPLE);
  const id = created.body.id;

  const asViewer = await asActor(request(app).delete(`/api/sops/${id}`), VIEWER_NAME);
  assert.equal(asViewer.status, 403);

  const asEditor = await asActor(request(app).delete(`/api/sops/${id}`), EDITOR);
  assert.equal(asEditor.status, 204);

  const listed = await request(app).get('/api/sops');
  assert.equal(listed.body.length, 0);

  const missing = await asActor(request(app).delete(`/api/sops/${id}`), EDITOR);
  assert.equal(missing.status, 404);
});
