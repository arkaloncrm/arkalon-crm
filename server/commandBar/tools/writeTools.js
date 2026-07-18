const { pool, P } = require('../../database');
const { STAGE_MAP, calculateDealFinancials } = require('../../utils/dealFinancials');
const { parseNoteTask } = require('../../utils/parseNoteTask');
const { auditCreate, auditUpdate } = require('../../utils/auditLog');
const { resolveDateExpression, resolveDateTimeToUtc, pushDateByDuration } = require('../dateResolve');
const {
  DEAL_STAGES, DEAL_BUSINESS_UNITS, DEAL_TYPES,
  TASK_PRIORITIES, ACTIVITY_TYPES,
} = require('../systemPrompt');

// --- shared entity resolution ------------------------------------------------

// Fuzzy-resolves a name to exactly one row, or reports why it couldn't:
// no match (error), more than one match (ambiguous — the model must ask
// Stuart, never guess), or a single unambiguous hit.
async function resolveEntityRef(id, name, { table, nameExpr, label }) {
  if (id) {
    const r = await pool.query(P(`SELECT id, ${nameExpr} AS name, business_unit FROM ${table} WHERE id = ?`), [id]);
    if (r.rows.length === 0) return { error: `${label} #${id} not found` };
    return { id: r.rows[0].id, name: r.rows[0].name, business_unit: r.rows[0].business_unit };
  }
  if (!name) return null;
  const r = await pool.query(
    P(`SELECT id, ${nameExpr} AS name, business_unit FROM ${table} WHERE ${nameExpr} ILIKE ? ORDER BY ${nameExpr} LIMIT 10`),
    [`%${name}%`]
  );
  if (r.rows.length === 0) return { error: `No ${label.toLowerCase()} found matching "${name}"` };
  if (r.rows.length > 1) {
    // Only auto-resolve on a UNIQUE exact match — two genuinely duplicate-named
    // records must still go to disambiguation rather than silently picking one.
    const exactMatches = r.rows.filter(x => x.name.toLowerCase() === name.toLowerCase());
    if (exactMatches.length === 1) {
      return { id: exactMatches[0].id, name: exactMatches[0].name, business_unit: exactMatches[0].business_unit };
    }
    return {
      ambiguous: true,
      matches: r.rows.map(x => ({ id: x.id, name: x.name, type: label.toLowerCase() })),
      message: `Multiple ${label.toLowerCase()}s match "${name}" — ask Stuart which one before continuing.`,
    };
  }
  return { id: r.rows[0].id, name: r.rows[0].name, business_unit: r.rows[0].business_unit };
}

const ACCOUNT_REF = { table: 'accounts', nameExpr: 'name', label: 'Account' };
const CONTACT_REF = { table: 'contacts', nameExpr: "(first_name || ' ' || last_name)", label: 'Contact' };
const DEAL_REF = { table: 'deals', nameExpr: 'deal_name', label: 'Deal' };

// Find-or-create resolution for accounts, used by create_deal / create_contact.
// Never creates on this pass — only reports whether one would be created so
// the confirmation card can say so.
async function resolveOrProposeAccount(name) {
  if (!name) return { id: null, name: null, willCreate: false };
  const r = await pool.query(P('SELECT id, name FROM accounts WHERE name ILIKE ? ORDER BY name LIMIT 10'), [`%${name}%`]);
  if (r.rows.length === 0) return { id: null, name, willCreate: true };
  if (r.rows.length === 1) return { id: r.rows[0].id, name: r.rows[0].name, willCreate: false };
  const exactMatches = r.rows.filter(a => a.name.toLowerCase() === name.toLowerCase());
  if (exactMatches.length === 1) return { id: exactMatches[0].id, name: exactMatches[0].name, willCreate: false };
  return {
    ambiguous: true,
    matches: r.rows.map(a => ({ id: a.id, name: a.name, type: 'account' })),
    message: `Multiple accounts match "${name}" — ask Stuart which one before continuing.`,
  };
}

