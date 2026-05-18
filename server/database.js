const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'arkalon.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const journalMode = db.pragma('journal_mode', { simple: true });
const foreignKeys = db.pragma('foreign_keys', { simple: true });
console.log(`[DB] WAL mode: ${journalMode} | Foreign keys: ${foreignKeys}`);

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'admin',
      avatar_initials TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      website TEXT,
      industry TEXT,
      employee_count INTEGER,
      annual_revenue REAL,
      phone TEXT,
      billing_street TEXT,
      billing_city TEXT,
      billing_state TEXT,
      billing_postcode TEXT,
      billing_country TEXT DEFAULT 'Australia',
      description TEXT,
      business_unit TEXT CHECK(business_unit IN ('ASC', 'Simply Seated', 'Both')),
      account_owner_id INTEGER REFERENCES users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
      salutation TEXT,
      first_name TEXT,
      last_name TEXT NOT NULL,
      title TEXT,
      email TEXT,
      phone TEXT,
      mobile TEXT,
      linkedin_url TEXT,
      department TEXT,
      business_unit TEXT CHECK(business_unit IN ('ASC', 'Simply Seated', 'Both')),
      contact_owner_id INTEGER REFERENCES users(id),
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      sku TEXT UNIQUE,
      description TEXT,
      unit_price REAL DEFAULT 0,
      unit_type TEXT CHECK(unit_type IN ('per month', 'per seat/month', 'per day', 'per item', 'per project', 'flat fee')),
      business_unit TEXT CHECK(business_unit IN ('ASC', 'Simply Seated', 'Both')),
      default_commission_pct REAL,
      is_recurring BOOLEAN DEFAULT 0,
      is_active BOOLEAN DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      salutation TEXT,
      first_name TEXT,
      last_name TEXT NOT NULL,
      title TEXT,
      company TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      mobile TEXT,
      website TEXT,
      industry TEXT,
      employee_count INTEGER,
      annual_revenue REAL,
      lead_source TEXT,
      lead_status TEXT DEFAULT 'New',
      business_unit TEXT CHECK(business_unit IN ('ASC', 'Simply Seated')),
      target_type TEXT CHECK(target_type IN ('Direct Customer', 'Partner', 'Referral')),
      description TEXT,
      warm_path TEXT,
      next_action TEXT,
      next_action_date DATE,
      last_contacted DATE,
      priority TEXT CHECK(priority IN ('P1 - Act Now', 'P2 - This Month', 'P3 - Pipeline', 'Parked')),
      converted BOOLEAN DEFAULT 0,
      converted_at DATETIME,
      converted_account_id INTEGER REFERENCES accounts(id),
      converted_contact_id INTEGER REFERENCES contacts(id),
      converted_deal_id INTEGER REFERENCES deals(id),
      lead_owner_id INTEGER REFERENCES users(id),
      street TEXT,
      city TEXT,
      state TEXT,
      postcode TEXT,
      country TEXT DEFAULT 'Australia',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS deals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deal_name TEXT NOT NULL,
      account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
      stage TEXT DEFAULT 'New',
      probability INTEGER DEFAULT 10,
      close_date DATE,
      lead_source TEXT,
      business_unit TEXT CHECK(business_unit IN ('ASC', 'Simply Seated')),
      deal_type TEXT CHECK(deal_type IN ('Direct Customer', 'Partner', 'Referral')),
      gross_total_value REAL DEFAULT 0,
      commission_percentage REAL,
      commission_amount REAL DEFAULT 0,
      contract_term_months INTEGER,
      total_contract_earnings REAL DEFAULT 0,
      weighted_value REAL DEFAULT 0,
      forecast_category TEXT CHECK(forecast_category IN ('Pipeline', 'Best Case', 'Commit', 'Closed Won', 'Omitted')),
      description TEXT,
      next_action TEXT,
      next_action_date DATE,
      deal_owner_id INTEGER REFERENCES users(id),
      converted_from_lead_id INTEGER REFERENCES leads(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS deal_contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      role TEXT DEFAULT 'Primary' CHECK(role IN ('Primary', 'Operations', 'Billing', 'Technical', 'Executive', 'Other')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(deal_id, contact_id)
    );

    CREATE TABLE IF NOT EXISTS deal_line_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
      product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
      product_name TEXT NOT NULL,
      sku TEXT,
      description TEXT,
      quantity REAL DEFAULT 1,
      unit_price REAL DEFAULT 0,
      unit_type TEXT,
      contract_term_months INTEGER,
      line_total REAL DEFAULT 0,
      commission_pct REAL,
      commission_amount REAL DEFAULT 0,
      is_recurring BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('Call', 'Meeting', 'Email', 'LinkedIn', 'Demo', 'Other')),
      subject TEXT NOT NULL,
      status TEXT DEFAULT 'Planned' CHECK(status IN ('Planned', 'Held', 'Not Held')),
      direction TEXT CHECK(direction IN ('Outbound', 'Inbound')),
      outcome TEXT,
      start_datetime DATETIME,
      end_datetime DATETIME,
      duration_minutes INTEGER,
      description TEXT,
      next_action TEXT,
      next_action_date DATE,
      lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
      contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
      account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
      deal_id INTEGER REFERENCES deals(id) ON DELETE SET NULL,
      business_unit TEXT CHECK(business_unit IN ('ASC', 'Simply Seated', 'Both')),
      activity_owner_id INTEGER REFERENCES users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject TEXT NOT NULL,
      status TEXT DEFAULT 'Not Started' CHECK(status IN ('Not Started', 'In Progress', 'Completed', 'Deferred', 'Waiting on Input')),
      priority TEXT DEFAULT 'Normal' CHECK(priority IN ('High', 'Normal', 'Low')),
      due_datetime DATETIME,
      is_all_day INTEGER DEFAULT 1,
      reminder_datetime DATETIME,
      description TEXT,
      lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
      contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
      account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
      deal_id INTEGER REFERENCES deals(id) ON DELETE SET NULL,
      business_unit TEXT CHECK(business_unit IN ('ASC', 'Simply Seated', 'Both')),
      task_owner_id INTEGER REFERENCES users(id),
      completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
      contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
      account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
      deal_id INTEGER REFERENCES deals(id) ON DELETE CASCADE,
      created_by_id INTEGER REFERENCES users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ai_ingest_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT,
      payload TEXT,
      record_type TEXT,
      record_id INTEGER,
      status TEXT DEFAULT 'success',
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  seedDefaultUser();
  seedDefaultProducts();

  console.log(`[DB] Database initialised: ${DB_PATH}`);
}

