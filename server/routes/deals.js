const express = require('express');
const { DateTime } = require('luxon');
const { pool, P } = require('../database');
const { STAGE_MAP, calculateDealFinancials, commissionBasisString } = require('../utils/dealFinancials');
const router = express.Router();

function isFiniteNonNegative(val) {
  const n = Number(val);
  return Number.isFinite(n) && n >= 0;
}

function isPositiveInteger(val) {
  const n = Number(val);
  return Number.isFinite(n) && Number.isInteger(n) && n > 0;
}

function normaliseOverrideAmount(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  return Number(value);
}

const ALLOWED_DEAL_SORT_FIELDS = [
  'close_date', 'gross_total_value', 'deal_name', 'stage',
  'probability', 'created_at', 'updated_at', 'commission_amount', 'total_contract_earnings',
];

// GET /api/deals/summary/by-bu — MUST be before /summary and /:id
router.get('/summary/by-bu', async (req, res) => {
  try {
    const { rows: data } = await pool.query(`
      SELECT
        business_unit,
        COUNT(*) AS deal_count,
        COALESCE(SUM(total_contract_earnings), 0) AS total_commission,
        COALESCE(SUM(gross_total_value), 0) AS gross_total
      FROM deals
      WHERE stage NOT IN ('Closed Won', 'Closed Lost')
        AND business_unit IS NOT NULL
      GROUP BY business_unit
    `);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/deals/summary — MUST be before /:id
router.get('/summary', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        COUNT(*) AS open_deal_count,
        COALESCE(SUM(gross_total_value), 0) AS open_gross_total,
        COALESCE(SUM(weighted_value), 0) AS open_weighted_total,
        COALESCE(SUM(total_contract_earnings), 0) AS projected_commission_total
      FROM deals
      WHERE stage NOT IN ('Closed Won', 'Closed Lost')
    `);
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/deals/closing-soon — MUST be before /:id
router.get('/closing-soon', async (req, res) => {
  try {
    const rawDays = Number.parseInt(req.query.days, 10);
    const days = Number.isFinite(rawDays) ? Math.min(Math.max(rawDays, 1), 90) : 30;

    // close_date is a DATE field (yyyy-MM-dd), NOT a UTC timestamp.
    // Use the Sydney date string directly — converting to UTC would shift Sydney
    // midnight to the previous UTC day and exclude deals on the cutoff date.
    const cutoffStr = DateTime.now()
      .setZone('Australia/Sydney')
      .startOf('day')
      .plus({ days })
      .toISODate();

    const validBUs = ['ASC', 'Simply Seated'];
    const buFilter = validBUs.includes(req.query.business_unit) ? req.query.business_unit : null;

    let sql = `
      SELECT
        deals.id,
        deals.deal_name,
        deals.stage,
        deals.close_date,
        deals.total_contract_earnings,
        deals.probability,
        deals.business_unit,
        accounts.name AS account_name
      FROM deals
      LEFT JOIN accounts ON deals.account_id = accounts.id
      WHERE deals.close_date IS NOT NULL
        AND deals.close_date <= ?
        AND deals.stage NOT IN ('Closed Won', 'Closed Lost')
    `;
    // NO lower bound on close_date — overdue open deals must be included
    const params = [cutoffStr];

    if (buFilter) {
      sql += ` AND deals.business_unit = ?`;
      params.push(buFilter);
    }

    sql += ` ORDER BY deals.close_date ASC`;

    const { rows: deals } = await pool.query(P(sql), params);
    res.json({ success: true, data: deals });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/deals/stale — MUST be before /:id
router.get('/stale', async (req, res) => {
  try {
    const rawDays = Number.parseInt(req.query.days, 10);
    const days = Number.isFinite(rawDays) ? Math.min(Math.max(rawDays, 1), 90) : 14;

    // Timestamps are stored as UTC — convert before formatting.
    const thresholdStr = DateTime.now()
      .setZone('Australia/Sydney')
      .startOf('day')
      .minus({ days })
      .toUTC()
      .toFormat('yyyy-LL-dd HH:mm:ss');

    const todayUtcStr = DateTime.now().toUTC().toFormat('yyyy-LL-dd HH:mm:ss');

    const validBUs = ['ASC', 'Simply Seated'];
    const buFilter = validBUs.includes(req.query.business_unit) ? req.query.business_unit : null;

    let whereClause = `WHERE deals.stage NOT IN ('Closed Won', 'Closed Lost')`;
    const innerParams = [];

    if (buFilter) {
      whereClause += ` AND deals.business_unit = ?`;
      innerParams.push(buFilter);
    }

    const innerSql = `
      SELECT
        deals.id,
        deals.deal_name,
        deals.stage,
        deals.close_date,
        deals.total_contract_earnings,
        deals.business_unit,
        accounts.name AS account_name,
        (
          SELECT MAX(touch_date)
          FROM (
            SELECT created_at AS touch_date FROM activities WHERE deal_id = deals.id
            UNION ALL
            SELECT created_at AS touch_date FROM notes WHERE deal_id = deals.id
          ) touches
        ) AS last_touch_date,
        (
          SELECT MIN(due_datetime)
          FROM tasks
          WHERE tasks.deal_id = deals.id
            AND tasks.status != 'Completed'
        ) AS next_open_task_due
      FROM deals
      LEFT JOIN accounts ON deals.account_id = accounts.id
      ${whereClause}
    `;

    const wrappedSql = `
      SELECT *,
        CASE
          WHEN last_touch_date IS NULL THEN NULL
          ELSE FLOOR(EXTRACT(EPOCH FROM (?::timestamp - last_touch_date)) / 86400)::integer
        END AS days_stale
      FROM (${innerSql}) sub
      WHERE sub.last_touch_date IS NULL
         OR sub.last_touch_date < ?::timestamp
      ORDER BY sub.close_date ASC
    `;

    // Parameter order: ?::timestamp (today) → ...buFilter → sub.last_touch_date < ?
    const params = [todayUtcStr, ...innerParams, thresholdStr];
    const { rows: staleDeals } = await pool.query(P(wrappedSql), params);

    res.json({ success: true, data: staleDeals });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/deals
router.get('/', async (req, res) => {
  try {
    const { business_unit, stage, account_id, forecast_category, product_id, search, open_only, sort_by, sort_dir, limit, offset } = req.query;

    const whereClauses = [];
    const params = [];

    if (business_unit) { whereClauses.push('deals.business_unit = ?'); params.push(business_unit); }
    if (stage) { whereClauses.push('deals.stage = ?'); params.push(stage); }
    if (account_id) { whereClauses.push('deals.account_id = ?'); params.push(account_id); }
    if (forecast_category) { whereClauses.push('deals.forecast_category = ?'); params.push(forecast_category); }
    if (product_id) {
      whereClauses.push('deals.id IN (SELECT deal_id FROM deal_line_items WHERE product_id = ?)');
      params.push(Number(product_id));
    }
    if (search) {
      whereClauses.push('deals.deal_name ILIKE ?');
      params.push(`%${search}%`);
    }
    if (open_only === 'true') {
      whereClauses.push(`deals.stage NOT IN ('Closed Won', 'Closed Lost')`);
    }

    const where = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const safeSortBy = ALLOWED_DEAL_SORT_FIELDS.includes(sort_by)
      ? `deals.${sort_by}`
      : 'deals.close_date';
    const safeSortDir = sort_dir === 'desc' ? 'DESC' : 'ASC';
    const safeLimit = Math.min(parseInt(limit) || 100, 100);
    const safeOffset = parseInt(offset) || 0;

    const { rows: deals } = await pool.query(P(`
      SELECT
        deals.id,
        deals.deal_name,
        deals.account_id,
        deals.stage,
        deals.probability,
        deals.forecast_category,
        deals.close_date,
        deals.lead_source,
        deals.business_unit,
        deals.deal_type,
        deals.gross_total_value,
        deals.manual_gross_value,
        deals.monthly_recurring_revenue,
        deals.commission_percentage,
        deals.commission_amount,
        deals.commission_override_amount,
        deals.contract_term_months,
        deals.total_contract_earnings,
        deals.weighted_value,
        deals.reference_no,
        deals.description,
        deals.next_action,
        deals.next_action_date,
        deals.deal_owner_id,
        deals.converted_from_lead_id,
        deals.created_at,
        deals.updated_at,
        accounts.name AS account_name
      FROM deals
      LEFT JOIN accounts ON deals.account_id = accounts.id
      ${where}
      ORDER BY ${safeSortBy} ${safeSortDir}
      LIMIT ? OFFSET ?
    `), [...params, safeLimit, safeOffset]);

    res.json({ success: true, data: deals });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/deals/:id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const dealResult = await pool.query(P(`
      SELECT
        deals.id,
        deals.deal_name,
        deals.account_id,
        deals.stage,
        deals.probability,
        deals.forecast_category,
        deals.close_date,
        deals.lead_source,
        deals.business_unit,
        deals.deal_type,
        deals.gross_total_value,
        deals.manual_gross_value,
        deals.monthly_recurring_revenue,
        deals.commission_percentage,
        deals.commission_amount,
        deals.commission_override_amount,
        deals.contract_term_months,
        deals.total_contract_earnings,
        deals.weighted_value,
        deals.commission_warning,
        deals.reference_no,
        deals.description,
        deals.executive_summary,
        deals.next_action,
        deals.next_action_date,
        deals.deal_owner_id,
        deals.converted_from_lead_id,
        deals.created_at,
        deals.updated_at,
        accounts.name AS account_name
      FROM deals
      LEFT JOIN accounts ON deals.account_id = accounts.id
      WHERE deals.id = ?
    `), [id]);
    const deal = dealResult.rows[0];

    if (!deal) return res.status(404).json({ success: false, error: 'Deal not found' });

    const { rows: line_items } = await pool.query(P(`
      SELECT
        deal_line_items.id,
        deal_line_items.deal_id,
        deal_line_items.product_id,
        deal_line_items.product_name,
        deal_line_items.sku,
        deal_line_items.description,
        deal_line_items.quantity,
        deal_line_items.unit_price,
        deal_line_items.unit_type,
        deal_line_items.contract_term_months,
        deal_line_items.line_total,
        deal_line_items.commission_pct,
        deal_line_items.commission_amount,
        deal_line_items.is_recurring
      FROM deal_line_items
      WHERE deal_line_items.deal_id = ?
      ORDER BY deal_line_items.id ASC
    `), [id]);

    const { rows: contacts } = await pool.query(P(`
      SELECT
        contacts.id,
        contacts.first_name,
        contacts.last_name,
        contacts.first_name || ' ' || contacts.last_name AS full_name,
        contacts.title,
        contacts.email,
        contacts.phone,
        deal_contacts.role
      FROM deal_contacts
      JOIN contacts ON deal_contacts.contact_id = contacts.id
      WHERE deal_contacts.deal_id = ?
    `), [id]);

    res.json({
      success: true,
      data: {
        ...deal,
        commission_basis: commissionBasisString(deal),
        line_items,
        contacts,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

async function validateDealPayload(safeBody, rawLineItems, rawContactRoles) {
  if (!safeBody.deal_name?.trim()) return { error: 'Deal name is required' };
  if (!['ASC', 'Simply Seated'].includes(safeBody.business_unit)) {
    return { error: 'business_unit must be ASC or Simply Seated' };
  }
  if (!STAGE_MAP[safeBody.stage]) return { error: 'Invalid stage' };

  if (safeBody.business_unit === 'ASC') {
    if (!['Direct Customer', 'Partner', 'Referral'].includes(safeBody.deal_type)) {
      return { error: 'ASC deal_type must be Direct Customer, Partner, or Referral' };
    }
    const hasOverride =
      safeBody.commission_override_amount !== null &&
      safeBody.commission_override_amount !== undefined &&
      String(safeBody.commission_override_amount).trim() !== '';
    if (!hasOverride && !isPositiveInteger(safeBody.contract_term_months)) {
      return { error: 'ASC deals require a positive integer contract_term_months unless commission override is set' };
    }
  }

  if (
    safeBody.commission_override_amount !== null &&
    safeBody.commission_override_amount !== undefined &&
    String(safeBody.commission_override_amount).trim() !== ''
  ) {
    if (!isFiniteNonNegative(safeBody.commission_override_amount)) {
      return { error: 'commission_override_amount must be a non-negative number' };
    }
  }

  if (safeBody.account_id) {
    const accountResult = await pool.query(
      P('SELECT id, business_unit FROM accounts WHERE id = ?'),
      [safeBody.account_id]
    );
    const account = accountResult.rows[0];
    if (!account) return { error: 'Account not found' };
    if (account.business_unit !== 'Both' && account.business_unit !== safeBody.business_unit) {
      return { error: `Business unit mismatch: account is ${account.business_unit} but deal is ${safeBody.business_unit}` };
    }
  }

  const resolvedLineItems = [];
  for (const [i, item] of rawLineItems.entries()) {
    if (!isFiniteNonNegative(item.quantity)) {
      return { error: `Line item ${i + 1}: quantity must be a non-negative number` };
    }
    if (!isFiniteNonNegative(item.unit_price)) {
      return { error: `Line item ${i + 1}: unit_price must be a non-negative number` };
    }

    let resolvedItem = {
      product_id: null,
      product_name: String(item.product_name || item.description || 'Custom Item').trim(),
      sku: null,
      description: item.description || null,
      quantity: Number(item.quantity),
      unit_price: Number(item.unit_price),
      unit_type: item.unit_type || null,
      is_recurring: item.is_recurring ? 1 : 0,
      commission_pct: null,
    };

    if (item.product_id) {
      const productResult = await pool.query(
        P('SELECT * FROM products WHERE id = ?'),
        [item.product_id]
      );
      const product = productResult.rows[0];
      if (!product) return { error: `Line item ${i + 1}: product ID ${item.product_id} not found` };
      if (product.business_unit !== safeBody.business_unit && product.business_unit !== 'Both') {
        return { error: `Line item ${i + 1}: product does not match deal business unit` };
      }
      resolvedItem.product_id = product.id;
      resolvedItem.product_name = product.name;
      resolvedItem.sku = product.sku;
      resolvedItem.unit_type = product.unit_type;
      resolvedItem.is_recurring = product.is_recurring ? 1 : 0;
      resolvedItem.commission_pct = product.default_commission_pct;
      resolvedItem.quantity = Number(item.quantity);
      resolvedItem.unit_price = Number(item.unit_price);
      resolvedItem.description = item.description || product.description || null;
    }

    resolvedLineItems.push(resolvedItem);
  }

  const validRoles = ['Primary', 'Operations', 'Billing', 'Technical', 'Executive', 'Other'];
  const seenContactIds = new Set();
  const resolvedContactRoles = [];

  for (const cr of rawContactRoles) {
    if (!cr.contact_id) return { error: 'Each contact_role entry must have a contact_id' };
    if (!validRoles.includes(cr.role)) return { error: `Invalid contact role: ${cr.role}` };
    if (seenContactIds.has(Number(cr.contact_id))) return { error: 'Duplicate contact in contact_roles' };
    seenContactIds.add(Number(cr.contact_id));

    const contactResult = await pool.query(
      P('SELECT id, account_id FROM contacts WHERE id = ?'),
      [cr.contact_id]
    );
    const contact = contactResult.rows[0];
    if (!contact) return { error: `Contact ID ${cr.contact_id} not found` };

    if (safeBody.account_id) {
      if (!contact.account_id || contact.account_id !== Number(safeBody.account_id)) {
        return { error: `Contact ${cr.contact_id} does not belong to the selected account` };
      }
    }
    resolvedContactRoles.push({ contact_id: Number(cr.contact_id), role: cr.role });
  }

  return { resolvedLineItems, resolvedContactRoles };
}

async function insertLineItems(client, dealId, lineItems) {
  for (const item of lineItems) {
    const line_total = Math.round(item.quantity * item.unit_price * 100) / 100;
    const item_commission_amount = Math.round(line_total * (Number(item.commission_pct) || 0) * 100) / 100;
    await client.query(P(`
      INSERT INTO deal_line_items (
        deal_id, product_id, product_name, sku, description,
        quantity, unit_price, unit_type, line_total,
        commission_pct, commission_amount, is_recurring
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `), [
      dealId, item.product_id || null, item.product_name, item.sku || null,
      item.description || null, item.quantity, item.unit_price,
      item.unit_type || null, line_total,
      item.commission_pct || null, item_commission_amount, item.is_recurring ? 1 : 0
    ]);
  }
}

async function insertContactRoles(client, dealId, contactRoles) {
  for (const cr of contactRoles) {
    await client.query(
      P('INSERT INTO deal_contacts (deal_id, contact_id, role) VALUES (?, ?, ?)'),
      [dealId, cr.contact_id, cr.role]
    );
  }
}

// POST /api/deals
router.post('/', async (req, res) => {
  try {
    const { deal_owner_id: _stripped, ...safeBody } = req.body;
    const { line_items: rawLineItems = [], contact_roles: rawContactRoles = [] } = safeBody;

    const validation = await validateDealPayload(safeBody, rawLineItems, rawContactRoles);
    if (validation.error) return res.status(400).json({ success: false, error: validation.error });
    const { resolvedLineItems, resolvedContactRoles } = validation;

    const client = await pool.connect();
    let dealId;
    let commissionWarning = null;
    try {
      await client.query('BEGIN');

      // Tiered Simply Seated commission depends on the account's first Closed Won
      // deal. Read it BEFORE the INSERT so the new row never skews the lookup.
      let context = {};
      if (safeBody.business_unit === 'Simply Seated' && safeBody.account_id) {
        const firstDealResult = await client.query(P(`
          SELECT MIN(close_date) as first_date
          FROM deals
          WHERE stage = 'Closed Won'
            AND business_unit = 'Simply Seated'
            AND account_id = ?
        `), [safeBody.account_id]);
        context = { firstDealDate: firstDealResult.rows[0]?.first_date || null };
      }

      const financials = calculateDealFinancials(safeBody, resolvedLineItems, context);
      const result = await client.query(P(`
        INSERT INTO deals (
          deal_name, account_id, stage, probability, forecast_category,
          close_date, lead_source, business_unit, deal_type,
          gross_total_value, manual_gross_value, monthly_recurring_revenue, commission_percentage,
          commission_amount, commission_override_amount, contract_term_months,
          total_contract_earnings, weighted_value,
          reference_no, description, next_action, next_action_date, deal_owner_id, commission_warning
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id
      `), [
        safeBody.deal_name,
        safeBody.account_id || null,
        safeBody.stage,
        financials.probability,
        financials.forecast_category,
        safeBody.close_date || null,
        safeBody.lead_source || null,
        safeBody.business_unit,
        safeBody.deal_type || null,
        financials.gross_total_value,
        normaliseOverrideAmount(safeBody.manual_gross_value),
        financials.monthly_recurring_revenue,
        financials.commission_percentage,
        financials.commission_amount,
        normaliseOverrideAmount(safeBody.commission_override_amount),
        safeBody.contract_term_months || null,
        financials.total_contract_earnings,
        financials.weighted_value,
        safeBody.reference_no || null,
        safeBody.description || null,
        safeBody.next_action || null,
        safeBody.next_action_date || null,
        req.user.id,
        financials.commission_warning,
      ]);

      dealId = result.rows[0].id;
      commissionWarning = financials.commission_warning;
      await insertLineItems(client, dealId, resolvedLineItems);
      await insertContactRoles(client, dealId, resolvedContactRoles);

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    res.status(201).json({ success: true, data: { id: dealId, commission_warning: commissionWarning } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/deals/:id
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await pool.query(P('SELECT id FROM deals WHERE id = ?'), [id]);
    if (existing.rows.length === 0) return res.status(404).json({ success: false, error: 'Deal not found' });

    const { deal_owner_id: _stripped, ...safeBody } = req.body;
    const { line_items: rawLineItems = [], contact_roles: rawContactRoles = [] } = safeBody;

    const validation = await validateDealPayload(safeBody, rawLineItems, rawContactRoles);
    if (validation.error) return res.status(400).json({ success: false, error: validation.error });
    const { resolvedLineItems, resolvedContactRoles } = validation;

    const client = await pool.connect();
    let commissionWarning = null;
    try {
      await client.query('BEGIN');

      // Tiered Simply Seated commission depends on the account's first Closed Won
      // deal. Read it BEFORE the UPDATE (excluding this deal) so a stage change
      // written below cannot affect the lookup.
      let context = {};
      if (safeBody.business_unit === 'Simply Seated' && safeBody.account_id) {
        const firstDealResult = await client.query(P(`
          SELECT MIN(close_date) as first_date
          FROM deals
          WHERE stage = 'Closed Won'
            AND business_unit = 'Simply Seated'
            AND account_id = ?
            AND id != ?
        `), [safeBody.account_id, id]);
        context = { firstDealDate: firstDealResult.rows[0]?.first_date || null };
      }

      const financials = calculateDealFinancials(safeBody, resolvedLineItems, context);
      commissionWarning = financials.commission_warning;

      // Closing a deal stamps the close date to today (UTC) as the source of
      // truth, ignoring whatever close_date the client submitted.
      const closeDate = safeBody.stage === 'Closed Won'
        ? DateTime.utc().toISODate()
        : (safeBody.close_date || null);

      await client.query(P(`
        UPDATE deals SET
          deal_name = ?, account_id = ?, stage = ?,
          probability = ?, forecast_category = ?,
          close_date = ?, lead_source = ?,
          business_unit = ?, deal_type = ?,
          gross_total_value = ?,
          manual_gross_value = ?,
          monthly_recurring_revenue = ?,
          commission_percentage = ?,
          commission_amount = ?,
          commission_override_amount = ?,
          contract_term_months = ?,
          total_contract_earnings = ?,
          weighted_value = ?,
          reference_no = ?,
          description = ?, next_action = ?,
          next_action_date = ?,
          commission_warning = ?,
          updated_at = NOW()
        WHERE id = ?
      `), [
        safeBody.deal_name,
        safeBody.account_id || null,
        safeBody.stage,
        financials.probability,
        financials.forecast_category,
        closeDate,
        safeBody.lead_source || null,
        safeBody.business_unit,
        safeBody.deal_type || null,
        financials.gross_total_value,
        normaliseOverrideAmount(safeBody.manual_gross_value),
        financials.monthly_recurring_revenue,
        financials.commission_percentage,
        financials.commission_amount,
        normaliseOverrideAmount(safeBody.commission_override_amount),
        safeBody.contract_term_months || null,
        financials.total_contract_earnings,
        financials.weighted_value,
        safeBody.reference_no || null,
        safeBody.description || null,
        safeBody.next_action || null,
        safeBody.next_action_date || null,
        financials.commission_warning,
        id,
      ]);

      await client.query(P('DELETE FROM deal_line_items WHERE deal_id = ?'), [id]);
      await insertLineItems(client, id, resolvedLineItems);
      await client.query(P('DELETE FROM deal_contacts WHERE deal_id = ?'), [id]);
      await insertContactRoles(client, id, resolvedContactRoles);

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    res.json({ success: true, data: { id, commission_warning: commissionWarning } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/deals/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await pool.query(P('SELECT id FROM deals WHERE id = ?'), [id]);
    if (existing.rows.length === 0) return res.status(404).json({ success: false, error: 'Deal not found' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM notes WHERE deal_id = $1', [id]);
      await client.query('DELETE FROM activities WHERE deal_id = $1', [id]);
      await client.query('DELETE FROM tasks WHERE deal_id = $1', [id]);
      await client.query('DELETE FROM deal_line_items WHERE deal_id = $1', [id]);
      await client.query('DELETE FROM deal_contacts WHERE deal_id = $1', [id]);
      // leads.converted_deal_id references deals(id) with no ON DELETE rule —
      // clear it first so a deal created via lead conversion can be deleted.
      await client.query('UPDATE leads SET converted_deal_id = NULL WHERE converted_deal_id = $1', [id]);
      await client.query('DELETE FROM deals WHERE id = $1', [id]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/deals/:id/stage
router.patch('/:id/stage', async (req, res) => {
  try {
    const { id } = req.params;
    const { stage } = req.body;
    if (!STAGE_MAP[stage]) return res.status(400).json({ success: false, error: 'Invalid stage' });

    const existingResult = await pool.query(
      P('SELECT id, gross_total_value FROM deals WHERE id = ?'),
      [id]
    );
    const existing = existingResult.rows[0];
    if (!existing) return res.status(404).json({ success: false, error: 'Deal not found' });

    const stageInfo = STAGE_MAP[stage];
    const weighted_value = Math.round((existing.gross_total_value || 0) * stageInfo.probability / 100 * 100) / 100;

    await pool.query(P(`
      UPDATE deals
      SET stage = ?, probability = ?, forecast_category = ?, weighted_value = ?, updated_at = NOW()
      WHERE id = ?
    `), [stage, stageInfo.probability, stageInfo.forecast_category, weighted_value, id]);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/deals/:id — partial update of non-financial fields only.
// Financial fields are intentionally excluded; they are derived from line
// items and must go through POST/PUT, which recalculate them.
const DEAL_PATCH_FIELDS = ['stage', 'close_date', 'next_action', 'next_action_date', 'executive_summary'];

router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const existingResult = await pool.query(
      P('SELECT id, gross_total_value FROM deals WHERE id = ?'),
      [id]
    );
    const existing = existingResult.rows[0];
    if (!existing) return res.status(404).json({ success: false, error: 'Deal not found' });

    const setParts = [];
    const params = [];
    // DATE columns reject '' in PostgreSQL — coerce blanks to NULL.
    const NON_TEXT = new Set(['close_date', 'next_action_date']);

    for (const field of DEAL_PATCH_FIELDS) {
      if (req.body[field] === undefined) continue;
      let value = req.body[field];
      if (NON_TEXT.has(field) && value === '') value = null;
      setParts.push(`${field} = ?`);
      params.push(value);
    }

    if (setParts.length === 0) {
      return res.status(400).json({ success: false, error: 'No updatable fields provided' });
    }

    // Stage drives probability / forecast / weighted value — keep them in sync,
    // matching the behaviour of PATCH /:id/stage.
    if (req.body.stage !== undefined) {
      const stageInfo = STAGE_MAP[req.body.stage];
      if (!stageInfo) return res.status(400).json({ success: false, error: 'Invalid stage' });
      const weighted_value =
        Math.round((existing.gross_total_value || 0) * stageInfo.probability / 100 * 100) / 100;
      setParts.push('probability = ?', 'forecast_category = ?', 'weighted_value = ?');
      params.push(stageInfo.probability, stageInfo.forecast_category, weighted_value);
    }

    params.push(id);
    await pool.query(
      P(`UPDATE deals SET ${setParts.join(', ')}, updated_at = NOW() WHERE id = ?`),
      params
    );

    const { rows } = await pool.query(P(`
      SELECT deals.*, accounts.name AS account_name
      FROM deals
      LEFT JOIN accounts ON deals.account_id = accounts.id
      WHERE deals.id = ?
    `), [id]);
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Roles accepted by the deal_contacts.role CHECK constraint already in the schema.
const DEAL_CONTACT_ROLES = ['Primary', 'Operations', 'Billing', 'Technical', 'Executive', 'Other'];

// GET /api/deals/:id/contacts
router.get('/:id/contacts', async (req, res) => {
  try {
    const { id } = req.params;
    const dealResult = await pool.query(P('SELECT id FROM deals WHERE id = ?'), [id]);
    if (dealResult.rows.length === 0) return res.status(404).json({ success: false, error: 'Deal not found' });

    const { rows } = await pool.query(P(`
      SELECT
        deal_contacts.contact_id,
        contacts.first_name,
        contacts.last_name,
        contacts.email,
        contacts.phone,
        accounts.name AS account_name,
        deal_contacts.role
      FROM deal_contacts
      JOIN contacts ON deal_contacts.contact_id = contacts.id
      LEFT JOIN accounts ON contacts.account_id = accounts.id
      WHERE deal_contacts.deal_id = ?
      ORDER BY deal_contacts.id ASC
    `), [id]);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/deals/:id/contacts — link a contact to a deal with a role
router.post('/:id/contacts', async (req, res) => {
  try {
    const { id } = req.params;
    const { contact_id, role } = req.body;

    if (!contact_id) return res.status(400).json({ success: false, error: 'contact_id is required' });
    if (!DEAL_CONTACT_ROLES.includes(role)) {
      return res.status(400).json({ success: false, error: 'Invalid contact role' });
    }

    const dealResult = await pool.query(P('SELECT id, account_id FROM deals WHERE id = ?'), [id]);
    const deal = dealResult.rows[0];
    if (!deal) return res.status(404).json({ success: false, error: 'Deal not found' });

    const contactResult = await pool.query(P('SELECT id, account_id FROM contacts WHERE id = ?'), [contact_id]);
    const contact = contactResult.rows[0];
    if (!contact) return res.status(404).json({ success: false, error: 'Contact not found' });

    if (deal.account_id && contact.account_id !== deal.account_id) {
      return res.status(400).json({ success: false, error: "Contact does not belong to the deal's account" });
    }

    const linked = await pool.query(
      P('SELECT id FROM deal_contacts WHERE deal_id = ? AND contact_id = ?'),
      [id, contact_id]
    );
    if (linked.rows.length > 0) {
      return res.status(400).json({ success: false, error: 'Contact is already linked to this deal' });
    }

    await pool.query(
      P('INSERT INTO deal_contacts (deal_id, contact_id, role) VALUES (?, ?, ?)'),
      [id, contact_id, role]
    );
    res.status(201).json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/deals/:id/contacts/:contactId — update a linked contact's role
router.patch('/:id/contacts/:contactId', async (req, res) => {
  try {
    const { id, contactId } = req.params;
    const { role } = req.body;
    if (!DEAL_CONTACT_ROLES.includes(role)) {
      return res.status(400).json({ success: false, error: 'Invalid contact role' });
    }

    const result = await pool.query(
      P('UPDATE deal_contacts SET role = ? WHERE deal_id = ? AND contact_id = ?'),
      [role, id, contactId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Contact is not linked to this deal' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/deals/:id/contacts/:contactId — remove a contact from a deal
router.delete('/:id/contacts/:contactId', async (req, res) => {
  try {
    const { id, contactId } = req.params;
    const result = await pool.query(
      P('DELETE FROM deal_contacts WHERE deal_id = ? AND contact_id = ?'),
      [id, contactId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Contact is not linked to this deal' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
