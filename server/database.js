const { Pool, types } = require('pg');
const bcrypt = require('bcryptjs');

// --- Result type parsers ----------------------------------------------------
// better-sqlite3 returned dates/timestamps as plain strings and REAL/INTEGER
// values as JS numbers. node-postgres defaults differ (Date objects for
// timestamps, NUMERIC as string, bigint as string). Override the parsers so
// query results keep the exact shape the route code and React client expect.
types.setTypeParser(1082, (v) => v);                                     // date        -> 'YYYY-MM-DD'
types.setTypeParser(1114, (v) => v);                                     // timestamp   -> 'YYYY-MM-DD HH:MM:SS'
types.setTypeParser(1184, (v) => v);                                     // timestamptz -> string
types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));   // numeric     -> number
types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));   // bigint/COUNT -> number

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Force every connection to UTC so NOW() defaults and timestamp comparisons
// stay aligned with the UTC strings the Luxon date helpers produce.
pool.on('connect', (client) => {
  client.query("SET TIME ZONE 'UTC'");
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected idle client error:', err.message);
});

// P() rewrites '?' placeholders into PostgreSQL's $1, $2, ... positional form,
// keeping route SQL readable and parameter arrays 1:1 with the placeholders.
function P(sql) {
  let n = 0;
  return sql.replace(/\?/g, () => `$${++n}`);
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'admin',
    avatar_initials TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    last_login TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS accounts (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    website TEXT,
    industry TEXT,
    employee_count INTEGER,
    annual_revenue NUMERIC(15,2),
    phone TEXT,
    billing_street TEXT,
    billing_city TEXT,
    billing_state TEXT,
    billing_postcode TEXT,
    billing_country TEXT DEFAULT 'Australia',
    description TEXT,
    business_unit TEXT CHECK(business_unit IN ('ASC', 'Simply Seated', 'Both')),
    account_owner_id INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS contacts (
    id SERIAL PRIMARY KEY,
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
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    sku TEXT UNIQUE,
    description TEXT,
    unit_price NUMERIC(15,2) DEFAULT 0,
    unit_type TEXT CHECK(unit_type IN ('per month', 'per seat/month', 'per day', 'per item', 'per project', 'flat fee')),
    business_unit TEXT CHECK(business_unit IN ('ASC', 'Simply Seated', 'Both')),
    default_commission_pct NUMERIC(15,2),
    is_recurring SMALLINT DEFAULT 0,
    is_active SMALLINT DEFAULT 1,
    category TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS leads (
    id SERIAL PRIMARY KEY,
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
    annual_revenue NUMERIC(15,2),
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
    converted SMALLINT DEFAULT 0,
    converted_at TIMESTAMP,
    converted_account_id INTEGER REFERENCES accounts(id),
    converted_contact_id INTEGER REFERENCES contacts(id),
    converted_deal_id INTEGER,
    lead_owner_id INTEGER REFERENCES users(id),
    street TEXT,
    city TEXT,
    state TEXT,
    postcode TEXT,
    country TEXT DEFAULT 'Australia',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS deals (
    id SERIAL PRIMARY KEY,
    deal_name TEXT NOT NULL,
    account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
    stage TEXT DEFAULT 'New',
    probability INTEGER DEFAULT 10,
    close_date DATE,
    lead_source TEXT,
    business_unit TEXT CHECK(business_unit IN ('ASC', 'Simply Seated')),
    deal_type TEXT CHECK(deal_type IN ('Direct Customer', 'Partner', 'Referral')),
    gross_total_value NUMERIC(15,2) DEFAULT 0,
    commission_percentage NUMERIC(15,2),
    commission_amount NUMERIC(15,2) DEFAULT 0,
    contract_term_months INTEGER,
    total_contract_earnings NUMERIC(15,2) DEFAULT 0,
    weighted_value NUMERIC(15,2) DEFAULT 0,
    forecast_category TEXT CHECK(forecast_category IN ('Pipeline', 'Best Case', 'Commit', 'Closed Won', 'Omitted')),
    description TEXT,
    next_action TEXT,
    next_action_date DATE,
    deal_owner_id INTEGER REFERENCES users(id),
    converted_from_lead_id INTEGER REFERENCES leads(id),
    monthly_recurring_revenue NUMERIC(15,2) DEFAULT 0,
    commission_override_amount NUMERIC(15,2),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS deal_contacts (
    id SERIAL PRIMARY KEY,
    deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
    contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'Primary' CHECK(role IN ('Primary', 'Operations', 'Billing', 'Technical', 'Executive', 'Other')),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(deal_id, contact_id)
  );

  CREATE TABLE IF NOT EXISTS deal_line_items (
    id SERIAL PRIMARY KEY,
    deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    sku TEXT,
    description TEXT,
    quantity NUMERIC(15,2) DEFAULT 1,
    unit_price NUMERIC(15,2) DEFAULT 0,
    unit_type TEXT,
    contract_term_months INTEGER,
    line_total NUMERIC(15,2) DEFAULT 0,
    commission_pct NUMERIC(15,2),
    commission_amount NUMERIC(15,2) DEFAULT 0,
    is_recurring SMALLINT DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS activities (
    id SERIAL PRIMARY KEY,
    type TEXT NOT NULL CHECK(type IN ('Call', 'Meeting', 'Email', 'LinkedIn', 'Demo', 'Other')),
    subject TEXT NOT NULL,
    status TEXT DEFAULT 'Planned' CHECK(status IN ('Planned', 'Held', 'Not Held')),
    direction TEXT CHECK(direction IN ('Outbound', 'Inbound')),
    outcome TEXT,
    start_datetime TIMESTAMP,
    end_datetime TIMESTAMP,
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
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id SERIAL PRIMARY KEY,
    subject TEXT NOT NULL,
    status TEXT DEFAULT 'Not Started' CHECK(status IN ('Not Started', 'In Progress', 'Completed', 'Deferred', 'Waiting on Input')),
    priority TEXT DEFAULT 'Normal' CHECK(priority IN ('High', 'Normal', 'Low')),
    due_datetime TIMESTAMP,
    is_all_day SMALLINT DEFAULT 1,
    reminder_datetime TIMESTAMP,
    description TEXT,
    lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
    contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
    account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
    deal_id INTEGER REFERENCES deals(id) ON DELETE SET NULL,
    business_unit TEXT CHECK(business_unit IN ('ASC', 'Simply Seated', 'Both')),
    task_owner_id INTEGER REFERENCES users(id),
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS notes (
    id SERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
    contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
    account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
    deal_id INTEGER REFERENCES deals(id) ON DELETE CASCADE,
    created_by_id INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS ai_ingest_log (
    id SERIAL PRIMARY KEY,
    source TEXT,
    payload TEXT,
    record_type TEXT,
    record_id INTEGER,
    status TEXT DEFAULT 'success',
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS research_queue (
    id SERIAL PRIMARY KEY,
    title TEXT,
    company_name TEXT,
    contact_name TEXT,
    first_name TEXT,
    last_name TEXT,
    email TEXT,
    phone TEXT,
    mobile TEXT,
    website TEXT,
    linkedin_url TEXT,
    business_unit TEXT CHECK (business_unit IN ('ASC', 'Simply Seated', 'Both')),
    candidate_type TEXT CHECK (candidate_type IN (
      'Lead Candidate', 'Account Candidate', 'Contact Candidate',
      'Event Opportunity', 'Partner Candidate', 'Supplier List Opportunity',
      'Research Note', 'Duplicate / Existing Record Match'
    )),
    status TEXT DEFAULT 'New' CHECK (status IN (
      'New', 'Needs Review', 'Needs Enrichment', 'Duplicate',
      'Approved', 'Converted', 'Rejected', 'Parked'
    )),
    source TEXT,
    source_url TEXT,
    source_payload TEXT,
    ai_summary TEXT,
    why_it_matters TEXT,
    suggested_next_action TEXT,
    confidence_level TEXT CHECK (confidence_level IN ('High', 'Medium', 'Low')),
    duplicate_match_type TEXT,
    duplicate_match_record_id INTEGER,
    review_notes TEXT,
    rejected_reason TEXT,
    assigned_to_id INTEGER REFERENCES users(id),
    reviewed_by_id INTEGER REFERENCES users(id),
    reviewed_at TIMESTAMP,
    converted_lead_id INTEGER REFERENCES leads(id),
    converted_account_id INTEGER REFERENCES accounts(id),
    converted_contact_id INTEGER REFERENCES contacts(id),
    converted_deal_id INTEGER REFERENCES deals(id),
    converted_task_id INTEGER REFERENCES tasks(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS my_day_items (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    title TEXT NOT NULL,
    date_bucket TEXT NOT NULL CHECK (date_bucket IN ('today', 'tomorrow')),
    task_date DATE DEFAULT CURRENT_DATE,
    completed BOOLEAN DEFAULT false,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    pushed_from TEXT CHECK (pushed_from IN ('today', 'tomorrow'))
  );

  -- leads.converted_deal_id references deals(id), but deals is created after
  -- leads, so the foreign key is attached once both tables exist.
  DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'leads_converted_deal_id_fkey'
    ) THEN
      ALTER TABLE leads ADD CONSTRAINT leads_converted_deal_id_fkey
        FOREIGN KEY (converted_deal_id) REFERENCES deals(id);
    END IF;
  END $$;
`;

async function seedDefaultUser() {
  const password_hash = bcrypt.hashSync('Arkalon2024!', 12);
  const { rowCount } = await pool.query(
    P(`INSERT INTO users (name, email, password_hash, role, avatar_initials)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (email) DO NOTHING`),
    ['Stuart Munro', 'stuart@arkalon.com.au', password_hash, 'admin', 'SM']
  );
  if (rowCount > 0) console.log('[DB] Default user seeded: stuart@arkalon.com.au');
}

async function seedDefaultProducts() {
  const products = [
    ['ASC - Teams Recording Licence', 'ASC-REC-001', 33, 'per seat/month', 'ASC', 1],
    ['ASC - Legacy Import / Migration', 'ASC-IMP-001', 5000, 'per project', 'ASC', 0],
    ['ASC - Professional Services', 'ASC-PS-001', 1800, 'per day', 'ASC', 0],
    ['SS - Chair Hire (Chiavari)', 'SS-CHR-001', 0, 'per item', 'Simply Seated', 0],
    ['SS - Table Hire', 'SS-TBL-001', 0, 'per item', 'Simply Seated', 0],
    ['SS - Delivery & Setup', 'SS-DEL-001', 0, 'flat fee', 'Simply Seated', 0],
    ['SS - Styling Package', 'SS-STY-001', 0, 'flat fee', 'Simply Seated', 0],
  ];

  let seeded = 0;
  for (const row of products) {
    const { rowCount } = await pool.query(
      P(`INSERT INTO products (name, sku, unit_price, unit_type, business_unit, is_recurring, is_active)
         VALUES (?, ?, ?, ?, ?, ?, 1)
         ON CONFLICT (sku) DO NOTHING`),
      row
    );
    seeded += rowCount;
  }
  if (seeded > 0) console.log(`[DB] Default products seeded (${seeded})`);
}

// Additive column migrations — safe no-ops once the column exists.
const COLUMN_MIGRATIONS = [
  `ALTER TABLE leads ADD COLUMN IF NOT EXISTS executive_summary TEXT`,
  `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS executive_summary TEXT`,
  `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS executive_summary TEXT`,
  `ALTER TABLE deals ADD COLUMN IF NOT EXISTS executive_summary TEXT`,
];

async function initDb() {
  await pool.query(SCHEMA);
  for (const sql of COLUMN_MIGRATIONS) {
    await pool.query(sql);
  }
  await seedDefaultUser();
  await seedDefaultProducts();
  console.log('[DB] PostgreSQL schema initialised (14 tables ready)');
}

module.exports = { pool, P, initDb };
