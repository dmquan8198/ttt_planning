const { Router } = require('express');
const { asyncHandler } = require('../lib/asyncHandler');
const { normalizeDate } = require('../lib/normalizeDate');
const { getTodayVN } = require('../lib/today');
const { computePhaseRollup } = require('../lib/phaseRollup');
const { buildChatbotContext, fmtDMY } = require('../lib/buildChatbotContext');
const { TOOLS, executeTool } = require('../lib/chatbotTools');
const { pickCurrentAndNextSprint } = require('../lib/pickCurrentAndNextSprint');

// how many prior turns of the conversation get replayed into the prompt —
// enough for real follow-ups ("còn task đó thì sao") without letting a long
// session grow the prompt without bound.
const MAX_HISTORY_TURNS = 10;
// tool-call round trips per question, not follow-up turns — e.g. "sprint
// hiện tại có bao nhiêu task chưa xong" is sprint_hien_tai then dem_task,
// 2 iterations. A cap exists so a model stuck re-calling tools without
// converging can't loop forever; hitting it returns REPLY_TOO_MANY_LOOKUPS
// below instead of hanging the request.
const MAX_TOOL_ITERATIONS = 5;

const REFUSAL = 'Xin lỗi, mình chỉ có thể trả lời các câu hỏi liên quan đến dữ liệu trong hệ thống Túi Thần Tài thôi ạ 🙏';
const REPLY_TOO_MANY_LOOKUPS = 'Xin lỗi, mình tra cứu hơi lâu mà chưa ra kết quả rõ ràng — bạn thử hỏi cụ thể hơn (ví dụ nêu rõ mã sprint) giúp mình nhé.';
// what the model is told to say instead of guessing when a question IS
// in-scope but no tool/data actually answers it — distinct from REFUSAL
// (which is for off-topic questions). Names the 👎 button on purpose: the
// chatbot_logs.rating column exists specifically so a real "I don't know"
// turns into a concrete signal for what tool/data to add next, rather than
// a hallucinated answer nobody flags because it sounded plausible.
const DONT_KNOW_RULE =
  'Nếu câu hỏi liên quan đến hệ thống nhưng không có tool/dữ liệu nào đủ để trả lời chắc chắn, ' +
  'hãy thành thật nói mình chưa biết/chưa được dạy để trả lời câu này, và gợi ý người dùng bấm 👎 bên dưới câu trả lời để admin biết mà bổ sung — ' +
  'TUYỆT ĐỐI không đoán hay bịa ra một câu trả lời nghe hợp lý.';

// used only when chatWithToolsFn isn't available (no provider wired up for
// tool-calling — Gemini/Render today, see llmClient.supportsTools) — the
// original "dump every phase/sprint/task/SOP into the prompt" approach.
// Kept verbatim as a fallback rather than deleted: still the only way to
// answer at all until Gemini gets its own function-calling support.
const SYSTEM_INSTRUCTION =
  'Bạn là "Túi Thần Tài" — trợ lý AI của hệ thống quản lý dự án "Túi Thần Tài". ' +
  'CHỈ được trả lời dựa trên DỮ LIỆU HỆ THỐNG được cung cấp bên dưới — KHÔNG bịa đặt thông tin không có trong dữ liệu này, ' +
  'và KHÔNG dùng kiến thức chung bên ngoài để trả lời. ' +
  'Nếu câu hỏi không liên quan gì đến dữ liệu của hệ thống này (ví dụ hỏi về thời tiết, tin tức, kiến thức chung, ' +
  'hoặc bất kỳ điều gì nằm ngoài phạm vi quản lý dự án/quy trình vận hành này), hãy LỊCH SỰ TỪ CHỐI đúng nguyên văn: ' +
  `"${REFUSAL}" ` +
  'và không trả lời gì thêm ngoài câu đó. ' +
  `${DONT_KNOW_RULE} ` +
  'Khi trả lời được, hãy trả lời ngắn gọn, đúng trọng tâm, thân thiện, xưng "mình", bằng tiếng Việt, không markdown phức tạp.';

