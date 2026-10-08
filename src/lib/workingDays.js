// Working days = Monday to Friday. Public holidays are NOT modelled (the app
// has no holiday calendar), so a holiday counts as a working day here.
//
// Dates are plain 'YYYY-MM-DD' strings, handled at UTC midnight so the result
// never depends on the server's timezone.

function isWeekend(iso) {
  const dow = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return dow === 0 || dow === 6;
}

// how many working days lie in (fromIso, toIso] — i.e. "how many working
// days from now until it is due": due tomorrow (a weekday) = 1; due Monday
// when today is Friday = 1; due Saturday when today is Thursday = 1 (the
// weekend adds nothing, so a weekend due date counts like the Friday before
// it). 0 when toIso is today or already past. Stops counting at `cap` so a
// due date years away costs nothing.
function workingDaysUntil(fromIso, toIso, cap = 60) {
  if (toIso <= fromIso) return 0;
  const day = new Date(`${fromIso}T00:00:00Z`);
  const end = new Date(`${toIso}T00:00:00Z`);
  let count = 0;
  while (day < end && count < cap) {
    day.setUTCDate(day.getUTCDate() + 1);
    const dow = day.getUTCDay();
    if (dow !== 0 && dow !== 6) count += 1;
  }
  return count;
}

module.exports = { isWeekend, workingDaysUntil };
