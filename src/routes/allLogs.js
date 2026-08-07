const { Router } = require('express');
const { asyncHandler } = require('../lib/asyncHandler');

function allLogsRouter(pool) {
  const router = Router();

  router.get('/', asyncHandler(async (req, res) => {
    const { rows } = await pool.query(`
      SELECT l.id, l.task_id, l.note, l.created_at, t.name AS task_name
      FROM activity_logs l
      JOIN tasks t ON t.id = l.task_id
      ORDER BY l.created_at DESC
    `);
    res.json(rows);
  }));

  return router;
}

module.exports = allLogsRouter;
