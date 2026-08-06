// This app has a single-timezone audience (Vietnam, fixed UTC+7, no DST),
// regardless of what timezone the deployed server's OS clock actually runs in.
// `new Date().toISOString().slice(0, 10)` gives UTC's calendar date, which is
// up to a day behind Vietnam's between 00:00-07:00 local time. getTodayVN()
// shifts "now" by the fixed VN offset before taking the calendar date, so
// days_remaining and current/next sprint selection roll over at Vietnam
// midnight, not UTC midnight.
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

function getTodayVN() {
  return new Date(Date.now() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

module.exports = { getTodayVN };
