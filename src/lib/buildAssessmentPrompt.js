const { computePhaseRollup } = require('./phaseRollup');
const { STATUS_CODES, STATUS_LABELS } = require('./statusCodes');

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const NOT_DONE_LIST_CAP = 15;
const WEEKS_BEFORE = 2;
const WEEKS_AFTER = 3;

function addDaysIso(iso, days) {
  return new Date(new Date(iso).getTime() + days * MS_PER_DAY).toISOString().slice(0, 10);
}

// Monday of the ISO week containing `iso` (getDay(): 0=Sun..6=Sat).
function weekStartIso(iso) {
  const d = new Date(iso);
  const dow = d.getUTCDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  return addDaysIso(iso, diff);
}

function fmtDMY(iso) {
  const [y, m, dd] = iso.split('-');
  return `${dd}/${m}/${y}`;
}

function statusLabel(status) {
  return STATUS_LABELS[status] || status;
}

function formatTaskLine(t, todayIso) {
  const overdue = t.status !== '4.done' && t.due_date < todayIso ? ' — TRỄ HẠN' : '';
  return `  - ${t.name} [${t.category}/${t.platform}] — ${statusLabel(t.status)}, due ${fmtDMY(t.due_date)}${overdue}`;
}

function formatNotDoneList(tasks, todayIso) {
  const notDone = tasks.filter((t) => t.status !== '4.done');
  if (notDone.length === 0) return '  (không còn task nào chưa xong)';
  const shown = notDone.slice(0, NOT_DONE_LIST_CAP).map((t) => formatTaskLine(t, todayIso));
  const rest = notDone.length - NOT_DONE_LIST_CAP;
  if (rest > 0) shown.push(`  ... và ${rest} task khác chưa xong`);
  return shown.join('\n');
}

// builds the structured data + Vietnamese prompt text sent to the LLM.
// Deliberately hands the model real numbers/task lists rather than asking
// it to "assess the project" blind, so the assessment is grounded in
// actual data instead of a plausible-sounding hallucination.
function buildAssessmentPrompt({ phases, sprints, tasks, todayIso }) {
  const byStatus = STATUS_CODES.map(
    (code) => `${statusLabel(code)}: ${tasks.filter((t) => t.status === code).length}`
  ).join(', ');

  const phaseBlocks = phases
    .slice()
    .sort((a, b) => (a.target_date < b.target_date ? -1 : 1))
    .map((phase) => {
      const phaseTasks = tasks.filter((t) => t.phase_id === phase.id);
      const rollup = computePhaseRollup(phase, phaseTasks, todayIso);
      return (
        `### Phase ${rollup.code}: ${rollup.name} (mốc golive ${fmtDMY(rollup.target_date)}, ` +
        `còn ${rollup.days_remaining} ngày)\n` +
        `Tổng ${rollup.total} task — Done Analyst ${rollup.done_analyst}/${rollup.total}, ` +
        `Done Dev/QC ${rollup.done_dev_qc}/${rollup.total}, Golive ${rollup.golive}/${rollup.total}\n` +
        `Task chưa xong:\n${formatNotDoneList(phaseTasks, todayIso)}`
      );
    })
    .join('\n\n');

  const sprintBlocks = sprints
    .slice()
    .sort((a, b) => (a.start_date < b.start_date ? -1 : 1))
    .map((sprint) => {
      const sprintTasks = tasks.filter((t) => t.sprint_id === sprint.id);
      const doneCount = sprintTasks.filter((t) => t.status === '4.done').length;
      const when = sprint.end_date < todayIso ? 'đã qua' : sprint.start_date > todayIso ? 'sắp tới' : 'đang chạy';
      return (
        `### Sprint ${sprint.code} (${fmtDMY(sprint.start_date)}–${fmtDMY(sprint.end_date)}, ${when})\n` +
        `Tổng ${sprintTasks.length} task, Done ${doneCount}/${sprintTasks.length}\n` +
        `Task chưa xong:\n${formatNotDoneList(sprintTasks, todayIso)}`
      );
    })
    .join('\n\n');

  const currentWeekStart = weekStartIso(todayIso);
  const weekBlocks = [];
  for (let i = -WEEKS_BEFORE; i <= WEEKS_AFTER; i++) {
    const start = addDaysIso(currentWeekStart, i * 7);
    const end = addDaysIso(start, 6);
    const weekTasks = tasks.filter((t) => t.due_date >= start && t.due_date <= end);
    const doneCount = weekTasks.filter((t) => t.status === '4.done').length;
    const label = i === 0 ? ' (tuần này)' : i < 0 ? ' (đã qua)' : '';
    weekBlocks.push(
      `### Tuần ${fmtDMY(start)}–${fmtDMY(end)}${label}\n` +
        `Due trong tuần: ${weekTasks.length} task, Done ${doneCount}/${weekTasks.length}\n` +
        `Task chưa xong:\n${formatNotDoneList(weekTasks, todayIso)}`
    );
  }

  const prompt =
    `Bạn là trợ lý PM đánh giá tiến độ dự án "Túi Thần Tài" (tích hợp ví điện tử/ngân hàng, ` +
    `các bên liên quan TVAM/VCB/MoMo). Dựa CHÍNH XÁC trên dữ liệu bên dưới (không bịa thêm số liệu), ` +
    `hãy viết một bản đánh giá tổng quan bằng tiếng Việt, giọng văn ngắn gọn, súc tích, dùng bullet point, ` +
    `nêu rõ điểm đang tốt, điểm đang trễ/rủi ro, và đề xuất hành động cụ thể.\n\n` +
    `Trình bày đúng theo cấu trúc markdown sau, với đúng 3 heading này:\n` +
    `## Tổng quan\n(1 đoạn ngắn 2-3 câu tóm tắt sức khỏe chung của dự án)\n\n` +
    `## Theo Tuần\n(nhận xét về nhịp độ hoàn thành theo từng tuần, tuần nào đang chậm/trễ)\n\n` +
    `## Theo Sprint\n(nhận xét từng sprint đang chạy/sắp tới, sprint nào có nguy cơ không kịp)\n\n` +
    `## Theo Phase\n(nhận xét tiến độ từng phase so với mốc golive, phase nào rủi ro nhất)\n\n` +
    `--- DỮ LIỆU ---\n` +
    `Hôm nay: ${fmtDMY(todayIso)}\n` +
    `Tổng số task: ${tasks.length} (${byStatus})\n\n` +
    `== PHASE ==\n${phaseBlocks}\n\n` +
    `== SPRINT ==\n${sprintBlocks}\n\n` +
    `== TUẦN ==\n${weekBlocks.join('\n\n')}\n`;

  return prompt;
}

module.exports = { buildAssessmentPrompt };
