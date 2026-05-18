const { pool, P } = require('../../database');

async function runMigration() {
  // These columns now ship in the base schema; ADD COLUMN IF NOT EXISTS keeps
  // this a safe no-op on fresh databases and a real migration on older ones.
  await pool.query('ALTER TABLE deals ADD COLUMN IF NOT EXISTS monthly_recurring_revenue NUMERIC(15,2) DEFAULT 0');
  await pool.query('ALTER TABLE deals ADD COLUMN IF NOT EXISTS commission_override_amount NUMERIC(15,2)');

  const stageMappings = [
    { from: 'New',    to: 'Prospect' },
    { from: 'Quoted', to: 'Proposal Sent' },
    { from: 'Commit', to: 'Negotiation' },
  ];

  for (const { from, to } of stageMappings) {
    const { rowCount } = await pool.query(
      P('UPDATE deals SET stage = ? WHERE stage = ?'),
      [to, from]
    );
    if (rowCount > 0) {
      console.log(`[Migration 004] Normalised ${rowCount} deal(s): stage '${from}' -> '${to}'`);
    }
  }
}

module.exports = { runMigration };
