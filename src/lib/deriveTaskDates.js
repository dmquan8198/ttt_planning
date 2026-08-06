function deriveTaskDates(task, sprint) {
  if (task.date_overridden) {
    return { start_date: task.start_date, due_date: task.due_date };
  }
  if (!sprint) {
    return { start_date: task.start_date, due_date: task.due_date };
  }
  return { start_date: sprint.start_date, due_date: sprint.end_date };
}

module.exports = { deriveTaskDates };