function businessUnitCompatible(recordBusinessUnit, actionBusinessUnit) {
  return !recordBusinessUnit || recordBusinessUnit === 'Both' || recordBusinessUnit === actionBusinessUnit;
}

function money(n) {
  return `$${Number(n || 0).toLocaleString('en-AU', { maximumFractionDigits: 2 })}`;
}

// --- create_deal --------------------------------------------------------

async function prepareCreateDeal(args) {
  const { account_name, deal_name, value, stage, close_date, business_unit, deal_type, contract_term_months } = args || {};

  if (!account_name) return { error: 'account_name is required' };
  if (!deal_name?.trim()) return { error: 'deal_name is required' };
  if (value === undefined || value === null || !(Number(value) >= 0)) return { error: 'value must be a non-negative number' };
  if (!DEAL_BUSINESS_UNITS.includes(business_unit)) {
    return { error: `business_unit must be one of: ${DEAL_BUSINESS_UNITS.join(', ')}` };
  }
  if (!DEAL_STAGES.includes(stage)) {
    return { error: `Invalid stage "${stage}". Valid stages: ${DEAL_STAGES.join(', ')}` };
  }
  if (business_unit === 'ASC') {
    if (!DEAL_TYPES.includes(deal_type)) {
      return { error: `ASC deals require deal_type — one of: ${DEAL_TYPES.join(', ')}` };
    }
    if (!Number.isInteger(Number(contract_term_months)) || Number(contract_term_months) <= 0) {
      return { error: 'ASC deals require a positive integer contract_term_months' };
    }
  }

  let resolvedCloseDate = null;
  if (close_date) {
    resolvedCloseDate = resolveDateExpression(close_date);
    if (!resolvedCloseDate) return { error: `Could not resolve close_date "${close_date}"` };
  }

  const account = await resolveOrProposeAccount(account_name);
  if (account.ambiguous) return account;

  const summary = {
    action: 'create_deal',
    deal_name,
    account_name: account.name,
    account_will_be_created: account.willCreate,
    business_unit,
    deal_type: deal_type || null,
    stage,
    value: Number(value),
    close_date: resolvedCloseDate,
    contract_term_months: contract_term_months ? Number(contract_term_months) : null,
  };

  return {
    pending: true,
    summary,
    label: `Create deal "${deal_name}"`,
    execute: {
      type: 'create_deal',
      account_id: account.id,
      account_name: account.name,
      account_will_be_created: account.willCreate,
      deal_name,
      business_unit,
      deal_type: deal_type || null,
      stage,
      value: Number(value),
      close_date: resolvedCloseDate,
      contract_term_months: contract_term_months ? Number(contract_term_months) : null,
    },
  };
}

