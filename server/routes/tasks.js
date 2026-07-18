const express = require('express');
const { pool, P } = require('../database');
const { getSydneyTodayUtcBounds } = require('../utils/dateUtils');
const router = express.Router();

const ALLOWED_SORT_FIELDS = ['due_datetime', 'created_at', 'updated_at', 'subject', 'priority', 'status'];

const BASE_SELECT = `
  SELECT
    tasks.id,
    tasks.subject,
    tasks.status,
    tasks.priority,
    tasks.due_datetime,
    tasks.is_all_day,
    tasks.reminder_datetime,
    tasks.description,
    tasks.business_unit,
    tasks.lead_id,
    tasks.contact_id,
    tasks.account_id,
    tasks.deal_id,
    tasks.task_owner_id,
    tasks.completed_at,
    tasks.created_at,
    tasks.updated_at,
    leads.company AS lead_company,
    contacts.first_name || ' ' || contacts.last_name AS contact_name,
    COALESCE(NULLIF(contacts.mobile, ''), contacts.phone) AS contact_phone,
    accounts.name AS account_name,
    deals.deal_name AS deal_name,
    users.name AS owner_name
  FROM tasks
  LEFT JOIN leads ON tasks.lead_id = leads.id
  LEFT JOIN contacts ON tasks.contact_id = contacts.id
  LEFT JOIN accounts ON tasks.account_id = accounts.id
  LEFT JOIN deals ON tasks.deal_id = deals.id
  LEFT JOIN users ON tasks.task_owner_id = users.id
`;

function validateBusinessUnitCompatibility(business_unit, { lead, contact, account, deal }) {
  if (!['ASC', 'Simply Seated'].includes(business_unit)) {
    return 'Task business_unit must be ASC or Simply Seated — never Both or blank';
  }
  const linkedRecords = [lead, contact, account, deal].filter(Boolean);
  for (const record of linkedRecords) {
    if (record.business_unit && record.business_unit !== 'Both' && record.business_unit !== business_unit) {
      return `Business unit mismatch: linked record is ${record.business_unit} but task is ${business_unit}`;
    }
  }
  return null;
}

