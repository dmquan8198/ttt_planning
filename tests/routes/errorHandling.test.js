const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const { asyncHandler } = require('../../src/lib/asyncHandler');

// This mirrors the middleware order set up in src/app.js: routes first, then
// a final error-handling middleware. We build a small test-only app (rather
// than mounting a route on createApp()'s return value, which would land
// AFTER its error middleware in the stack and never be reached) to prove the
// asyncHandler + error-middleware pattern that tasks 8-11 will rely on.
function buildTestApp() {
  const app = express();

  app.get('/__test/boom', asyncHandler(async () => {
    throw new Error('boom');
  }));

  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

test('async handler errors are caught and return 500 JSON, not a crash/hang', async () => {
  const app = buildTestApp();

  const res = await request(app).get('/__test/boom');
  assert.equal(res.status, 500);
  assert.deepEqual(res.body, { error: 'Internal server error' });
});