// used when chatWithToolsFn IS available — no data dump at all, the model
// pulls exactly what a question needs via chatbotTools.js's SQL-backed
// tools instead of trying to count/filter a 75k+ char wall of text itself
// (see the num_ctx investigation in ollamaClient.js for why that failed).
const TOOLS_SYSTEM_INSTRUCTION =
  'Bạn là "Túi Thần Tài" — trợ lý AI của hệ thống quản lý dự án "Túi Thần Tài". ' +
  'Bạn có các tool để tra cứu dữ liệu THẬT (task, sprint, SOP) trong hệ thống. ' +
  'LUÔN gọi tool phù hợp khi câu hỏi cần số liệu, danh sách, hay chi tiết cụ thể — KHÔNG tự đếm, tự đoán, hay bịa đặt thông tin ngoài kết quả tool trả về. ' +
  'Bên dưới có sẵn DANH SÁCH SPRINT kèm ngày bắt đầu/kết thúc và hôm nay là ngày nào — với BẤT KỲ câu hỏi nào nhắc tới mốc thời gian của sprint ' +
  '("sprint này/hiện tại", "sprint tiếp theo/sau/kế tiếp", hay một ngày/tháng cụ thể), LUÔN so sánh mốc thời gian đó với bảng sprint này TRƯỚC để xác định đúng mã sprint (ví dụ "S18"), rồi mới dùng mã đó gọi dem_task/liet_ke_task/task_qua_han — KHÔNG tự đoán mã sprint. ' +
  'Câu hỏi về % hoàn thành/tiến độ phase thì LUÔN gọi thong_tin_phase — dem_task/liet_ke_task chỉ đếm số task, không đủ để tính %. ' +
  'Câu hỏi về task trễ hạn/quá deadline thì LUÔN gọi task_qua_han — KHÔNG tự so sánh due_date từ liet_ke_task với hôm nay, kết quả đó không tin cậy. ' +
  'Câu chào hỏi xã giao thông thường thì trả lời thẳng, không cần gọi tool. ' +
  'Nếu câu hỏi không liên quan gì đến dữ liệu hệ thống này (ví dụ thời tiết, tin tức, kiến thức chung), hãy LỊCH SỰ TỪ CHỐI đúng nguyên văn: ' +
  `"${REFUSAL}" ` +
  'và không trả lời gì thêm ngoài câu đó. ' +
  `${DONT_KNOW_RULE} ` +
  'Khi trả lời được, hãy trả lời ngắn gọn, đúng trọng tâm, thân thiện, xưng "mình", bằng tiếng Việt, không markdown phức tạp.';

async function loadChatbotInputs(pool) {
  const { rows: phasesRaw } = await pool.query(
    'SELECT id, code, name, target_date FROM phases ORDER BY target_date'
  );
  const phasesBase = phasesRaw.map((p) => ({ ...p, target_date: normalizeDate(p.target_date) }));

  const { rows: sprintsRaw } = await pool.query(
    'SELECT id, code, start_date, end_date FROM sprints ORDER BY start_date'
  );
  const sprints = sprintsRaw.map((s) => ({
    ...s, start_date: normalizeDate(s.start_date), end_date: normalizeDate(s.end_date)
  }));

  const { rows: tasksRaw } = await pool.query(
    'SELECT id, name, category, platform, status, phase_id, sprint_id, start_date, due_date FROM tasks ORDER BY stt NULLS LAST, id'
  );
  // pct_complete isn't a stored column — same computePhaseRollup used by
  // GET /api/phases derives it from each phase's own tasks' statuses.
  const todayIso = getTodayVN();
  const phases = phasesBase.map((p) => {
    const phaseTasks = tasksRaw.filter((t) => t.phase_id === p.id);
    return { ...p, pct_complete: computePhaseRollup(p, phaseTasks, todayIso).pct_complete };
  });
  const { rows: subtasksRaw } = await pool.query(
    'SELECT id, task_id, name, status, pic, start_date, due_date FROM subtasks ORDER BY task_id, id'
  );
  const subtasksByTask = {};
  subtasksRaw.forEach((st) => {
    if (!subtasksByTask[st.task_id]) subtasksByTask[st.task_id] = [];
    subtasksByTask[st.task_id].push({ ...st, start_date: normalizeDate(st.start_date), due_date: normalizeDate(st.due_date) });
  });
  const tasks = tasksRaw.map((t) => ({
    ...t, start_date: normalizeDate(t.start_date), due_date: normalizeDate(t.due_date),
    subtasks: subtasksByTask[t.id] || []
  }));

  const { rows: sops } = await pool.query('SELECT * FROM sops ORDER BY group_name, category, id');

  return { phases, sprints, tasks, sops };
}

