const MS_PER_DAY = 24 * 60 * 60 * 1000;

function computePhaseRollup(phase, tasks, todayISO) {
  const total = tasks.length;
  const doneAnalyst = tasks.filter((t) => t.done_analyst).length;
  // pct_complete mirrors the sheet's %NV column: analyst-completion only, not a dev/uat blend
  const doneDev = tasks.filter((t) => t.done_dev).length;
  const doneUat = tasks.filter((t) => t.done_uat).length;
  // round to 1 decimal place: multiply by 1000 then divide by 10 (equivalent to Math.round(pct*10)/10)
  const pctComplete = total === 0 ? null : Math.round((doneAnalyst / total) * 1000) / 10;
  const daysRemaining = Math.round(
    (new Date(phase.target_date) - new Date(todayISO)) / MS_PER_DAY
  );

  return {
    code: phase.code,
    name: phase.name,
    target_date: phase.target_date,
    total,
    done_analyst: doneAnalyst,
    done_dev: doneDev,
    done_uat: doneUat,
    pct_complete: pctComplete,
    days_remaining: daysRemaining
  };
}

module.exports = { computePhaseRollup };