async function executeCreateDeal(action, ctx) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let accountId = action.account_id;
    if (action.account_will_be_created) {
      const insertAcc = await client.query(
        P('INSERT INTO accounts (name, business_unit, account_owner_id) VALUES (?, ?, ?) RETURNING id'),
        [action.account_name, action.business_unit, ctx.userId]
      );
      accountId = insertAcc.rows[0].id;
      await auditCreate(client, 'account', accountId, {
        name: action.account_name, business_unit: action.business_unit, via: 'command_bar create_deal find-or-create',
      }, ctx.userId);
    }

    let context = {};
    if (action.business_unit === 'Simply Seated' && accountId) {
      const firstDealResult = await client.query(P(`
        SELECT MIN(close_date) AS first_date FROM deals
        WHERE stage = 'Closed Won' AND business_unit = 'Simply Seated' AND account_id = ?
      `), [accountId]);
      context = { firstDealDate: firstDealResult.rows[0]?.first_date || null };
    }

    const financials = calculateDealFinancials({
      business_unit: action.business_unit,
      deal_type: action.deal_type,
      stage: action.stage,
      contract_term_months: action.contract_term_months,
      manual_gross_value: action.value,
      close_date: action.close_date,
    }, [], context);

    const result = await client.query(P(`
      INSERT INTO deals (
        deal_name, account_id, stage, probability, forecast_category, close_date,
        business_unit, deal_type, gross_total_value, manual_gross_value, monthly_recurring_revenue,
        commission_percentage, commission_amount, contract_term_months, total_contract_earnings,
        weighted_value, deal_owner_id, commission_warning
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id
    `), [
      action.deal_name, accountId, action.stage, financials.probability, financials.forecast_category,
      action.close_date, action.business_unit, action.deal_type, financials.gross_total_value,
      action.value, financials.monthly_recurring_revenue, financials.commission_percentage,
      financials.commission_amount, action.contract_term_months, financials.total_contract_earnings,
      financials.weighted_value, ctx.userId, financials.commission_warning,
    ]);
    const dealId = result.rows[0].id;

    await auditCreate(client, 'deal', dealId, {
      deal_name: action.deal_name, account: action.account_name, value: action.value,
      stage: action.stage, close_date: action.close_date,
    }, ctx.userId);

    await client.query('COMMIT');
    return {
      entity_type: 'deal',
      entity_id: dealId,
      summary: `Created deal "${action.deal_name}" (#${dealId}) — ${action.stage}, ${money(action.value)}, closing ${action.close_date || 'no date set'}.`,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// --- create_contact -------------------------------------------------------

async function prepareCreateContact(args) {
  const { first_name, last_name, account_name, business_unit, phone, mobile, email, title } = args || {};

  if (!last_name?.trim()) return { error: 'last_name is required' };
  if (!DEAL_BUSINESS_UNITS.includes(business_unit)) {
    return { error: `business_unit must be one of: ${DEAL_BUSINESS_UNITS.join(', ')}` };
  }

  const account = account_name ? await resolveOrProposeAccount(account_name) : { id: null, name: null, willCreate: false };
  if (account.ambiguous) return account;

  const summary = {
    action: 'create_contact',
    first_name: first_name || null,
    last_name,
    account_name: account.name,
    account_will_be_created: account.willCreate,
    business_unit,
    phone: phone || null,
    mobile: mobile || null,
    email: email || null,
    title: title || null,
  };

  return {
    pending: true,
    summary,
    label: `Create contact ${[first_name, last_name].filter(Boolean).join(' ')}`,
    execute: {
      type: 'create_contact',
      account_id: account.id,
      account_name: account.name,
      account_will_be_created: account.willCreate,
      first_name: first_name || null,
      last_name,
      business_unit,
      phone: phone || null,
      mobile: mobile || null,
      email: email || null,
      title: title || null,
    },
  };
}

async function executeCreateContact(action, ctx) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let accountId = action.account_id;
    if (action.account_will_be_created) {
      const insertAcc = await client.query(
        P('INSERT INTO accounts (name, business_unit, account_owner_id) VALUES (?, ?, ?) RETURNING id'),
        [action.account_name, action.business_unit, ctx.userId]
      );
      accountId = insertAcc.rows[0].id;
      await auditCreate(client, 'account', accountId, {
        name: action.account_name, business_unit: action.business_unit, via: 'command_bar create_contact find-or-create',
      }, ctx.userId);
    }

    const insert = await client.query(P(`
      INSERT INTO contacts (account_id, first_name, last_name, title, email, phone, mobile, business_unit, contact_owner_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id
    `), [
      accountId, action.first_name, action.last_name, action.title, action.email,
      action.phone, action.mobile, action.business_unit, ctx.userId,
    ]);
    const contactId = insert.rows[0].id;

    await auditCreate(client, 'contact', contactId, {
      name: [action.first_name, action.last_name].filter(Boolean).join(' '),
      account: action.account_name, email: action.email, mobile: action.mobile,
    }, ctx.userId);

    await client.query('COMMIT');
    return {
      entity_type: 'contact',
      entity_id: contactId,
      summary: `Created contact ${[action.first_name, action.last_name].filter(Boolean).join(' ')} (#${contactId})${action.account_name ? ` at ${action.account_name}` : ''}.`,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// --- create_task -----------------------------------------------------------

async function prepareCreateTask(args) {
  const { subject, due_date, due_time, business_unit, priority, account_name, account_id, contact_name, contact_id, deal_name, deal_id } = args || {};

  if (!subject?.trim()) return { error: 'subject is required' };
  if (!DEAL_BUSINESS_UNITS.includes(business_unit)) {
    return { error: `business_unit must be one of: ${DEAL_BUSINESS_UNITS.join(', ')}` };
  }
  if (priority && !TASK_PRIORITIES.includes(priority)) {
    return { error: `Invalid priority "${priority}". Valid: ${TASK_PRIORITIES.join(', ')}` };
  }

  let resolvedDueDate = null;
  let dueDatetimeUtc = null;
  let isAllDay = true;
  if (due_date) {
    resolvedDueDate = resolveDateExpression(due_date);
    if (!resolvedDueDate) return { error: `Could not resolve due_date "${due_date}"` };
    isAllDay = !due_time;
    dueDatetimeUtc = resolveDateTimeToUtc(due_date, due_time);
  }

  const account = await resolveEntityRef(account_id, account_name, ACCOUNT_REF);
  if (account?.error || account?.ambiguous) return account;
  const contact = await resolveEntityRef(contact_id, contact_name, CONTACT_REF);
  if (contact?.error || contact?.ambiguous) return contact;
  const deal = await resolveEntityRef(deal_id, deal_name, DEAL_REF);
  if (deal?.error || deal?.ambiguous) return deal;

  for (const linked of [account, contact, deal]) {
    if (linked && !businessUnitCompatible(linked.business_unit, business_unit)) {
      return { error: `Business unit mismatch: linked record is ${linked.business_unit} but task is ${business_unit}` };
    }
  }

  const summary = {
    action: 'create_task',
    subject,
    business_unit,
    priority: priority || 'Normal',
    due_date: resolvedDueDate,
    due_time: isAllDay ? null : due_time,
    account_name: account?.name || null,
    contact_name: contact?.name || null,
    deal_name: deal?.name || null,
  };

  return {
    pending: true,
    summary,
    label: `Create task "${subject}"`,
    execute: {
      type: 'create_task',
      subject, business_unit, priority: priority || 'Normal',
      due_datetime: dueDatetimeUtc, is_all_day: isAllDay,
      account_id: account?.id || null, contact_id: contact?.id || null, deal_id: deal?.id || null,
      account_name: account?.name || null, contact_name: contact?.name || null, deal_name: deal?.name || null,
    },
  };
}

async function executeCreateTask(action, ctx) {
  const insert = await pool.query(P(`
    INSERT INTO tasks (subject, status, priority, due_datetime, is_all_day, account_id, contact_id, deal_id, business_unit, task_owner_id)
    VALUES (?, 'Not Started', ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING id
  `), [
    action.subject, action.priority, action.due_datetime, action.is_all_day ? 1 : 0,
    action.account_id, action.contact_id, action.deal_id, action.business_unit, ctx.userId,
  ]);
  const taskId = insert.rows[0].id;

  await auditCreate(null, 'task', taskId, {
    subject: action.subject, due_datetime: action.due_datetime,
    linked: action.account_name || action.contact_name || action.deal_name || null,
  }, ctx.userId);

  return {
    entity_type: 'task',
    entity_id: taskId,
    summary: `Created task "${action.subject}" (#${taskId})${action.due_datetime ? `, due ${action.due_datetime}` : ''}.`,
  };
}

// --- log_activity ------------------------------------------------------

async function prepareLogActivity(args) {
  const { type, subject, body, date, business_unit, outcome, account_name, account_id, contact_name, contact_id, deal_name, deal_id } = args || {};

  if (!ACTIVITY_TYPES.includes(type)) return { error: `Invalid type "${type}". Valid: ${ACTIVITY_TYPES.join(', ')}` };
  if (!subject?.trim()) return { error: 'subject is required' };
  if (!DEAL_BUSINESS_UNITS.includes(business_unit)) {
    return { error: `business_unit must be one of: ${DEAL_BUSINESS_UNITS.join(', ')}` };
  }

  const dateExpr = date || 'today';
  const resolvedDate = resolveDateExpression(dateExpr);
  if (!resolvedDate) return { error: `Could not resolve date "${date}"` };
  const startUtc = resolveDateTimeToUtc(dateExpr, null);

  const account = await resolveEntityRef(account_id, account_name, ACCOUNT_REF);
  if (account?.error || account?.ambiguous) return account;
  const contact = await resolveEntityRef(contact_id, contact_name, CONTACT_REF);
  if (contact?.error || contact?.ambiguous) return contact;
  const deal = await resolveEntityRef(deal_id, deal_name, DEAL_REF);
  if (deal?.error || deal?.ambiguous) return deal;

  for (const linked of [account, contact, deal]) {
    if (linked && !businessUnitCompatible(linked.business_unit, business_unit)) {
      return { error: `Business unit mismatch: linked record is ${linked.business_unit} but activity is ${business_unit}` };
    }
  }

  const summary = {
    action: 'log_activity',
    type, subject, body: body || null, outcome: outcome || null,
    date: resolvedDate, business_unit,
    account_name: account?.name || null, contact_name: contact?.name || null, deal_name: deal?.name || null,
  };

  return {
    pending: true,
    summary,
    label: `Log ${type.toLowerCase()}: "${subject}"`,
    execute: {
      type: 'log_activity',
      activity_type: type, subject, description: body || null, outcome: outcome || null,
      start_datetime: startUtc, business_unit,
      account_id: account?.id || null, contact_id: contact?.id || null, deal_id: deal?.id || null,
      account_name: account?.name || null, contact_name: contact?.name || null, deal_name: deal?.name || null,
    },
  };
}

async function executeLogActivity(action, ctx) {
  const insert = await pool.query(P(`
    INSERT INTO activities (type, subject, status, outcome, start_datetime, description, account_id, contact_id, deal_id, business_unit, activity_owner_id)
    VALUES (?, ?, 'Held', ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING id
  `), [
    action.activity_type, action.subject, action.outcome, action.start_datetime, action.description,
    action.account_id, action.contact_id, action.deal_id, action.business_unit, ctx.userId,
  ]);
  const activityId = insert.rows[0].id;

  await auditCreate(null, 'activity', activityId, {
    type: action.activity_type, subject: action.subject,
    linked: action.account_name || action.contact_name || action.deal_name || null,
  }, ctx.userId);

  return {
    entity_type: 'activity',
    entity_id: activityId,
    summary: `Logged ${action.activity_type.toLowerCase()} "${action.subject}" (#${activityId}).`,
  };
}

// --- create_note (with Smart Note→Task follow-up proposal) -----------------

async function prepareCreateNote(args) {
  const { body, account_name, account_id, contact_name, contact_id, deal_name, deal_id } = args || {};
  if (!body?.trim()) return { error: 'body is required' };

  const refs = [
    account_name || account_id ? 'account' : null,
    contact_name || contact_id ? 'contact' : null,
    deal_name || deal_id ? 'deal' : null,
  ].filter(Boolean);
  if (refs.length === 0) return { error: 'A note must be linked to exactly one of account, contact, or deal' };
  if (refs.length > 1) return { error: 'A note can only be linked to one record at a time' };

  let link = null;
  if (refs[0] === 'account') link = await resolveEntityRef(account_id, account_name, ACCOUNT_REF);
  else if (refs[0] === 'contact') link = await resolveEntityRef(contact_id, contact_name, CONTACT_REF);
  else link = await resolveEntityRef(deal_id, deal_name, DEAL_REF);
  if (link?.error || link?.ambiguous) return link;

  // Reuse the exact Smart Note→Task parser rather than duplicating its prompt.
  const taskSuggestion = await parseNoteTask(body);
  const businessUnit = link.business_unit;
  const buValid = DEAL_BUSINESS_UNITS.includes(businessUnit);
  const willProposeTask = taskSuggestion.action_detected && buValid;

  const summary = {
    action: 'create_note',
    body,
    linked_type: refs[0],
    linked_name: link.name,
    will_create_task: willProposeTask,
    task_subject: willProposeTask ? taskSuggestion.subject : null,
    task_due: willProposeTask ? taskSuggestion.due_datetime : null,
  };

  return {
    pending: true,
    summary,
    label: 'Create note',
    execute: {
      type: 'create_note',
      body,
      linked_type: refs[0],
      linked_id: link.id,
      linked_name: link.name,
      task: willProposeTask ? {
        subject: taskSuggestion.subject,
        due_datetime: taskSuggestion.due_datetime,
        is_all_day: taskSuggestion.is_all_day,
        business_unit: businessUnit,
      } : null,
    },
  };
}

async function executeCreateNote(action, ctx) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const linkCol = `${action.linked_type}_id`;
    const insert = await client.query(P(`
      INSERT INTO notes (content, ${linkCol}, created_by_id) VALUES (?, ?, ?) RETURNING id
    `), [action.body, action.linked_id, ctx.userId]);
    const noteId = insert.rows[0].id;
    await auditCreate(client, 'note', noteId, { linked: action.linked_name, preview: action.body.slice(0, 120) }, ctx.userId);

    let taskId = null;
    if (action.task) {
      const taskInsert = await client.query(P(`
        INSERT INTO tasks (subject, status, priority, due_datetime, is_all_day, ${linkCol}, business_unit, task_owner_id)
        VALUES (?, 'Not Started', 'Normal', ?, ?, ?, ?, ?)
        RETURNING id
      `), [action.task.subject, action.task.due_datetime, action.task.is_all_day ? 1 : 0, action.linked_id, action.task.business_unit, ctx.userId]);
      taskId = taskInsert.rows[0].id;
      await auditCreate(client, 'task', taskId, {
        subject: action.task.subject, due_datetime: action.task.due_datetime, via: 'command_bar create_note follow-up',
      }, ctx.userId);
    }

    await client.query('COMMIT');
    return {
      entity_type: 'note',
      entity_id: noteId,
      summary: `Created note (#${noteId}) on ${action.linked_name}${taskId ? ` and follow-up task "${action.task.subject}" (#${taskId})` : ''}.`,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// --- update_deal -------------------------------------------------------

async function resolveOpenDealByRef(ref) {
  const r = await pool.query(P(`
    SELECT deals.id, deals.deal_name, deals.stage, deals.close_date, deals.gross_total_value,
      deals.business_unit, deals.deal_type, deals.contract_term_months, deals.account_id,
      accounts.name AS account_name
    FROM deals LEFT JOIN accounts ON deals.account_id = accounts.id
    WHERE deals.stage NOT IN ('Closed Won', 'Closed Lost')
      AND (deals.deal_name ILIKE ? OR accounts.name ILIKE ?)
    ORDER BY deals.close_date ASC NULLS LAST
  `), [`%${ref}%`, `%${ref}%`]);

  if (r.rows.length === 0) return { error: `No open deal found matching "${ref}"` };
  if (r.rows.length > 1) {
    return {
      ambiguous: true,
      matches: r.rows.map(d => ({ id: d.id, name: `${d.deal_name} (${d.account_name || 'no account'})`, type: 'deal' })),
      message: `Multiple open deals match "${ref}" — ask Stuart which one before continuing.`,
    };
  }
  return { deal: r.rows[0] };
}

async function prepareUpdateDeal(args) {
  const { deal_ref, deal_id, stage, close_date, close_date_push, value } = args || {};

  let deal;
  if (deal_id) {
    const r = await pool.query(P(`
      SELECT deals.id, deals.deal_name, deals.stage, deals.close_date, deals.gross_total_value,
        deals.business_unit, deals.deal_type, deals.contract_term_months, deals.account_id,
        accounts.name AS account_name
      FROM deals LEFT JOIN accounts ON deals.account_id = accounts.id
      WHERE deals.id = ?
    `), [deal_id]);
    if (r.rows.length === 0) return { error: `Deal #${deal_id} not found` };
    deal = r.rows[0];
  } else {
    if (!deal_ref) return { error: 'Provide deal_ref (deal or account name) or deal_id' };
    const resolved = await resolveOpenDealByRef(deal_ref);
    if (resolved.error || resolved.ambiguous) return resolved;
    deal = resolved.deal;
  }

  if (!stage && !close_date && !close_date_push && value === undefined) {
    return { error: 'Provide at least one of stage, close_date, close_date_push, value to update' };
  }
  if (close_date && close_date_push) {
    return { error: 'Provide only one of close_date (a target date) or close_date_push (a duration to add to the current close date), not both' };
  }
  if (stage && !DEAL_STAGES.includes(stage)) {
    return { error: `Invalid stage "${stage}". Valid stages: ${DEAL_STAGES.join(', ')}` };
  }

  let resolvedCloseDate = null;
  if (close_date) {
    resolvedCloseDate = resolveDateExpression(close_date);
    if (!resolvedCloseDate) return { error: `Could not resolve close_date "${close_date}"` };
  } else if (close_date_push) {
    // Anchored to the deal's CURRENT close_date, not today — "push it two
    // weeks" means two weeks later than where it already sits.
    resolvedCloseDate = pushDateByDuration(deal.close_date, close_date_push);
    if (!resolvedCloseDate) return { error: `Could not resolve close_date_push "${close_date_push}" — use a plain duration like "two weeks" or "14 days"` };
  }
  if (value !== undefined && value !== null && !(Number(value) >= 0)) {
    return { error: 'value must be a non-negative number' };
  }

  const changes = {};
  if (stage) changes.stage = { from: deal.stage, to: stage };
  if (resolvedCloseDate) changes.close_date = { from: deal.close_date, to: resolvedCloseDate };
  if (value !== undefined && value !== null) changes.value = { from: deal.gross_total_value, to: Number(value) };

  const summary = { action: 'update_deal', deal_id: deal.id, deal_name: deal.deal_name, account_name: deal.account_name, changes };

  return {
    pending: true,
    summary,
    label: `Update deal "${deal.deal_name}"`,
    execute: {
      type: 'update_deal',
      deal_id: deal.id,
      prev: {
        stage: deal.stage, close_date: deal.close_date, gross_total_value: deal.gross_total_value,
        business_unit: deal.business_unit, deal_type: deal.deal_type,
        contract_term_months: deal.contract_term_months, account_id: deal.account_id,
      },
      stage: stage || null,
      close_date: resolvedCloseDate,
      value: value !== undefined && value !== null ? Number(value) : null,
    },
  };
}

async function executeUpdateDeal(action, ctx) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const setParts = [];
    const params = [];
    const auditChanges = [];
    const newStage = action.stage || action.prev.stage;

    if (action.value !== null) {
      let context = {};
      if (action.prev.business_unit === 'Simply Seated' && action.prev.account_id) {
        const firstDealResult = await client.query(P(`
          SELECT MIN(close_date) AS first_date FROM deals
          WHERE stage = 'Closed Won' AND business_unit = 'Simply Seated' AND account_id = ? AND id != ?
        `), [action.prev.account_id, action.deal_id]);
        context = { firstDealDate: firstDealResult.rows[0]?.first_date || null };
      }
      const financials = calculateDealFinancials({
        business_unit: action.prev.business_unit,
        deal_type: action.prev.deal_type,
        stage: newStage,
        contract_term_months: action.prev.contract_term_months,
        manual_gross_value: action.value,
        close_date: action.close_date || action.prev.close_date,
      }, [], context);

      setParts.push(
        'manual_gross_value = ?', 'gross_total_value = ?', 'monthly_recurring_revenue = ?',
        'commission_percentage = ?', 'commission_amount = ?', 'total_contract_earnings = ?',
        'weighted_value = ?', 'probability = ?', 'forecast_category = ?', 'commission_warning = ?'
      );
      params.push(
        action.value, financials.gross_total_value, financials.monthly_recurring_revenue,
        financials.commission_percentage, financials.commission_amount, financials.total_contract_earnings,
        financials.weighted_value, financials.probability, financials.forecast_category, financials.commission_warning
      );
      auditChanges.push({ field: 'gross_total_value', oldValue: action.prev.gross_total_value, newValue: financials.gross_total_value });
    } else if (action.stage) {
      const stageInfo = STAGE_MAP[action.stage];
      const weighted_value = Math.round((action.prev.gross_total_value || 0) * stageInfo.probability / 100 * 100) / 100;
      setParts.push('probability = ?', 'forecast_category = ?', 'weighted_value = ?');
      params.push(stageInfo.probability, stageInfo.forecast_category, weighted_value);
    }

    if (action.stage) {
      setParts.push('stage = ?'); params.push(action.stage);
      auditChanges.push({ field: 'stage', oldValue: action.prev.stage, newValue: action.stage });
    }
    if (action.close_date) {
      setParts.push('close_date = ?'); params.push(action.close_date);
      auditChanges.push({ field: 'close_date', oldValue: action.prev.close_date, newValue: action.close_date });
    }

    params.push(action.deal_id);
    await client.query(P(`UPDATE deals SET ${setParts.join(', ')}, updated_at = NOW() WHERE id = ?`), params);

    if (action.close_date && action.close_date !== action.prev.close_date) {
      await client.query(P('INSERT INTO notes (content, deal_id, created_by_id) VALUES (?, ?, ?)'), [
        `Close date moved from ${action.prev.close_date || 'not set'} to ${action.close_date} via Command Bar`,
        action.deal_id, ctx.userId,
      ]);
    }

    await auditUpdate(client, 'deal', action.deal_id, auditChanges, ctx.userId);
    await client.query('COMMIT');

    const parts = [];
    if (action.stage) parts.push(`stage → ${action.stage}`);
    if (action.close_date) parts.push(`close date → ${action.close_date}`);
    if (action.value !== null) parts.push(`value → ${money(action.value)}`);

    return { entity_type: 'deal', entity_id: action.deal_id, summary: `Updated deal #${action.deal_id}: ${parts.join(', ')}.` };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

const PREPARE = {
  create_deal: prepareCreateDeal,
  create_contact: prepareCreateContact,
  create_task: prepareCreateTask,
  log_activity: prepareLogActivity,
  create_note: prepareCreateNote,
  update_deal: prepareUpdateDeal,
};

const EXECUTE = {
  create_deal: executeCreateDeal,
  create_contact: executeCreateContact,
  create_task: executeCreateTask,
  log_activity: executeLogActivity,
  create_note: executeCreateNote,
  update_deal: executeUpdateDeal,
};

module.exports = { PREPARE, EXECUTE, resolveEntityRef, resolveOrProposeAccount, ACCOUNT_REF, CONTACT_REF, DEAL_REF };
