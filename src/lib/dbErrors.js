// Real Postgres reports a foreign-key violation with SQLSTATE code '23503'.
// pg-mem (test-only) raises the same violation but never populates `.code`
// for it, so we fall back to matching the (identical wording, both engines)
// "violates foreign key constraint" message text.
function isForeignKeyViolation(err) {
  return err.code === '23503' || /violates foreign key constraint/.test(err.message || '');
}

// same real-Postgres-vs-pg-mem caveat as isForeignKeyViolation above:
// SQLSTATE '23505' on real Postgres, message-text fallback for pg-mem.
function isUniqueViolation(err) {
  return err.code === '23505' || /duplicate key value violates unique constraint/.test(err.message || '');
}

module.exports = { isForeignKeyViolation, isUniqueViolation };
