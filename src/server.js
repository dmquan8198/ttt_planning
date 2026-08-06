require('dotenv').config();
const { Pool, types } = require('pg');
const createApp = require('./app');

// Return DATE columns (OID 1082) as plain 'YYYY-MM-DD' strings instead of
// letting node-postgres construct a local-midnight JS Date object — this
// sidesteps timezone-dependent day-shift bugs entirely, regardless of what
// timezone the deployed server runs in.
types.setTypeParser(1082, (val) => val);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

const app = createApp(pool);
const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`TTT Project Manager listening on port ${port}`);
});
