const { pool, P } = require('../../database');
const { resolveDateExpression, resolveDateWindow, dateWindowToUtcRange, sydneyNow } = require('../dateResolve');
const { DEAL_STAGES, DEAL_BUSINESS_UNITS, TASK_STATUSES } = require('../systemPrompt');

// Resolves a { range } OR { from, to } date-argument pair to a Sydney
// { from, to } window. Returns undefined if neither is provided, or
// { error } if provided but unparseable.
function resolveWindowArgs(range, from, to) {
  if (range) {
    const w = resolveDateWindow(range);
    return w || { error: `Could not resolve date range "${range}"` };
  }
  if (from || to) {
    const f = from ? resolveDateExpression(from) : null;
    const t = to ? resolveDateExpression(to) : null;
    if (from && !f) return { error: `Could not resolve date "${from}"` };
    if (to && !t) return { error: `Could not resolve date "${to}"` };
    return { from: f, to: t };
  }
  return undefined;
}

async function queryDeals(args = {}, ctx = {}) {
  const {
    account_name, business_unit, stage, stages, min_value, max_value,
    close_date_range, close_date_from, close_date_to,
    created_by_me, created_within_days, open_only,
    sort_by, sort_dir, limit,
  } = args;

  const where = [];
  const params = [];

  if (business_unit) {
    if (!DEAL_BUSINESS_UNITS.includes(business_unit)) {
      return { error: `Invalid business_unit "${business_unit}". Valid: ${DEAL_BUSINESS_UNITS.join(', ')}` };
    }
    where.push('deals.business_unit = ?'); params.push(business_unit);
  }

  const stageList = Array.isArray(stages) ? stages : (stage ? [stage] : null);
  if (stageList && stageList.length) {
    for (const s of stageList) {
      if (!DEAL_STAGES.includes(s)) {
        return { error: `Invalid stage "${s}". Valid stages: ${DEAL_STAGES.join(', ')}` };
      }
    }
    where.push('deals.stage = ANY(?)'); params.push(stageList);
  }
  if (open_only) where.push(`deals.stage NOT IN ('Closed Won', 'Closed Lost')`);
  if (account_name) { where.push('accounts.name ILIKE ?'); params.push(`%${account_name}%`); }
  if (min_value != null) { where.push('deals.gross_total_value >= ?'); params.push(Number(min_value)); }
  if (max_value != null) { where.push('deals.gross_total_value <= ?'); params.push(Number(max_value)); }

  const window = resolveWindowArgs(close_date_range, close_date_from, close_date_to);
  if (window?.error) return window;
  // close_date is a pure DATE column — compare Sydney date strings directly.
  if (window?.from) { where.push('deals.close_date >= ?'); params.push(window.from); }
  if (window?.to) { where.push('deals.close_date <= ?'); params.push(window.to); }

  if (created_by_me) { where.push('deals.deal_owner_id = ?'); params.push(ctx.userId); }
  if (created_within_days != null) {
    const cutoff = sydneyNow().minus({ days: Number(created_within_days) }).toUTC().toFormat('yyyy-LL-dd HH:mm:ss');
    where.push('deals.created_at >= ?'); params.push(cutoff);
  }

  const ALLOWED_SORT = ['close_date', 'gross_total_value', 'deal_name', 'stage', 'probability', 'created_at', 'weighted_value'];
  const sortBy = ALLOWED_SORT.includes(sort_by) ? sort_by : 'close_date';
  const sortDir = sort_dir === 'desc' ? 'DESC' : 'ASC';
  const safeLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 100);

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { rows } = await pool.query(P(`
    SELECT deals.id, deals.deal_name, deals.stage, deals.close_date, deals.business_unit,
      deals.gross_total_value, deals.weighted_value, deals.total_contract_earnings,
      accounts.name AS account_name
    FROM deals LEFT JOIN accounts ON deals.account_id = accounts.id
    ${whereSql}
    ORDER BY deals.${sortBy} ${sortDir}
    LIMIT ?
  `), [...params, safeLimit]);

  return { count: rows.length, deals: rows };
}

