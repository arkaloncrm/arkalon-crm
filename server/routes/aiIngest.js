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

// Allowed CHECK-constraint values on research_queue — anything else is coerced
// to a safe default so a malformed ingest payload can't 500 on the constraint.
const VALID_CANDIDATE_TYPES = [
  'Lead Candidate', 'Account Candidate', 'Contact Candidate',
  'Event Opportunity', 'Partner Candidate', 'Supplier List Opportunity',
  'Research Note', 'Duplicate / Existing Record Match',
];
const VALID_BUSINESS_UNITS = ['ASC', 'Simply Seated', 'Both'];
const VALID_CONFIDENCE = ['High', 'Medium', 'Low'];

// POST /api/ai/ingest — all incoming records land in the Research Queue as
// staging candidates; they are promoted to live CRM records by a human review.
router.post('/ingest', validateApiKey, async (req, res) => {
  const { record_type, business_unit, data, source } = req.body;

  if (!data || typeof data !== 'object') {
    return res.status(400).json({ success: false, error: 'data object is required' });
  }

  try {
    const bu = data.business_unit || business_unit || null;
    const safeBu = VALID_BUSINESS_UNITS.includes(bu) ? bu : null;
    const candidateType = VALID_CANDIDATE_TYPES.includes(data.candidate_type)
      ? data.candidate_type
      : 'Lead Candidate';
    const confidence = VALID_CONFIDENCE.includes(data.confidence_level)
      ? data.confidence_level
      : 'Medium';

    const aiSummary = data.ai_summary || data.summary || data.executive_summary || null;
    const contactName = data.contact_name
      || [data.first_name, data.last_name].filter(Boolean).join(' ').trim()
      || null;

    const insert = await pool.query(P(`
      INSERT INTO research_queue (
        title, company_name, contact_name, first_name, last_name, email, phone, mobile,
        website, linkedin_url, business_unit, candidate_type, status, source, source_url,
        source_payload, ai_summary, why_it_matters, suggested_next_action, confidence_level
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'New', ?, ?, ?, ?, ?, ?, ?)
      RETURNING id
    `), [
      data.title || null,
      data.company || data.company_name || null,
      contactName,
      data.first_name || null,
      data.last_name || null,
      data.email || null,
      data.phone || null,
      data.mobile || null,
      data.website || null,
      data.linkedin_url || null,
      safeBu,
      candidateType,
      source || data.source || 'AI Ingest',
      data.source_url || null,
      JSON.stringify(req.body),
      aiSummary,
      data.why_it_matters || null,
      data.suggested_next_action || null,
      confidence,
    ]);

    const newId = insert.rows[0].id;
    await logIngest(source || 'ai', req.body, record_type || 'research_queue', newId, 'success', null);
    return res.status(201).json({ success: true, destination: 'research_queue', id: newId });

  } catch (err) {
    await logIngest(source || 'ai', req.body, record_type || 'research_queue', null, 'error', err.message);
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
