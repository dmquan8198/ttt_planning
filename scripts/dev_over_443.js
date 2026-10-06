// Dev-only: run the app against the real Neon database over a WebSocket on
// port 443 instead of a direct Postgres connection on port 5432.
//
// Some networks (the office one) block outbound 5432, so `npm run dev` fails
// every API call with "connect ETIMEDOUT <neon ip>:5432" and no data loads.
// Port 443 is open there, and Neon's serverless driver speaks the same
// protocol through it — same database, same queries, same app.
//
//   npm run dev:443
//
// Not for production: Render connects directly (src/server.js), which is
// faster. Everything else is identical to src/server.js.
require('dotenv').config();
// try IPv4 first: on the office network the IPv6 addresses Neon resolves to
// are unreachable, and each one costs a connect timeout before a working
// address is tried — seconds on the very first request
require('dns').setDefaultResultOrder('ipv4first');
const { Pool, neonConfig, types } = require('@neondatabase/serverless');
const ws = require('ws');
const createApp = require('../src/app');

neonConfig.webSocketConstructor = ws;

// same as src/server.js: DATE columns stay plain 'YYYY-MM-DD' strings
types.setTypeParser(1082, (val) => val);

// That network also drops roughly a third of connections opened at the SAME
// moment — and a page load fires ~8 API calls at once. So: few connections
// (max 3) that are kept for minutes (idleTimeoutMillis) rather than opened per
// burst, a short connect timeout so a dropped one fails fast, and a retry on
// exactly that failure. "due to connection timeout" means no connection was
// ever established, so the query never reached the database and retrying it
// cannot run a statement twice.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 3,
  idleTimeoutMillis: 10 * 60 * 1000,
  connectionTimeoutMillis: 5000
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err && err.message ? err.message : err);
});

const query = pool.query.bind(pool);
pool.query = async (...args) => {
  for (let attempt = 1; ; attempt++) {
    try {
      return await query(...args);
    } catch (err) {
      if (attempt >= 4 || !/due to connection timeout/.test(String(err && err.message))) throw err;
    }
  }
};

const app = createApp(pool);
const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`TTT Project Manager listening on port ${port} (database over WebSocket :443)`);
});
