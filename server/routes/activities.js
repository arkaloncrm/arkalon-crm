const express = require('express');
const { pool, P } = require('../database');
const router = express.Router();

const ALLOWED_SORT_FIELDS = ['start_datetime', 'created_at', 'updated_at', 'subject', 'type', 'status'];

const BASE_SELECT = `
  SELECT
    activities.id,
    activities.type,
    activities.subject,
    activities.status,
    activities.direction,
    activities.outcome,
    activities.start_datetime,
    activities.end_datetime,
    activities.duration_minutes,
    activities.description,
    activities.next_action,
    activities.next_action_date,
    activities.business_unit,
    activities.lead_id,
    activities.contact_id,
    activities.account_id,
    activities.deal_id,
    activities.activity_owner_id,
    activities.created_at,
    activities.updated_at,
    leads.company AS lead_company,
    contacts.first_name || ' ' || contacts.last_name AS contact_name,
    accounts.name AS account_name,
    deals.deal_name AS deal_name,
    users.name AS owner_name
  FROM activities
  LEFT JOIN leads ON activities.lead_id = leads.id
  LEFT JOIN contacts ON activities.contact_id = contacts.id
  LEFT JOIN accounts ON activities.account_id = accounts.id
  LEFT JOIN deals ON activities.deal_id = deals.id
  LEFT JOIN users ON activities.activity_owner_id = users.id
`;

function validateBusinessUnitCompatibility(business_unit, { lead, contact, account, deal }) {
  if (!['ASC', 'Simply Seated'].includes(business_unit)) {
    return 'Activity business_unit must be ASC or Simply Seated — never Both or blank';
  }
  const linkedRecords = [lead, contact, account, deal].filter(Boolean);
  for (const record of linkedRecords) {
    if (record.business_unit && record.business_unit !== 'Both' && record.business_unit !== business_unit) {
      return `Business unit mismatch: linked record is ${record.business_unit} but activity is ${business_unit}`;
    }
  }
  return null;
}

