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

async function seedPhaseAndTask(pool) {
  await pool.query("INSERT INTO phases (code, name, target_date) VALUES ('P1', 'Lived', '2026-09-01')");
  const { rows: [phase] } = await pool.query("SELECT id FROM phases WHERE code='P1'");
  await pool.query(
    `INSERT INTO tasks (category, name, platform, phase_id, status, start_date, due_date)
     VALUES ('Product Foundation', 'Task A', 'Web', $1, '4.done', '2026-07-01', '2026-07-05')`,
    [phase.id]
  );
  // a not-done task too, so prompt-building tests can see it show up in
  // the "chưa xong" list (the done one above deliberately doesn't).
  await pool.query(
    `INSERT INTO tasks (category, name, platform, phase_id, status, start_date, due_date)
     VALUES ('Product Foundation', 'Task B', 'Web', $1, '0.backlog', '2026-07-01', '2026-09-05')`,
    [phase.id]
  );
  return phase;
}

const ADMIN = 'quan.dang1';
const ADMIN_EMAIL = 'dmquan8198@gmail.com';
function asAdmin(req) {
  return req
    .set('X-Actor-Name', encodeURIComponent(ADMIN))
    .set('X-Actor-Email', encodeURIComponent(ADMIN_EMAIL));
}

test('POST /api/ai-assessments/generate calls the injected LLM fn and does not persist', async () => {
  const pool = makeTestPool();
  await seedPhaseAndTask(pool);
  let receivedPrompt = null;
  const fakeGenerate = async (prompt) => {
    receivedPrompt = prompt;
    return '## Tổng quan\nDự án ổn.';
  };
  const app = createApp(pool, undefined, fakeGenerate);

  const res = await request(app).post('/api/ai-assessments/generate').send({});
  assert.equal(res.status, 200);
  assert.equal(res.body.content, '## Tổng quan\nDự án ổn.');
  assert.ok(receivedPrompt.includes('P1'));
  assert.ok(receivedPrompt.includes('Task B'));

  const list = await request(app).get('/api/ai-assessments');
  assert.equal(list.body.length, 0); // generate must not write a row
});

test('POST /api/ai-assessments/generate surfaces an LLM error as 502', async () => {
  const pool = makeTestPool();
  await seedPhaseAndTask(pool);
  const failingGenerate = async () => { throw new Error('Chưa cấu hình GEMINI_API_KEY trên server.'); };
  const app = createApp(pool, undefined, failingGenerate);

  const res = await request(app).post('/api/ai-assessments/generate').send({});
  assert.equal(res.status, 502);
  assert.equal(res.body.error, 'Chưa cấu hình GEMINI_API_KEY trên server.');
});

test('POST /api/ai-assessments persists a given assessment and attributes the actor', async () => {
  const pool = makeTestPool();
  const app = createApp(pool, undefined, async () => 'unused');

  const created = await asAdmin(request(app).post('/api/ai-assessments'))
    .send({ content: '## Tổng quan\nDự án ổn.' });
  assert.equal(created.status, 201);
  assert.equal(created.body.actor_name, ADMIN);
  assert.equal(created.body.content, '## Tổng quan\nDự án ổn.');

  const list = await request(app).get('/api/ai-assessments');
  assert.equal(list.body.length, 1);
  assert.equal(list.body[0].id, created.body.id);
});

test('POST /api/ai-assessments rejects an empty content', async () => {
  const pool = makeTestPool();
  const app = createApp(pool, undefined, async () => 'unused');
  const res = await asAdmin(request(app).post('/api/ai-assessments')).send({ content: '   ' });
  assert.equal(res.status, 400);
});

test('POST /api/ai-assessments without an actor header is rejected (deny-by-default)', async () => {
  const pool = makeTestPool();
  const app = createApp(pool, undefined, async () => 'unused');
  const res = await request(app).post('/api/ai-assessments').send({ content: 'x' });
  assert.equal(res.status, 403);
});

test('GET /api/ai-assessments lists newest first', async () => {
  const pool = makeTestPool();
  const app = createApp(pool, undefined, async () => 'unused');

  const first = await asAdmin(request(app).post('/api/ai-assessments')).send({ content: 'first' });
  const second = await asAdmin(request(app).post('/api/ai-assessments')).send({ content: 'second' });

  const list = await request(app).get('/api/ai-assessments');
  assert.equal(list.body[0].id, second.body.id);
  assert.equal(list.body[1].id, first.body.id);
});

test('DELETE /api/ai-assessments/:id as editor is rejected; admin can delete', async () => {
  const pool = makeTestPool();
  await pool.query("INSERT INTO users (email, name, role) VALUES ('editor@example.com', 'Editor', 'editor')");
  const app = createApp(pool, undefined, async () => 'unused');

  const created = await asAdmin(request(app).post('/api/ai-assessments')).send({ content: 'x' });

  const asEditor = await request(app)
    .delete(`/api/ai-assessments/${created.body.id}`)
    .set('X-Actor-Name', encodeURIComponent('Editor'))
    .set('X-Actor-Email', encodeURIComponent('editor@example.com'));
  assert.equal(asEditor.status, 403);

  const deleted = await asAdmin(request(app).delete(`/api/ai-assessments/${created.body.id}`));
  assert.equal(deleted.status, 204);

  const list = await request(app).get('/api/ai-assessments');
  assert.equal(list.body.length, 0);
});

test('DELETE /api/ai-assessments/:id on a non-existent id returns 404', async () => {
  const pool = makeTestPool();
  const app = createApp(pool, undefined, async () => 'unused');
  const res = await asAdmin(request(app).delete('/api/ai-assessments/999'));
  assert.equal(res.status, 404);
});

test('DELETE /api/ai-assessments/:id with a non-numeric id returns 400', async () => {
  const pool = makeTestPool();
  const app = createApp(pool, undefined, async () => 'unused');
  const res = await asAdmin(request(app).delete('/api/ai-assessments/abc'));
  assert.equal(res.status, 400);
});