function buildChatPrompt(systemContext, history, userMessage) {
  const historyText = (history || [])
    .slice(-MAX_HISTORY_TURNS)
    .map((h) => (h.role === 'assistant' ? 'Trợ lý' : 'Người dùng') + ': ' + h.text)
    .join('\n');
  return (
    SYSTEM_INSTRUCTION +
    '\n\n--- DỮ LIỆU HỆ THỐNG ---\n' + systemContext +
    (historyText ? '\n--- LỊCH SỬ HỘI THOẠI ---\n' + historyText + '\n' : '') +
    '\nNgười dùng: ' + userMessage + '\nTrợ lý:'
  );
}

function currentModelLabel() {
  return process.env.LLM_PROVIDER === 'ollama' ? (process.env.OLLAMA_MODEL || 'ollama') : 'gemini';
}

function historyToMessages(history) {
  return (history || [])
    .slice(-MAX_HISTORY_TURNS)
    .map((h) => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: h.text }));
}

// real, observed failure mode (twice, both on questions needing the
// sprint_ke_tiep chain): instead of a proper tool_calls entry, Qwen
// sometimes emits its tool-call intent as literal text content — e.g.
// `brtc\n{"name": "sprint_hien_tai", "arguments": {...}}\n</tool_call>` —
// a Hermes-style tag format it's seen in training that doesn't match what
// Ollama's /api/chat actually parses into structured tool_calls. Left
// unhandled, that garbled text would just get shown to the user as the
// "answer". Confidence collapsing into malformed output like this seems to
// correlate with the model being unsure what to do next, so nudging it
// with an explicit correction and one more turn (still bounded by
// MAX_TOOL_ITERATIONS) recovers more often than silently failing would.
function looksLikeLeakedToolCall(content) {
  if (!content) return false;
  return /<\/?tool_call>/i.test(content) || (/"name"\s*:\s*"/.test(content) && /"arguments"\s*:/.test(content));
}

// runs the tool-calling loop for one question: model either answers
// directly (no tool_calls) or asks for one/more tools, which get executed
// against the real DB (chatbotTools.js) and fed back as role:"tool"
// messages, repeating until the model converges or MAX_TOOL_ITERATIONS
// hits. toolCalls (name/args/result per call) is returned alongside the
// reply purely for chatbot_logs — the human-feedback data the team asked
// for needs to show not just what was answered but what was looked up, so
// a bad answer can be told apart from "wrong tool args" vs "right data,
// bad phrasing" later.
// a small, bounded table (one line per sprint — ~15 sprints project-wide,
// nowhere near the 75k+ char task dump this whole tool-calling rewrite
// exists to avoid) given to the model UNCONDITIONALLY, not behind a tool
// call. Exists because relying on the model to first call sprint_hien_tai
// and then correctly reuse its result was NOT reliable enough in practice
// — "sprint tiếp theo có bao nhiêu task?" repeatedly tripped it into either
// inventing a sprint code or leaking a malformed tool-call attempt as text
// (see looksLikeLeakedToolCall). Putting the actual dates in front of it
// lets it answer "which sprint" by reading, not by chaining tool calls or
// guessing — directly what was asked for: compare the referenced date
// against each sprint's range before counting/analyzing anything.
async function buildSprintReferenceBlock(pool) {
  const { rows } = await pool.query('SELECT code, start_date, end_date FROM sprints ORDER BY start_date');
  const sprints = rows.map((s) => ({ ...s, start_date: normalizeDate(s.start_date), end_date: normalizeDate(s.end_date) }));
  const today = getTodayVN();
  const { current, next } = pickCurrentAndNextSprint(sprints, today);
  const lines = sprints.map((s) => {
    let tag = '';
    if (current && s.code === current.code) tag = '   <- SPRINT HIỆN TẠI (hôm nay nằm trong khoảng này)';
    else if (next && s.code === next.code) tag = '   <- sprint tiếp theo';
    return `- ${s.code}: ${fmtDMY(s.start_date)} - ${fmtDMY(s.end_date)}${tag}`;
  });
  return (
    `Hôm nay: ${fmtDMY(today)}\n` +
    `== DANH SÁCH SPRINT (so sánh mốc thời gian được hỏi với bảng này để xác định đúng mã sprint trước khi gọi tool đếm/liệt kê) ==\n` +
    (lines.join('\n') || '(chưa có sprint nào)')
  );
}

async function runToolLoop(pool, chatWithToolsFn, history, message) {
  const sprintBlock = await buildSprintReferenceBlock(pool);
  const messages = [
    { role: 'system', content: `${TOOLS_SYSTEM_INSTRUCTION}\n\n${sprintBlock}` },
    ...historyToMessages(history),
    { role: 'user', content: message }
  ];

  const toolCalls = [];
  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const reply = await chatWithToolsFn(messages, TOOLS);
    messages.push(reply);

    if (reply.tool_calls && reply.tool_calls.length > 0) {
      for (const call of reply.tool_calls) {
        const name = call.function.name;
        const args = call.function.arguments || {};
        const result = await executeTool(pool, name, args);
        toolCalls.push({ name, args, result });
        messages.push({ role: 'tool', name, tool_call_id: call.id, content: JSON.stringify(result) });
      }
      continue;
    }

    if (looksLikeLeakedToolCall(reply.content)) {
      messages.push({
        role: 'user',
        content: 'Câu trả lời trước không đúng định dạng tool call. Hãy gọi tool qua cơ chế function calling thật (không viết ra dạng text/tag), hoặc trả lời thẳng bằng văn bản bình thường nếu không cần tool.'
      });
      continue;
    }

    return { content: (reply.content || '').trim(), toolCalls, totalChars: JSON.stringify(messages).length };
  }
  return { content: REPLY_TOO_MANY_LOOKUPS, toolCalls, totalChars: JSON.stringify(messages).length };
}

