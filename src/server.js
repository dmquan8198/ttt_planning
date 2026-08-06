require('dotenv').config();
const { Pool } = require('pg');
const createApp = require('./app');

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
