// Real Postgres reports a foreign-key violation with SQLSTATE code '23503'.
// pg-mem (test-only) raises the same violation but never populates `.code`
// for it, so we fall back to matching the (identical wording, both engines)
// "violates foreign key constraint" message text.
function isForeignKeyViolation(err) {
  return err.code === '23503' || /violates foreign key constraint/.test(err.message || '');
}

module.exports = { isForeignKeyViolation };