function seedDefaultUser() {
  const existing = db.prepare('SELECT id FROM users LIMIT 1').get();
  if (existing) return;

  const hash = bcrypt.hashSync('Arkalon2024!', 12);
  db.prepare(`
    INSERT INTO users (name, email, password_hash, role, avatar_initials)
    VALUES (?, ?, ?, ?, ?)
  `).run('Stuart Munro', 'stuart@arkalon.com.au', hash, 'admin', 'SM');

  console.log('[DB] Default user seeded: stuart@arkalon.com.au');
}

function seedDefaultProducts() {
  const existing = db.prepare('SELECT id FROM products LIMIT 1').get();
  if (existing) return;

  const insert = db.prepare(`
    INSERT INTO products (name, sku, unit_price, unit_type, business_unit, is_recurring, is_active)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `);

  const products = [
    ['ASC - Teams Recording Licence', 'ASC-REC-001', 33, 'per seat/month', 'ASC', 1],
    ['ASC - Legacy Import / Migration', 'ASC-IMP-001', 5000, 'per project', 'ASC', 0],
    ['ASC - Professional Services', 'ASC-PS-001', 1800, 'per day', 'ASC', 0],
    ['SS - Chair Hire (Chiavari)', 'SS-CHR-001', 0, 'per item', 'Simply Seated', 0],
    ['SS - Table Hire', 'SS-TBL-001', 0, 'per item', 'Simply Seated', 0],
    ['SS - Delivery & Setup', 'SS-DEL-001', 0, 'flat fee', 'Simply Seated', 0],
    ['SS - Styling Package', 'SS-STY-001', 0, 'flat fee', 'Simply Seated', 0],
  ];

  const seedMany = db.transaction((rows) => {
    for (const row of rows) insert.run(...row);
  });
  seedMany(products);

  console.log('[DB] Default products seeded (7 products)');
}

module.exports = { db, initDatabase };