// generateFn: (prompt: string) => Promise<string>, same DI shape as
// aiAssessments/aiSuggestions. chatWithToolsFn: (messages, tools) =>
// Promise<message> — only ollama implements it (llmClient.supportsTools());
// null/undefined means "fall back to generateFn + the full context dump".
// Tests never make a real network call either way.
function chatbotRouter(pool, generateFn, chatWithToolsFn) {
  const router = Router();

  // no role gate: open to any signed-in viewer, same reasoning as
  // ai-assessments/generate and ai-suggestions/why. Does write now (the
  // chatbot_logs row below) — unlike those, but only ever a log row keyed
  // by whoever asked, never anything the app itself reads back to decide
  // behavior, so the "compute-only" trust model this comment used to
  // describe still holds in spirit.
  router.post('/', asyncHandler(async (req, res) => {
    const message = (req.body.message || '').trim();
    if (!message) {
      return res.status(400).json({ error: 'message không được để trống' });
    }
    const history = Array.isArray(req.body.history) ? req.body.history : [];

    const startedAt = Date.now();
    let reply;
    let promptChars = null;
    let toolCalls = null;
    const mode = chatWithToolsFn ? 'tools' : 'context_dump';

    try {
      if (chatWithToolsFn) {
        const result = await runToolLoop(pool, chatWithToolsFn, history, message);
        reply = result.content;
        toolCalls = result.toolCalls;
        promptChars = result.totalChars;
      } else {
        const { phases, sprints, tasks, sops } = await loadChatbotInputs(pool);
        const systemContext = buildChatbotContext({ phases, sprints, tasks, sops, todayIso: getTodayVN() });
        const prompt = buildChatPrompt(systemContext, history, message);
        promptChars = prompt.length;
        reply = (await generateFn(prompt)).trim();
      }
    } catch (err) {
      return res.status(502).json({ error: err.message || 'Không gọi được LLM.' });
    }

    // best-effort: a logging failure shouldn't take down a reply the user
    // already has. rating starts NULL (no feedback yet) — filled in later
    // by PATCH /:id/rating from the 👍/👎 under the reply in the widget.
    let logId = null;
    try {
      const { rows } = await pool.query(
        `INSERT INTO chatbot_logs (actor_email, actor_name, message, reply, prompt_chars, latency_ms, model, mode, tool_calls)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [req.actorEmail, req.actorName, message, reply, promptChars, Date.now() - startedAt, currentModelLabel(),
          mode, toolCalls ? JSON.stringify(toolCalls) : null]
      );
      logId = rows[0].id;
    } catch (err) {
      console.error('Không ghi được chatbot_logs:', err);
    }

    res.json({ reply, logId });
  }));

  // no role gate: any signed-in viewer can rate a reply, including ones
  // asked before this endpoint existed (rating an id that doesn't exist
  // just matches zero rows — not an error, nothing to leak).
  router.patch('/:id/rating', asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const rating = Number(req.body.rating);
    if (!Number.isInteger(id) || ![1, -1].includes(rating)) {
      return res.status(400).json({ error: 'id hoặc rating không hợp lệ (rating phải là 1 hoặc -1)' });
    }
    await pool.query('UPDATE chatbot_logs SET rating=$1 WHERE id=$2', [rating, id]);
    res.json({ ok: true });
  }));

  return router;
}

module.exports = chatbotRouter;
