const express = require('express');
const { pool, P } = require('../database');
const router = express.Router();

// GET /api/contacts
router.get('/', async (req, res) => {
  try {
    const { business_unit, search, account_id, sort_by, sort_dir } = req.query;

    const conditions = [];
    const params = [];

    if (business_unit) { conditions.push('c.business_unit = ?'); params.push(business_unit); }
    if (account_id) { conditions.push('c.account_id = ?'); params.push(account_id); }
    if (search) {
      conditions.push('(c.first_name ILIKE ? OR c.last_name ILIKE ? OR c.email ILIKE ?)');
      const s = `%${search}%`;
      params.push(s, s, s);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const allowedSorts = ['last_name', 'first_name', 'created_at', 'updated_at', 'business_unit'];
    const col = allowedSorts.includes(sort_by) ? sort_by : 'last_name';
    const dir = sort_dir === 'desc' ? 'DESC' : 'ASC';
    // Break last_name ties by first name, matching the original default ordering.
    const orderBy = col === 'last_name' ? `c.${col} ${dir}, c.first_name ASC` : `c.${col} ${dir}`;

    const { rows: contacts } = await pool.query(P(`
      SELECT c.*, a.name as account_name, u.name as contact_owner_name
      FROM contacts c
      LEFT JOIN accounts a ON c.account_id = a.id
      LEFT JOIN users u ON c.contact_owner_id = u.id
      ${where}
      ORDER BY ${orderBy}
    `), params);

    res.json({ success: true, data: contacts, total: contacts.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/contacts/:id
router.get('/:id', async (req, res) => {
  try {
    const contactResult = await pool.query(P(`
      SELECT c.*, a.name as account_name, u.name as contact_owner_name
      FROM contacts c
      LEFT JOIN accounts a ON c.account_id = a.id
      LEFT JOIN users u ON c.contact_owner_id = u.id
      WHERE c.id = ?
    `), [req.params.id]);
    const contact = contactResult.rows[0];
    if (!contact) return res.status(404).json({ success: false, error: 'Contact not found' });

    const { rows: deals } = await pool.query(P(`
      SELECT d.id, d.deal_name, d.stage, d.gross_total_value, d.close_date, dc.role
      FROM deal_contacts dc
      JOIN deals d ON dc.deal_id = d.id
      WHERE dc.contact_id = ?
      ORDER BY d.created_at DESC
    `), [req.params.id]);

    res.json({ success: true, data: { ...contact, deals } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/contacts
router.post('/', async (req, res) => {
  try {
    const {
      account_id, salutation, first_name, last_name, title, email, phone,
      mobile, linkedin_url, department, business_unit, contact_owner_id, description,
    } = req.body;

    if (!last_name) return res.status(400).json({ success: false, error: 'Last name is required' });
    if (!business_unit || !['ASC', 'Simply Seated'].includes(business_unit)) {
      return res.status(400).json({ success: false, error: 'Business unit must be ASC or Simply Seated' });
    }

    const insert = await pool.query(P(`
      INSERT INTO contacts (account_id, salutation, first_name, last_name, title, email, phone,
        mobile, linkedin_url, department, business_unit, contact_owner_id, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id
    `), [
      account_id || null, salutation, first_name, last_name, title, email, phone,
      mobile, linkedin_url, department, business_unit, contact_owner_id || req.user.id, description,
    ]);

    const { rows } = await pool.query(P(`
      SELECT c.*, a.name as account_name
      FROM contacts c LEFT JOIN accounts a ON c.account_id = a.id
      WHERE c.id = ?
    `), [insert.rows[0].id]);
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/contacts/:id
router.put('/:id', async (req, res) => {
  try {
    const existing = await pool.query(P('SELECT id FROM contacts WHERE id = ?'), [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ success: false, error: 'Contact not found' });

    const fields = [
      'account_id', 'salutation', 'first_name', 'last_name', 'title', 'email',
      'phone', 'mobile', 'linkedin_url', 'department', 'business_unit',
      'contact_owner_id', 'description', 'executive_summary',
    ];
    const updates = fields.filter(f => req.body[f] !== undefined);
    if (updates.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });

    // An edit must not clear or invalidate business_unit — only validate when it
    // is actually being changed (partial updates may omit it entirely).
    if (req.body.business_unit !== undefined &&
        (!req.body.business_unit || !['ASC', 'Simply Seated'].includes(req.body.business_unit))) {
      return res.status(400).json({ success: false, error: 'Business unit must be ASC or Simply Seated' });
    }

    const setClause = updates.map(f => `${f} = ?`).join(', ');
    await pool.query(
      P(`UPDATE contacts SET ${setClause}, updated_at = NOW() WHERE id = ?`),
      [...updates.map(f => req.body[f]), req.params.id]
    );

    const { rows } = await pool.query(P(`
      SELECT c.*, a.name as account_name
      FROM contacts c LEFT JOIN accounts a ON c.account_id = a.id
      WHERE c.id = ?
    `), [req.params.id]);
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/contacts/:id — partial update for inline edits. Strictly limited
// to contact-detail fields; no other column may be patched via this endpoint.
const CONTACT_PATCH_FIELDS = ['phone', 'mobile', 'email'];

router.patch('/:id', async (req, res) => {
  try {
    const existing = await pool.query(P('SELECT id FROM contacts WHERE id = ?'), [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ success: false, error: 'Contact not found' });

    const updates = CONTACT_PATCH_FIELDS.filter(f => req.body[f] !== undefined);
    if (updates.length === 0) return res.status(400).json({ success: false, error: 'No updatable fields provided' });

    const setClause = updates.map(f => `${f} = ?`).join(', ');
    await pool.query(
      P(`UPDATE contacts SET ${setClause}, updated_at = NOW() WHERE id = ?`),
      [...updates.map(f => req.body[f]), req.params.id]
    );

    const { rows } = await pool.query(P(`
      SELECT c.*, a.name as account_name
      FROM contacts c LEFT JOIN accounts a ON c.account_id = a.id
      WHERE c.id = ?
    `), [req.params.id]);
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/contacts/:id
router.delete('/:id', async (req, res) => {
  try {
    const existing = await pool.query(P('SELECT id FROM contacts WHERE id = ?'), [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ success: false, error: 'Contact not found' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const id = req.params.id;
      await client.query('DELETE FROM notes WHERE contact_id = $1', [id]);
      await client.query('DELETE FROM activities WHERE contact_id = $1', [id]);
      await client.query('DELETE FROM tasks WHERE contact_id = $1', [id]);
      // leads.converted_contact_id references contacts(id) with no ON DELETE rule —
      // clear it first so a contact created via lead conversion can be deleted.
      await client.query('UPDATE leads SET converted_contact_id = NULL WHERE converted_contact_id = $1', [id]);
      await client.query('DELETE FROM contacts WHERE id = $1', [id]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    res.json({ success: true, message: 'Contact deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
