// subtasks have their OWN small pipeline — separate from the parent task's
// 6-stage one (see statusCodes.js) — since a subtask is meant to be a much
// lighter-weight checklist item, not a full task.
const SUBTASK_STATUSES = ['todo', 'wip', 'done'];

const SUBTASK_STATUS_LABELS = {
  todo: 'TODO',
  wip: 'WIP',
  done: 'Done'
};

module.exports = { SUBTASK_STATUSES, SUBTASK_STATUS_LABELS };
