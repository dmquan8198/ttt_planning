const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { newDb } = require('pg-mem');
const fs = require('node:fs');
const path = require('node:path');
const createApp = require('../../src/app');
const { getTodayVN } = require('../../src/lib/today');

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

test('POST /api/chatbot logs the exchange to chatbot_logs and returns its id as logId', async () => {
  const pool = makeTestPool();
  const app = createApp(pool, undefined, async () => 'Câu trả lời test');

  const res = await request(app)
    .post('/api/chatbot')
    .set('X-Actor-Name', encodeURIComponent('quan.dang1'))
    .set('X-Actor-Email', encodeURIComponent('dmquan8198@gmail.com'))
    .send({ message: 'Hỏi thử' });

  assert.equal(res.status, 200);
  assert.ok(Number.isInteger(res.body.logId));

  const { rows } = await pool.query('SELECT * FROM chatbot_logs WHERE id=$1', [res.body.logId]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].actor_email, 'dmquan8198@gmail.com');
  assert.equal(rows[0].actor_name, 'quan.dang1');
  assert.equal(rows[0].message, 'Hỏi thử');
  assert.equal(rows[0].reply, 'Câu trả lời test');
  assert.equal(rows[0].rating, null);
});

test('PATCH /api/chatbot/:id/rating sets the rating on that log row', async () => {
  const pool = makeTestPool();
  const app = createApp(pool, undefined, async () => 'ok');

  const chat = await request(app).post('/api/chatbot').send({ message: 'Hỏi thử' });
  const res = await request(app).patch(`/api/chatbot/${chat.body.logId}/rating`).send({ rating: 1 });
  assert.equal(res.status, 200);

  const { rows } = await pool.query('SELECT rating FROM chatbot_logs WHERE id=$1', [chat.body.logId]);
  assert.equal(rows[0].rating, 1);
});

test('PATCH /api/chatbot/:id/rating rejects a rating that is not 1 or -1', async () => {
  const pool = makeTestPool();
  const app = createApp(pool, undefined, async () => 'ok');
  const chat = await request(app).post('/api/chatbot').send({ message: 'Hỏi thử' });
  const res = await request(app).patch(`/api/chatbot/${chat.body.logId}/rating`).send({ rating: 3 });
  assert.equal(res.status, 400);
});

// --- tool-calling path (chatWithToolsFn passed as the 4th createApp arg —
// see src/app.js's chatToolsFn default, which only kicks in when this arg
// is left undefined, so these tests pin the 'tools' branch directly
// without touching LLM_PROVIDER) ---

test('POST /api/chatbot with a tool-calling fn runs the loop: model asks for dem_task, gets a REAL count back, then answers', async () => {
  const pool = makeTestPool();
  await pool.query("INSERT INTO sprints (code, start_date, end_date) VALUES ('S18', '2026-09-14', '2026-09-25')");
  const { rows: [sprint] } = await pool.query("SELECT id FROM sprints WHERE code='S18'");
  await pool.query(
    `INSERT INTO tasks (category, name, platform, sprint_id, status, start_date, due_date)
     VALUES ('Product Foundation', 'Task A', 'Web', $1, '5.done', '2026-09-14', '2026-09-16')`,
    [sprint.id]
  );
  await pool.query(
    `INSERT INTO tasks (category, name, platform, sprint_id, status, start_date, due_date)
     VALUES ('Product Foundation', 'Task B', 'BE', $1, '0.backlog', '2026-09-17', '2026-09-20')`,
    [sprint.id]
  );

  let call = 0;
  const seenMessages = [];
  const fakeChatWithTools = async (messages, tools) => {
    call += 1;
    seenMessages.push(messages.map((m) => ({ role: m.role, content: m.content })));
    assert.ok(tools.some((t) => t.function.name === 'dem_task'));
    if (call === 1) {
      return { role: 'assistant', content: '', tool_calls: [{ id: 'c1', function: { name: 'dem_task', arguments: { sprint_code: 'S18' } } }] };
    }
    // second call: the tool result message should carry the real count (2)
    const toolMsg = messages[messages.length - 1];
    const parsed = JSON.parse(toolMsg.content);
    return { role: 'assistant', content: `Sprint S18 có ${parsed.so_luong} task.`, tool_calls: [] };
  };

  const app = createApp(pool, undefined, undefined, fakeChatWithTools);
  const res = await request(app).post('/api/chatbot').send({ message: 'Sprint S18 có bao nhiêu task?' });

  assert.equal(res.status, 200);
  assert.equal(res.body.reply, 'Sprint S18 có 2 task.');
  assert.equal(call, 2);
  assert.equal(seenMessages[0][0].role, 'system');
  assert.ok(seenMessages[0][0].content.includes('gọi tool'));

  const { rows } = await pool.query('SELECT mode, tool_calls FROM chatbot_logs WHERE id=$1', [res.body.logId]);
  assert.equal(rows[0].mode, 'tools');
  assert.equal(rows[0].tool_calls.length, 1);
  assert.equal(rows[0].tool_calls[0].name, 'dem_task');
  assert.equal(rows[0].tool_calls[0].result.so_luong, 2);
});

