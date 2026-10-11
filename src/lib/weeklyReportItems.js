// Picks the business items worth a line in the weekly report and works out, for
// each one: where it stands now, the next step, and any blocker.
//
// The app has no explicit "blocker" field, so this reads what the team already
// writes: activity-log notes following the convention
//     Status: <where it stands>
//     Next action: <what happens next>
// plus "Đổi ngày" / "Lý do dời ngày" entries, and falls back to signals in the
// data itself (overdue, rescheduled, stale, waiting on someone). Pure functions —
// the caller supplies tasks and logs.
const { STATUS_LABELS } = require('./statusCodes');

const STAMP_COLUMN = {
  '1.in_analyst': 'in_analyst_at', '2.ready_for_dev': 'ready_for_dev_at', '3.in_test': 'in_test_at',
  '4.in_test_uat': 'in_test_uat_at', '5.ready_for_staging': 'ready_for_staging_at'
};
const DEFAULT_NEXT = {
  '0.backlog': 'Lên lịch phân tích',
  '1.in_analyst': 'Chốt phân tích → Ready for Dev',
  '2.ready_for_dev': 'Bắt đầu dev',
  '3.in_test': 'Hoàn tất dev → chuyển UAT',
  '4.in_test_uat': 'Chốt UAT → Done UAT',
  '5.ready_for_staging': 'Lên môi trường tiếp theo → Done'
};
const WAITING = /chờ|đợi|back lại|gửi lại|chưa (?:có|nhận|phản hồi|test)|phụ thuộc|pending/i;
const MS_DAY = 86400000;

const dayNum = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / MS_DAY;
const daysBetween = (fromIso, toIso) => Math.round(dayNum(toIso) - dayNum(fromIso));
const vnDate = (ts) => new Date(new Date(ts).getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);

// the app appends " — <actor name>" to the end of a note
const stripActor = (s) => String(s).replace(/\s+—\s+[^—\n]+$/, '').replace(/^[-–•]\s*/, '').trim();

// shorten at a word boundary, never mid-word
function cut(str, n) {
  const s = String(str).replace(/\s+/g, ' ').trim();
  return s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…';
}

function parseNote(note) {
  const text = String(note);
  const status = /(?:^|\n)\s*Status:\s*([^\n]*)/i.exec(text);
  const next = /(?:^|\n)\s*Next action:\s*([^\n]*)/i.exec(text);
  const reason = /(?:^|\n)\s*Lý do dời ngày:\s*([^\n]*)/i.exec(text);
  const push = /Đổi ngày\b[^\n]*?\(([+-]\d+) ngày\)/.exec(text);
  return {
    status: status ? stripActor(status[1]) : null,
    next: next ? stripActor(next[1]) : null,
    reason: reason ? stripActor(reason[1]) : null,
    pushDays: push ? Number(push[1]) : 0
  };
}

