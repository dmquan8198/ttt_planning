// Stamps "this task was edited just now, by <actor>" — the data behind
// Danh sách nghiệp vụ's "Sửa lần cuối" column and its recent-edit highlight
// (see tasks.last_edited_at in migrations/001_init.sql). Call it from any
// route that changes something a person would call "an update to this task".
// NOT for pure re-ordering (stt, subtask order): those don't mean anything
// changed about the work itself.
async function touchTask(pool, taskId, actorName) {
  await pool.query(
    'UPDATE tasks SET last_edited_at=now(), last_edited_by=$2 WHERE id=$1',
    [taskId, actorName || null]
  );
}

module.exports = { touchTask };
