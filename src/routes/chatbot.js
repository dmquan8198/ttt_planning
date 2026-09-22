const { Router } = require('express');
const { asyncHandler } = require('../lib/asyncHandler');
const { normalizeDate } = require('../lib/normalizeDate');
const { getTodayVN } = require('../lib/today');
const { computePhaseRollup } = require('../lib/phaseRollup');
const { buildChatbotContext } = require('../lib/buildChatbotContext');

// how many prior turns of the conversation get replayed into the prompt —
// enough for real follow-ups ("còn task đó thì sao") without letting a long
// session grow the prompt without bound.
const MAX_HISTORY_TURNS = 10;

const SYSTEM_INSTRUCTION =
  'Bạn là "Túi Thần Tài" — trợ lý AI của hệ thống quản lý dự án "Túi Thần Tài". ' +
  'CHỈ được trả lời dựa trên DỮ LIỆU HỆ THỐNG được cung cấp bên dưới — KHÔNG bịa đặt thông tin không có trong dữ liệu này, ' +
  'và KHÔNG dùng kiến thức chung bên ngoài để trả lời. ' +
  'Nếu câu hỏi không liên quan gì đến dữ liệu của hệ thống này (ví dụ hỏi về thời tiết, tin tức, kiến thức chung, ' +
  'hoặc bất kỳ điều gì nằm ngoài phạm vi quản lý dự án/quy trình vận hành này), hãy LỊCH SỰ TỪ CHỐI đúng nguyên văn: ' +
  '"Xin lỗi, mình chỉ có thể trả lời các câu hỏi liên quan đến dữ liệu trong hệ thống Túi Thần Tài thôi ạ 🙏" ' +
  'và không trả lời gì thêm ngoài câu đó. ' +
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

// generateFn: (prompt: string) => Promise<string> — same DI shape as
// aiAssessments/aiSuggestions, so tests never make a real network call.
function chatbotRouter(pool, generateFn) {
  const router = Router();

  // no role gate: compute-only, writes nothing to the DB — same reasoning
  // as ai-assessments/generate and ai-suggestions/why, open to any signed-in
  // viewer.
  router.post('/', asyncHandler(async (req, res) => {
    const message = (req.body.message || '').trim();
    if (!message) {
      return res.status(400).json({ error: 'message không được để trống' });
    }
    const history = Array.isArray(req.body.history) ? req.body.history : [];

    const { phases, sprints, tasks, sops } = await loadChatbotInputs(pool);
    const systemContext = buildChatbotContext({ phases, sprints, tasks, sops, todayIso: getTodayVN() });
    const prompt = buildChatPrompt(systemContext, history, message);

    let reply;
    try {
      reply = await generateFn(prompt);
    } catch (err) {
      return res.status(502).json({ error: err.message || 'Không gọi được LLM.' });
    }
    res.json({ reply: reply.trim() });
  }));

  return router;
}

module.exports = chatbotRouter;
