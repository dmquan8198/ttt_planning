const { Router } = require('express');
const { computePhaseRollup } = require('../lib/phaseRollup');
const { asyncHandler } = require('../lib/asyncHandler');

function phasesRouter(pool) {
  const router = Router();

  router.get('/', asyncHandler(async (req, res) => {
    const { rows: phases } = await pool.query(
      'SELECT id, code, name, target_date FROM phases ORDER BY target_date'
    );
    const { rows: tasks } = await pool.query(
      'SELECT phase_id, done_analyst, done_dev, done_uat FROM tasks'
    );
    const today = new Date().toISOString().slice(0, 10);

    const result = phases.map((phase) => {
      const phaseTasks = tasks.filter((t) => t.phase_id === phase.id);
      return computePhaseRollup(phase, phaseTasks, today);
    });

    res.json(result);
  }));

  return router;
}

module.exports = phasesRouter;
