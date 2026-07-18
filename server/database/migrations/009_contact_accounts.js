const { pool } = require('../../database');

async function runMigration() {
  // Junction table so one contact can sit under multiple accounts — the primary
  // employer stays on contacts.account_id (unchanged everywhere else); rows here
  // are additional links, e.g. the exhibition event account a contact was met at.
  // Mirrors the deal_contacts junction pattern. Idempotent on every startup.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contact_accounts (
      id SERIAL PRIMARY KEY,
      contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      relationship TEXT DEFAULT 'event',
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE (contact_id, account_id)
    )
  `);
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_contact_accounts_account ON contact_accounts(account_id)'
  );
}

module.exports = { runMigration };
