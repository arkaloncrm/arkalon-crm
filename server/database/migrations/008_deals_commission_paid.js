const { pool } = require('../../database');

async function runMigration() {
  // These columns now ship in the base schema; ADD COLUMN IF NOT EXISTS keeps
  // this a safe no-op on fresh databases and a real migration on older ones.
  // Persisted paid/unpaid status per deal's commission — non-financial state,
  // never touched by the commission calculation. No backfill: every existing
  // deal correctly defaults to unpaid.
  await pool.query('ALTER TABLE deals ADD COLUMN IF NOT EXISTS commission_paid BOOLEAN NOT NULL DEFAULT false');
  await pool.query('ALTER TABLE deals ADD COLUMN IF NOT EXISTS commission_paid_at TIMESTAMP');
}

module.exports = { runMigration };