// tasks: [{ id, name, category, status, due_date, sprint (code), sprint_id, pic, updated_at, <stage>_at }]
// logs: [{ task_id, note, created_at }]   (any order)
// focusSprintIds: ids of the current + next sprint (items in them count for a little more)
function buildFocusItems({ tasks, logs, today, focusSprintIds = [], limit = 6 }) {
  const byTask = new Map();
  logs.forEach((l) => {
    if (!byTask.has(l.task_id)) byTask.set(l.task_id, []);
    byTask.get(l.task_id).push({ ...parseNote(l.note), at: vnDate(l.created_at) });
  });
  byTask.forEach((list) => list.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)));
  const focusSet = new Set(focusSprintIds);

  const candidates = [];
  tasks.forEach((t) => {
    if (t.status === '6.done' || t.status === '5.ready_for_staging') return;
    const list = byTask.get(t.id) || [];
    const lastNote = list.find((l) => l.status || l.next);
    const lastStatus = list.find((l) => l.status);
    const lastNext = list.find((l) => l.next);
    const recentPush = list.filter((l) => l.pushDays !== 0 && daysBetween(l.at, today) <= 14);
    const pushDays = recentPush.reduce((a, l) => a + l.pushDays, 0); // net: > 0 means the date moved out
    const reason = (list.find((l) => l.reason && daysBetween(l.at, today) <= 14) || {}).reason || null;
    const stageSinceTs = t[STAMP_COLUMN[t.status]] || t.updated_at;
    const stageSince = stageSinceTs ? vnDate(stageSinceTs) : null;
    const daysInStage = stageSince ? Math.max(0, daysBetween(stageSince, today)) : null;
    const overdueDays = t.due_date < today ? daysBetween(t.due_date, today) : 0;
    const dueIn = daysBetween(today, t.due_date);
    const staleDays = list.length ? daysBetween(list[0].at, today) : null;
    const waitingText = [lastStatus && lastStatus.status, lastNext && lastNext.next].filter(Boolean).find((s) => WAITING.test(s)) || null;
    const active = ['1.in_analyst', '2.ready_for_dev', '3.in_test', '4.in_test_uat'].includes(t.status);

    const blockers = [];
    if (overdueDays > 0) blockers.push(`Quá hạn ${overdueDays} ngày`);
    if (pushDays > 0) blockers.push(`Dời lịch +${pushDays} ngày${reason ? `: ${cut(reason, 38)}` : ''}`);
    if (waitingText) blockers.push('Đang chờ phản hồi bên liên quan');
    if (active && staleDays !== null && staleDays >= 7) blockers.push(`Chưa có cập nhật ${staleDays} ngày`);
    else if (active && staleDays === null && daysInStage !== null && daysInStage >= 14) blockers.push(`Chưa có log, ${daysInStage} ngày ở ${STATUS_LABELS[t.status]}`);

    let score = 0;
    if (overdueDays > 0) score += 3 + Math.min(overdueDays, 10) / 5;
    if (dueIn >= 0 && dueIn <= 7) score += 2;
    if (pushDays > 0) score += 2;
    if (waitingText) score += 2;
    if (staleDays !== null && staleDays <= 7) score += 1; // someone is actively working on it
    if (focusSet.has(t.sprint_id)) score += 1;
    if (score < 2) return;

    candidates.push({
      id: t.id, name: t.name, category: t.category, status: t.status, statusLabel: STATUS_LABELS[t.status],
      sprint: t.sprint || null, pic: t.pic || null, due: t.due_date, score,
      now: lastStatus ? lastStatus.status : (daysInStage !== null ? `${daysInStage} ngày ở ${STATUS_LABELS[t.status]}` : ''),
      next: lastNext ? lastNext.next : DEFAULT_NEXT[t.status],
      blockers, lastNoteAt: lastNote ? lastNote.at : null
    });
  });

  // fold siblings ("[SOF] Thanh toán bằng Túi - Donation / - VTS / ...") into one line
  const groups = new Map();
  candidates.forEach((c) => {
    const prefix = c.name.includes(' - ') ? c.name.split(' - ')[0].trim() : null;
    const key = prefix ? `${prefix}|${c.status}` : `#${c.id}`;
    if (!groups.has(key)) groups.set(key, { prefix, members: [] });
    groups.get(key).members.push(c);
  });
  const items = [];
  groups.forEach(({ prefix, members }) => {
    const lead = [...members].sort((a, b) => b.score - a.score)[0];
    if (members.length === 1 || !prefix) { items.push({ ...lead, count: 1, score: lead.score }); return; }
    const newest = [...members].sort((a, b) => String(b.lastNoteAt).localeCompare(String(a.lastNoteAt)))[0];
    const kinds = new Map();
    members.flatMap((m) => m.blockers).forEach((b) => {
      const kind = b.split(' ').slice(0, 2).join(' ');
      const have = kinds.get(kind);
      if (!have || (/\d+/.exec(b) && Number(/\d+/.exec(b)[0]) > Number((/\d+/.exec(have) || [0])[0]))) kinds.set(kind, b);
    });
    const blockers = [...kinds.values()].slice(0, 2);
    items.push({
      ...lead, name: prefix, count: members.length, score: lead.score + 0.3 * (members.length - 1),
      now: newest.now, next: newest.next, blockers,
      due: members.map((m) => m.due).sort()[0],
      detail: members.map((m) => m.name.split(' - ').slice(1).join(' - ')).join(', ')
    });
  });
  items.sort((a, b) => b.score - a.score || a.due.localeCompare(b.due));
  const perStage = {}; const picked = []; const rest = [];
  items.forEach((i) => {
    perStage[i.status] = (perStage[i.status] || 0) + 1;
    (picked.length < limit && perStage[i.status] <= 3 ? picked : rest).push(i);
  });
  rest.forEach((i) => { if (picked.length < limit) picked.push(i); });
  picked.sort((a, b) => b.score - a.score || a.due.localeCompare(b.due));
  return { items: picked.map((i) => ({ ...i, blockers: i.blockers.slice(0, 2) })), more: Math.max(0, items.length - picked.length) };
}

module.exports = { buildFocusItems, parseNote, cut, daysBetween };
