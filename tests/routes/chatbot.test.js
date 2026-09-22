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

test('POST /api/chatbot calls the injected LLM fn with grounding context and returns its reply', async () => {
  const pool = makeTestPool();
  await pool.query(
    `INSERT INTO tasks (category, name, platform, status, start_date, due_date)
     VALUES ('Product Foundation', 'Xóa hợp đồng ủy thác đầu tư', 'BE', '0.backlog', '2026-08-05', '2026-08-10')`
  );
  await pool.query(
    `INSERT INTO sops (group_name, title, steps)
     VALUES ('Vận hành', 'Trình ký hợp đồng', 'Bước 1: soạn thảo')`
  );

  let receivedPrompt = null;
  const fakeGenerate = async (prompt) => {
    receivedPrompt = prompt;
    return '  Task "Xóa hợp đồng ủy thác đầu tư" đang ở trạng thái Backlog.  ';
  };
  const app = createApp(pool, undefined, fakeGenerate);

  const res = await request(app).post('/api/chatbot').send({ message: 'Task xóa hợp đồng đang ở trạng thái gì?' });
  assert.equal(res.status, 200);
  assert.equal(res.body.reply, 'Task "Xóa hợp đồng ủy thác đầu tư" đang ở trạng thái Backlog.'); // trimmed
  assert.ok(receivedPrompt.includes('Xóa hợp đồng ủy thác đầu tư'));
  assert.ok(receivedPrompt.includes('Trình ký hợp đồng'));
  assert.ok(receivedPrompt.includes('Task xóa hợp đồng đang ở trạng thái gì?'));
  assert.ok(receivedPrompt.includes('CHỈ được trả lời dựa trên DỮ LIỆU HỆ THỐNG'));
});

test('POST /api/chatbot includes prior history turns in the prompt sent to the LLM', async () => {
  const pool = makeTestPool();
  let receivedPrompt = null;
  const fakeGenerate = async (prompt) => { receivedPrompt = prompt; return 'ok'; };
  const app = createApp(pool, undefined, fakeGenerate);

  await request(app).post('/api/chatbot').send({
    message: 'Còn task đó thì sao?',
    history: [
      { role: 'user', text: 'Sprint S13 có bao nhiêu task?' },
      { role: 'assistant', text: 'Sprint S13 có 4 task.' }
    ]
  });
  assert.ok(receivedPrompt.includes('Sprint S13 có bao nhiêu task?'));
  assert.ok(receivedPrompt.includes('Sprint S13 có 4 task.'));
  assert.ok(receivedPrompt.includes('Còn task đó thì sao?'));
});

test('POST /api/chatbot rejects an empty message', async () => {
  const pool = makeTestPool();
  const app = createApp(pool, undefined, async () => 'unused');
  const res = await request(app).post('/api/chatbot').send({ message: '   ' });
  assert.equal(res.status, 400);
});

test('POST /api/chatbot surfaces an LLM failure as 502', async () => {
  const pool = makeTestPool();
  const app = createApp(pool, undefined, async () => { throw new Error('Gemini API lỗi: quota exceeded'); });
  const res = await request(app).post('/api/chatbot').send({ message: 'Xin chào' });
  assert.equal(res.status, 502);
  assert.match(res.body.error, /quota exceeded/);
});
