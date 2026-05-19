const express = require('express');
const { DateTime } = require('luxon');
const { pool, P } = require('../database');
const router = express.Router();

router.get('/summary', async (req, res) => {
  try {
    const leadCount = (await pool.query('SELECT COUNT(*) as count FROM leads WHERE converted = 0')).rows[0];
    const contactCount = (await pool.query('SELECT COUNT(*) as count FROM contacts')).rows[0];
    const accountCount = (await pool.query('SELECT COUNT(*) as count FROM accounts')).rows[0];
    const dealCount = (await pool.query("SELECT COUNT(*) as count FROM deals WHERE stage NOT IN ('Closed Won','Closed Lost')")).rows[0];
    const pipeline = (await pool.query("SELECT SUM(weighted_value) as total FROM deals WHERE stage NOT IN ('Closed Won','Closed Lost')")).rows[0];
    const closedWon = (await pool.query("SELECT SUM(total_contract_earnings) as total FROM deals WHERE stage = 'Closed Won'")).rows[0];

    res.json({
      success: true,
      data: {
        leads: leadCount.count,
        contacts: contactCount.count,
        accounts: accountCount.count,
        open_deals: dealCount.count,
        pipeline_value: Math.round((pipeline.total || 0) * 100) / 100,
        closed_won_value: Math.round((closedWon.total || 0) * 100) / 100,
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/pipeline-by-stage', async (req, res) => {
  try {
    const { rows: data } = await pool.query(`
      SELECT stage, COUNT(*) as count, SUM(gross_total_value) as total_value
      FROM deals
      WHERE stage NOT IN ('Closed Won', 'Closed Lost')
      GROUP BY stage
    `);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/pipeline-by-bu', async (req, res) => {
  try {
    const { rows: data } = await pool.query(`
      SELECT business_unit, COUNT(*) as count, SUM(weighted_value) as weighted_total
      FROM deals
      WHERE stage NOT IN ('Closed Won', 'Closed Lost')
      GROUP BY business_unit
    `);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/reports/lead-source-performance — single merged endpoint
router.get('/lead-source-performance', async (req, res) => {
  try {
    const validBUs = ['ASC', 'Simply Seated'];
    const buFilter = validBUs.includes(req.query.business_unit) ? req.query.business_unit : null;

    // Defensive schema check: verify deals.lead_source exists before querying
    const colResult = await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'deals'"
    );
    const dealHasLeadSource = colResult.rows.some(c => c.column_name === 'lead_source');

    let leadSql = `
      SELECT
        COALESCE(lead_source, 'Unknown') AS source,
        business_unit,
        COUNT(*) AS lead_count,
        SUM(CASE WHEN converted = 1 THEN 1 ELSE 0 END) AS converted_count
      FROM leads
      WHERE 1=1
    `;
    const leadParams = [];
    if (buFilter) {
      leadSql += ` AND business_unit = ?`;
      leadParams.push(buFilter);
    }
    leadSql += ` GROUP BY lead_source, business_unit`;
    const leadRows = (await pool.query(P(leadSql), leadParams)).rows;

    let dealRows = [];
    if (dealHasLeadSource) {
      let dealSql = `
        SELECT
          COALESCE(lead_source, 'Unknown') AS source,
          business_unit,
          COUNT(*) AS deal_count,
          COALESCE(SUM(total_contract_earnings), 0) AS total_commission
        FROM deals
        WHERE 1=1
      `;
      const dealParams = [];
      if (buFilter) {
        dealSql += ` AND business_unit = ?`;
        dealParams.push(buFilter);
      }
      dealSql += ` GROUP BY lead_source, business_unit`;
      dealRows = (await pool.query(P(dealSql), dealParams)).rows;
    }

    const map = {};
    for (const row of leadRows) {
      const key = `${row.source}|${row.business_unit}`;
      map[key] = {
        source: row.source,
        business_unit: row.business_unit,
        lead_count: row.lead_count,
        converted_count: row.converted_count,
        conversion_rate: row.lead_count > 0
          ? Math.round((row.converted_count / row.lead_count) * 100)
          : 0,
        deal_count: 0,
        total_commission: 0,
      };
    }
    for (const row of dealRows) {
      const key = `${row.source}|${row.business_unit}`;
      if (map[key]) {
        map[key].deal_count = row.deal_count;
        map[key].total_commission = row.total_commission;
      } else {
        map[key] = {
          source: row.source,
          business_unit: row.business_unit,
          lead_count: 0,
          converted_count: 0,
          conversion_rate: 0,
          deal_count: row.deal_count,
          total_commission: row.total_commission,
        };
      }
    }

    const merged = Object.values(map).sort((a, b) => b.total_commission - a.total_commission);
    res.json({ success: true, data: merged });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/reports/activity-summary
router.get('/activity-summary', async (req, res) => {
  try {
    const rawDays = Number.parseInt(req.query.period, 10);
    const days = Number.isFinite(rawDays) ? Math.min(Math.max(rawDays, 1), 90) : 30;

    const validBUs = ['ASC', 'Simply Seated'];
    const buFilter = validBUs.includes(req.query.business_unit) ? req.query.business_unit : null;

    // Timestamps are stored as UTC — convert before formatting.
    const thresholdStr = DateTime.now()
      .setZone('Australia/Sydney')
      .startOf('day')
      .minus({ days })
      .toUTC()
      .toFormat('yyyy-LL-dd HH:mm:ss');

    let activitySql = `
      SELECT
        type,
        COUNT(*) AS count,
        business_unit,
        SUM(CASE WHEN direction = 'Outbound' THEN 1 ELSE 0 END) AS outbound_count,
        SUM(CASE WHEN direction = 'Inbound' THEN 1 ELSE 0 END) AS inbound_count
      FROM activities
      WHERE COALESCE(start_datetime, created_at) >= ?
    `;
    const activityParams = [thresholdStr];
    if (buFilter) {
      activitySql += ` AND business_unit = ?`;
      activityParams.push(buFilter);
    }
    activitySql += ` GROUP BY type, business_unit ORDER BY count DESC`;
    const byType = (await pool.query(P(activitySql), activityParams)).rows;

    // Overdue tasks — Luxon UTC string, consistent with task date handling
    const nowUtcStr = DateTime.now().toUTC().toFormat('yyyy-LL-dd HH:mm:ss');
    let overdueSql = `
      SELECT COUNT(*) AS count FROM tasks
      WHERE due_datetime < ? AND status != 'Completed'
    `;
    const overdueParams = [nowUtcStr];
    if (buFilter) {
      overdueSql += ` AND business_unit = ?`;
      overdueParams.push(buFilter);
    }
    const overdue = (await pool.query(P(overdueSql), overdueParams)).rows[0];

    let completedSql = `
      SELECT COUNT(*) AS count FROM tasks
      WHERE status = 'Completed' AND completed_at >= ?
    `;
    const completedParams = [thresholdStr];
    if (buFilter) {
      completedSql += ` AND business_unit = ?`;
      completedParams.push(buFilter);
    }
    const completedTasks = (await pool.query(P(completedSql), completedParams)).rows[0];

    res.json({ success: true, data: { byType, overdue, completedTasks, days } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Commission reports -----------------------------------------------------
// Commission is read straight from deals.total_contract_earnings, which the
// deal POST/PUT routes compute via calculateDealFinancials (override → line
// items → BU default rate). Reports never re-derive it and never weight it by
// probability. close_date is a pure DATE — Sydney boundary strings are compared
// directly, with no UTC conversion (converting would shift Sydney midnight to
// the previous UTC day and drop deals on the boundary date).

// GET /api/reports/commission-earned — Report 1: Closed Won this calendar month
router.get('/commission-earned', async (req, res) => {
  try {
    const now = DateTime.now().setZone('Australia/Sydney');
    const monthStart = now.startOf('month').toISODate();
    const monthEnd = now.endOf('month').toISODate();

    const { rows: deals } = await pool.query(P(`
      SELECT
        deals.id,
        deals.deal_name,
        deals.business_unit,
        deals.close_date,
        deals.gross_total_value,
        deals.total_contract_earnings,
        accounts.name AS account_name
      FROM deals
      LEFT JOIN accounts ON deals.account_id = accounts.id
      WHERE deals.stage = 'Closed Won'
        AND deals.close_date IS NOT NULL
        AND deals.close_date >= ?
        AND deals.close_date <= ?
      ORDER BY deals.close_date ASC
    `), [monthStart, monthEnd]);

    res.json({ success: true, data: { deals, month_label: now.toFormat('LLLL yyyy') } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/reports/commission-forecast — Report 2: open deals closing this quarter
router.get('/commission-forecast', async (req, res) => {
  try {
    const now = DateTime.now().setZone('Australia/Sydney');
    const quarterStart = now.startOf('quarter').toISODate();
    const quarterEnd = now.endOf('quarter').toISODate();

    const { rows: deals } = await pool.query(P(`
      SELECT
        deals.id,
        deals.deal_name,
        deals.business_unit,
        deals.stage,
        deals.close_date,
        deals.gross_total_value,
        deals.total_contract_earnings,
        accounts.name AS account_name
      FROM deals
      LEFT JOIN accounts ON deals.account_id = accounts.id
      WHERE deals.stage NOT IN ('Closed Won', 'Closed Lost')
        AND deals.close_date IS NOT NULL
        AND deals.close_date >= ?
        AND deals.close_date <= ?
      ORDER BY deals.close_date ASC
    `), [quarterStart, quarterEnd]);

    res.json({ success: true, data: { deals, quarter_label: `Q${now.quarter} ${now.year}` } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/reports/bu-split — Report 4: ASC vs Simply Seated commission split
router.get('/bu-split', async (req, res) => {
  try {
    const now = DateTime.now().setZone('Australia/Sydney');
    const yearStart = now.startOf('year').toISODate();
    const yearEnd = now.endOf('year').toISODate();

    const { rows: openRows } = await pool.query(`
      SELECT
        business_unit,
        COUNT(*) AS open_count,
        COALESCE(SUM(total_contract_earnings), 0) AS pipeline_commission
      FROM deals
      WHERE stage NOT IN ('Closed Won', 'Closed Lost')
        AND business_unit IS NOT NULL
      GROUP BY business_unit
    `);

    const { rows: closedRows } = await pool.query(P(`
      SELECT
        business_unit,
        COALESCE(SUM(total_contract_earnings), 0) AS closed_commission
      FROM deals
      WHERE stage = 'Closed Won'
        AND business_unit IS NOT NULL
        AND close_date >= ?
        AND close_date <= ?
      GROUP BY business_unit
    `), [yearStart, yearEnd]);

    const blank = () => ({ open_count: 0, pipeline_commission: 0, closed_commission: 0 });
    const split = { 'ASC': blank(), 'Simply Seated': blank() };
    for (const row of openRows) {
      if (split[row.business_unit]) {
        split[row.business_unit].open_count = row.open_count;
        split[row.business_unit].pipeline_commission = row.pipeline_commission;
      }
    }
    for (const row of closedRows) {
      if (split[row.business_unit]) {
        split[row.business_unit].closed_commission = row.closed_commission;
      }
    }

    res.json({ success: true, data: { split, year: now.year } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/reports/commission-by-deal — Report 6: every deal, open + closed.
// Deliberately unbounded — the /api/deals list caps at 100 rows, which would
// silently truncate this report. Sorting and filtering happen client-side.
router.get('/commission-by-deal', async (req, res) => {
  try {
    const { rows: deals } = await pool.query(`
      SELECT
        deals.id,
        deals.deal_name,
        deals.business_unit,
        deals.stage,
        deals.close_date,
        deals.gross_total_value,
        deals.commission_percentage,
        deals.commission_override_amount,
        deals.total_contract_earnings,
        accounts.name AS account_name
      FROM deals
      LEFT JOIN accounts ON deals.account_id = accounts.id
      ORDER BY deals.close_date ASC NULLS LAST
    `);
    res.json({ success: true, data: deals });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
