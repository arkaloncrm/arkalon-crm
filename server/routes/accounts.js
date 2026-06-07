const express = require('express');
const { pool, P } = require('../database');
const router = express.Router();

// GET /api/accounts
router.get('/', async (req, res) => {
  try {
    const { business_unit, search, industry, sort_by, sort_dir } = req.query;

    const conditions = [];
    const params = [];

    if (business_unit) { conditions.push('a.business_unit = ?'); params.push(business_unit); }
    if (industry) { conditions.push('a.industry = ?'); params.push(industry); }
    if (search) {
      conditions.push('(a.name ILIKE ? OR a.website ILIKE ?)');
      const s = `%${search}%`;
      params.push(s, s);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const allowedSorts = ['name', 'business_unit', 'created_at', 'updated_at', 'industry'];
    const col = allowedSorts.includes(sort_by) ? sort_by : 'name';
    const dir = sort_dir === 'desc' ? 'DESC' : 'ASC';

    const { rows: accounts } = await pool.query(P(`
      SELECT a.*, u.name as account_owner_name,
        (SELECT COUNT(*) FROM deals d
          WHERE d.account_id = a.id AND d.stage NOT IN ('Closed Won', 'Closed Lost')) as open_deals_count
      FROM accounts a
      LEFT JOIN users u ON a.account_owner_id = u.id
      ${where}
      ORDER BY a.${col} ${dir}
    `), params);

    res.json({ success: true, data: accounts, total: accounts.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/accounts/:id
router.get('/:id', async (req, res) => {
  try {
    const accountResult = await pool.query(P(`
      SELECT a.*, u.name as account_owner_name
      FROM accounts a
      LEFT JOIN users u ON a.account_owner_id = u.id
      WHERE a.id = ?
    `), [req.params.id]);
    const account = accountResult.rows[0];
    if (!account) return res.status(404).json({ success: false, error: 'Account not found' });

    const { rows: contacts } = await pool.query(P(`
      SELECT id, first_name, last_name, title, email, phone
      FROM contacts WHERE account_id = ?
      ORDER BY last_name ASC, first_name ASC
    `), [req.params.id]);

    const { rows: deals } = await pool.query(P(`
      SELECT id, deal_name, stage, gross_total_value, close_date, business_unit
      FROM deals WHERE account_id = ?
      ORDER BY created_at DESC
    `), [req.params.id]);

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
router.post('/', async (req, res) => {
  try {
    const {
      name, website, industry, employee_count, annual_revenue, phone,
      billing_street, billing_city, billing_state, billing_postcode, billing_country,
      description, business_unit, account_owner_id,
    } = req.body;

    if (!name) return res.status(400).json({ success: false, error: 'Account name is required' });

    const insert = await pool.query(P(`
      INSERT INTO accounts (name, website, industry, employee_count, annual_revenue, phone,
        billing_street, billing_city, billing_state, billing_postcode, billing_country,
        description, business_unit, account_owner_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id
    `), [
      name, website, industry, employee_count,
      annual_revenue !== undefined ? Math.round(annual_revenue * 100) / 100 : null,
      phone,
      billing_street, billing_city, billing_state, billing_postcode, billing_country || 'Australia',
      description, business_unit, account_owner_id || req.user.id,
    ]);

    const { rows } = await pool.query(P('SELECT * FROM accounts WHERE id = ?'), [insert.rows[0].id]);
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/accounts/:id
router.put('/:id', async (req, res) => {
  try {
    const existing = await pool.query(P('SELECT id FROM accounts WHERE id = ?'), [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ success: false, error: 'Account not found' });

    const fields = [
      'name', 'website', 'industry', 'employee_count', 'annual_revenue', 'phone',
      'billing_street', 'billing_city', 'billing_state', 'billing_postcode', 'billing_country',
      'description', 'executive_summary', 'business_unit', 'account_owner_id',
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
    await pool.query(
      P(`UPDATE accounts SET ${setClause}, updated_at = NOW() WHERE id = ?`),
      [...values, req.params.id]
    );

    const { rows } = await pool.query(P('SELECT * FROM accounts WHERE id = ?'), [req.params.id]);
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/accounts/:id/priority — toggle the priority_flag boolean
router.patch('/:id/priority', async (req, res) => {
  try {
    const existing = await pool.query(P('SELECT priority_flag FROM accounts WHERE id = ?'), [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ success: false, error: 'Account not found' });

    // Treat a null priority_flag as false so toggling always lands on a boolean.
    const next = existing.rows[0].priority_flag !== true;
    await pool.query(
      P('UPDATE accounts SET priority_flag = ?, updated_at = NOW() WHERE id = ?'),
      [next, req.params.id]
    );

    const { rows } = await pool.query(P('SELECT * FROM accounts WHERE id = ?'), [req.params.id]);
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/accounts/:id
router.delete('/:id', async (req, res) => {
  try {
    const existing = await pool.query(P('SELECT id FROM accounts WHERE id = ?'), [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ success: false, error: 'Account not found' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const id = req.params.id;
      await client.query('DELETE FROM notes WHERE account_id = $1', [id]);
      await client.query('DELETE FROM activities WHERE account_id = $1', [id]);
      await client.query('DELETE FROM tasks WHERE account_id = $1', [id]);
      // leads.converted_account_id references accounts(id) with no ON DELETE rule —
      // clear it first so deleting an account created via lead conversion does not
      // fail the foreign key constraint.
      await client.query('UPDATE leads SET converted_account_id = NULL WHERE converted_account_id = $1', [id]);
      await client.query('DELETE FROM accounts WHERE id = $1', [id]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    res.json({ success: true, message: 'Account deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
