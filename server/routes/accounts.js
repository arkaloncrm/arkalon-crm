const express = require('express');
const { db } = require('../database');
const router = express.Router();

// GET /api/accounts
router.get('/', (req, res) => {
  try {
    const { business_unit, search, industry } = req.query;

    const conditions = [];
    const params = [];

    if (business_unit) { conditions.push('a.business_unit = ?'); params.push(business_unit); }
    if (industry) { conditions.push('a.industry = ?'); params.push(industry); }
    if (search) {
      conditions.push('(a.name LIKE ? OR a.website LIKE ?)');
      const s = `%${search}%`;
      params.push(s, s);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const accounts = db.prepare(`
      SELECT a.*, u.name as account_owner_name,
        (SELECT COUNT(*) FROM deals d
          WHERE d.account_id = a.id AND d.stage NOT IN ('Closed Won', 'Closed Lost')) as open_deals_count
      FROM accounts a
      LEFT JOIN users u ON a.account_owner_id = u.id
      ${where}
      ORDER BY a.name ASC
    `).all(...params);

    res.json({ success: true, data: accounts, total: accounts.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/accounts/:id
router.get('/:id', (req, res) => {
  try {
    const account = db.prepare(`
      SELECT a.*, u.name as account_owner_name
      FROM accounts a
      LEFT JOIN users u ON a.account_owner_id = u.id
      WHERE a.id = ?
    `).get(req.params.id);
    if (!account) return res.status(404).json({ success: false, error: 'Account not found' });

    const contacts = db.prepare(`
      SELECT id, first_name, last_name, title, email, phone
      FROM contacts WHERE account_id = ?
      ORDER BY last_name ASC, first_name ASC
    `).all(req.params.id);

    const deals = db.prepare(`
      SELECT id, deal_name, stage, gross_total_value, close_date, business_unit
      FROM deals WHERE account_id = ?
      ORDER BY created_at DESC
    `).all(req.params.id);

    const openDealsCount = deals.filter(d => d.stage !== 'Closed Won' && d.stage !== 'Closed Lost').length;
    const totalPipelineValue = Math.round(
      deals
        .filter(d => d.stage !== 'Closed Lost')
        .reduce((sum, d) => sum + (d.gross_total_value || 0), 0) * 100
    ) / 100;

    res.json({
      success: true,
      data: {
        ...account,
        contacts,
        deals,
        open_deals_count: openDealsCount,
        total_pipeline_value: totalPipelineValue,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/accounts
router.post('/', (req, res) => {
  try {
    const {
      name, website, industry, employee_count, annual_revenue, phone,
      billing_street, billing_city, billing_state, billing_postcode, billing_country,
      description, business_unit, account_owner_id,
    } = req.body;

    if (!name) return res.status(400).json({ success: false, error: 'Account name is required' });

    const result = db.prepare(`
      INSERT INTO accounts (name, website, industry, employee_count, annual_revenue, phone,
        billing_street, billing_city, billing_state, billing_postcode, billing_country,
        description, business_unit, account_owner_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name, website, industry, employee_count,
      annual_revenue !== undefined ? Math.round(annual_revenue * 100) / 100 : null,
      phone,
      billing_street, billing_city, billing_state, billing_postcode, billing_country || 'Australia',
      description, business_unit, account_owner_id || req.user.id,
    );

    const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ success: true, data: account });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/accounts/:id
router.put('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT id FROM accounts WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Account not found' });

    const fields = [
      'name', 'website', 'industry', 'employee_count', 'annual_revenue', 'phone',
      'billing_street', 'billing_city', 'billing_state', 'billing_postcode', 'billing_country',
      'description', 'business_unit', 'account_owner_id',
    ];
    const updates = fields.filter(f => req.body[f] !== undefined);
    if (updates.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });

    const values = updates.map(f => {
      if (f === 'annual_revenue' && req.body[f] !== null) {
        return Math.round(req.body[f] * 100) / 100;
      }
      return req.body[f];
    });

    const setClause = updates.map(f => `${f} = ?`).join(', ');
    db.prepare(`UPDATE accounts SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(...values, req.params.id);

    const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id);
    res.json({ success: true, data: account });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/accounts/:id
router.delete('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT id FROM accounts WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Account not found' });

    const deleteAccountTx = db.transaction((id) => {
      db.prepare('DELETE FROM notes WHERE account_id = ?').run(id);
      db.prepare('DELETE FROM activities WHERE account_id = ?').run(id);
      db.prepare('DELETE FROM tasks WHERE account_id = ?').run(id);
      // leads.converted_account_id references accounts(id) with no ON DELETE rule —
      // clear it first so deleting an account created via lead conversion does not
      // fail the foreign key constraint.
      db.prepare('UPDATE leads SET converted_account_id = NULL WHERE converted_account_id = ?').run(id);
      db.prepare('DELETE FROM accounts WHERE id = ?').run(id);
    });
    deleteAccountTx(req.params.id);

    res.json({ success: true, message: 'Account deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
