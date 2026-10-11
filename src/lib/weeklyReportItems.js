// Turns tasks + activity-log notes into what the weekly report says about each
// business item — where it stands, the next step, any blocker — and into short
// "themes" (groups of related items) for the timeline pages.
//
// The app has no explicit "blocker" field, so blockers are read from what the
// team already writes: log notes following the convention
//     Status: <where it stands>
//     Next action: <what happens next>
// plus "Đổi ngày" / "Lý do dời ngày" entries, falling back to signals in the data
// (overdue, rescheduled, waiting on someone, stale). Pure functions: the caller
// supplies tasks and logs.
const { STATUS_LABELS } = require('./statusCodes');

// plain words for readers who do not live in the tool (the boss)
const FRIENDLY = {
  '0.backlog': 'Chưa bắt đầu', '1.in_analyst': 'Đang phân tích', '2.ready_for_dev': 'Chờ dev', '3.in_test': 'Đang dev',
  '4.in_test_uat': 'Đang test', '5.ready_for_staging': 'Test xong, chờ lên', '6.done': 'Hoàn thành'
};
const SHORT = {
  '0.backlog': 'chưa bắt đầu', '1.in_analyst': 'phân tích', '2.ready_for_dev': 'chờ dev', '3.in_test': 'dev',
  '4.in_test_uat': 'test', '5.ready_for_staging': 'test xong', '6.done': 'xong'
};
const STAMP_COLUMN = {
  '1.in_analyst': 'in_analyst_at', '2.ready_for_dev': 'ready_for_dev_at', '3.in_test': 'in_test_at',
  '4.in_test_uat': 'in_test_uat_at', '5.ready_for_staging': 'ready_for_staging_at'
};
const DEFAULT_NEXT = {
  '0.backlog': 'Lên lịch phân tích',
  '1.in_analyst': 'Chốt phân tích, chuyển dev',
  '2.ready_for_dev': 'Bắt đầu dev',
  '3.in_test': 'Dev xong, chuyển test',
  '4.in_test_uat': 'Chốt kết quả test',
  '5.ready_for_staging': 'Lên môi trường chính thức'
};
const WAITING = /chờ|đợi|back lại|gửi lại|chưa (?:có|nhận|phản hồi|test)|phụ thuộc|pending/i;
const MS_DAY = 86400000;

const dayNum = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / MS_DAY;
const daysBetween = (fromIso, toIso) => Math.round(dayNum(toIso) - dayNum(fromIso));
const vnDate = (ts) => new Date(new Date(ts).getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);

// the app appends " — <actor name>" to the end of a note; notes sometimes start with a list dash
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

// tasks: [{ id, status, due_date, updated_at, <stage>_at }]
// logs: [{ task_id, note, created_at }]   (any order)
// → Map(task id → { now, next, blockers[] })   blockers is [] when nothing is known
function describeTasks({ tasks, logs, today }) {
  const byTask = new Map();
  logs.forEach((l) => {
    if (!byTask.has(l.task_id)) byTask.set(l.task_id, []);
    byTask.get(l.task_id).push({ ...parseNote(l.note), at: vnDate(l.created_at) });
  });
  byTask.forEach((list) => list.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)));

  const out = new Map();
  tasks.forEach((t) => {
    const list = byTask.get(t.id) || [];
    const lastStatus = list.find((l) => l.status);
    const lastNext = list.find((l) => l.next);
    const pushDays = list.filter((l) => l.pushDays !== 0 && daysBetween(l.at, today) <= 14).reduce((a, l) => a + l.pushDays, 0); // net: > 0 = date moved out
    const reason = (list.find((l) => l.reason && daysBetween(l.at, today) <= 14) || {}).reason || null;
    const stageSinceTs = t[STAMP_COLUMN[t.status]] || t.updated_at;
    const daysInStage = stageSinceTs ? Math.max(0, daysBetween(vnDate(stageSinceTs), today)) : null;
    const finished = t.status === '6.done' || t.status === '5.ready_for_staging';
    const overdueDays = !finished && t.due_date < today ? daysBetween(t.due_date, today) : 0;
    const staleDays = list.length ? daysBetween(list[0].at, today) : null;
    const waitingText = [lastStatus && lastStatus.status, lastNext && lastNext.next].filter(Boolean).find((s) => WAITING.test(s)) || null;
    const active = ['1.in_analyst', '2.ready_for_dev', '3.in_test', '4.in_test_uat'].includes(t.status);

    const blockers = [];
    if (overdueDays > 0) blockers.push(`Quá hạn ${overdueDays} ngày`);
    if (pushDays > 0 && !finished) blockers.push(`Dời lịch +${pushDays} ngày${reason ? `: ${cut(reason, 38)}` : ''}`);
    if (waitingText && !finished) blockers.push('Đang chờ phản hồi bên liên quan');
    if (active && staleDays !== null && staleDays >= 7) blockers.push(`Chưa có cập nhật ${staleDays} ngày`);
    else if (active && staleDays === null && daysInStage !== null && daysInStage >= 14) blockers.push(`Chưa có cập nhật, đã ${daysInStage} ngày ở bước này`);

    out.set(t.id, {
      now: lastStatus ? lastStatus.status : '',
      next: lastNext ? lastNext.next : (DEFAULT_NEXT[t.status] || ''),
      blockers: blockers.slice(0, 2)
    });
  });
  return out;
}

