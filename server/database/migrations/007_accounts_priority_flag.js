const { pool } = require('../../database');

async function runMigration() {
  // This column now ships in the base schema; ADD COLUMN IF NOT EXISTS keeps
  // this a safe no-op on fresh databases and a real migration on older ones.
  await pool.query('ALTER TABLE accounts ADD COLUMN IF NOT EXISTS priority_flag BOOLEAN DEFAULT false');
}

module.exports = { runMigration };
