const express = require('express');
const bcrypt = require('bcryptjs');
const XLSX = require('xlsx');
const { pool, P } = require('../database');
const router = express.Router();

const normName = (v) => String(v || '').trim().toLowerCase();
const VALID_BUS_IMPORT = ['ASC', 'Simply Seated', 'Both'];

// GET /api/settings/profile — load current user for the Settings form
router.get('/profile', async (req, res) => {
  try {
    const { rows } = await pool.query(
      P('SELECT id, name, email, avatar_initials, role FROM users WHERE id = ?'),
      [req.user.id]
    );
    const user = rows[0];
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    res.json({ success: true, data: user });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/settings/profile
router.patch('/profile', async (req, res) => {
  try {
    const { name, email, avatar_initials, current_password, new_password, confirm_new_password } = req.body;

    // Required field validation
    if (!name?.trim()) return res.status(400).json({ success: false, error: 'Name is required' });
    if (!email?.trim()) return res.status(400).json({ success: false, error: 'Email is required' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ success: false, error: 'Invalid email format' });
    }

    const userResult = await pool.query(P('SELECT * FROM users WHERE id = ?'), [req.user.id]);
    const user = userResult.rows[0];
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    // Email uniqueness check excluding current user
    const emailConflict = await pool.query(
      P('SELECT id FROM users WHERE email = ? AND id != ?'),
      [email.trim(), req.user.id]
    );
    if (emailConflict.rows.length > 0) return res.status(400).json({ success: false, error: 'Email is already in use by another account' });

    // Password change validation
    if (new_password) {
      // Guard: current_password must be present before calling bcrypt.compareSync.
      // Passing undefined/null to bcrypt.compareSync throws a fatal exception that crashes Node.
      if (!current_password || typeof current_password !== 'string' || !current_password.trim()) {
        return res.status(400).json({ success: false, error: 'Current password is required to set a new password' });
      }
      const valid = bcrypt.compareSync(current_password, user.password_hash);
      if (!valid) return res.status(400).json({ success: false, error: 'Current password is incorrect' });
      if (new_password.length < 8) return res.status(400).json({ success: false, error: 'New password must be at least 8 characters' });
      if (new_password !== confirm_new_password) return res.status(400).json({ success: false, error: 'New passwords do not match' });
    }

    const initials = avatar_initials?.trim().slice(0, 2).toUpperCase() ||
      name.trim().split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();

    // The users table has no updated_at column (schema: created_at, last_login only).
    if (new_password) {
      const password_hash = bcrypt.hashSync(new_password, 12);
      await pool.query(
        P('UPDATE users SET name = ?, email = ?, avatar_initials = ?, password_hash = ? WHERE id = ?'),
        [name.trim(), email.trim(), initials, password_hash, req.user.id]
      );
    } else {
      await pool.query(
        P('UPDATE users SET name = ?, email = ?, avatar_initials = ? WHERE id = ?'),
        [name.trim(), email.trim(), initials, req.user.id]
      );
    }

    // Return updated user so frontend can refresh topbar name/initials immediately
    const updated = await pool.query(
      P('SELECT id, name, email, avatar_initials, role FROM users WHERE id = ?'),
      [req.user.id]
    );
    res.json({ success: true, message: 'Profile updated', data: updated.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/settings/stats
router.get('/stats', async (req, res) => {
  try {
    const stats = {
      leads: (await pool.query('SELECT COUNT(*) AS count FROM leads')).rows[0].count,
      contacts: (await pool.query('SELECT COUNT(*) AS count FROM contacts')).rows[0].count,
      accounts: (await pool.query('SELECT COUNT(*) AS count FROM accounts')).rows[0].count,
      deals: (await pool.query('SELECT COUNT(*) AS count FROM deals')).rows[0].count,
      activities: (await pool.query('SELECT COUNT(*) AS count FROM activities')).rows[0].count,
      tasks: (await pool.query('SELECT COUNT(*) AS count FROM tasks')).rows[0].count,
      notes: (await pool.query('SELECT COUNT(*) AS count FROM notes')).rows[0].count,
      products: (await pool.query('SELECT COUNT(*) AS count FROM products')).rows[0].count,
    };
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/settings/export/:entity
router.get('/export/:entity', async (req, res) => {
  try {
    const { entity } = req.params;
    const allowed = ['accounts', 'contacts', 'deals'];
    if (!allowed.includes(entity)) return res.status(400).json({ success: false, error: 'Invalid entity' });

    let rows, headers, mapRow;

    if (entity === 'accounts') {
      rows = (await pool.query('SELECT name, business_unit, website, industry, phone, billing_city, billing_state, billing_country, description FROM accounts ORDER BY name')).rows;
      headers = ['Name', 'Business Unit', 'Website', 'Industry', 'Phone', 'City', 'State', 'Country', 'Description'];
      // Explicit field mapping — do NOT use Object.values() which depends on property order
      mapRow = r => [r.name, r.business_unit, r.website, r.industry, r.phone, r.billing_city, r.billing_state, r.billing_country, r.description];
    } else if (entity === 'contacts') {
      rows = (await pool.query(`
        SELECT contacts.first_name, contacts.last_name, contacts.title, contacts.email,
          contacts.phone, contacts.mobile, contacts.business_unit,
          accounts.name AS account_name
        FROM contacts
        LEFT JOIN accounts ON contacts.account_id = accounts.id
        ORDER BY contacts.last_name
      `)).rows;
      headers = ['First Name', 'Last Name', 'Title', 'Email', 'Phone', 'Mobile', 'Business Unit', 'Account'];
      mapRow = r => [r.first_name, r.last_name, r.title, r.email, r.phone, r.mobile, r.business_unit, r.account_name];
    } else if (entity === 'deals') {
      rows = (await pool.query(`
        SELECT deals.deal_name, deals.stage, deals.business_unit, deals.deal_type,
          deals.gross_total_value, deals.monthly_recurring_revenue,
          deals.total_contract_earnings, deals.close_date,
          accounts.name AS account_name
        FROM deals
        LEFT JOIN accounts ON deals.account_id = accounts.id
        ORDER BY deals.close_date
      `)).rows;
      headers = ['Deal Name', 'Stage', 'BU', 'Type', 'Gross Value', 'MRR', 'Commission', 'Close Date', 'Account'];
      mapRow = r => [r.deal_name, r.stage, r.business_unit, r.deal_type, r.gross_total_value, r.monthly_recurring_revenue, r.total_contract_earnings, r.close_date, r.account_name];
    }

    const wsData = [headers, ...rows.map(mapRow)];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, entity);
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', `attachment; filename="${entity}_export_${new Date().toISOString().slice(0, 10)}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/settings/import
router.post('/import', async (req, res) => {
  const { accounts = [], contacts = [], includeWarnings = true } = req.body;

  // Backend revalidation — never trust frontend-validated status alone
  const revalidateAccount = (acc) => {
    if (!acc.name?.trim()) return false;
    if (!VALID_BUS_IMPORT.includes(acc.business_unit?.trim())) return false;
    return true;
  };
  const revalidateContact = (con) => {
    if (!con.last_name?.trim()) return false;
    if (!VALID_BUS_IMPORT.includes(con.business_unit?.trim())) return false;
    return true;
  };

  // Filter based on includeWarnings flag
  const importableAccounts = accounts.filter(a =>
    revalidateAccount(a) && (includeWarnings ? a.status !== 'error' : a.status === 'ok')
  );
  const importableContacts = contacts.filter(c =>
    revalidateContact(c) && (includeWarnings ? c.status !== 'error' : c.status === 'ok')
  );

  const results = {
    accounts: { imported: 0, skipped_duplicate: 0 },
    contacts: { imported: 0, imported_without_account: 0, skipped_duplicate: 0, skipped: 0 },
  };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Build case-insensitive name->id map from existing accounts
    const accountNameToId = {};
    const existingAccounts = (await client.query('SELECT id, name FROM accounts')).rows;
    for (const a of existingAccounts) {
      accountNameToId[normName(a.name)] = a.id;
    }

    for (const acc of importableAccounts) {
      const key = normName(acc.name);
      // Duplicate check happens here — before insert, not caught after
      if (accountNameToId[key]) {
        results.accounts.skipped_duplicate++;
        continue;
      }
      // No inner try/catch — unexpected insert errors must throw so the transaction rolls back
      const result = await client.query(P(`
        INSERT INTO accounts (name, business_unit, website, industry, phone,
          billing_city, billing_state, billing_country, description, account_owner_id,
          created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        RETURNING id
      `), [
        acc.name.trim(),
        acc.business_unit.trim(),
        acc.website || null,
        acc.industry || null,
        acc.phone || null,
        acc.billing_city || null,
        acc.billing_state || null,
        acc.billing_country || 'Australia',
        acc.description || null,
        req.user.id,
      ]);
      accountNameToId[key] = result.rows[0].id;
      results.accounts.imported++;
    }

    for (const con of importableContacts) {
      // Case-insensitive account lookup — contacts without an account get null (not skipped)
      const accountId = con.account_name
        ? (accountNameToId[normName(con.account_name)] || null)
        : null;

      // Skip contacts that already exist (matched on last name + email, or name when email blank)
      const existingContact = (await client.query(
        P('SELECT id FROM contacts WHERE last_name = ? AND (email = ? OR (first_name = ? AND email IS NULL))'),
        [con.last_name.trim(), con.email || null, con.first_name || null]
      )).rows[0];

      if (existingContact) {
        results.contacts.skipped_duplicate = (results.contacts.skipped_duplicate || 0) + 1;
        continue;
      }

      // No inner try/catch — unexpected insert errors must throw so the transaction rolls back
      await client.query(P(`
        INSERT INTO contacts (first_name, last_name, title, email, phone, mobile,
          business_unit, description, account_id, contact_owner_id,
          created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `), [
        con.first_name || null,
        con.last_name.trim(),
        con.title || null,
        con.email || null,
        con.phone || null,
        con.mobile || null,
        con.business_unit.trim(),
        con.description || null,
        accountId,
        req.user.id,
      ]);

      if (!accountId && con.account_name) {
        results.contacts.imported_without_account++;
      } else {
        results.contacts.imported++;
      }
    }

    await client.query('COMMIT');
    res.json({ success: true, data: results });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
