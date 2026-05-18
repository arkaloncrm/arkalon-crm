const express = require('express');
const { pool } = require('../database');
const router = express.Router();

// Per-entity duplicate-check config. `fields` maps an incoming payload key to
// the actual column on that table — entities only expose the columns they have
// (leads have no linkedin_url, accounts have no email/mobile, etc.).
const ENTITY_CONFIG = {
  lead: {
    table: 'leads',
    displayCol: 'company',
    fields: { company_name: 'company', email: 'email', phone: 'phone', mobile: 'mobile', website: 'website' },
  },
  account: {
    table: 'accounts',
    displayCol: 'name',
    fields: { company_name: 'name', phone: 'phone', website: 'website' },
  },
  contact: {
    table: 'contacts',
    displayCol: "TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))",
    fields: { email: 'email', phone: 'phone', mobile: 'mobile', linkedin_url: 'linkedin_url' },
  },
};

// Human-readable labels for the matched-field name returned to the client.
const FIELD_LABELS = {
  company: 'Company', name: 'Name', email: 'Email',
  phone: 'Phone', mobile: 'Mobile', website: 'Website', linkedin_url: 'LinkedIn',
};

// POST /api/validation/check-duplicate
router.post('/check-duplicate', async (req, res) => {
  try {
    const { entity_type, exclude_id } = req.body;
    const config = ENTITY_CONFIG[entity_type];
    if (!config) {
      return res.status(400).json({ success: false, error: 'entity_type must be lead, account, or contact' });
    }

    // Keep only payload fields that map to a real column and carry a value.
    const checks = [];
    for (const [payloadKey, column] of Object.entries(config.fields)) {
      const raw = req.body[payloadKey];
      if (raw !== null && raw !== undefined && String(raw).trim() !== '') {
        checks.push({ column, value: String(raw).trim() });
      }
    }
    if (checks.length === 0) return res.json({ success: true, data: [] });

    const excludeId = Number.isInteger(Number(exclude_id)) ? Number(exclude_id) : 0;

    // $1 = exclude_id, $2.. = each checked value.
    const conditions = checks.map((c, i) => `${c.column} ILIKE TRIM($${i + 2})`);
    const matchCols = [...new Set(checks.map(c => c.column))];
    const sql = `
      SELECT id, ${config.displayCol} AS display_name, ${matchCols.join(', ')}
      FROM ${config.table}
      WHERE id != $1 AND (${conditions.join(' OR ')})
      LIMIT 5
    `;
    const params = [excludeId, ...checks.map(c => c.value)];
    const { rows } = await pool.query(sql, params);

    // Work out which field(s) actually matched for each candidate record.
    const data = rows.map(row => {
      const matchedFields = checks
        .filter(c => row[c.column] != null
          && String(row[c.column]).trim().toLowerCase() === c.value.toLowerCase())
        .map(c => FIELD_LABELS[c.column] || c.column);
      return {
        id: row.id,
        name: row.display_name || `#${row.id}`,
        matched_fields: [...new Set(matchedFields)],
      };
    });

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
