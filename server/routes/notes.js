const express = require('express');
const { pool, P } = require('../database');
const router = express.Router();

// GET /api/notes?lead_id=X or ?contact_id=X or ?account_id=X or ?deal_id=X
router.get('/', async (req, res) => {
  try {
    const { lead_id, contact_id, account_id, deal_id } = req.query;
    const conditions = [];
    const params = [];

    if (lead_id) { conditions.push('n.lead_id = ?'); params.push(lead_id); }
    if (contact_id) { conditions.push('n.contact_id = ?'); params.push(contact_id); }
    if (account_id) { conditions.push('n.account_id = ?'); params.push(account_id); }
    if (deal_id) { conditions.push('n.deal_id = ?'); params.push(deal_id); }

    if (conditions.length === 0) {
      return res.status(400).json({ success: false, error: 'At least one filter (lead_id, contact_id, account_id, deal_id) is required' });
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const { rows: notes } = await pool.query(P(`
      SELECT n.*, u.name as created_by_name
      FROM notes n
      LEFT JOIN users u ON n.created_by_id = u.id
      ${where}
      ORDER BY n.created_at DESC
    `), params);

    res.json({ success: true, data: notes });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/notes
router.post('/', async (req, res) => {
  try {
    const { activity_owner_id, task_owner_id, created_by_id, ...safeBody } = req.body;
    const { content, lead_id, contact_id, account_id, deal_id } = safeBody;

    if (!content) return res.status(400).json({ success: false, error: 'Note content is required' });

    const parentIds = [lead_id, contact_id, account_id, deal_id]
      .filter(id => id !== null && id !== undefined && id !== '');

    if (parentIds.length === 0) {
      return res.status(400).json({ success: false, error: 'A note must be linked to exactly one record (lead, contact, account, or deal)' });
    }
    if (parentIds.length > 1) {
      return res.status(400).json({ success: false, error: 'A note can only be linked to one record at a time' });
    }

    const insert = await pool.query(P(`
      INSERT INTO notes (content, lead_id, contact_id, account_id, deal_id, created_by_id)
      VALUES (?, ?, ?, ?, ?, ?)
      RETURNING id
    `), [
      content,
      lead_id || null,
      contact_id || null,
      account_id || null,
      deal_id || null,
      req.user.id,
    ]);

    const { rows } = await pool.query(P(`
      SELECT n.*, u.name as created_by_name
      FROM notes n LEFT JOIN users u ON n.created_by_id = u.id
      WHERE n.id = ?
    `), [insert.rows[0].id]);

    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/notes/:id
router.put('/:id', async (req, res) => {
  try {
    const existing = await pool.query(P('SELECT id, created_by_id FROM notes WHERE id = ?'), [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ success: false, error: 'Note not found' });

    const { content } = req.body;
    if (!content) return res.status(400).json({ success: false, error: 'Note content is required' });

    await pool.query(
      P('UPDATE notes SET content = ?, updated_at = NOW() WHERE id = ?'),
      [content, req.params.id]
    );

    const { rows } = await pool.query(P(`
      SELECT n.*, u.name as created_by_name
      FROM notes n LEFT JOIN users u ON n.created_by_id = u.id
      WHERE n.id = ?
    `), [req.params.id]);

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/notes/:id
router.delete('/:id', async (req, res) => {
  try {
    const existing = await pool.query(P('SELECT id FROM notes WHERE id = ?'), [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ success: false, error: 'Note not found' });
    await pool.query(P('DELETE FROM notes WHERE id = ?'), [req.params.id]);
    res.json({ success: true, message: 'Note deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
