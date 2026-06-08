const express = require('express');
const { pool, P } = require('../database');
const { parseNoteTask } = require('../utils/parseNoteTask');
const router = express.Router();

// Whitelisted parent tables for server-side business_unit inheritance. Keyed by
// the note's polymorphic link field — the value is interpolated into SQL so it
// must never come from user input.
const BU_SOURCE = { deal_id: 'deals', account_id: 'accounts', contact_id: 'contacts', lead_id: 'leads' };

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

// POST /api/notes/suggest-task
// Called by the client AFTER a note has already been saved (a separate request,
// so it never delays or gates note saving). Parses the note for a single
// follow-up task and resolves business_unit from the in-context record. Never
// throws to the client — on any problem it returns action_detected:false so the
// note flow is undisturbed.
router.post('/suggest-task', async (req, res) => {
  try {
    const { content, lead_id, contact_id, account_id, deal_id } = req.body;

    // Resolve the single in-context link (same precedence the note carries).
    const link = {};
    if (deal_id) link.deal_id = deal_id;
    else if (account_id) link.account_id = account_id;
    else if (contact_id) link.contact_id = contact_id;
    else if (lead_id) link.lead_id = lead_id;

    const linkKeys = Object.keys(link);
    if (!content || linkKeys.length !== 1) {
      return res.json({ success: true, data: { action_detected: false } });
    }

    const parsed = await parseNoteTask(content);
    if (!parsed.action_detected) {
      return res.json({ success: true, data: { action_detected: false } });
    }

    // Inherit business_unit from the in-context record, resolved server-side.
    const linkField = linkKeys[0];
    const r = await pool.query(P(`SELECT business_unit FROM ${BU_SOURCE[linkField]} WHERE id = ?`), [link[linkField]]);
    const business_unit = r.rows[0]?.business_unit ?? null;
    const bu_valid = ['ASC', 'Simply Seated'].includes(business_unit);

    res.json({
      success: true,
      data: {
        action_detected: true,
        subject: parsed.subject,
        due_datetime: parsed.due_datetime,
        is_all_day: parsed.is_all_day,
        reminder_datetime: parsed.reminder_datetime,
        due_date: parsed.due_date,
        due_time: parsed.due_time,
        link,
        // Only inherit silently when valid; otherwise the UI must collect a BU.
        business_unit: bu_valid ? business_unit : null,
        bu_valid,
      },
    });
  } catch (err) {
    // Defensive: a suggestion failure must never surface as an error to the user.
    console.error('[NOTE-SUGGEST] Failed:', err.message);
    res.json({ success: true, data: { action_detected: false } });
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
