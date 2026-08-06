// pg (and pg-mem) return DATE columns as JS Date objects; API responses
// and internal date-string comparisons both need plain 'YYYY-MM-DD' strings.
function normalizeDate(value) {
  if (value == null) return value;
  // Only pg-mem (test-only) ever hands us an actual Date instance here — real pg
  // is configured (see src/server.js) to return DATE columns as plain strings
  // directly, avoiding timezone-dependent Date-object construction entirely.
  // pg-mem constructs DATE values at UTC midnight, so toISOString() is correct here.
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

module.exports = { normalizeDate };
