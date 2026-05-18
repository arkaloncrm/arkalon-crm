const { pool } = require('../../database');

async function runMigration() {
  // These columns now ship in the base schema; ADD COLUMN IF NOT EXISTS keeps
  // this a safe no-op on fresh databases and a real migration on older ones.
  await pool.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS category TEXT');
  await pool.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS notes TEXT');
}

module.exports = { runMigration };
