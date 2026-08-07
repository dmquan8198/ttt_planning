const MS_PER_DAY = 24 * 60 * 60 * 1000;

function computePhaseRollup(phase, tasks, todayISO) {
  const total = tasks.length;
  const doneAnalyst = tasks.filter((t) => t.done_analyst).length;
  const doneDev = tasks.filter((t) => t.done_dev).length;
  const doneUat = tasks.filter((t) => t.done_uat).length;
  // pct_complete blends all 3 funnel stages evenly: (analyst+dev+uat done) / (total*3).
  // round to 1 decimal place: multiply by 1000 then divide by 10 (equivalent to Math.round(pct*10)/10)
  const pctComplete = total === 0 ? null : Math.round(((doneAnalyst + doneDev + doneUat) / (total * 3)) * 1000) / 10;
  const daysRemaining = Math.round(
    (new Date(phase.target_date) - new Date(todayISO)) / MS_PER_DAY
  );

  return {
    id: phase.id,
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
