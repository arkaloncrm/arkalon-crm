const database = require('../../database.js');
const db = database.db || database;

function runMigration() {
  const columns = db.pragma('table_info(deals)').map(col => col.name);

  if (!columns.includes('monthly_recurring_revenue')) {
    db.prepare('ALTER TABLE deals ADD COLUMN monthly_recurring_revenue REAL DEFAULT 0').run();
    console.log('[Migration 004] Added deals.monthly_recurring_revenue');
  }

  if (!columns.includes('commission_override_amount')) {
    db.prepare('ALTER TABLE deals ADD COLUMN commission_override_amount REAL').run();
    console.log('[Migration 004] Added deals.commission_override_amount (nullable)');
  }

  const stageMappings = [
    { from: 'New',    to: 'Prospect' },
    { from: 'Quoted', to: 'Proposal Sent' },
    { from: 'Commit', to: 'Negotiation' },
  ];

  for (const { from, to } of stageMappings) {
    const affected = db.prepare('SELECT COUNT(*) AS count FROM deals WHERE stage = ?').get(from);
    if (affected && affected.count > 0) {
      db.prepare('UPDATE deals SET stage = ? WHERE stage = ?').run(to, from);
      console.log(`[Migration 004] Normalised ${affected.count} deal(s): stage '${from}' → '${to}'`);
    }
  }
}

module.exports = { runMigration };
