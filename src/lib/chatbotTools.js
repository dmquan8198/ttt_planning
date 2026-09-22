// Tool-calling backend for the chatbot (see src/routes/chatbot.js). Exists
// because dumping the whole task/sprint/SOP table into the prompt (the
// original approach, still what buildChatbotContext.js does for providers
// that don't support tool-calling) makes a 7B local model both slow (15-20k+
// token prompts) and wrong — it can't reliably count/filter a wall of text
// itself. Giving it a handful of narrow, SQL-backed lookups instead means
// counting and filtering are always exact (the database does them), and the
// model only ever sees the slice of data relevant to the one question asked.
const { STATUS_CODES, STATUS_LABELS } = require('./statusCodes');
const { normalizeDate } = require('./normalizeDate');
const { getTodayVN } = require('./today');
const { pickCurrentAndNextSprint } = require('./pickCurrentAndNextSprint');
const { computePhaseRollup } = require('./phaseRollup');

const MAX_LIST_ROWS = 30;

// accepts either the raw status code ("5.done") or its Vietnamese label
// ("Done", case-insensitive) — a 7B model asked for "task đã Done" is just
// as likely to pass the label as the code, and rejecting that outright
// would make the tool feel broken for no reason.
function normalizeStatus(input) {
  if (!input) return { code: null };
  const raw = String(input).trim();
  if (STATUS_CODES.includes(raw)) return { code: raw };
  const lower = raw.toLowerCase();
  const found = Object.entries(STATUS_LABELS).find(([, label]) => label.toLowerCase() === lower);
  if (found) return { code: found[0] };
  return { code: undefined, error: `status "${raw}" không hợp lệ. Giá trị hợp lệ: ${Object.values(STATUS_LABELS).join(', ')}` };
}

const CURRENT_SPRINT_ALIASES = ['hiện tại', 'hien tai', 'current', 'now', 'sprint này', 'sprint hiện tại'];
const NEXT_SPRINT_ALIASES = ['tiếp theo', 'tiep theo', 'next', 'sprint tiếp theo', 'sprint sau', 'kế tiếp'];

// a real, observed failure mode: asked "sprint này có bao nhiêu task?", the
// model skipped calling sprint_hien_tai first and just invented a sprint
// code (dem_task({sprint_code: "S23"}) when the real current sprint was
// S18) — the SQL behind dem_task ran fine, the wrong INPUT was the bug.
// Accepting these aliases turns "call sprint_hien_tai, remember its code,
// pass that code to a second call" (a two-step chain a 7B model won't
// reliably get right) into "pass this one fixed word" — removing the
// failure mode instead of hoping stronger prose wording prevents it.
// "tiếp theo" added after a second real failure: asked "sprint tiếp theo
// có bao nhiêu task?" the model had no alias for "next" so it fell back to
// "hiện tại" (wrong sprint) AND, separately, emitted the tool call as raw
// text (`<tool_call>{...}</tool_call>`) instead of Ollama's structured
// tool_calls field — a small model's confidence tends to drop into
// malformed output exactly when it's guessing at something it has no
// clean answer for.
async function resolveSprintId(pool, sprintCode) {
  if (!sprintCode) return { id: null };
  const raw = String(sprintCode).trim().toLowerCase();
  if (CURRENT_SPRINT_ALIASES.includes(raw) || NEXT_SPRINT_ALIASES.includes(raw)) {
    const { rows } = await pool.query('SELECT id, code, start_date, end_date FROM sprints ORDER BY start_date');
    const sprints = rows.map((s) => ({ ...s, start_date: normalizeDate(s.start_date), end_date: normalizeDate(s.end_date) }));
    const { current, next } = pickCurrentAndNextSprint(sprints, getTodayVN());
    const picked = NEXT_SPRINT_ALIASES.includes(raw) ? next : current;
    if (!picked) return { id: undefined, error: 'Không tìm thấy sprint phù hợp (không có sprint nào đang chạy hoặc sắp tới).' };
    return { id: picked.id };
  }
  const { rows } = await pool.query('SELECT id FROM sprints WHERE code=$1', [String(sprintCode).trim()]);
  if (rows.length === 0) return { id: undefined, error: `Không tìm thấy sprint "${sprintCode}".` };
  return { id: rows[0].id };
}

async function resolvePhaseId(pool, phaseCode) {
  if (!phaseCode) return { id: null };
  const { rows } = await pool.query('SELECT id FROM phases WHERE code=$1', [phaseCode]);
  if (rows.length === 0) return { id: undefined, error: `Không tìm thấy phase "${phaseCode}".` };
  return { id: rows[0].id };
}

