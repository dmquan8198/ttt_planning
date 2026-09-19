const { STATUS_CODES } = require('./statusCodes');
const { pickCurrentAndNextSprint } = require('./pickCurrentAndNextSprint');

function round2(n) {
  return Math.round(n * 100) / 100;
}

// every status code is present even at 0 so a night with no tasks in
// '1.in_analyst' still has that key — downstream analysis (Excel/pandas)
// can rely on a fixed column set instead of handling missing keys.
function summarizeTasks(tasks) {
  const by_status = {};
  STATUS_CODES.forEach((code) => { by_status[code] = 0; });
  const by_category = {};
  tasks.forEach((t) => {
    by_status[t.status] = (by_status[t.status] || 0) + 1;
    by_category[t.category] = (by_category[t.category] || 0) + 1;
  });

  const total_tasks = tasks.length;
  const completed_tasks = by_status['5.done'] || 0;
  const completion_rate = total_tasks ? round2((completed_tasks / total_tasks) * 100) : 0;

  return { total_tasks, completed_tasks, completion_rate, by_status, by_category };
}

function summarizeSprint(sprint, tasks) {
  if (!sprint) return null;
  const sprintTasks = tasks.filter((t) => t.sprint_id === sprint.id);
  return {
    code: sprint.code,
    start_date: sprint.start_date,
    end_date: sprint.end_date,
    ...summarizeTasks(sprintTasks)
  };
}

function buildSnapshot(tasks, sprints, todayIso) {
  const { current, next } = pickCurrentAndNextSprint(sprints, todayIso);
  return {
    ...summarizeTasks(tasks),
    sprint_now: summarizeSprint(current, tasks),
    sprint_next: summarizeSprint(next, tasks)
  };
}

module.exports = { buildSnapshot, summarizeTasks };
