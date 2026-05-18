const express = require('express');
const { pool, P } = require('../database');
const router = express.Router();

const AI_API_KEY = 'arkalon-ai-key-2024';

function validateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== AI_API_KEY) {
    return res.status(401).json({ success: false, error: 'Invalid or missing API key' });
  }
  next();
}

async function logIngest(source, payload, record_type, record_id, status, error_message) {
  try {
    await pool.query(P(`
      INSERT INTO ai_ingest_log (source, payload, record_type, record_id, status, error_message)
      VALUES (?, ?, ?, ?, ?, ?)
    `), [source, JSON.stringify(payload), record_type, record_id, status, error_message]);
  } catch (err) {
    console.error('[AI INGEST LOG ERROR]', err.message);
  }
}

// POST /api/ai/ingest
router.post('/ingest', validateApiKey, async (req, res) => {
  const { record_type, business_unit, data, source } = req.body;

  if (!record_type || !data) {
    return res.status(400).json({ success: false, error: 'record_type and data are required' });
  }

  const supportedTypes = ['lead', 'contact', 'account', 'task', 'activity'];
  if (!supportedTypes.includes(record_type)) {
    return res.status(400).json({
      success: false,
      error: `Unsupported record_type. Supported: ${supportedTypes.join(', ')}`
    });
  }

  try {
    let result;
    const ingestData = { ...data, business_unit: data.business_unit || business_unit };

    switch (record_type) {
      case 'lead': {
        if (!ingestData.last_name || !ingestData.company) {
          return res.status(400).json({ success: false, error: 'Lead requires last_name and company' });
        }
        const r = await pool.query(P(`
          INSERT INTO leads (salutation, first_name, last_name, title, company, email, phone,
            mobile, lead_source, lead_status, business_unit, description, priority)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          RETURNING id
        `), [
          ingestData.salutation, ingestData.first_name, ingestData.last_name, ingestData.title,
          ingestData.company, ingestData.email, ingestData.phone, ingestData.mobile,
          ingestData.lead_source, ingestData.lead_status || 'New', ingestData.business_unit,
          ingestData.description, ingestData.priority
        ]);
        result = (await pool.query(P('SELECT * FROM leads WHERE id = ?'), [r.rows[0].id])).rows[0];
        break;
      }
      case 'contact': {
        if (!ingestData.last_name) {
          return res.status(400).json({ success: false, error: 'Contact requires last_name' });
        }
        const r = await pool.query(P(`
          INSERT INTO contacts (account_id, salutation, first_name, last_name, title,
            email, phone, mobile, business_unit, description)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          RETURNING id
        `), [
          ingestData.account_id, ingestData.salutation, ingestData.first_name, ingestData.last_name,
          ingestData.title, ingestData.email, ingestData.phone, ingestData.mobile,
          ingestData.business_unit, ingestData.description
        ]);
        result = (await pool.query(P('SELECT * FROM contacts WHERE id = ?'), [r.rows[0].id])).rows[0];
        break;
      }
      case 'account': {
        if (!ingestData.name) {
          return res.status(400).json({ success: false, error: 'Account requires name' });
        }
        const r = await pool.query(P(`
          INSERT INTO accounts (name, website, industry, phone, business_unit, description)
          VALUES (?, ?, ?, ?, ?, ?)
          RETURNING id
        `), [
          ingestData.name, ingestData.website, ingestData.industry, ingestData.phone,
          ingestData.business_unit, ingestData.description
        ]);
        result = (await pool.query(P('SELECT * FROM accounts WHERE id = ?'), [r.rows[0].id])).rows[0];
        break;
      }
      case 'task': {
        if (!ingestData.subject) {
          return res.status(400).json({ success: false, error: 'Task requires subject' });
        }
        const r = await pool.query(P(`
          INSERT INTO tasks (subject, status, priority, due_datetime, is_all_day,
            description, business_unit, lead_id, contact_id, account_id, deal_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          RETURNING id
        `), [
          ingestData.subject, ingestData.status || 'Not Started', ingestData.priority || 'Normal',
          ingestData.due_datetime, ingestData.is_all_day !== false ? 1 : 0,
          ingestData.description, ingestData.business_unit,
          ingestData.lead_id, ingestData.contact_id, ingestData.account_id, ingestData.deal_id
        ]);
        result = (await pool.query(P('SELECT * FROM tasks WHERE id = ?'), [r.rows[0].id])).rows[0];
        break;
      }
      case 'activity': {
        if (!ingestData.type || !ingestData.subject) {
          return res.status(400).json({ success: false, error: 'Activity requires type and subject' });
        }
        const r = await pool.query(P(`
          INSERT INTO activities (type, subject, status, direction, outcome, start_datetime,
            description, next_action, next_action_date, lead_id, contact_id,
            account_id, deal_id, business_unit)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          RETURNING id
        `), [
          ingestData.type, ingestData.subject, ingestData.status || 'Held',
          ingestData.direction, ingestData.outcome, ingestData.start_datetime,
          ingestData.description, ingestData.next_action, ingestData.next_action_date,
          ingestData.lead_id, ingestData.contact_id, ingestData.account_id,
          ingestData.deal_id, ingestData.business_unit
        ]);
        result = (await pool.query(P('SELECT * FROM activities WHERE id = ?'), [r.rows[0].id])).rows[0];
        break;
      }
    }

    await logIngest(source || 'ai', req.body, record_type, result.id, 'success', null);
    return res.status(201).json({ success: true, data: result });

  } catch (err) {
    await logIngest(source || 'ai', req.body, record_type, null, 'error', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/ai/log — view ingest history
router.get('/log', validateApiKey, async (req, res) => {
  try {
    const { rows: logs } = await pool.query('SELECT * FROM ai_ingest_log ORDER BY created_at DESC LIMIT 100');
    res.json({ success: true, data: logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
