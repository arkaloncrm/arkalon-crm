const database = require('../../database.js');
const db = database.db || database;

function runMigration() {
  const columns = db.pragma('table_info(products)').map(col => col.name);

  if (!columns.includes('category')) {
    db.prepare('ALTER TABLE products ADD COLUMN category TEXT').run();
    console.log('[Migration 006] Added products.category');
  }

  if (!columns.includes('notes')) {
    db.prepare('ALTER TABLE products ADD COLUMN notes TEXT').run();
    console.log('[Migration 006] Added products.notes');
  }
}

module.exports = { runMigration };
