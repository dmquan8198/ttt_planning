// Read-only: prints the weekly-report numbers as JSON (debugging / dry runs).
// Goes over port 443 like dev:443 (the office network blocks 5432).
//
//   node scripts/weekly_report_data.js > report.json
//
// The server serves the finished deck itself at GET /api/reports/weekly.pptx
// (see src/routes/weeklyReport.js); this script is only for looking at the data.
require('dotenv').config({ quiet: true });
require('dns').setDefaultResultOrder('ipv4first');
const { Pool, neonConfig, types } = require('@neondatabase/serverless');
const ws = require('ws');
const { collectWeeklyReport } = require('../src/lib/weeklyReportData');

neonConfig.webSocketConstructor = ws;
types.setTypeParser(1082, (v) => v);

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 8000 });
  try {
    console.log(JSON.stringify(await collectWeeklyReport(pool, process.argv[2]), null, 1));
  } finally {
    await pool.end();
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
