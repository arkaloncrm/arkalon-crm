const express = require('express');
const { pool, P } = require('../database');
const router = express.Router();

// Columns returned to the client — joined with users twice for the assigned /
// reviewed display names the detail page shows.
const SELECT_WITH_USERS = `
  SELECT rq.*, au.name AS assigned_to_name, ru.name AS reviewed_by_name
  FROM research_queue rq
  LEFT JOIN users au ON rq.assigned_to_id = au.id
  LEFT JOIN users ru ON rq.reviewed_by_id = ru.id
`;

// GET /api/research-queue
router.get('/', async (req, res) => {
  try {
    const { business_unit, candidate_type, status, confidence_level, source, search, sort_by, sort_dir } = req.query;

    const conditions = [];
    const params = [];

    if (business_unit) { conditions.push('rq.business_unit = ?'); params.push(business_unit); }
    if (candidate_type) { conditions.push('rq.candidate_type = ?'); params.push(candidate_type); }
    if (status) { conditions.push('rq.status = ?'); params.push(status); }
    if (confidence_level) { conditions.push('rq.confidence_level = ?'); params.push(confidence_level); }
    if (source) { conditions.push('rq.source = ?'); params.push(source); }
    if (search) {
      conditions.push('(rq.title ILIKE ? OR rq.company_name ILIKE ? OR rq.contact_name ILIKE ? OR rq.ai_summary ILIKE ?)');
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const allowedSorts = ['id', 'created_at', 'updated_at', 'status', 'confidence_level', 'candidate_type'];
    const col = allowedSorts.includes(sort_by) ? sort_by : 'created_at';
    const dir = sort_dir === 'asc' ? 'ASC' : 'DESC';

    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 100);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    const countResult = await pool.query(P(`SELECT COUNT(*) AS total FROM research_queue rq ${where}`), params);
    const total = countResult.rows[0].total;

    const { rows } = await pool.query(
      P(`${SELECT_WITH_USERS} ${where} ORDER BY rq.${col} ${dir} LIMIT ? OFFSET ?`),
      [...params, limit, offset]
    );

    res.json({ success: true, data: rows, total });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/research-queue/:id
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(P(`${SELECT_WITH_USERS} WHERE rq.id = ?`), [req.params.id]);
    if (!rows[0]) return res.status(404).json({ success: false, error: 'Research record not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/research-queue
router.post('/', async (req, res) => {
  try {
    const {
      title, company_name, contact_name, first_name, last_name, email, phone, mobile,
      website, linkedin_url, business_unit, candidate_type, status, source, source_url,
      ai_summary, why_it_matters, suggested_next_action, confidence_level, review_notes,
      rejected_reason, assigned_to_id,
    } = req.body;

    if (!candidate_type) return res.status(400).json({ success: false, error: 'Candidate type is required' });
    if (!business_unit) return res.status(400).json({ success: false, error: 'Business unit is required' });

    const insert = await pool.query(P(`
      INSERT INTO research_queue (
        title, company_name, contact_name, first_name, last_name, email, phone, mobile,
        website, linkedin_url, business_unit, candidate_type, status, source, source_url,
        ai_summary, why_it_matters, suggested_next_action, confidence_level, review_notes,
        rejected_reason, assigned_to_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id
    `), [
      title || null, company_name || null, contact_name || null, first_name || null,
      last_name || null, email || null, phone || null, mobile || null, website || null,
      linkedin_url || null, business_unit, candidate_type, status || 'New', source || null,
      source_url || null, ai_summary || null, why_it_matters || null,
      suggested_next_action || null, confidence_level || null, review_notes || null,
      rejected_reason || null, assigned_to_id || req.user.id,
    ]);

    const { rows } = await pool.query(P(`${SELECT_WITH_USERS} WHERE rq.id = ?`), [insert.rows[0].id]);
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/research-queue/:id
router.put('/:id', async (req, res) => {
  try {
    const existing = await pool.query(P('SELECT id FROM research_queue WHERE id = ?'), [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ success: false, error: 'Research record not found' });

    const fields = [
      'title', 'company_name', 'contact_name', 'first_name', 'last_name', 'email', 'phone',
      'mobile', 'website', 'linkedin_url', 'business_unit', 'candidate_type', 'status',
      'source', 'source_url', 'ai_summary', 'why_it_matters', 'suggested_next_action',
      'confidence_level', 'review_notes', 'rejected_reason', 'assigned_to_id',
    ];
    const updates = fields.filter(f => req.body[f] !== undefined);
    if (updates.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });

    // The CHECK-constrained columns reject '' (a blank dropdown option) — only
    // NULL or a valid value passes; assigned_to_id is an integer FK. Coerce '' → NULL.
    const BLANK_TO_NULL = new Set(['business_unit', 'candidate_type', 'status', 'confidence_level', 'assigned_to_id']);
    const setClause = updates.map(f => `${f} = ?`).join(', ');
    await pool.query(
      P(`UPDATE research_queue SET ${setClause}, updated_at = NOW() WHERE id = ?`),
      [...updates.map(f => {
        const v = req.body[f];
        return BLANK_TO_NULL.has(f) && v === '' ? null : v;
      }), req.params.id]
    );

    const { rows } = await pool.query(P(`${SELECT_WITH_USERS} WHERE rq.id = ?`), [req.params.id]);
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/research-queue/:id
router.delete('/:id', async (req, res) => {
  try {
    const existing = await pool.query(P('SELECT id FROM research_queue WHERE id = ?'), [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ success: false, error: 'Research record not found' });
    await pool.query(P('DELETE FROM research_queue WHERE id = ?'), [req.params.id]);
    res.json({ success: true, message: 'Research record deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/research-queue/:id/convert
// Conversions create a live CRM record and stamp the research record — they
// NEVER delete it, so the queue stays a permanent audit trail.
router.post('/:id/convert', async (req, res) => {
  try {
    const { convert_to } = req.body;

    const recResult = await pool.query(P('SELECT * FROM research_queue WHERE id = ?'), [req.params.id]);
    const rec = recResult.rows[0];
    if (!rec) return res.status(404).json({ success: false, error: 'Research record not found' });

    if (convert_to === 'deal') {
      return res.status(400).json({
        success: false,
        error: 'Converting to Deal requires an existing Account. Please create an Account first, then create a Deal from the Account record.',
      });
    }

    const targetColumn = {
      lead: 'converted_lead_id',
      account: 'converted_account_id',
      contact: 'converted_contact_id',
      task: 'converted_task_id',
    }[convert_to];
    if (!targetColumn) {
      return res.status(400).json({ success: false, error: 'convert_to must be one of: lead, account, contact, task' });
    }

    // Don't re-create the same target type twice for one research record.
    if (rec[targetColumn]) {
      return res.status(400).json({ success: false, error: `This record has already been converted to a ${convert_to}.` });
    }

    // Required-field guards — the target tables have NOT NULL columns that the
    // research record may not have populated. Fail clearly instead of a 500.
    if (convert_to === 'lead' && (!rec.company_name || !rec.last_name)) {
      return res.status(400).json({ success: false, error: 'Cannot convert to Lead — company name and last name are required. Edit the record to add them first.' });
    }
    if (convert_to === 'account' && !rec.company_name) {
      return res.status(400).json({ success: false, error: 'Cannot convert to Account — company name is required. Edit the record to add it first.' });
    }
    if (convert_to === 'contact' && !rec.last_name) {
      return res.status(400).json({ success: false, error: 'Cannot convert to Contact — last name is required. Edit the record to add it first.' });
    }
    if (convert_to === 'task' && !rec.title) {
      return res.status(400).json({ success: false, error: 'Cannot convert to Task — a title is required. Edit the record to add one first.' });
    }

    // The leads table only permits ASC / Simply Seated for business_unit (no
    // 'Both'); coerce an unsupported value to NULL so the CHECK still passes.
    const leadBu = ['ASC', 'Simply Seated'].includes(rec.business_unit) ? rec.business_unit : null;

    const client = await pool.connect();
    let newId;
    try {
      await client.query('BEGIN');

      if (convert_to === 'lead') {
        const r = await client.query(P(`
          INSERT INTO leads (company, first_name, last_name, email, phone, mobile, website,
            business_unit, lead_source, lead_status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'New', NOW(), NOW())
          RETURNING id
        `), [
          rec.company_name, rec.first_name, rec.last_name, rec.email, rec.phone,
          rec.mobile, rec.website, leadBu, rec.source,
        ]);
        newId = r.rows[0].id;
      } else if (convert_to === 'account') {
        const r = await client.query(P(`
          INSERT INTO accounts (name, website, phone, business_unit, created_at, updated_at)
          VALUES (?, ?, ?, ?, NOW(), NOW())
          RETURNING id
        `), [rec.company_name, rec.website, rec.phone, rec.business_unit]);
        newId = r.rows[0].id;
      } else if (convert_to === 'contact') {
        const r = await client.query(P(`
          INSERT INTO contacts (first_name, last_name, email, phone, mobile, linkedin_url,
            business_unit, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
          RETURNING id
        `), [
          rec.first_name, rec.last_name, rec.email, rec.phone, rec.mobile,
          rec.linkedin_url, rec.business_unit,
        ]);
        newId = r.rows[0].id;
      } else {
        const r = await client.query(P(`
          INSERT INTO tasks (subject, description, status, priority, business_unit, created_at, updated_at)
          VALUES (?, ?, 'Not Started', 'Normal', ?, NOW(), NOW())
          RETURNING id
        `), [rec.title, rec.ai_summary, rec.business_unit]);
        newId = r.rows[0].id;
      }

      await client.query(P(`
        UPDATE research_queue
        SET ${targetColumn} = ?, status = 'Converted', reviewed_by_id = ?, reviewed_at = NOW(), updated_at = NOW()
        WHERE id = ?
      `), [newId, req.user.id, req.params.id]);

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    res.json({ success: true, data: { convert_to, id: newId, research_queue_id: Number(req.params.id) } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Shared status-transition handler for reject / park / approve.
async function transition(req, res, { status, extraColumn, extraValue }) {
  try {
    const existing = await pool.query(P('SELECT id FROM research_queue WHERE id = ?'), [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ success: false, error: 'Research record not found' });

    const sets = [`status = '${status}'`, 'reviewed_by_id = ?', 'reviewed_at = NOW()', 'updated_at = NOW()'];
    const params = [req.user.id];
    if (extraColumn) {
      sets.splice(1, 0, `${extraColumn} = ?`);
      params.unshift(extraValue);
    }

    await pool.query(P(`UPDATE research_queue SET ${sets.join(', ')} WHERE id = ?`), [...params, req.params.id]);

    const { rows } = await pool.query(P(`${SELECT_WITH_USERS} WHERE rq.id = ?`), [req.params.id]);
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// POST /api/research-queue/:id/reject
router.post('/:id/reject', (req, res) =>
  transition(req, res, { status: 'Rejected', extraColumn: 'rejected_reason', extraValue: req.body.rejected_reason || null })
);

// POST /api/research-queue/:id/park
router.post('/:id/park', (req, res) => transition(req, res, { status: 'Parked' }));

// POST /api/research-queue/:id/approve
router.post('/:id/approve', (req, res) => transition(req, res, { status: 'Approved' }));

module.exports = router;
