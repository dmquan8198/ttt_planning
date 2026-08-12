const { computePhaseRollup } = require('./phaseRollup');
const { STATUS_CODES } = require('./statusCodes');

// fixed definition of "at risk" / "due soon" for weekly snapshots, so a
// snapshot captured today stays comparable to one captured weeks ago even if
// the Roadmap page's threshold/window chips get toggled in between. Matches
// the Roadmap UI's own original defaults (Done UAT threshold, 7 days) —
// fixed here independent of whatever the UI's own chips currently default to.
const RISK_THRESHOLD = 3;
const DUE_SOON_WINDOW_DAYS = 7;

function addDaysIso(iso, days) {
  return new Date(new Date(iso).getTime() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function computeSnapshotData(phases, tasks, todayIso) {
  const phaseRollups = phases.map((phase) => {
    const phaseTasks = tasks.filter((t) => t.phase_id === phase.id);
    return computePhaseRollup(phase, phaseTasks, todayIso);
  });

  const dueSoonEndIso = addDaysIso(todayIso, DUE_SOON_WINDOW_DAYS);
  const riskCount = tasks.filter((t) =>
    STATUS_CODES.indexOf(t.status) < RISK_THRESHOLD && t.due_date < todayIso
  ).length;
  const dueSoonCount = tasks.filter((t) =>
    STATUS_CODES.indexOf(t.status) < RISK_THRESHOLD && t.due_date >= todayIso && t.due_date <= dueSoonEndIso
  ).length;

  return { phases: phaseRollups, risk_count: riskCount, due_soon_count: dueSoonCount };
}

module.exports = { computeSnapshotData, RISK_THRESHOLD, DUE_SOON_WINDOW_DAYS };
