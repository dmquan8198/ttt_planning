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

test('POST /api/ai-suggestions/why calls the injected LLM fn with task context and returns its content', async () => {
  const pool = makeTestPool();
  let receivedPrompt = null;
  const fakeGenerate = async (prompt) => {
    receivedPrompt = prompt;
    return '  Giúp khách hàng đóng tài khoản đúng quy trình.  ';
  };
  const app = createApp(pool, undefined, fakeGenerate);

  const res = await request(app).post('/api/ai-suggestions/why').send({
    name: 'Xóa hợp đồng ủy thác đầu tư', category: 'TTT New - Product Foundation', platform: 'BE'
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.content, 'Giúp khách hàng đóng tài khoản đúng quy trình.'); // trimmed
  assert.ok(receivedPrompt.includes('Xóa hợp đồng ủy thác đầu tư'));
  assert.ok(receivedPrompt.includes('TTT New - Product Foundation'));
  assert.ok(receivedPrompt.includes('BE'));
});

test('POST /api/ai-suggestions/why rejects an empty name', async () => {
  const pool = makeTestPool();
  const app = createApp(pool, undefined, async () => 'unused');
  const res = await request(app).post('/api/ai-suggestions/why').send({ name: '   ' });
  assert.equal(res.status, 400);
});

test('POST /api/ai-suggestions/why works without category/platform (optional context)', async () => {
  const pool = makeTestPool();
  var receivedPrompt = null;
  const fakeGenerate = async (prompt) => { receivedPrompt = prompt; return 'Lý do gợi ý.'; };
  const app = createApp(pool, undefined, fakeGenerate);

  const res = await request(app).post('/api/ai-suggestions/why').send({ name: 'Task không có category' });
  assert.equal(res.status, 200);
  assert.ok(receivedPrompt.includes('Task không có category'));
  assert.ok(!receivedPrompt.includes('Category:'));
  assert.ok(!receivedPrompt.includes('Platform:'));
});

test('POST /api/ai-suggestions/why surfaces an LLM error as 502', async () => {
  const pool = makeTestPool();
  const failingGenerate = async () => { throw new Error('Gemini API lỗi: quota exceeded'); };
  const app = createApp(pool, undefined, failingGenerate);

  const res = await request(app).post('/api/ai-suggestions/why').send({ name: 'Task X' });
  assert.equal(res.status, 502);
  assert.equal(res.body.error, 'Gemini API lỗi: quota exceeded');
});

test('POST /api/ai-suggestions/why requires no actor/role — any signed-in state works (compute-only)', async () => {
  const pool = makeTestPool();
  const app = createApp(pool, undefined, async () => 'x');
  const res = await request(app).post('/api/ai-suggestions/why').send({ name: 'Task X' }); // no X-Actor headers at all
  assert.equal(res.status, 200);
});