// bundles the three optional task filters (sprint/phase/status) shared by
// dem_task and liet_ke_task into resolved ids/codes + a WHERE fragment, so
// both tools build the exact same filter semantics from the same inputs.
async function resolveTaskFilters(pool, args) {
  const sprint = await resolveSprintId(pool, args.sprint_code);
  if (sprint.error) return { error: sprint.error };
  const phase = await resolvePhaseId(pool, args.phase_code);
  if (phase.error) return { error: phase.error };
  const status = normalizeStatus(args.status);
  if (status.error) return { error: status.error };

  const conditions = [];
  const params = [];
  if (sprint.id) { params.push(sprint.id); conditions.push(`t.sprint_id = $${params.length}`); }
  if (phase.id) { params.push(phase.id); conditions.push(`t.phase_id = $${params.length}`); }
  if (status.code) { params.push(status.code); conditions.push(`t.status = $${params.length}`); }

  return { where: conditions.length ? 'WHERE ' + conditions.join(' AND ') : '', params };
}

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'sprint_hien_tai',
      description: 'Lấy thông tin sprint hiện tại (đang chạy tính theo ngày hôm nay) và sprint kế tiếp — dùng khi câu hỏi nhắc đến "sprint này/hiện tại" mà không nói rõ mã sprint.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'dem_task',
      description: 'Đếm CHÍNH XÁC số lượng task khớp bộ lọc — luôn dùng tool này thay vì tự đếm khi câu hỏi hỏi "bao nhiêu task".',
      parameters: {
        type: 'object',
        properties: {
          sprint_code: { type: 'string', description: 'Mã sprint, ví dụ "S18", hoặc "hiện tại"/"tiếp theo" nếu câu hỏi không nêu mã cụ thể. Bỏ trống nếu không lọc theo sprint.' },
          phase_code: { type: 'string', description: 'Mã phase, ví dụ "P2". Bỏ trống nếu không lọc theo phase.' },
          status: { type: 'string', description: `Trạng thái task. Một trong: ${Object.values(STATUS_LABELS).join(', ')}. Bỏ trống nếu không lọc theo trạng thái.` }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'liet_ke_task',
      description: `Lấy danh sách task khớp bộ lọc (tối đa ${MAX_LIST_ROWS} task, có tổng số thật để biết có bị cắt bớt không) — dùng khi câu hỏi cần tên/chi tiết task, không chỉ số lượng.`,
      parameters: {
        type: 'object',
        properties: {
          sprint_code: { type: 'string', description: 'Mã sprint, ví dụ "S18", hoặc "hiện tại"/"tiếp theo" nếu câu hỏi không nêu mã cụ thể. Bỏ trống nếu không lọc theo sprint.' },
          phase_code: { type: 'string', description: 'Mã phase, ví dụ "P2". Bỏ trống nếu không lọc theo phase.' },
          status: { type: 'string', description: `Trạng thái task. Một trong: ${Object.values(STATUS_LABELS).join(', ')}. Bỏ trống nếu không lọc theo trạng thái.` }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'tim_sop',
      description: 'Tìm quy trình vận hành (SOP) theo từ khoá trong tiêu đề/nội dung — dùng khi câu hỏi về cách làm/quy trình thay vì về task.',
      parameters: {
        type: 'object',
        properties: {
          tu_khoa: { type: 'string', description: 'Từ khoá tìm kiếm, ví dụ "hoàn tiền", "đối soát".' }
        },
        required: ['tu_khoa']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'thong_tin_phase',
      description: 'Lấy % hoàn thành THẬT, tổng số task, và số ngày còn lại tới golive của 1 phase hoặc tất cả phase. LUÔN dùng tool này cho câu hỏi về % hoàn thành/tiến độ — KHÔNG tự ước tính % từ số lượng task của dem_task/liet_ke_task, con số đó không đủ để tính % (thiếu trạng thái từng task).',
      parameters: {
        type: 'object',
        properties: {
          phase_code: { type: 'string', description: 'Mã phase, ví dụ "P2". Bỏ trống để lấy tất cả phase.' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'task_qua_han',
      description: 'Lấy danh sách task ĐANG TRỄ HẠN THẬT (due date đã qua mà chưa Done), tính chính xác bằng ngày hôm nay — dùng cho câu hỏi về task trễ/quá hạn/deadline. KHÔNG dùng liet_ke_task rồi tự so sánh due_date với hôm nay — model không đủ tin cậy để tự làm phép so sánh ngày đó.',
      parameters: {
        type: 'object',
        properties: {
          sprint_code: { type: 'string', description: 'Mã sprint, ví dụ "S18", hoặc "hiện tại"/"tiếp theo". Bỏ trống để xét tất cả sprint.' },
          phase_code: { type: 'string', description: 'Mã phase, ví dụ "P2". Bỏ trống để xét tất cả phase.' }
        }
      }
    }
  }
];

async function toolSprintHienTai(pool) {
  const { rows } = await pool.query('SELECT id, code, start_date, end_date FROM sprints ORDER BY start_date');
  const sprints = rows.map((s) => ({ ...s, start_date: normalizeDate(s.start_date), end_date: normalizeDate(s.end_date) }));
  const { current, next } = pickCurrentAndNextSprint(sprints, getTodayVN());
  return {
    hom_nay: getTodayVN(),
    sprint_hien_tai: current ? { code: current.code, start_date: current.start_date, end_date: current.end_date } : null,
    sprint_ke_tiep: next ? { code: next.code, start_date: next.start_date, end_date: next.end_date } : null
  };
}

async function toolDemTask(pool, args) {
  const filters = await resolveTaskFilters(pool, args);
  if (filters.error) return { error: filters.error };
  const { rows } = await pool.query(`SELECT count(*)::int AS n FROM tasks t ${filters.where}`, filters.params);
  return { so_luong: rows[0].n, bo_loc_da_ap_dung: args };
}

async function toolLietKeTask(pool, args) {
  const filters = await resolveTaskFilters(pool, args);
  if (filters.error) return { error: filters.error };
  const { rows: countRows } = await pool.query(`SELECT count(*)::int AS n FROM tasks t ${filters.where}`, filters.params);
  const total = countRows[0].n;
  const { rows } = await pool.query(
    `SELECT t.name, t.category, t.platform, t.status, t.start_date, t.due_date, s.code AS sprint_code, p.code AS phase_code
     FROM tasks t LEFT JOIN sprints s ON s.id = t.sprint_id LEFT JOIN phases p ON p.id = t.phase_id
     ${filters.where} ORDER BY t.stt NULLS LAST, t.id LIMIT ${MAX_LIST_ROWS}`,
    filters.params
  );
  const tasks = rows.map((t) => ({
    ten: t.name, category: t.category, platform: t.platform, trang_thai: STATUS_LABELS[t.status] || t.status,
    sprint: t.sprint_code, phase: t.phase_code,
    start_date: normalizeDate(t.start_date), due_date: normalizeDate(t.due_date)
  }));
  return { tong_so_khop: total, so_dang_hien: tasks.length, bi_cat_bot: total > tasks.length, tasks };
}

async function toolTimSop(pool, args) {
  const keyword = (args.tu_khoa || '').trim();
  if (!keyword) return { error: 'tu_khoa không được để trống' };
  const { rows } = await pool.query(
    `SELECT group_name, category, title, steps, pic FROM sops
     WHERE title ILIKE $1 OR steps ILIKE $1 OR context ILIKE $1 OR group_name ILIKE $1
     ORDER BY group_name, category, id LIMIT 5`,
    [`%${keyword}%`]
  );
  return {
    so_ket_qua: rows.length,
    ket_qua: rows.map((s) => ({ nhom: s.group_name, danh_muc: s.category, tieu_de: s.title, pic: s.pic, cac_buoc: s.steps }))
  };
}

// reuses computePhaseRollup — the exact same function GET /api/phases uses
// for the Roadmap cards — rather than recomputing "% complete" a second,
// possibly-inconsistent way here. Born from a real failure: asked "Phase P2
// hoàn thành bao nhiêu %?", the model had only dem_task's raw count (81)
// to work with and guessed "54%" out of nowhere — the real figure (from
// this same rollup) was 42%. A task count alone can't yield a percentage
// (it says nothing about each task's status), so the fix is a tool that
// returns the real number, not a stronger prompt asking it to guess less.
async function toolThongTinPhase(pool, args) {
  const phaseFilter = args.phase_code ? String(args.phase_code).trim() : null;
  const { rows: phasesRaw } = await pool.query('SELECT id, code, name, target_date, updated_at FROM phases ORDER BY id');
  if (phaseFilter && !phasesRaw.some((p) => p.code === phaseFilter)) {
    return { error: `Không tìm thấy phase "${phaseFilter}".` };
  }
  const { rows: taskRows } = await pool.query('SELECT phase_id, status FROM tasks');
  const today = getTodayVN();
  const phases = phasesRaw
    .filter((p) => !phaseFilter || p.code === phaseFilter)
    .map((p) => {
      const normalized = { ...p, target_date: normalizeDate(p.target_date) };
      const phaseTasks = taskRows.filter((t) => t.phase_id === p.id);
      const rollup = computePhaseRollup(normalized, phaseTasks, today);
      return {
        ma: rollup.code,
        ten: rollup.name,
        tong_task: rollup.total,
        phan_tram_hoan_thanh: rollup.pct_complete,
        muc_tieu_golive: rollup.target_date,
        so_ngay_con_lai_toi_golive: rollup.days_remaining
      };
    });
  return { phases };
}

// real, observed failure mode: asked "task nào trễ hạn?", the model called
// liet_ke_task(status: "In Dev") — due dates all still in the future — and
// then just ASSERTED in its final text that they were overdue, no date
// comparison of any kind behind it. A 7B model doing "is 2026-09-25 before
// or after 2026-09-22" inline in a chat response isn't reliable enough to
// trust, so the comparison happens here in SQL instead, same reasoning as
// dem_task existing so the model never has to count text itself.
async function toolTaskQuaHan(pool, args) {
  const sprint = await resolveSprintId(pool, args.sprint_code);
  if (sprint.error) return { error: sprint.error };
  const phase = await resolvePhaseId(pool, args.phase_code);
  if (phase.error) return { error: phase.error };

  const today = getTodayVN();
  const params = [today];
  const conditions = [`t.due_date < $1`, `t.status != '5.done'`];
  if (sprint.id) { params.push(sprint.id); conditions.push(`t.sprint_id = $${params.length}`); }
  if (phase.id) { params.push(phase.id); conditions.push(`t.phase_id = $${params.length}`); }
  const where = `WHERE ${conditions.join(' AND ')}`;

  const { rows: countRows } = await pool.query(`SELECT count(*)::int AS n FROM tasks t ${where}`, params);
  const total = countRows[0].n;
  const { rows } = await pool.query(
    `SELECT t.name, t.status, t.due_date, s.code AS sprint_code, p.code AS phase_code
     FROM tasks t LEFT JOIN sprints s ON s.id = t.sprint_id LEFT JOIN phases p ON p.id = t.phase_id
     ${where} ORDER BY t.due_date LIMIT ${MAX_LIST_ROWS}`,
    params
  );
  const tasks = rows.map((t) => {
    const dueDate = normalizeDate(t.due_date);
    const soNgayQuaHan = Math.round((new Date(today) - new Date(dueDate)) / (24 * 60 * 60 * 1000));
    return {
      ten: t.name, trang_thai: STATUS_LABELS[t.status] || t.status, due_date: dueDate,
      so_ngay_qua_han: soNgayQuaHan, sprint: t.sprint_code, phase: t.phase_code
    };
  });
  return { tong_so_task_qua_han: total, so_dang_hien: tasks.length, bi_cat_bot: total > tasks.length, tasks };
}

// dispatch table keyed by the function name the model calls — every
// executor takes (pool, args) and returns a plain JSON-serializable object
// (never throws for expected "not found"/"invalid filter" cases, those
// come back as {error: "..."} so the model can see what went wrong and
// retry, same reasoning as GraphQL/tool-use APIs generally preferring a
// typed error field over a thrown exception the caller can't recover from).
const EXECUTORS = {
  sprint_hien_tai: (pool) => toolSprintHienTai(pool),
  dem_task: (pool, args) => toolDemTask(pool, args),
  liet_ke_task: (pool, args) => toolLietKeTask(pool, args),
  tim_sop: (pool, args) => toolTimSop(pool, args),
  thong_tin_phase: (pool, args) => toolThongTinPhase(pool, args),
  task_qua_han: (pool, args) => toolTaskQuaHan(pool, args)
};

async function executeTool(pool, name, args) {
  const fn = EXECUTORS[name];
  if (!fn) return { error: `Không có tool tên "${name}"` };
  try {
    return await fn(pool, args || {});
  } catch (err) {
    return { error: err.message || 'Lỗi không xác định khi chạy tool.' };
  }
}

module.exports = { TOOLS, executeTool };