async function queryContacts(args = {}, ctx = {}) {
  const { account_name, created_by_me, newest_n, search } = args;
  const where = [];
  const params = [];

  if (account_name) { where.push('accounts.name ILIKE ?'); params.push(`%${account_name}%`); }
  if (search) {
    where.push('(contacts.first_name ILIKE ? OR contacts.last_name ILIKE ? OR contacts.email ILIKE ?)');
    const s = `%${search}%`; params.push(s, s, s);
  }
  if (created_by_me) { where.push('contacts.contact_owner_id = ?'); params.push(ctx.userId); }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const limit = Math.min(Math.max(parseInt(newest_n) || 20, 1), 100);

  const { rows } = await pool.query(P(`
    SELECT contacts.id, contacts.first_name, contacts.last_name, contacts.title, contacts.email,
      contacts.phone, contacts.mobile, contacts.business_unit, accounts.name AS account_name
    FROM contacts LEFT JOIN accounts ON contacts.account_id = accounts.id
    ${whereSql}
    ORDER BY contacts.created_at DESC
    LIMIT ?
  `), [...params, limit]);

  return { count: rows.length, contacts: rows };
}

async function queryTasks(args = {}) {
  const { due_range, due_from, due_to, status, business_unit, account_name, contact_name, limit } = args;
  const where = [];
  const params = [];

  if (status) {
    if (!TASK_STATUSES.includes(status)) {
      return { error: `Invalid status "${status}". Valid: ${TASK_STATUSES.join(', ')}` };
    }
    where.push('tasks.status = ?'); params.push(status);
  }
  if (business_unit) {
    if (!DEAL_BUSINESS_UNITS.includes(business_unit)) {
      return { error: `Invalid business_unit "${business_unit}". Valid: ${DEAL_BUSINESS_UNITS.join(', ')}` };
    }
    where.push('tasks.business_unit = ?'); params.push(business_unit);
  }
  if (account_name) { where.push('accounts.name ILIKE ?'); params.push(`%${account_name}%`); }
  if (contact_name) { where.push("(contacts.first_name || ' ' || contacts.last_name) ILIKE ?"); params.push(`%${contact_name}%`); }

  const window = resolveWindowArgs(due_range, due_from, due_to);
  if (window?.error) return window;
  // due_datetime is a UTC TIMESTAMP column — convert the Sydney window to UTC bounds.
  const utcRange = window ? dateWindowToUtcRange(window) : null;
  if (utcRange?.fromUtc) { where.push('tasks.due_datetime >= ?'); params.push(utcRange.fromUtc); }
  if (utcRange?.toUtc) { where.push('tasks.due_datetime <= ?'); params.push(utcRange.toUtc); }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const safeLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 100);

  const { rows } = await pool.query(P(`
    SELECT tasks.id, tasks.subject, tasks.status, tasks.priority, tasks.due_datetime,
      tasks.business_unit, accounts.name AS account_name,
      (contacts.first_name || ' ' || contacts.last_name) AS contact_name
    FROM tasks
    LEFT JOIN accounts ON tasks.account_id = accounts.id
    LEFT JOIN contacts ON tasks.contact_id = contacts.id
    ${whereSql}
    ORDER BY tasks.due_datetime ASC
    LIMIT ?
  `), [...params, safeLimit]);

  return { count: rows.length, tasks: rows };
}

// Reuses the same stored weighted_value the dashboard reads (set from
// STAGE_MAP at deal write time) rather than recomputing weighting here.
async function pipelineSummary(args = {}) {
  const { close_date_range, close_date_from, close_date_to, business_unit } = args;
  const where = [`stage NOT IN ('Closed Won', 'Closed Lost')`];
  const params = [];

  if (business_unit) {
    if (!DEAL_BUSINESS_UNITS.includes(business_unit)) {
      return { error: `Invalid business_unit "${business_unit}". Valid: ${DEAL_BUSINESS_UNITS.join(', ')}` };
    }
    where.push('business_unit = ?'); params.push(business_unit);
  }

  const window = resolveWindowArgs(close_date_range, close_date_from, close_date_to);
  if (window?.error) return window;
  if (window?.from) { where.push('close_date >= ?'); params.push(window.from); }
  if (window?.to) { where.push('close_date <= ?'); params.push(window.to); }

  const whereSql = `WHERE ${where.join(' AND ')}`;

  const totals = (await pool.query(P(`
    SELECT COUNT(*) AS count, COALESCE(SUM(gross_total_value), 0) AS gross_total,
      COALESCE(SUM(weighted_value), 0) AS weighted_total
    FROM deals ${whereSql}
  `), params)).rows[0];

  const byStage = (await pool.query(P(`
    SELECT stage, COUNT(*) AS count, COALESCE(SUM(gross_total_value), 0) AS gross_total,
      COALESCE(SUM(weighted_value), 0) AS weighted_total
    FROM deals ${whereSql}
    GROUP BY stage
  `), params)).rows;

  return { totals, by_stage: byStage, window: window || null };
}

