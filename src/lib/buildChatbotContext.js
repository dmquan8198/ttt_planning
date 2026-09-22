const { STATUS_LABELS } = require('./statusCodes');
const { SUBTASK_STATUS_LABELS } = require('./subtaskStatuses');

function fmtDMY(iso) {
  if (!iso) return '?';
  const [y, m, dd] = String(iso).slice(0, 10).split('-');
  return `${dd}/${m}/${y}`;
}

function formatSubtaskLine(st) {
  const bits = [SUBTASK_STATUS_LABELS[st.status] || st.status];
  if (st.pic) bits.push('PIC: ' + st.pic);
  if (st.start_date && st.due_date) bits.push(fmtDMY(st.start_date) + '→' + fmtDMY(st.due_date));
  return `    + Subtask "${st.name}" — ${bits.join(', ')}`;
}

function formatTaskBlock(t, phaseById, sprintById) {
  const phase = t.phase_id != null ? phaseById[t.phase_id] : null;
  const sprint = t.sprint_id != null ? sprintById[t.sprint_id] : null;
  const bits = [
    STATUS_LABELS[t.status] || t.status,
    fmtDMY(t.start_date) + '→' + fmtDMY(t.due_date)
  ];
  if (phase) bits.push('Phase ' + phase.code);
  if (sprint) bits.push('Sprint ' + sprint.code);
  const subtaskLines = (t.subtasks || []).map(formatSubtaskLine).join('\n');
  return `- [${t.category}/${t.platform}] "${t.name}" — ${bits.join(', ')}` + (subtaskLines ? '\n' + subtaskLines : '');
}

function formatSopBlock(s) {
  const lines = [`### [${s.group_name}${s.category ? '/' + s.category : ''}] ${s.title}`];
  if (s.timing || s.duration) lines.push(`Tần suất: ${s.timing || '?'}${s.duration ? ' (' + s.duration + ')' : ''}`);
  if (s.pic) lines.push(`PIC: ${s.pic}`);
  if (s.context) lines.push(`Bối cảnh: ${s.context}`);
  if (s.steps) lines.push(`Các bước thực hiện: ${s.steps}`);
  if (s.next_action) lines.push(`Đề xuất cải tiến: ${s.next_action}`);
  if (s.stakeholders) lines.push(`Stakeholders: ${s.stakeholders}`);
  if (s.reference) lines.push(`Tài liệu tham khảo: ${s.reference}`);
  return lines.join('\n');
}

// assembles every piece of the app's own data the chatbot is allowed to
// answer from (phases/sprints/tasks+subtasks/SOPs) into one plain-text
// block, handed to the LLM as grounding — the whole point being that the
// model has real data to quote from instead of "assessing" the project
// blind, same reasoning as buildAssessmentPrompt.
function buildChatbotContext({ phases, sprints, tasks, sops, todayIso }) {
  const phaseById = {};
  phases.forEach((p) => { phaseById[p.id] = p; });
  const sprintById = {};
  sprints.forEach((s) => { sprintById[s.id] = s; });

  const phaseLines = phases
    .slice()
    .sort((a, b) => (a.target_date < b.target_date ? -1 : 1))
    .map((p) => `- ${p.code}: ${p.name} — mốc golive ${fmtDMY(p.target_date)}, hoàn thành ${p.pct_complete != null ? Math.round(p.pct_complete) + '%' : 'chưa rõ'}`)
    .join('\n');

  const sprintLines = sprints
    .slice()
    .sort((a, b) => (a.start_date < b.start_date ? -1 : 1))
    .map((s) => `- ${s.code}: ${fmtDMY(s.start_date)}–${fmtDMY(s.end_date)}`)
    .join('\n');

  const taskLines = tasks.map((t) => formatTaskBlock(t, phaseById, sprintById)).join('\n');
  const sopLines = sops.map(formatSopBlock).join('\n\n');

  return (
    `Hôm nay: ${fmtDMY(todayIso)}\n\n` +
    `== PHASE ==\n${phaseLines || '(chưa có phase nào)'}\n\n` +
    `== SPRINT ==\n${sprintLines || '(chưa có sprint nào)'}\n\n` +
    `== NGHIỆP VỤ (TASK & SUBTASK) — tổng ${tasks.length} task ==\n${taskLines || '(chưa có task nào)'}\n\n` +
    `== QUY TRÌNH VẬN HÀNH (SOPs) — tổng ${sops.length} quy trình ==\n${sopLines || '(chưa có quy trình nào)'}\n`
  );
}

module.exports = { buildChatbotContext, fmtDMY };
