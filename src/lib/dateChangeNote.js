const MS_PER_DAY = 24 * 60 * 60 * 1000;

function fmtDMY(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function dayDelta(fromIso, toIso) {
  return Math.round((new Date(toIso) - new Date(fromIso)) / MS_PER_DAY);
}

function signed(n) {
  return (n > 0 ? '+' : '') + n;
}

// Builds a human-readable activity-log note describing a start_date/due_date
// change (before/after are { start_date, due_date } plain 'YYYY-MM-DD' strings),
// or returns null when neither date actually changed — callers should skip
// logging in that case rather than record a no-op note. actorName (who made
// the change) is optional and, when given, is inserted right after the
// "Đổi ngày" prefix — before the trailing "(+N ngày)" delta, so that pattern
// stays anchored to the end of the string for callers that parse it back out
// (see public/app.js's parseDateChangeNote). Every date change uses that one
// label; the body alone tells a whole-range shift ("a–b → c–d (+N ngày)")
// from a per-end change ("bắt đầu …, kết thúc …"). Rows written before that
// was unified say "Dịch ngày" for a shift — the migration rewrites them, and
// isDateChangeNote below accepts both either way.
const PREFIX = 'Đổi ngày';
function buildDateChangeNote(before, after, actorName) {
  const startChanged = before.start_date !== after.start_date;
  const dueChanged = before.due_date !== after.due_date;
  if (!startChanged && !dueChanged) return null;

  const who = actorName ? ` (${actorName})` : '';
  const startDelta = startChanged ? dayDelta(before.start_date, after.start_date) : 0;
  const dueDelta = dueChanged ? dayDelta(before.due_date, after.due_date) : 0;

  // both ends moved by the same amount — a plain shift of the whole range
  if (startChanged && dueChanged && startDelta === dueDelta) {
    return `${PREFIX}${who}: ${fmtDMY(before.start_date)}–${fmtDMY(before.due_date)} → ` +
      `${fmtDMY(after.start_date)}–${fmtDMY(after.due_date)} (${signed(startDelta)} ngày)`;
  }

  const parts = [];
  if (startChanged) {
    parts.push(`bắt đầu ${fmtDMY(before.start_date)} → ${fmtDMY(after.start_date)} (${signed(startDelta)} ngày)`);
  }
  if (dueChanged) {
    parts.push(`kết thúc ${fmtDMY(before.due_date)} → ${fmtDMY(after.due_date)} (${signed(dueDelta)} ngày)`);
  }
  return `${PREFIX}${who}: ${parts.join(', ')}`;
}

// mirrors public/app.js's own isDateChangeNote (no shared module system
// between client/server here) — used server-side to keep the auto-generated
// date-change audit trail immutable via the log-edit endpoint. Accepts the
// legacy "Dịch ngày" label too, so un-migrated rows stay protected.
function isDateChangeNote(note) {
  return /^(Dịch ngày|Đổi ngày)\b/.test(note);
}

module.exports = { buildDateChangeNote, isDateChangeNote };
