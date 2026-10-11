// Builds the weekly report deck from a JSON file made by weekly_report_data.js.
// Mostly for trying layout changes; the server builds the same deck on demand.
//
//   node scripts/weekly_report_data.js > report.json
//   node scripts/weekly_report_deck.js report.json weekly.pptx
const fs = require('fs');
const { buildWeeklyDeck } = require('../src/lib/weeklyReportDeck');

const [, , inPath, outPath = 'weekly-report.pptx'] = process.argv;
if (!inPath) { console.error('usage: node scripts/weekly_report_deck.js report.json [out.pptx]'); process.exit(1); }

buildWeeklyDeck(JSON.parse(fs.readFileSync(inPath, 'utf8'))).then(({ buffer, warnings }) => {
  fs.writeFileSync(outPath, buffer);
  console.log('wrote', outPath);
  if (warnings.length) console.log('FIT WARNINGS:\n' + warnings.join('\n'));
});
