// Stands between the public internet (reached via a Tailscale Funnel on
// this machine) and the local Ollama server. Ollama itself has no
// authentication and a much wider API than this app needs (model
// pull/delete/list, etc.) — this bridge exposes exactly one route
// (generate), gated by a shared secret, so a leaked bridge URL can only
// ever be used to prompt the already-pulled model, never to manage Ollama
// or touch anything else on this machine.
//
// Run with: node scripts/ollama-bridge.js
// Then expose it (not the app, not Ollama directly):
//   tailscale funnel --bg --https=8443 8787
require('dotenv').config();
const express = require('express');

const PORT = process.env.BRIDGE_PORT || 8787;
const SECRET = process.env.OLLAMA_BRIDGE_SECRET;
const OLLAMA_LOCAL_URL = process.env.OLLAMA_LOCAL_URL || 'http://localhost:11434';

if (!SECRET) {
  console.error('OLLAMA_BRIDGE_SECRET chưa được cấu hình trong .env — dừng lại, không chạy bridge không có secret.');
  process.exit(1);
}

const app = express();
app.disable('x-powered-by');
app.use(express.json());

// two routes, both narrow passthroughs to Ollama's own equivalent endpoint:
// /api/generate for the plain-prompt path (geminiClient.js's shape) and
// /api/chat for the tool-calling loop (see chatbotTools.js + chatbot.js) —
// still exactly two verbs, no model-management surface exposed.
function proxyToOllama(path) {
  return async (req, res) => {
    if (req.headers['x-bridge-secret'] !== SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    let upstream;
    try {
      upstream = await fetch(`${OLLAMA_LOCAL_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body)
      });
    } catch (err) {
      return res.status(502).json({ error: 'Không gọi được Ollama nội bộ trên máy này.' });
    }

    const bodyText = await upstream.text();
    res.status(upstream.status).type('application/json').send(bodyText);
  };
}

app.post('/api/generate', proxyToOllama('/api/generate'));
app.post('/api/chat', proxyToOllama('/api/chat'));

app.listen(PORT, () => {
  console.log(`Ollama bridge listening on port ${PORT} (upstream: ${OLLAMA_LOCAL_URL})`);
});