test('POST /api/chatbot with a tool-calling fn puts a full sprint date table in the system message, tagging which is current vs next', async () => {
  // this is the fix for "sprint tiếp theo có bao nhiêu task?" repeatedly
  // tripping the model into inventing a code or leaking a malformed tool
  // call: give it the actual dates up front so it can read off the right
  // sprint instead of chaining tool calls or guessing.
  const pool = makeTestPool();
  const today = getTodayVN();
  const shift = (days) => {
    const d = new Date(today + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  await pool.query('INSERT INTO sprints (code, start_date, end_date) VALUES ($1, $2, $3)', ['S18', shift(-3), shift(3)]);
  await pool.query('INSERT INTO sprints (code, start_date, end_date) VALUES ($1, $2, $3)', ['S19', shift(4), shift(10)]);
  await pool.query('INSERT INTO sprints (code, start_date, end_date) VALUES ($1, $2, $3)', ['S17', shift(-10), shift(-4)]);

  let systemContent = null;
  const fakeChatWithTools = async (messages) => {
    systemContent = messages[0].content;
    return { role: 'assistant', content: 'ok', tool_calls: [] };
  };
  const app = createApp(pool, undefined, undefined, fakeChatWithTools);
  await request(app).post('/api/chatbot').send({ message: 'Xin chào' });

  assert.ok(systemContent.includes('DANH SÁCH SPRINT'));
  assert.match(systemContent, /S18:.*<- SPRINT HIỆN TẠI/);
  assert.match(systemContent, /S19:.*<- sprint tiếp theo/);
  assert.doesNotMatch(systemContent.match(/S17:[^\n]*/)[0], /<-/); // past sprint, no tag
});

test('POST /api/chatbot with a tool-calling fn tells the model to admit not knowing and point to the 👎 button, rather than guess', async () => {
  const pool = makeTestPool();
  let systemContent = null;
  const fakeChatWithTools = async (messages) => {
    systemContent = messages[0].content;
    return { role: 'assistant', content: 'ok', tool_calls: [] };
  };
  const app = createApp(pool, undefined, undefined, fakeChatWithTools);
  await request(app).post('/api/chatbot').send({ message: 'Xin chào' });

  assert.match(systemContent, /chưa biết\/chưa được dạy/);
  assert.match(systemContent, /👎/);
});

test('POST /api/chatbot recovers when the model leaks a tool-call attempt as raw text instead of using tool_calls', async () => {
  // real observed output from Qwen2.5:7b-instruct via Ollama, asked
  // "Sprint tiếp theo đã có bao nhiêu task?" — tool_calls came back empty
  // but content held a Hermes-style <tool_call> tag. Must never reach the
  // user as-is.
  const leaked = 'brtc\n{"name": "sprint_hien_tai", "arguments": {"sprint_code": "tiếp theo"}}\n</tool_call>';
  let call = 0;
  const fakeChatWithTools = async (messages) => {
    call += 1;
    if (call === 1) return { role: 'assistant', content: leaked, tool_calls: [] };
    // second call should have received a correction nudge, not the leaked text as-is
    const last = messages[messages.length - 1];
    assert.equal(last.role, 'user');
    assert.match(last.content, /không đúng định dạng/);
    return { role: 'assistant', content: 'Sprint tiếp theo có 3 task.', tool_calls: [] };
  };
  const pool = makeTestPool();
  const app = createApp(pool, undefined, undefined, fakeChatWithTools);

  const res = await request(app).post('/api/chatbot').send({ message: 'Sprint tiếp theo đã có bao nhiêu task?' });
  assert.equal(res.status, 200);
  assert.equal(res.body.reply, 'Sprint tiếp theo có 3 task.');
  assert.doesNotMatch(res.body.reply, /tool_call/);
  assert.equal(call, 2);
});

test('POST /api/chatbot with a tool-calling fn skips the loop entirely for a direct answer (no tool_calls)', async () => {
  const pool = makeTestPool();
  const fakeChatWithTools = async () => ({ role: 'assistant', content: 'Chào bạn!', tool_calls: [] });
  const app = createApp(pool, undefined, undefined, fakeChatWithTools);

  const res = await request(app).post('/api/chatbot').send({ message: 'Xin chào' });
  assert.equal(res.status, 200);
  assert.equal(res.body.reply, 'Chào bạn!');

  const { rows } = await pool.query('SELECT tool_calls FROM chatbot_logs WHERE id=$1', [res.body.logId]);
  assert.deepEqual(rows[0].tool_calls, []);
});

test('POST /api/chatbot with a tool-calling fn that never converges stops after MAX_TOOL_ITERATIONS with an explanatory reply', async () => {
  const pool = makeTestPool();
  let calls = 0;
  const fakeChatWithTools = async () => {
    calls += 1;
    return { role: 'assistant', content: '', tool_calls: [{ id: `c${calls}`, function: { name: 'sprint_hien_tai', arguments: {} } }] };
  };
  const app = createApp(pool, undefined, undefined, fakeChatWithTools);

  const res = await request(app).post('/api/chatbot').send({ message: 'Sprint nào đang chạy?' });
  assert.equal(res.status, 200);
  assert.match(res.body.reply, /tra cứu hơi lâu/);
  assert.equal(calls, 5); // MAX_TOOL_ITERATIONS

  const { rows } = await pool.query('SELECT tool_calls FROM chatbot_logs WHERE id=$1', [res.body.logId]);
  assert.equal(rows[0].tool_calls.length, 5);
});

test('POST /api/chatbot with a tool-calling fn surfaces its failure as 502, same as the plain generateFn path', async () => {
  const pool = makeTestPool();
  const fakeChatWithTools = async () => { throw new Error('Ollama lỗi: connection refused'); };
  const app = createApp(pool, undefined, undefined, fakeChatWithTools);

  const res = await request(app).post('/api/chatbot').send({ message: 'Xin chào' });
  assert.equal(res.status, 502);
  assert.match(res.body.error, /connection refused/);
});
