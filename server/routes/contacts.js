const express = require('express');
const { db } = require('../database');
const router = express.Router();

// GET /api/contacts
router.get('/', (req, res) => {
  try {
    const { business_unit, search, account_id } = req.query;

    const conditions = [];
    const params = [];

    if (business_unit) { conditions.push('c.business_unit = ?'); params.push(business_unit); }
    if (account_id) { conditions.push('c.account_id = ?'); params.push(account_id); }
    if (search) {
      conditions.push('(c.first_name LIKE ? OR c.last_name LIKE ? OR c.email LIKE ?)');
      const s = `%${search}%`;
      params.push(s, s, s);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const contacts = db.prepare(`
      SELECT c.*, a.name as account_name, u.name as contact_owner_name
      FROM contacts c
      LEFT JOIN accounts a ON c.account_id = a.id
      LEFT JOIN users u ON c.contact_owner_id = u.id
      ${where}
      ORDER BY c.last_name ASC, c.first_name ASC
    `).all(...params);

    res.json({ success: true, data: contacts, total: contacts.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/contacts/:id
router.get('/:id', (req, res) => {
  try {
    const contact = db.prepare(`
      SELECT c.*, a.name as account_name, u.name as contact_owner_name
      FROM contacts c
      LEFT JOIN accounts a ON c.account_id = a.id
      LEFT JOIN users u ON c.contact_owner_id = u.id
      WHERE c.id = ?
    `).get(req.params.id);
    if (!contact) return res.status(404).json({ success: false, error: 'Contact not found' });

    const deals = db.prepare(`
      SELECT d.id, d.deal_name, d.stage, d.gross_total_value, d.close_date, dc.role
      FROM deal_contacts dc
      JOIN deals d ON dc.deal_id = d.id
      WHERE dc.contact_id = ?
      ORDER BY d.created_at DESC
    `).all(req.params.id);

    res.json({ success: true, data: { ...contact, deals } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/contacts
router.post('/', (req, res) => {
  try {
    const {
      account_id, salutation, first_name, last_name, title, email, phone,
      mobile, linkedin_url, department, business_unit, contact_owner_id, description,
    } = req.body;

    if (!last_name) return res.status(400).json({ success: false, error: 'Last name is required' });

    const result = db.prepare(`
      INSERT INTO contacts (account_id, salutation, first_name, last_name, title, email, phone,
        mobile, linkedin_url, department, business_unit, contact_owner_id, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      account_id || null, salutation, first_name, last_name, title, email, phone,
      mobile, linkedin_url, department, business_unit, contact_owner_id || req.user.id, description,
    );

    const contact = db.prepare(`
      SELECT c.*, a.name as account_name
      FROM contacts c LEFT JOIN accounts a ON c.account_id = a.id
      WHERE c.id = ?
    `).get(result.lastInsertRowid);
    res.status(201).json({ success: true, data: contact });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/contacts/:id
router.put('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT id FROM contacts WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Contact not found' });

    const fields = [
      'account_id', 'salutation', 'first_name', 'last_name', 'title', 'email',
      'phone', 'mobile', 'linkedin_url', 'department', 'business_unit',
      'contact_owner_id', 'description',
    ];
    const updates = fields.filter(f => req.body[f] !== undefined);
    if (updates.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });

    const setClause = updates.map(f => `${f} = ?`).join(', ');
    db.prepare(`UPDATE contacts SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(...updates.map(f => req.body[f]), req.params.id);

    const contact = db.prepare(`
      SELECT c.*, a.name as account_name
      FROM contacts c LEFT JOIN accounts a ON c.account_id = a.id
      WHERE c.id = ?
    `).get(req.params.id);
    res.json({ success: true, data: contact });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/contacts/:id
router.delete('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT id FROM contacts WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Contact not found' });

    const deleteContactTx = db.transaction((id) => {
      db.prepare('DELETE FROM notes WHERE contact_id = ?').run(id);
      db.prepare('DELETE FROM activities WHERE contact_id = ?').run(id);
      db.prepare('DELETE FROM tasks WHERE contact_id = ?').run(id);
      // leads.converted_contact_id references contacts(id) with no ON DELETE rule —
      // clear it first so a contact created via lead conversion can be deleted.
      db.prepare('UPDATE leads SET converted_contact_id = NULL WHERE converted_contact_id = ?').run(id);
      db.prepare('DELETE FROM contacts WHERE id = ?').run(id);
    });
    deleteContactTx(req.params.id);

    res.json({ success: true, message: 'Contact deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
