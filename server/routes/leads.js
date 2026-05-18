const express = require('express');
const { db } = require('../database');
const router = express.Router();

const STAGE_PROBABILITY = {
  'New': 10, 'Contacted': 20, 'Qualified': 40, 'Quoted': 60,
  'Commit': 80, 'Closed Won': 100, 'Closed Lost': 0,
};

// GET /api/leads
router.get('/', (req, res) => {
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
      conditions.push('(l.company LIKE ? OR l.first_name LIKE ? OR l.last_name LIKE ? OR l.email LIKE ?)');
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const allowedSorts = ['created_at', 'updated_at', 'company', 'last_name', 'lead_status', 'priority', 'business_unit'];
    const col = allowedSorts.includes(sort_by) ? sort_by : 'created_at';
    const dir = sort_dir === 'asc' ? 'ASC' : 'DESC';

    const leads = db.prepare(`
      SELECT l.*, u.name as lead_owner_name
      FROM leads l
      LEFT JOIN users u ON l.lead_owner_id = u.id
      ${where}
      ORDER BY l.${col} ${dir}
    `).all(...params);

    res.json({ success: true, data: leads, total: leads.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/leads/:id
router.get('/:id', (req, res) => {
  try {
    const lead = db.prepare(`
      SELECT l.*, u.name as lead_owner_name
      FROM leads l
      LEFT JOIN users u ON l.lead_owner_id = u.id
      WHERE l.id = ?
    `).get(req.params.id);
    if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });
    res.json({ success: true, data: lead });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/leads
router.post('/', (req, res) => {
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

    const result = db.prepare(`
      INSERT INTO leads (
        salutation, first_name, last_name, title, company, email, phone, mobile,
        website, industry, employee_count, annual_revenue, lead_source, lead_status,
        business_unit, target_type, description, warm_path, next_action,
        next_action_date, last_contacted, priority, lead_owner_id,
        street, city, state, postcode, country
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      salutation, first_name, last_name, title, company, email, phone, mobile,
      website, industry, employee_count, annual_revenue, lead_source, lead_status || 'New',
      business_unit, target_type, description, warm_path, next_action,
      next_action_date, last_contacted, priority, lead_owner_id || req.user.id,
      street, city, state, postcode, country || 'Australia',
    );

    const lead = db.prepare(`
      SELECT l.*, u.name as lead_owner_name
      FROM leads l LEFT JOIN users u ON l.lead_owner_id = u.id
      WHERE l.id = ?
    `).get(result.lastInsertRowid);
    res.status(201).json({ success: true, data: lead });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/leads/:id
router.put('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT id FROM leads WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Lead not found' });

    const fields = [
      'salutation', 'first_name', 'last_name', 'title', 'company', 'email', 'phone', 'mobile',
      'website', 'industry', 'employee_count', 'annual_revenue', 'lead_source', 'lead_status',
      'business_unit', 'target_type', 'description', 'warm_path', 'next_action',
      'next_action_date', 'last_contacted', 'priority', 'lead_owner_id',
      'street', 'city', 'state', 'postcode', 'country',
    ];
    const updates = fields.filter(f => req.body[f] !== undefined);
    if (updates.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });

    const setClause = updates.map(f => `${f} = ?`).join(', ');
    db.prepare(`UPDATE leads SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(...updates.map(f => req.body[f]), req.params.id);

    const lead = db.prepare(`
      SELECT l.*, u.name as lead_owner_name
      FROM leads l LEFT JOIN users u ON l.lead_owner_id = u.id
      WHERE l.id = ?
    `).get(req.params.id);
    res.json({ success: true, data: lead });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/leads/:id
router.delete('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT id FROM leads WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Lead not found' });

    const deleteLeadTx = db.transaction((id) => {
      db.prepare('DELETE FROM notes WHERE lead_id = ?').run(id);
      db.prepare('DELETE FROM activities WHERE lead_id = ?').run(id);
      db.prepare('DELETE FROM tasks WHERE lead_id = ?').run(id);
      // deals.converted_from_lead_id references leads(id) with no ON DELETE rule —
      // clear it first so a lead with a converted deal can be deleted.
      db.prepare('UPDATE deals SET converted_from_lead_id = NULL WHERE converted_from_lead_id = ?').run(id);
      db.prepare('DELETE FROM leads WHERE id = ?').run(id);
    });
    deleteLeadTx(req.params.id);

    res.json({ success: true, message: 'Lead deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/leads/:id/convert
router.post('/:id/convert', (req, res) => {
  try {
    const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
    if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });
    if (lead.converted) return res.status(400).json({ success: false, error: 'Lead is already converted' });

    const { account_name, create_deal, deal_name, deal_stage, deal_close_date } = req.body;
    if (!account_name) return res.status(400).json({ success: false, error: 'account_name is required' });

    // Force business_unit from the lead record — never trust payload
    const { business_unit } = lead;
    const stage = deal_stage || 'New';
    const probability = STAGE_PROBABILITY[stage] ?? 10;

    const convert = db.transaction(() => {
      // 1. Create Account
      const accountResult = db.prepare(`
        INSERT INTO accounts (name, website, industry, employee_count, annual_revenue, phone,
          billing_street, billing_city, billing_state, billing_postcode, billing_country,
          business_unit, account_owner_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
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
      );
      const accountId = accountResult.lastInsertRowid;

      // 2. Create Contact
      const contactResult = db.prepare(`
        INSERT INTO contacts (account_id, salutation, first_name, last_name, title,
          email, phone, mobile, business_unit, contact_owner_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
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
      );
      const contactId = contactResult.lastInsertRowid;

      // 3. Optionally create Deal
      let dealId = null;
      if (create_deal && deal_name) {
        const grossTotal = Math.round(0 * 100) / 100;
        const dealResult = db.prepare(`
          INSERT INTO deals (deal_name, account_id, stage, probability, close_date,
            business_unit, gross_total_value, commission_amount, total_contract_earnings,
            weighted_value, forecast_category, converted_from_lead_id, deal_owner_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
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
        );
        dealId = dealResult.lastInsertRowid;

        // Link contact to deal via junction table
        db.prepare(`
          INSERT INTO deal_contacts (deal_id, contact_id, role) VALUES (?, ?, ?)
        `).run(dealId, contactId, 'Primary');
      }

      // 4. Mark lead as converted
      db.prepare(`
        UPDATE leads SET
          converted = 1,
          converted_at = CURRENT_TIMESTAMP,
          converted_account_id = ?,
          converted_contact_id = ?,
          converted_deal_id = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(accountId, contactId, dealId, lead.id);

      return { account_id: accountId, contact_id: contactId, deal_id: dealId, lead_id: lead.id };
    });

    const result = convert();
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
