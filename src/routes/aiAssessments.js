const { Router } = require('express');
const { asyncHandler } = require('../lib/asyncHandler');
const { normalizeDate } = require('../lib/normalizeDate');
const { getTodayVN } = require('../lib/today');
const { buildAssessmentPrompt } = require('../lib/buildAssessmentPrompt');
const { requireRole } = require('../lib/requireRole');

async function loadAssessmentInputs(pool) {
  const { rows: phasesRaw } = await pool.query(
    'SELECT id, code, name, target_date, updated_at FROM phases ORDER BY target_date'
  );
  const phases = phasesRaw.map((p) => ({ ...p, target_date: normalizeDate(p.target_date) }));

  const { rows: sprintsRaw } = await pool.query(
    'SELECT id, code, start_date, end_date FROM sprints ORDER BY start_date'
  );
  const sprints = sprintsRaw.map((s) => ({
    ...s, start_date: normalizeDate(s.start_date), end_date: normalizeDate(s.end_date)
  }));

  const { rows: tasksRaw } = await pool.query(
    'SELECT id, name, category, platform, status, phase_id, sprint_id, due_date FROM tasks'
  );
  const tasks = tasksRaw.map((t) => ({ ...t, due_date: normalizeDate(t.due_date) }));

  return { phases, sprints, tasks };
}

// generateFn: (prompt: string) => Promise<string> — injected so tests never
// make a real network call to Gemini (mirrors createApp's googleTokenVerifier
// DI param in src/app.js).
function aiAssessmentsRouter(pool, generateFn) {
  const router = Router();

  // no role gate: generating costs nothing but an LLM call and writes
  // nothing to the DB, so any signed-in viewer can try it (compute-only,
  // no persistence, open to all).
  router.post('/generate', asyncHandler(async (req, res) => {
    const { phases, sprints, tasks } = await loadAssessmentInputs(pool);
    const prompt = buildAssessmentPrompt({ phases, sprints, tasks, todayIso: getTodayVN() });
    let content;
    try {
      content = await generateFn(prompt);
    } catch (err) {
      return res.status(502).json({ error: err.message || 'Không gọi được LLM.' });
    }
    res.json({ content, generated_at: new Date().toISOString() });
  }));

  router.get('/', asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      'SELECT id, content, actor_name, created_at FROM ai_assessments ORDER BY created_at DESC'
    );
    res.json(rows);
  }));

  router.post('/', requireRole(pool, 'editor'), asyncHandler(async (req, res) => {
    const content = (req.body.content || '').trim();
    if (!content) {
      return res.status(400).json({ error: 'content không được để trống' });
    }
    const { rows } = await pool.query(
      'INSERT INTO ai_assessments (content, actor_name) VALUES ($1, $2) RETURNING id, content, actor_name, created_at',
      [content, req.actorName || null]
    );
    res.status(201).json(rows[0]);
  }));

  router.delete('/:id', requireRole(pool, 'admin'), asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'id không hợp lệ' });
    }
    const { rowCount } = await pool.query('DELETE FROM ai_assessments WHERE id=$1', [id]);
    if (rowCount === 0) {
      return res.status(404).json({ error: 'không tìm thấy đánh giá' });
    }
    res.status(204).end();
  }));

  return router;
}

module.exports = aiAssessmentsRouter;
