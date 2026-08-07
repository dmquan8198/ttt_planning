const express = require('express');
const path = require('path');
const phasesRouter = require('./routes/phases');
const sprintsRouter = require('./routes/sprints');
const tasksRouter = require('./routes/tasks');
const logsRouter = require('./routes/logs');
const allLogsRouter = require('./routes/allLogs');
const authRouter = require('./routes/auth');

function createApp(pool) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

  // whoever is signed in on the client sends their name on every mutating
  // request via this header; route handlers read req.actorName to attribute
  // activity-log entries. No session/token — see routes/auth.js for why.
  // The header is percent-encoded client-side (public/app.js's authFetch)
  // since Node decodes headers as latin1, which would otherwise mangle
  // Vietnamese diacritics.
  app.use((req, res, next) => {
    const raw = req.headers['x-actor-name'];
    let name = null;
    if (raw) {
      try {
        name = decodeURIComponent(raw).trim() || null;
      } catch (err) {
        name = raw.trim() || null;
      }
    }
    req.actorName = name;
    next();
  });

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  app.use('/api', authRouter());

  app.use('/api/phases', phasesRouter(pool));

  app.use('/api/sprints', sprintsRouter(pool));

  app.use('/api/tasks/:taskId/logs', logsRouter(pool));

  app.use('/api/logs', allLogsRouter(pool));

  app.use('/api/tasks', tasksRouter(pool));

  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

module.exports = createApp;
