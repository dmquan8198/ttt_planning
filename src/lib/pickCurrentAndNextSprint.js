function pickCurrentAndNextSprint(sprints, todayISO) {
  const sorted = [...sprints].sort((a, b) => a.start_date.localeCompare(b.start_date));
  const currentIndex = sorted.findIndex((s) => s.start_date <= todayISO && todayISO <= s.end_date);

  if (currentIndex === -1) {
    const next = sorted.find((s) => s.start_date > todayISO) || null;
    return { current: null, next };
  }

  return {
    current: sorted[currentIndex],
    next: sorted[currentIndex + 1] || null
  };
}

module.exports = { pickCurrentAndNextSprint };
