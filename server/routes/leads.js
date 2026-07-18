const express = require('express');
const { pool, P } = require('../database');
const router = express.Router();

const STAGE_PROBABILITY = {
  'New': 10, 'Contacted': 20, 'Qualified': 40, 'Quoted': 60,
  'Commit': 80, 'Closed Won': 100, 'Closed Lost': 0,
};

// GET /api/leads
router.get('/', async (req, res) => {
  try {
    const { business_unit, status, priority, search, converted, sort_by, sort_dir } = req.query;

    const conditions = [];
    const params = [];

    const convertedVal = converted !== undefined ? parseInt(converted) : 0;
    conditions.push('l.converted = ?');
    params.push(convertedVal);

    if (business_unit) { conditions.push('l.business_unit = ?'); params.push(business_unit); }
    if (status) { conditions.push('l.lead_status = ?'); params.push(status); }
    if (priority) { conditions.push('l.priority = ?'); params.push(priority); }
    if (search) {
      conditions.push('(l.company ILIKE ? OR l.first_name ILIKE ? OR l.last_name ILIKE ? OR l.email ILIKE ?)');
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const allowedSorts = ['created_at', 'updated_at', 'company', 'last_name', 'lead_status', 'priority', 'business_unit'];
    const col = allowedSorts.includes(sort_by) ? sort_by : 'created_at';
    const dir = sort_dir === 'asc' ? 'ASC' : 'DESC';

    const { rows: leads } = await pool.query(P(`
      SELECT l.*, u.name as lead_owner_name
      FROM leads l
      LEFT JOIN users u ON l.lead_owner_id = u.id
      ${where}
      ORDER BY l.${col} ${dir}
    `), params);

    res.json({ success: true, data: leads, total: leads.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/leads/:id
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(P(`
      SELECT l.*, u.name as lead_owner_name
      FROM leads l
      LEFT JOIN users u ON l.lead_owner_id = u.id
      WHERE l.id = ?
    `), [req.params.id]);
    const lead = rows[0];
    if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });
    res.json({ success: true, data: lead });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/leads
router.post('/', async (req, res) => {
  try {
    const {
      salutation, first_name, last_name, title, company, email, phone, mobile,
      website, industry, employee_count, annual_revenue, lead_source, lead_status,
      business_unit, target_type, description, warm_path, next_action,
      next_action_date, last_contacted, priority, lead_owner_id,
      street, city, state, postcode, country,
    } = req.body;

    if (!last_name || !company) {
      return res.status(400).json({ success: false, error: 'Last name and company are required' });
    }
    if (!business_unit || !['ASC', 'Simply Seated'].includes(business_unit)) {
      return res.status(400).json({ success: false, error: 'Business unit must be ASC or Simply Seated' });
    }

    const insert = await pool.query(P(`
      INSERT INTO leads (
        salutation, first_name, last_name, title, company, email, phone, mobile,
        website, industry, employee_count, annual_revenue, lead_source, lead_status,
        business_unit, target_type, description, warm_path, next_action,
        next_action_date, last_contacted, priority, lead_owner_id,
        street, city, state, postcode, country
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id
    `), [
      salutation, first_name, last_name, title, company, email, phone, mobile,
      website, industry, employee_count, annual_revenue, lead_source, lead_status || 'New',
      business_unit, target_type, description, warm_path, next_action,
      next_action_date || null, last_contacted || null, priority, lead_owner_id || req.user.id,
      street, city, state, postcode, country || 'Australia',
    ]);

    const { rows } = await pool.query(P(`
      SELECT l.*, u.name as lead_owner_name
      FROM leads l LEFT JOIN users u ON l.lead_owner_id = u.id
      WHERE l.id = ?
    `), [insert.rows[0].id]);
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/leads/:id
router.put('/:id', async (req, res) => {
  try {
    const existing = await pool.query(P('SELECT id FROM leads WHERE id = ?'), [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ success: false, error: 'Lead not found' });

    const fields = [
      'salutation', 'first_name', 'last_name', 'title', 'company', 'email', 'phone', 'mobile',
      'website', 'industry', 'employee_count', 'annual_revenue', 'lead_source', 'lead_status',
      'business_unit', 'target_type', 'description', 'executive_summary', 'warm_path', 'next_action',
      'next_action_date', 'last_contacted', 'priority', 'lead_owner_id',
      'street', 'city', 'state', 'postcode', 'country',
    ];
    const updates = fields.filter(f => req.body[f] !== undefined);
    if (updates.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });

    // PostgreSQL rejects '' for non-text columns (SQLite tolerated it) — coerce
    // empty strings to NULL for date / numeric fields.
    const NON_TEXT = new Set(['employee_count', 'annual_revenue', 'next_action_date', 'last_contacted', 'lead_owner_id']);
    const setClause = updates.map(f => `${f} = ?`).join(', ');
    await pool.query(
      P(`UPDATE leads SET ${setClause}, updated_at = NOW() WHERE id = ?`),
      [...updates.map(f => {
        const v = req.body[f];
        return NON_TEXT.has(f) && v === '' ? null : v;
      }), req.params.id]
    );

    const { rows } = await pool.query(P(`
      SELECT l.*, u.name as lead_owner_name
      FROM leads l LEFT JOIN users u ON l.lead_owner_id = u.id
      WHERE l.id = ?
    `), [req.params.id]);
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/leads/:id
router.delete('/:id', async (req, res) => {
  try {
    const existing = await pool.query(P('SELECT id FROM leads WHERE id = ?'), [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ success: false, error: 'Lead not found' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const id = req.params.id;
      await client.query('DELETE FROM notes WHERE lead_id = $1', [id]);
      await client.query('UPDATE activities SET lead_id = NULL WHERE lead_id = $1', [id]);
      await client.query('UPDATE tasks SET lead_id = NULL WHERE lead_id = $1', [id]);
      // deals.converted_from_lead_id references leads(id) with no ON DELETE rule —
      // clear it first so a lead with a converted deal can be deleted.
      await client.query('UPDATE deals SET converted_from_lead_id = NULL WHERE converted_from_lead_id = $1', [id]);
      // research_queue.converted_lead_id has no ON DELETE rule — clear it to avoid FK violation.
      await client.query('UPDATE research_queue SET converted_lead_id = NULL WHERE converted_lead_id = $1', [id]);
      await client.query('DELETE FROM leads WHERE id = $1', [id]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    res.json({ success: true, message: 'Lead deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

const BULK_DELETE_CAP = 100;

// POST /api/leads/bulk-delete — same cascade as DELETE /:id, batched and
// transactional (all-or-nothing). Body: { ids: number[] }, capped at 100.
router.post('/bulk-delete', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: 'ids must be a non-empty array' });
    }
    if (ids.length > BULK_DELETE_CAP) {
      return res.status(400).json({ success: false, error: `Cannot delete more than ${BULK_DELETE_CAP} leads at once` });
    }
    const intIds = [...new Set(ids.map(Number))].filter(Number.isInteger);
    if (intIds.length === 0) {
      return res.status(400).json({ success: false, error: 'ids must contain valid lead IDs' });
    }

    const client = await pool.connect();
    let deleted = 0;
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM notes WHERE lead_id = ANY($1)', [intIds]);
      await client.query('UPDATE activities SET lead_id = NULL WHERE lead_id = ANY($1)', [intIds]);
      await client.query('UPDATE tasks SET lead_id = NULL WHERE lead_id = ANY($1)', [intIds]);
      await client.query('UPDATE deals SET converted_from_lead_id = NULL WHERE converted_from_lead_id = ANY($1)', [intIds]);
      await client.query('UPDATE research_queue SET converted_lead_id = NULL WHERE converted_lead_id = ANY($1)', [intIds]);
      const result = await client.query('DELETE FROM leads WHERE id = ANY($1)', [intIds]);
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

// POST /api/leads/:id/convert
router.post('/:id/convert', async (req, res) => {
  try {
    const leadResult = await pool.query(P('SELECT * FROM leads WHERE id = ?'), [req.params.id]);
    const lead = leadResult.rows[0];
    if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });
    if (lead.converted) return res.status(400).json({ success: false, error: 'Lead is already converted' });

    const { account_name, create_deal, deal_name, deal_stage, deal_close_date } = req.body;
    if (!account_name) return res.status(400).json({ success: false, error: 'account_name is required' });

    // Force business_unit from the lead record — never trust payload
    const { business_unit } = lead;
    const stage = deal_stage || 'New';
    const probability = STAGE_PROBABILITY[stage] ?? 10;

    const client = await pool.connect();
    let result;
    try {
      await client.query('BEGIN');

      // 1. Create Account
      const accountResult = await client.query(P(`
        INSERT INTO accounts (name, website, industry, employee_count, annual_revenue, phone,
          billing_street, billing_city, billing_state, billing_postcode, billing_country,
          business_unit, account_owner_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id
      `), [
        account_name,
        lead.website,
        lead.industry,
        lead.employee_count,
        lead.annual_revenue !== null ? Math.round(lead.annual_revenue * 100) / 100 : null,
        lead.phone,
        lead.street,
        lead.city,
        lead.state,
        lead.postcode,
        lead.country || 'Australia',
        business_unit,
        lead.lead_owner_id,
      ]);
      const accountId = accountResult.rows[0].id;

      // 2. Create Contact
      const contactResult = await client.query(P(`
        INSERT INTO contacts (account_id, salutation, first_name, last_name, title,
          email, phone, mobile, business_unit, contact_owner_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id
      `), [
        accountId,
        lead.salutation,
        lead.first_name,
        lead.last_name,
        lead.title,
        lead.email,
        lead.phone,
        lead.mobile,
        business_unit,
        lead.lead_owner_id,
      ]);
      const contactId = contactResult.rows[0].id;

      // 3. Optionally create Deal
      let dealId = null;
      if (create_deal && deal_name) {
        const grossTotal = Math.round(0 * 100) / 100;
        const dealResult = await client.query(P(`
          INSERT INTO deals (deal_name, account_id, stage, probability, close_date,
            business_unit, gross_total_value, commission_amount, total_contract_earnings,
            weighted_value, forecast_category, converted_from_lead_id, deal_owner_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          RETURNING id
        `), [
          deal_name,
          accountId,
          stage,
          probability,
          deal_close_date || null,
          business_unit,
          grossTotal,
          Math.round(0 * 100) / 100,
          Math.round(0 * 100) / 100,
          Math.round(0 * 100) / 100,
          'Pipeline',
          lead.id,
          lead.lead_owner_id,
        ]);
        dealId = dealResult.rows[0].id;

        // Link contact to deal via junction table
        await client.query(
          P('INSERT INTO deal_contacts (deal_id, contact_id, role) VALUES (?, ?, ?)'),
          [dealId, contactId, 'Primary']
        );
      }

      // 4. Mark lead as converted
      await client.query(P(`
        UPDATE leads SET
          converted = 1,
          converted_at = NOW(),
          converted_account_id = ?,
          converted_contact_id = ?,
          converted_deal_id = ?,
          updated_at = NOW()
        WHERE id = ?
      `), [accountId, contactId, dealId, lead.id]);

      await client.query('COMMIT');
      result = { account_id: accountId, contact_id: contactId, deal_id: dealId, lead_id: lead.id };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