// GET /api/activities
router.get('/', async (req, res) => {
  try {
    const { business_unit, type, lead_id, contact_id, account_id, deal_id,
      date_from, date_to, sort_by, sort_dir, limit, offset } = req.query;

    const conditions = [];
    const params = [];

    if (business_unit) { conditions.push('activities.business_unit = ?'); params.push(business_unit); }
    if (type) { conditions.push('activities.type = ?'); params.push(type); }
    if (lead_id) { conditions.push('activities.lead_id = ?'); params.push(lead_id); }
    if (contact_id) { conditions.push('activities.contact_id = ?'); params.push(contact_id); }
    if (account_id) { conditions.push('activities.account_id = ?'); params.push(account_id); }
    if (deal_id) { conditions.push('activities.deal_id = ?'); params.push(deal_id); }
    if (date_from) { conditions.push('activities.start_datetime >= ?'); params.push(date_from); }
    if (date_to) { conditions.push('activities.start_datetime <= ?'); params.push(date_to); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const safeSortBy = ALLOWED_SORT_FIELDS.includes(sort_by) ? sort_by : 'start_datetime';
    const safeSortDir = sort_dir === 'asc' ? 'ASC' : 'DESC';

    let sql = `${BASE_SELECT} ${where} ORDER BY activities.${safeSortBy} ${safeSortDir}`;

    if (limit) {
      const lim = Math.min(parseInt(limit) || 100, 100);
      const off = parseInt(offset) || 0;
      sql += ` LIMIT ${lim} OFFSET ${off}`;
    }

    const { rows: activities } = await pool.query(P(sql), params);
    res.json({ success: true, data: activities });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/activities/:id
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(P(`${BASE_SELECT} WHERE activities.id = ?`), [req.params.id]);
    const activity = rows[0];
    if (!activity) return res.status(404).json({ success: false, error: 'Activity not found' });
    res.json({ success: true, data: activity });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/activities
router.post('/', async (req, res) => {
  try {
    const { activity_owner_id, task_owner_id, created_by_id, ...safeBody } = req.body;
    const {
      type, subject, status, direction, outcome, start_datetime, end_datetime,
      duration_minutes, description, next_action, next_action_date,
      lead_id, contact_id, account_id, deal_id, business_unit,
    } = safeBody;

    if (!type || !subject) {
      return res.status(400).json({ success: false, error: 'Type and subject are required' });
    }
    if (!business_unit || !['ASC', 'Simply Seated'].includes(business_unit)) {
      return res.status(400).json({ success: false, error: 'Business unit must be ASC or Simply Seated' });
    }

    let lead = null;
    let contact = null;
    let account = null;
    let deal = null;

    if (contact_id) {
      const r = await pool.query(P('SELECT id, account_id, business_unit FROM contacts WHERE id = ?'), [contact_id]);
      contact = r.rows[0];
      if (!contact) return res.status(400).json({ success: false, error: 'Selected contact does not exist' });
      if (account_id && contact.account_id !== Number(account_id)) {
        return res.status(400).json({ success: false, error: 'Contact does not belong to the selected account' });
      }
    }

    if (deal_id) {
      const r = await pool.query(P('SELECT id, account_id, business_unit FROM deals WHERE id = ?'), [deal_id]);
      deal = r.rows[0];
      if (!deal) return res.status(400).json({ success: false, error: 'Selected deal does not exist' });
      if (account_id && deal.account_id !== Number(account_id)) {
        return res.status(400).json({ success: false, error: 'Deal does not belong to the selected account' });
      }
    }

    if (lead_id) {
      const r = await pool.query(P('SELECT id, business_unit FROM leads WHERE id = ?'), [lead_id]);
      lead = r.rows[0];
      if (!lead) return res.status(400).json({ success: false, error: 'Selected lead does not exist' });
    }

    if (account_id) {
      const r = await pool.query(P('SELECT id, business_unit FROM accounts WHERE id = ?'), [account_id]);
      account = r.rows[0];
      if (!account) return res.status(400).json({ success: false, error: 'Selected account does not exist' });
    }

    const buError = validateBusinessUnitCompatibility(business_unit, { lead, contact, account, deal });
    if (buError) return res.status(400).json({ success: false, error: buError });

    const insert = await pool.query(P(`
      INSERT INTO activities (type, subject, status, direction, outcome, start_datetime,
        end_datetime, duration_minutes, description, next_action, next_action_date,
        lead_id, contact_id, account_id, deal_id, business_unit, activity_owner_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id
    `), [
      type, subject, status || 'Held', direction || null, outcome || null,
      start_datetime || null, end_datetime || null, duration_minutes || null,
      description || null, next_action || null, next_action_date || null,
      lead_id || null, contact_id || null, account_id || null, deal_id || null,
      business_unit, req.user.id,
    ]);

    const { rows } = await pool.query(P(`${BASE_SELECT} WHERE activities.id = ?`), [insert.rows[0].id]);
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/activities/:id
router.put('/:id', async (req, res) => {
  try {
    const existing = await pool.query(P('SELECT id FROM activities WHERE id = ?'), [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ success: false, error: 'Activity not found' });

    const { activity_owner_id, task_owner_id, created_by_id, ...safeBody } = req.body;

    const fields = [
      'type', 'subject', 'status', 'direction', 'outcome', 'start_datetime', 'end_datetime',
      'duration_minutes', 'description', 'next_action', 'next_action_date',
      'lead_id', 'contact_id', 'account_id', 'deal_id', 'business_unit',
    ];
    const updates = fields.filter(f => safeBody[f] !== undefined);
    if (updates.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });

    // PostgreSQL rejects '' for non-text columns (SQLite tolerated it) — coerce
    // empty strings to NULL for date / numeric / foreign-key fields.
    const NON_TEXT = new Set(['duration_minutes', 'start_datetime', 'end_datetime', 'next_action_date', 'lead_id', 'contact_id', 'account_id', 'deal_id']);
    const setClause = updates.map(f => `${f} = ?`).join(', ');
    await pool.query(
      P(`UPDATE activities SET ${setClause}, updated_at = NOW() WHERE id = ?`),
      [...updates.map(f => {
        const v = safeBody[f];
        return NON_TEXT.has(f) && v === '' ? null : v;
      }), req.params.id]
    );

    const { rows } = await pool.query(P(`${BASE_SELECT} WHERE activities.id = ?`), [req.params.id]);
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/activities/:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query(P('DELETE FROM activities WHERE id = ?'), [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ success: false, error: 'Activity not found' });
    res.json({ success: true, message: 'Activity deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
