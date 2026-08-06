const express = require('express');
const path = require('path');
const phasesRouter = require('./routes/phases');

function createApp(pool) {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  app.use('/api/phases', phasesRouter(pool));

  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

module.exports = createApp;
