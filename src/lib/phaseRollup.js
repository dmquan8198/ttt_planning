const { STATUS_CODES } = require('./statusCodes');

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function statusAtLeast(status, minCode) {
  return STATUS_CODES.indexOf(status) >= STATUS_CODES.indexOf(minCode);
}

// each count is cumulative ("reached at least this stage"), not an exact
// match — a task sitting at Done has necessarily also passed Done UAT and
// Ready for Dev, so it counts toward all three, same as the old
// done_analyst/done_dev/done_uat boolean flags did (each stayed true once
// set, regardless of the task's later Kanban status).
function computePhaseRollup(phase, tasks, todayISO) {
  const total = tasks.length;
  const doneAnalyst = tasks.filter((t) => statusAtLeast(t.status, '1.ready_for_dev')).length;
  const doneDevQc = tasks.filter((t) => statusAtLeast(t.status, '3.ready_for_staging')).length;
  const golive = tasks.filter((t) => statusAtLeast(t.status, '4.done')).length;
  // headline %: how far the phase is toward Done UAT — the default group-by
  // on the Roadmap. round to 1 decimal place.
  const pctComplete = total === 0 ? null : Math.round((doneDevQc / total) * 1000) / 10;
  const daysRemaining = Math.round(
    (new Date(phase.target_date) - new Date(todayISO)) / MS_PER_DAY
  );

  return {
    id: phase.id,
    code: phase.code,
    name: phase.name,
    target_date: phase.target_date,
    updated_at: phase.updated_at,
    total,
    done_analyst: doneAnalyst,
    done_dev_qc: doneDevQc,
    golive,
    pct_complete: pctComplete,
    days_remaining: daysRemaining
  };
}

module.exports = { computePhaseRollup };
