const express = require('express');
const { DateTime } = require('luxon');
const { db } = require('../database');
const router = express.Router();

router.get('/summary', (req, res) => {
  try {
    const leadCount = db.prepare('SELECT COUNT(*) as count FROM leads WHERE converted = 0').get();
    const contactCount = db.prepare('SELECT COUNT(*) as count FROM contacts').get();
    const accountCount = db.prepare('SELECT COUNT(*) as count FROM accounts').get();
    const dealCount = db.prepare("SELECT COUNT(*) as count FROM deals WHERE stage NOT IN ('Closed Won','Closed Lost')").get();
    const pipeline = db.prepare("SELECT SUM(weighted_value) as total FROM deals WHERE stage NOT IN ('Closed Won','Closed Lost')").get();
    const closedWon = db.prepare("SELECT SUM(total_contract_earnings) as total FROM deals WHERE stage = 'Closed Won'").get();

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

router.get('/pipeline-by-stage', (req, res) => {
  try {
    const data = db.prepare(`
      SELECT stage, COUNT(*) as count, SUM(gross_total_value) as total_value
      FROM deals
      WHERE stage NOT IN ('Closed Won', 'Closed Lost')
      GROUP BY stage
    `).all();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/pipeline-by-bu', (req, res) => {
  try {
    const data = db.prepare(`
      SELECT business_unit, COUNT(*) as count, SUM(weighted_value) as weighted_total
      FROM deals
      WHERE stage NOT IN ('Closed Won', 'Closed Lost')
      GROUP BY business_unit
    `).all();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/reports/lead-source-performance — single merged endpoint
router.get('/lead-source-performance', (req, res) => {
  try {
    const validBUs = ['ASC', 'Simply Seated'];
    const buFilter = validBUs.includes(req.query.business_unit) ? req.query.business_unit : null;

    // Defensive schema check: verify deals.lead_source exists before querying
    const dealColumns = db.pragma('table_info(deals)').map(c => c.name);
    const dealHasLeadSource = dealColumns.includes('lead_source');

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
    const leadRows = db.prepare(leadSql).all(...leadParams);

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
      dealRows = db.prepare(dealSql).all(...dealParams);
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
router.get('/activity-summary', (req, res) => {
  try {
    const rawDays = Number.parseInt(req.query.period, 10);
    const days = Number.isFinite(rawDays) ? Math.min(Math.max(rawDays, 1), 90) : 30;

    const validBUs = ['ASC', 'Simply Seated'];
    const buFilter = validBUs.includes(req.query.business_unit) ? req.query.business_unit : null;

    // SQLite stores timestamps as UTC strings — convert before formatting.
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
    const byType = db.prepare(activitySql).all(...activityParams);

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
    const overdue = db.prepare(overdueSql).get(...overdueParams);

    let completedSql = `
      SELECT COUNT(*) AS count FROM tasks
      WHERE status = 'Completed' AND completed_at >= ?
    `;
    const completedParams = [thresholdStr];
    if (buFilter) {
      completedSql += ` AND business_unit = ?`;
      completedParams.push(buFilter);
    }
    const completedTasks = db.prepare(completedSql).get(...completedParams);

    res.json({ success: true, data: { byType, overdue, completedTasks, days } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
