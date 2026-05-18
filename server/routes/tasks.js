const express = require('express');
const { db } = require('../database');
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
router.get('/', (req, res) => {
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
      conditions.push(`tasks.due_datetime < CURRENT_TIMESTAMP AND tasks.status != 'Completed'`);
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

    const tasks = db.prepare(sql).all(...params);
    res.json({ success: true, data: tasks });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/tasks/:id/complete — must be before /:id to avoid conflict
router.patch('/:id/complete', (req, res) => {
  try {
    const existing = db.prepare('SELECT id FROM tasks WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Task not found' });

    db.prepare(`
      UPDATE tasks
      SET status = 'Completed', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(req.params.id);

    const task = db.prepare(`${BASE_SELECT} WHERE tasks.id = ?`).get(req.params.id);
    res.json({ success: true, data: task });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/tasks/:id
router.get('/:id', (req, res) => {
  try {
    const task = db.prepare(`${BASE_SELECT} WHERE tasks.id = ?`).get(req.params.id);
    if (!task) return res.status(404).json({ success: false, error: 'Task not found' });
    res.json({ success: true, data: task });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/tasks
router.post('/', (req, res) => {
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
      contact = db.prepare('SELECT id, account_id, business_unit FROM contacts WHERE id = ?').get(contact_id);
      if (!contact) return res.status(400).json({ success: false, error: 'Selected contact does not exist' });
      if (account_id && contact.account_id !== Number(account_id)) {
        return res.status(400).json({ success: false, error: 'Contact does not belong to the selected account' });
      }
    }

    if (deal_id) {
      deal = db.prepare('SELECT id, account_id, business_unit FROM deals WHERE id = ?').get(deal_id);
      if (!deal) return res.status(400).json({ success: false, error: 'Selected deal does not exist' });
      if (account_id && deal.account_id !== Number(account_id)) {
        return res.status(400).json({ success: false, error: 'Deal does not belong to the selected account' });
      }
    }

    if (lead_id) {
      lead = db.prepare('SELECT id, business_unit FROM leads WHERE id = ?').get(lead_id);
      if (!lead) return res.status(400).json({ success: false, error: 'Selected lead does not exist' });
    }

    if (account_id) {
      account = db.prepare('SELECT id, business_unit FROM accounts WHERE id = ?').get(account_id);
      if (!account) return res.status(400).json({ success: false, error: 'Selected account does not exist' });
    }

    const buError = validateBusinessUnitCompatibility(business_unit, { lead, contact, account, deal });
    if (buError) return res.status(400).json({ success: false, error: buError });

    const result = db.prepare(`
      INSERT INTO tasks (subject, status, priority, due_datetime, is_all_day, reminder_datetime,
        description, lead_id, contact_id, account_id, deal_id, business_unit, task_owner_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      subject, status || 'Not Started', priority || 'Normal',
      due_datetime || null, is_all_day !== false ? 1 : 0,
      reminder_datetime || null, description || null,
      lead_id || null, contact_id || null, account_id || null, deal_id || null,
      business_unit, req.user.id,
    );

    const task = db.prepare(`${BASE_SELECT} WHERE tasks.id = ?`).get(result.lastInsertRowid);
    res.status(201).json({ success: true, data: task });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/tasks/:id
router.put('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT id FROM tasks WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Task not found' });

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

    const setClause = updates.map(f => `${f} = ?`).join(', ');
    db.prepare(`UPDATE tasks SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(...updates.map(f => safeBody[f]), req.params.id);

    const task = db.prepare(`${BASE_SELECT} WHERE tasks.id = ?`).get(req.params.id);
    res.json({ success: true, data: task });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/tasks/:id
router.delete('/:id', (req, res) => {
  try {
    const result = db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
    if (result.changes === 0) return res.status(404).json({ success: false, error: 'Task not found' });
    res.json({ success: true, message: 'Task deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