// ---------- themes: group related items under one label ----------
const STOP = new Set(['vào', 'về', 'của', 'cho', 'và', 'khi', 'từ', 'trong', 'bằng', 'với', 'các', 'một', 'để', 'theo', 'tại', 'luồng', 'user', 'new']);
const stripTag = (name) => name.replace(/^\s*(\[[^\]]+\]\s*)+/, '').trim();
const words = (name) => (stripTag(name).toLowerCase().match(/[\p{L}\p{N}]+/gu) || []);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// tasks: [{ name, status, ... }] → [{ label, count, tasks[], status }] biggest first.
// 1) items sharing a "Prefix - suffix" prefix, 2) items sharing a 2-3 word phrase (≥ 3 of them),
// 3) everything else on its own line.
function groupThemes(tasks) {
  const left = new Set(tasks);
  const groups = [];
  const take = (label, members) => { members.forEach((m) => left.delete(m)); groups.push({ label, count: members.length, tasks: members }); };

  const byPrefix = new Map();
  tasks.forEach((t) => {
    if (!t.name.includes(' - ')) return;
    const prefix = stripTag(t.name.split(' - ')[0]);
    if (!prefix) return;
    if (!byPrefix.has(prefix)) byPrefix.set(prefix, []);
    byPrefix.get(prefix).push(t);
  });
  byPrefix.forEach((members, prefix) => { if (members.length >= 2) take(prefix, members); });

  for (;;) {
    const counts = new Map();
    left.forEach((t) => {
      const w = words(t.name); const seen = new Set();
      for (let n = 3; n >= 2; n -= 1) {
        for (let i = 0; i + n <= w.length; i += 1) {
          const gram = w.slice(i, i + n);
          if (STOP.has(gram[0]) || STOP.has(gram[n - 1])) continue;
          seen.add(gram.join(' '));
        }
      }
      seen.forEach((g) => counts.set(g, (counts.get(g) || 0) + 1));
    });
    let best = null;
    counts.forEach((c, g) => {
      if (c < 3) return;
      const score = c * 10 + g.split(' ').length;
      if (!best || score > best.score) best = { g, c, score };
    });
    if (!best) break;
    take(cap(best.g), [...left].filter((t) => ` ${words(t.name).join(' ')} `.includes(` ${best.g} `)));
  }
  left.forEach((t) => groups.push({ label: stripTag(t.name) || t.name, count: 1, tasks: [t] }));

  const dominant = (list) => {
    const c = {}; list.forEach((t) => { c[t.status] = (c[t.status] || 0) + 1; });
    return Object.entries(c).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0];
  };
  groups.forEach((g) => { g.status = dominant(g.tasks); });
  groups.sort((a, b) => b.count - a.count || (a.status < b.status ? 1 : -1));
  return groups;
}

module.exports = { describeTasks, groupThemes, parseNote, cut, daysBetween, FRIENDLY, SHORT, STATUS_LABELS };
