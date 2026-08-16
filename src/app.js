const express = require('express');
const path = require('path');
const phasesRouter = require('./routes/phases');
const sprintsRouter = require('./routes/sprints');
const tasksRouter = require('./routes/tasks');
const logsRouter = require('./routes/logs');
const allLogsRouter = require('./routes/allLogs');
const authRouter = require('./routes/auth');
const usersRouter = require('./routes/users');
const aiAssessmentsRouter = require('./routes/aiAssessments');
const aiSuggestionsRouter = require('./routes/aiSuggestions');
const resourceRolesRouter = require('./routes/resourceRoles');
const { verifyGoogleToken } = require('./lib/googleAuth');
const { generateText } = require('./lib/geminiClient');

function decodeActorHeader(raw) {
  if (!raw) return null;
  try {
    return decodeURIComponent(raw).trim() || null;
  } catch (err) {
    return raw.trim() || null;
  }
}

function createApp(pool, googleTokenVerifier, geminiGenerateFn) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

  // whoever is signed in on the client sends two headers on every mutating
  // request: X-Actor-Name (their Google display name — free text, used
  // only to attribute activity-log entries) and X-Actor-Email (the email
  // Google verified at login — the actual identity key requireRole looks
  // up against the users table). No session/token beyond that — see
  // routes/auth.js for why. Both are percent-encoded client-side
  // (public/app.js's authFetch) since Node decodes headers as latin1,
  // which would otherwise mangle Vietnamese diacritics.
  app.use((req, res, next) => {
    req.actorName = decodeActorHeader(req.headers['x-actor-name']);
    req.actorEmail = decodeActorHeader(req.headers['x-actor-email']);
    next();
  });

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  // not secret — a Google OAuth Client ID is meant to be embedded in
  // client-side code — just kept in an env var instead of hardcoded so
  // local/dev/prod can each point at their own registered origin.
  app.get('/api/config', (req, res) => {
    res.json({ googleClientId: process.env.GOOGLE_CLIENT_ID || null });
  });

  app.use('/api', authRouter(pool, googleTokenVerifier || verifyGoogleToken));

  app.use('/api/phases', phasesRouter(pool));

  app.use('/api/sprints', sprintsRouter(pool));

  app.use('/api/tasks/:taskId/logs', logsRouter(pool));

  app.use('/api/logs', allLogsRouter(pool));

  app.use('/api/users', usersRouter(pool));

  app.use('/api/ai-assessments', aiAssessmentsRouter(pool, geminiGenerateFn || generateText));

  app.use('/api/ai-suggestions', aiSuggestionsRouter(geminiGenerateFn || generateText));

  app.use('/api/tasks', tasksRouter(pool));

  app.use('/api/resource-roles', resourceRolesRouter(pool));

  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

module.exports = createApp;