async function precallBrief(args = {}) {
  const { account_name, contact_name } = args;
  if (!account_name && !contact_name) return { error: 'Provide account_name or contact_name' };

  let accountId = null;
  let contactId = null;

  if (account_name) {
    const r = await pool.query(P('SELECT id, name FROM accounts WHERE name ILIKE ? ORDER BY name LIMIT 10'), [`%${account_name}%`]);
    if (r.rows.length === 0) return { error: `No account found matching "${account_name}"` };
    if (r.rows.length > 1) {
      return {
        ambiguous: true,
        matches: r.rows.map(x => ({ id: x.id, name: x.name, type: 'account' })),
        message: 'Multiple accounts match — ask Stuart which one before continuing.',
      };
    }
    accountId = r.rows[0].id;
  } else {
    const r = await pool.query(
      P("SELECT id, first_name, last_name FROM contacts WHERE (first_name || ' ' || last_name) ILIKE ? ORDER BY last_name LIMIT 10"),
      [`%${contact_name}%`]
    );
    if (r.rows.length === 0) return { error: `No contact found matching "${contact_name}"` };
    if (r.rows.length > 1) {
      return {
        ambiguous: true,
        matches: r.rows.map(x => ({ id: x.id, name: `${x.first_name} ${x.last_name}`, type: 'contact' })),
        message: 'Multiple contacts match — ask Stuart which one before continuing.',
      };
    }
    contactId = r.rows[0].id;
  }

  const linkCol = accountId ? 'account_id' : 'contact_id';
  const linkVal = accountId || contactId;

  const [activities, notes, deals, tasks] = await Promise.all([
    pool.query(P(`
      SELECT type, subject, outcome, start_datetime FROM activities
      WHERE ${linkCol} = ? ORDER BY COALESCE(start_datetime, created_at) DESC LIMIT 3
    `), [linkVal]).then(r => r.rows),
    pool.query(P(`
      SELECT content, created_at FROM notes
      WHERE ${linkCol} = ? ORDER BY created_at DESC LIMIT 3
    `), [linkVal]).then(r => r.rows),
    pool.query(P(`
      SELECT deal_name, stage, gross_total_value, close_date FROM deals
      WHERE ${linkCol} = ? AND stage NOT IN ('Closed Won', 'Closed Lost') ORDER BY close_date ASC
    `), [linkVal]).then(r => r.rows),
    pool.query(P(`
      SELECT subject, due_datetime, status FROM tasks
      WHERE ${linkCol} = ? AND status != 'Completed' ORDER BY due_datetime ASC
    `), [linkVal]).then(r => r.rows),
  ]);

  return {
    entity_type: accountId ? 'account' : 'contact',
    recent_activities: activities,
    recent_notes: notes,
    open_deals: deals,
    open_tasks: tasks,
  };
}

async function findRecords(args = {}) {
  const { name, type } = args;
  if (!name) return { error: 'name is required' };

  const results = {};
  if (!type || type === 'account') {
    results.accounts = (await pool.query(
      P('SELECT id, name, business_unit FROM accounts WHERE name ILIKE ? ORDER BY name LIMIT 10'),
      [`%${name}%`]
    )).rows;
  }
  if (!type || type === 'contact') {
    results.contacts = (await pool.query(
      P("SELECT id, first_name, last_name, email FROM contacts WHERE (first_name || ' ' || last_name) ILIKE ? OR email ILIKE ? ORDER BY last_name LIMIT 10"),
      [`%${name}%`, `%${name}%`]
    )).rows;
  }
  return results;
}

module.exports = { queryDeals, queryContacts, queryTasks, pipelineSummary, precallBrief, findRecords };
