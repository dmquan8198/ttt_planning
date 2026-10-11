const crypto = require('crypto');
const { Router } = require('express');
const { asyncHandler } = require('../lib/asyncHandler');
const { getTodayVN } = require('../lib/today');
const { collectWeeklyReport } = require('../lib/weeklyReportData');
const { buildWeeklyDeck } = require('../lib/weeklyReportDeck');

// constant-time compare via fixed-length hashes (same approach as basicAuth.js)
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

const PPTX_TYPE = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

function weeklyReportRouter(pool) {
  const router = Router();

  // Read by the Google Apps Script that turns the deck into a Google Slides
  // file (see docs/weekly-report/README.md) — machine-to-machine, so a shared
  // secret rather than requireRole, like /api/reminders/due. It has its OWN
  // secret (REPORT_SECRET): its holder can read the whole project's status.
  // Denied by default when the server has no secret configured.
  router.get('/weekly.pptx', asyncHandler(async (req, res) => {
    const secret = process.env.REPORT_SECRET;
    if (!secret) {
      return res.status(500).json({ error: 'REPORT_SECRET chưa được cấu hình trên server' });
    }
    if (!safeEqual(req.headers['x-report-secret'] || '', secret)) {
      return res.status(401).json({ error: 'Không có quyền' });
    }
    const today = req.query.today || getTodayVN();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) {
      return res.status(400).json({ error: 'today không hợp lệ (YYYY-MM-DD)' });
    }

    const report = await collectWeeklyReport(pool, today);
    const { buffer } = await buildWeeklyDeck(report);
    // the period rides in the file name (ASCII only — headers are latin1) so the
    // Apps Script can title the Slides file without parsing the deck
    res.set({
      'Content-Type': PPTX_TYPE,
      'Content-Disposition': `attachment; filename="bao-cao-tuan_${report.weekAgo}_${report.today}.pptx"`,
      'Cache-Control': 'no-store'
    });
    res.send(buffer);
  }));

  return router;
}

module.exports = weeklyReportRouter;
