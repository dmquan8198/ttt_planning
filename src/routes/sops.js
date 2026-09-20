const { Router } = require('express');
const { asyncHandler } = require('../lib/asyncHandler');
const { requireRole } = require('../lib/requireRole');

// Quy trình vận hành (Operations/Ticket/Marketing SOP playbook) — a flat
// CRUD resource, no lookup tables of its own. group_name/category/pic are
// freeform text (same convention as tasks.category — the frontend offers
// existing values as suggestions, but never enforces membership in a
// fixed list here).
function sopsRouter(pool) {
  const router = Router();

  router.get('/', asyncHandler(async (req, res) => {
    const { rows } = await pool.query('SELECT * FROM sops ORDER BY group_name, category, id');
    res.json(rows);
  }));

  router.post('/', requireRole(pool, 'editor'), asyncHandler(async (req, res) => {
    const b = req.body;
    const groupName = (b.group_name || '').trim();
    const title = (b.title || '').trim();
    if (!groupName || !title) {
      return res.status(400).json({ error: 'group_name và title là bắt buộc' });
    }
    const { rows } = await pool.query(
      `INSERT INTO sops (group_name, category, title, context, steps, next_action, timing, duration, stakeholders, reference, pic)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        groupName, (b.category || '').trim() || null, title,
        (b.context || '').trim() || null, (b.steps || '').trim() || null, (b.next_action || '').trim() || null,
        (b.timing || '').trim() || null, (b.duration || '').trim() || null,
        (b.stakeholders || '').trim() || null, (b.reference || '').trim() || null,
        (b.pic || '').trim() || null
      ]
    );
    res.status(201).json(rows[0]);
  }));

  // full-replace, same PUT contract as /api/tasks/:id — the drawer sends
  // every field on every save, so a caller that omits one clears it.
  router.put('/:id', requireRole(pool, 'editor'), asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'id không hợp lệ' });
    }
    const b = req.body;
    const groupName = (b.group_name || '').trim();
    const title = (b.title || '').trim();
    if (!groupName || !title) {
      return res.status(400).json({ error: 'group_name và title là bắt buộc' });
    }
    const { rows } = await pool.query(
      `UPDATE sops SET
         group_name=$1, category=$2, title=$3, context=$4, steps=$5, next_action=$6,
         timing=$7, duration=$8, stakeholders=$9, reference=$10, pic=$11, updated_at=now()
       WHERE id=$12
       RETURNING *`,
      [
        groupName, (b.category || '').trim() || null, title,
        (b.context || '').trim() || null, (b.steps || '').trim() || null, (b.next_action || '').trim() || null,
        (b.timing || '').trim() || null, (b.duration || '').trim() || null,
        (b.stakeholders || '').trim() || null, (b.reference || '').trim() || null,
        (b.pic || '').trim() || null, id
      ]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'không tìm thấy quy trình' });
    }
    res.json(rows[0]);
  }));

  // editor-level, not admin — a wiki-style SOP entry is much lower-stakes
  // than deleting a tracked task, same reasoning as DELETE /subtasks/:id.
  router.delete('/:id', requireRole(pool, 'editor'), asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'id không hợp lệ' });
    }
    const { rowCount } = await pool.query('DELETE FROM sops WHERE id=$1', [id]);
    if (rowCount === 0) {
      return res.status(404).json({ error: 'không tìm thấy quy trình' });
    }
    res.status(204).end();
  }));

  return router;
}

module.exports = sopsRouter;