// GET /api/tasks
router.get('/', async (req, res) => {
  try {
    const { business_unit, status, priority, lead_id, contact_id, account_id, deal_id,
      overdue, due_today, sort_by, sort_dir, limit, offset } = req.query;

    const conditions = [];
    const params = [];

    if (business_unit) { conditions.push('tasks.business_unit = ?'); params.push(business_unit); }
    if (status) { conditions.push('tasks.status = ?'); params.push(status); }
    if (priority) { conditions.push('tasks.priority = ?'); params.push(priority); }
    if (lead_id) { conditions.push('tasks.lead_id = ?'); params.push(lead_id); }
    if (contact_id) { conditions.push('tasks.contact_id = ?'); params.push(contact_id); }
    if (account_id) { conditions.push('tasks.account_id = ?'); params.push(account_id); }
    if (deal_id) { conditions.push('tasks.deal_id = ?'); params.push(deal_id); }

    if (overdue === 'true') {
      conditions.push(`tasks.due_datetime < NOW() AND tasks.status != 'Completed'`);
    } else if (due_today === 'true') {
      const { startUtc, endUtc } = getSydneyTodayUtcBounds();
      conditions.push(`tasks.due_datetime >= ? AND tasks.due_datetime < ? AND tasks.status != 'Completed'`);
      params.push(startUtc, endUtc);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const safeSortBy = ALLOWED_SORT_FIELDS.includes(sort_by) ? sort_by : 'due_datetime';
    const safeSortDir = sort_dir === 'desc' ? 'DESC' : 'ASC';

    let sql = `${BASE_SELECT} ${where} ORDER BY tasks.${safeSortBy} ${safeSortDir}`;

    if (limit) {
      const lim = Math.min(parseInt(limit) || 100, 100);
      const off = parseInt(offset) || 0;
      sql += ` LIMIT ${lim} OFFSET ${off}`;
    }

    const { rows: tasks } = await pool.query(P(sql), params);
    res.json({ success: true, data: tasks });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/tasks/:id/complete — must be before /:id to avoid conflict
router.patch('/:id/complete', async (req, res) => {
  try {
    const existing = await pool.query(P('SELECT id FROM tasks WHERE id = ?'), [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ success: false, error: 'Task not found' });

    await pool.query(P(`
      UPDATE tasks
      SET status = 'Completed', completed_at = NOW(), updated_at = NOW()
      WHERE id = ?
    `), [req.params.id]);

    const { rows } = await pool.query(P(`${BASE_SELECT} WHERE tasks.id = ?`), [req.params.id]);
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/tasks/:id
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(P(`${BASE_SELECT} WHERE tasks.id = ?`), [req.params.id]);
    const task = rows[0];
    if (!task) return res.status(404).json({ success: false, error: 'Task not found' });
    res.json({ success: true, data: task });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/tasks
router.post('/', async (req, res) => {
  try {
    const { activity_owner_id, task_owner_id, created_by_id, ...safeBody } = req.body;
    const {
      subject, status, priority, due_datetime, is_all_day, reminder_datetime,
      description, lead_id, contact_id, account_id, deal_id, business_unit,
    } = safeBody;

    if (!subject) return res.status(400).json({ success: false, error: 'Subject is required' });
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
      INSERT INTO tasks (subject, status, priority, due_datetime, is_all_day, reminder_datetime,
        description, lead_id, contact_id, account_id, deal_id, business_unit, task_owner_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id
    `), [
      subject, status || 'Not Started', priority || 'Normal',
      due_datetime || null, is_all_day !== false ? 1 : 0,
      reminder_datetime || null, description || null,
      lead_id || null, contact_id || null, account_id || null, deal_id || null,
      business_unit, req.user.id,
    ]);

    const { rows } = await pool.query(P(`${BASE_SELECT} WHERE tasks.id = ?`), [insert.rows[0].id]);
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/tasks/:id
router.put('/:id', async (req, res) => {
  try {
    const existing = await pool.query(P('SELECT id FROM tasks WHERE id = ?'), [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ success: false, error: 'Task not found' });

    const { activity_owner_id, task_owner_id, created_by_id, ...safeBody } = req.body;

    const fields = [
      'subject', 'status', 'priority', 'due_datetime', 'is_all_day', 'reminder_datetime',
      'description', 'lead_id', 'contact_id', 'account_id', 'deal_id', 'business_unit', 'completed_at',
    ];
    const updates = fields.filter(f => safeBody[f] !== undefined);
    if (updates.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });

    if (safeBody.status === 'Completed' && safeBody.completed_at === undefined) {
      updates.push('completed_at');
      safeBody.completed_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
    }

    // PostgreSQL rejects '' for non-text columns (SQLite tolerated it) — coerce
    // empty strings to NULL for date / numeric / foreign-key fields.
    const NON_TEXT = new Set(['due_datetime', 'is_all_day', 'reminder_datetime', 'completed_at', 'lead_id', 'contact_id', 'account_id', 'deal_id']);
    const setClause = updates.map(f => `${f} = ?`).join(', ');
    await pool.query(
      P(`UPDATE tasks SET ${setClause}, updated_at = NOW() WHERE id = ?`),
      [...updates.map(f => {
        const v = safeBody[f];
        return NON_TEXT.has(f) && v === '' ? null : v;
      }), req.params.id]
    );

    const { rows } = await pool.query(P(`${BASE_SELECT} WHERE tasks.id = ?`), [req.params.id]);
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/tasks/:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query(P('DELETE FROM tasks WHERE id = ?'), [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ success: false, error: 'Task not found' });
    res.json({ success: true, message: 'Task deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

const BULK_DELETE_CAP = 100;

// POST /api/tasks/bulk-delete — tasks have no dependent records (same as
// DELETE /:id), batched and transactional (all-or-nothing). Body: { ids: number[] }, capped at 100.
router.post('/bulk-delete', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: 'ids must be a non-empty array' });
    }
    if (ids.length > BULK_DELETE_CAP) {
      return res.status(400).json({ success: false, error: `Cannot delete more than ${BULK_DELETE_CAP} tasks at once` });
    }
    const intIds = [...new Set(ids.map(Number))].filter(Number.isInteger);
    if (intIds.length === 0) {
      return res.status(400).json({ success: false, error: 'ids must contain valid task IDs' });
    }

    const client = await pool.connect();
    let deleted = 0;
    try {
      await client.query('BEGIN');
      const result = await client.query('DELETE FROM tasks WHERE id = ANY($1)', [intIds]);
      deleted = result.rowCount;
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    res.json({ success: true, data: { deleted } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
