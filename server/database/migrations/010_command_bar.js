const { pool } = require('../../database');

async function runMigration() {
  // Phase 2B rails: every Command Bar write logs one row per changed field
  // (a creation gets one row with field NULL and new_value = a short JSON
  // summary). Idempotent on every startup.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS record_audit (
      id SERIAL PRIMARY KEY,
      entity_type TEXT NOT NULL,        -- 'deal' | 'contact' | 'task' | 'account' | 'activity' | 'note'
      entity_id INTEGER NOT NULL,
      field TEXT,                       -- e.g. 'stage', 'close_date'; NULL for creations
      old_value TEXT,
      new_value TEXT,
      source TEXT NOT NULL DEFAULT 'command_bar',
      user_id INTEGER,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_record_audit_entity ON record_audit (entity_type, entity_id)'
  );
}

module.exports = { runMigration };
