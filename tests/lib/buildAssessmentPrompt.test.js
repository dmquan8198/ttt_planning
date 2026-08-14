const test = require('node:test');
const assert = require('node:assert/strict');
const { buildAssessmentPrompt } = require('../../src/lib/buildAssessmentPrompt');

const PHASE = { id: 1, code: 'P1', name: 'Lived', target_date: '2026-09-01', updated_at: '2026-08-01T00:00:00.000Z' };
const SPRINT = { id: 1, code: 'S1', start_date: '2026-08-04', end_date: '2026-08-15' };

test('includes the requested markdown section headings', () => {
  const prompt = buildAssessmentPrompt({ phases: [PHASE], sprints: [SPRINT], tasks: [], todayIso: '2026-08-08' });
  assert.ok(prompt.includes('## Tổng quan'));
  assert.ok(prompt.includes('## Theo Tuần'));
  assert.ok(prompt.includes('## Theo Sprint'));
  assert.ok(prompt.includes('## Theo Phase'));
});

test('lists not-done tasks per phase and marks overdue ones', () => {
  const tasks = [
    { id: 1, name: 'Task overdue', category: 'Cat', platform: 'Web', status: '0.backlog', phase_id: 1, sprint_id: 1, due_date: '2026-08-01' },
    { id: 2, name: 'Task done', category: 'Cat', platform: 'Web', status: '4.done', phase_id: 1, sprint_id: 1, due_date: '2026-08-01' }
  ];
  const prompt = buildAssessmentPrompt({ phases: [PHASE], sprints: [SPRINT], tasks, todayIso: '2026-08-08' });
  assert.ok(prompt.includes('Task overdue'));
  assert.ok(prompt.includes('TRỄ HẠN'));
  // done task shouldn't show up in the "chưa xong" (not-done) list
  const phaseSection = prompt.split('== SPRINT ==')[0];
  assert.ok(!phaseSection.includes('Task done'));
});

test('caps the not-done task list per group and notes the remainder', () => {
  const tasks = Array.from({ length: 20 }, (_, i) => ({
    id: i, name: `Task ${i}`, category: 'Cat', platform: 'Web', status: '0.backlog',
    phase_id: 1, sprint_id: 1, due_date: '2026-08-20'
  }));
  const prompt = buildAssessmentPrompt({ phases: [PHASE], sprints: [SPRINT], tasks, todayIso: '2026-08-08' });
  assert.ok(prompt.includes('và 5 task khác chưa xong'));
});

test('never fabricates data beyond what was passed in — no tasks means an empty-state note, not invented tasks', () => {
  const prompt = buildAssessmentPrompt({ phases: [PHASE], sprints: [SPRINT], tasks: [], todayIso: '2026-08-08' });
  assert.ok(prompt.includes('không còn task nào chưa xong'));
});
