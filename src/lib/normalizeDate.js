// pg (and pg-mem) return DATE columns as JS Date objects; API responses
// and internal date-string comparisons both need plain 'YYYY-MM-DD' strings.
function normalizeDate(value) {
  if (value == null) return value;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

module.exports = { normalizeDate };
