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
// logging in that case rather than record a no-op note.
function buildDateChangeNote(before, after) {
  const startChanged = before.start_date !== after.start_date;
  const dueChanged = before.due_date !== after.due_date;
  if (!startChanged && !dueChanged) return null;

  const startDelta = startChanged ? dayDelta(before.start_date, after.start_date) : 0;
  const dueDelta = dueChanged ? dayDelta(before.due_date, after.due_date) : 0;

  // both ends moved by the same amount — a plain shift of the whole range
  if (startChanged && dueChanged && startDelta === dueDelta) {
    return `Dịch ngày: ${fmtDMY(before.start_date)}–${fmtDMY(before.due_date)} → ` +
      `${fmtDMY(after.start_date)}–${fmtDMY(after.due_date)} (${signed(startDelta)} ngày)`;
  }

  const parts = [];
  if (startChanged) {
    parts.push(`bắt đầu ${fmtDMY(before.start_date)} → ${fmtDMY(after.start_date)} (${signed(startDelta)} ngày)`);
  }
  if (dueChanged) {
    parts.push(`kết thúc ${fmtDMY(before.due_date)} → ${fmtDMY(after.due_date)} (${signed(dueDelta)} ngày)`);
  }
  return `Đổi ngày: ${parts.join(', ')}`;
}

module.exports = { buildDateChangeNote };
