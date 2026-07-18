const express = require('express');
const crypto = require('crypto');
const { pool, P } = require('../database');
const { sydneyDateAtHourUtc, sydneyTomorrowDateString } = require('../utils/dateUtils');
const router = express.Router();

// ---------------------------------------------------------------------------
// In-memory preview sessions. Single-user system — no persistence needed.
// Keyed by UUID, expired after 30 minutes (checked on access + periodic sweep).
// ---------------------------------------------------------------------------
const SESSION_TTL_MS = 30 * 60 * 1000;
const sessions = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.createdAt > SESSION_TTL_MS) sessions.delete(id);
  }
}, 5 * 60 * 1000).unref();

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

// Match at matching time: strip spaces/dashes/parens/dots, fold +61/0061/61
// mobile+landline prefixes to the local 0-form so '+61 412 345 678' and
// '0412345678' compare equal.
function normalisePhone(raw) {
  if (!raw) return null;
  let p = String(raw).replace(/[\s\-().]/g, '');
  if (p.startsWith('+61')) p = '0' + p.slice(3);
  else if (p.startsWith('0061')) p = '0' + p.slice(4);
  else if (p.startsWith('61') && p.length === 11) p = '0' + p.slice(2);
  return p || null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// A phone field is digits with common punctuation and at least 8 digits.
const PHONE_CHARS_RE = /^[\d\s()+\-.]+$/;

function looksLikeEmail(v) { return EMAIL_RE.test(v); }
function looksLikePhone(v) {
  return PHONE_CHARS_RE.test(v) && (v.match(/\d/g) || []).length >= 8;
}

// Research-sheet placeholder cells carry no data — treat them as empty so they
// never pollute name/company classification. Matched case-insensitively on the
// start of the cell; a "→" anywhere marks a call-route annotation, not data.
const PLACEHOLDER_PREFIXES = [
  'needs enrichment', 'not published', 'none found', 'none verifiable',
  'contact form only', 'no phone', 'n/a', 'tbc', 'unknown', '-', '—',
];

function sanitiseCell(v) {
  const t = String(v || '').trim();
  if (!t) return '';
  if (t.includes('→')) return '';
  const lower = t.toLowerCase();
  if (PLACEHOLDER_PREFIXES.some(p => lower.startsWith(p))) return '';
  return t;
}

// A phone cell may hold several numbers ("+61 3 8677 3777 / +61 2 8088 0600")
// or a trailing annotation ("1300 859 117 (switchboard)") — keep only the
// first valid number, with trailing non-numeric text stripped.
function extractPhone(v) {
  if (looksLikePhone(v)) return v;
  for (const part of v.split(/\s*(?:\/|,|;|\bor\b)\s*/i)) {
    const t = part.trim();
    if (looksLikePhone(t)) return t;
    const m = t.match(/^\+?[\d\s().-]{7,}/);
    if (m) {
      const candidate = m[0].replace(/\D+$/, '').trim();
      if (looksLikePhone(candidate)) return candidate;
    }
  }
  return null;
}

// Priority-tier tokens (T1, T2, …) sometimes sit between company and name in
// research sheets — never real data, always ignored.
const PRIORITY_TIER_RE = /^[a-z]\d{1,2}$/i;

// A field containing one of these words is a job title, wherever it appears —
// including combined titles like "Head of Expansion ANZ / Country Leader"
// (matched as a substring, so "/"-joined dual titles need no special handling).
// "lead" and "leader" are both listed: \blead\b alone would not match "Leader"
// (no word boundary between "d" and "e"). "founder" alone already matches
// "Co-founder" (the hyphen is a non-word character, so \bfounder\b still hits).
const TITLE_RE = /\b(manager|director|head|officer|ceo|founder|co-founder|vp|president|lead|leader|coordinator|specialist|executive|gm|chief)\b/i;

// First row is a header if it names columns rather than containing data —
// e.g. "Name  Phone  Email" — i.e. keyword hit with no email and few digits.
function isHeaderRow(line) {
  if (!/\b(first|last|name|phone|mobile|email|company)\b/i.test(line)) return false;
  if (line.includes('@')) return false;
  return (line.match(/\d/g) || []).length < 6;
}

// Split "First Last" (or a single token) into name parts. contacts.last_name is
// NOT NULL, so callers fall back through first name → '(Imported)' on insert.
function splitName(full) {
  const tokens = String(full || '').trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { first_name: null, last_name: null };
  if (tokens.length === 1) return { first_name: null, last_name: tokens[0] };
  return { first_name: tokens[0], last_name: tokens.slice(1).join(' ') };
}

// Parse one delimited line into { company, first_name, last_name, phone, email }.
// Email and phone fields are identified by pattern (not position) so all the
// documented shapes — "First Last, Phone, Email", "First, Last, Phone, Email",
// "Company, First Last, Phone, Email" — resolve without ambiguity flags.
function classifyFields(fields) {
  let email = null;
  let phone = null;
  const rest = [];

  for (const f of fields) {
    if (!f) continue;
    if (looksLikeEmail(f)) {
      // First email wins; a second one is a generic company inbox — discard.
      if (!email) email = f;
      continue;
    }
    const p = extractPhone(f);
    if (p) {
      // Likewise keep only the first phone-bearing cell.
      if (!phone) phone = p;
      continue;
    }
    if (PRIORITY_TIER_RE.test(f)) continue;
    rest.push(f);
  }

  // Job-title fields must never pollute the name/company slots — pull them out
  // first (a title can sit anywhere, even directly after the name), then any
  // leftover text beyond company + name is also a title, never a name suffix.
  const titles = rest.filter(f => TITLE_RE.test(f));
  const nonTitles = rest.filter(f => !TITLE_RE.test(f));

  let company = null;
  let name = { first_name: null, last_name: null };

  if (nonTitles.length === 1) {
    name = splitName(nonTitles[0]);
  } else if (nonTitles.length === 2) {
    // "First, Last" vs "Company, First Last": a multi-word second field means
    // the first field is the company; two single words are a split name.
    if (/\s/.test(nonTitles[1])) {
      company = nonTitles[0];
      name = splitName(nonTitles[1]);
    } else {
      name = { first_name: nonTitles[0], last_name: nonTitles[1] };
    }
  } else if (nonTitles.length >= 3) {
    company = nonTitles[0];
    name = splitName(nonTitles[1]);
    titles.push(...nonTitles.slice(2));
  }

  return {
    company,
    ...name,
    title: titles.length ? titles.join(', ') : null,
    phone: phone ? phone.trim() : null,
    email: email ? email.trim().toLowerCase() : null,
  };
}

function parseRawText(rawText) {
  const lines = String(rawText || '').split(/\r?\n/);
  const rows = [];
  const parseErrors = [];
  let headerSkipped = false;
  let sawDataLine = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (!sawDataLine && !headerSkipped && isHeaderRow(line)) {
      headerSkipped = true;
      continue;
    }
    sawDataLine = true;

    // Excel/Sheets paste is tab-separated; otherwise fall back to commas.
    const delim = line.includes('\t') ? '\t' : ',';
    const rawFields = line.split(delim).map(f => f.trim());
    const fields = rawFields.map(sanitiseCell);
    const hadPlaceholders = rawFields.some((f, idx) => f && !fields[idx]);
    const parsed = classifyFields(fields);

    if (!parsed.phone && !parsed.email) {
      parseErrors.push({
        line: i + 1,
        raw: line,
        reason: hadPlaceholders
          ? 'No usable phone or email (placeholders only)'
          : 'No phone or email found',
      });
      continue;
    }

    rows.push({ ...parsed, line: i + 1 });
  }

  return { rows, parseErrors };
}

// ---------------------------------------------------------------------------
// Existing-contact lookup maps for dedup + warm detection
// ---------------------------------------------------------------------------
async function loadExistingContacts(db) {
  const { rows } = await db.query(`
    SELECT c.id, c.first_name, c.last_name, LOWER(c.email) AS email, c.phone, c.mobile,
      (EXISTS (SELECT 1 FROM activities a WHERE a.contact_id = c.id)
       OR EXISTS (SELECT 1 FROM deal_contacts dc WHERE dc.contact_id = c.id)) AS warm
    FROM contacts c
  `);

  const byEmail = new Map();
  const byPhone = new Map();
  const warmByName = new Set();
  for (const c of rows) {
    if (c.email) byEmail.set(c.email, c);
    const p1 = normalisePhone(c.phone);
    const p2 = normalisePhone(c.mobile);
    if (p1) byPhone.set(p1, c);
    if (p2) byPhone.set(p2, c);
    if (c.warm) {
      warmByName.add(`${(c.first_name || '').toLowerCase()} ${(c.last_name || '').toLowerCase()}`.trim());
    }
  }
  return { byEmail, byPhone, warmByName };
}

async function findAccountByName(db, name) {
  const { rows } = await db.query(
    P('SELECT id, name, business_unit FROM accounts WHERE LOWER(name) = LOWER(?) LIMIT 1'),
    [name]
  );
  return rows[0] || null;
}

// ---------------------------------------------------------------------------
// POST /api/bulk-import/preview — parse + dedupe + resolve, read-only
// ---------------------------------------------------------------------------
router.post('/preview', async (req, res) => {
  try {
    const { exhibition_account_name, employer_account_name, raw_text, default_relationship } = req.body;

    if (!exhibition_account_name || !String(exhibition_account_name).trim()) {
      return res.status(400).json({ success: false, error: 'Exhibition / event account name is required' });
    }
    if (!raw_text || !String(raw_text).trim()) {
      return res.status(400).json({ success: false, error: 'No rows pasted — paste contacts from your spreadsheet first' });
    }
    const relationship = default_relationship === 'organiser' ? 'organiser' : 'exhibitor';
    const exhibitionName = String(exhibition_account_name).trim();
    const employerName = employer_account_name && String(employer_account_name).trim()
      ? String(employer_account_name).trim() : null;

    const { rows: parsedRows, parseErrors } = parseRawText(raw_text);

    const { byEmail, byPhone, warmByName } = await loadExistingContacts(pool);

    const duplicates = [];
    const kept = [];
    const seenEmails = new Set();
    const seenPhones = new Set();

    for (const row of parsedRows) {
      const normPhone = normalisePhone(row.phone);

      const emailMatch = row.email ? byEmail.get(row.email) : null;
      const phoneMatch = normPhone ? byPhone.get(normPhone) : null;
      if (emailMatch || phoneMatch) {
        duplicates.push({
          first_name: row.first_name,
          last_name: row.last_name,
          phone: row.phone,
          email: row.email,
          reason: emailMatch ? 'Email matches existing contact' : 'Phone matches existing contact',
          existing_contact_id: (emailMatch || phoneMatch).id,
        });
        continue;
      }

      if ((row.email && seenEmails.has(row.email)) || (normPhone && seenPhones.has(normPhone))) {
        duplicates.push({
          first_name: row.first_name,
          last_name: row.last_name,
          phone: row.phone,
          email: row.email,
          reason: 'Duplicate within pasted rows',
          existing_contact_id: null,
        });
        continue;
      }
      if (row.email) seenEmails.add(row.email);
      if (normPhone) seenPhones.add(normPhone);

      // Warm = same full name as an existing contact with activity or deal
      // history. (Exact email/phone matches are dedup-excluded above, so the
      // spec's "matches an existing contact" warm signal is applied by name.)
      const nameKey = `${(row.first_name || '').toLowerCase()} ${(row.last_name || '').toLowerCase()}`.trim();
      const warm = nameKey ? warmByName.has(nameKey) : false;

      kept.push({ ...row, warm, relationship });
    }

    // Priority: organisers first, then warm contacts, then pasted order.
    const bucket = (r) => (r.relationship === 'organiser' ? 0 : r.warm ? 1 : 2);
    const ordered = kept
      .map((r, idx) => ({ r, idx }))
      .sort((a, b) => bucket(a.r) - bucket(b.r) || a.idx - b.idx)
      .map(({ r }) => r);

    const rows = ordered.map((r, i) => ({
      row_id: i + 1,
      first_name: r.first_name,
      last_name: r.last_name,
      company: r.company,
      title: r.title,
      phone: r.phone,
      email: r.email,
      priority_order: i + 1,
      warm: r.warm,
      status: 'new',
    }));

    const [exhibitionAccount, employerAccount] = await Promise.all([
      findAccountByName(pool, exhibitionName),
      employerName ? findAccountByName(pool, employerName) : Promise.resolve(null),
    ]);

    const session_id = crypto.randomUUID();
    sessions.set(session_id, {
      createdAt: Date.now(),
      userId: req.user.id,
      exhibitionName,
      employerName,
      relationship,
      rows,
    });

    res.json({
      success: true,
      session_id,
      exhibition_account: {
        id: exhibitionAccount ? exhibitionAccount.id : null,
        name: exhibitionName,
        will_create: !exhibitionAccount,
      },
      employer_account: employerName ? {
        id: employerAccount ? employerAccount.id : null,
        name: employerName,
        will_create: !employerAccount,
      } : null,
      rows,
      duplicates,
      parse_errors: parseErrors,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/bulk-import/confirm — create accounts, contacts, links, tasks
// ---------------------------------------------------------------------------
async function findOrCreateAccount(client, name, ownerId) {
  const existing = await findAccountByName(client, name);
  if (existing) return { id: existing.id, created: false };
  const { rows } = await client.query(
    P(`INSERT INTO accounts (name, business_unit, account_owner_id)
       VALUES (?, 'Simply Seated', ?) RETURNING id`),
    [name, ownerId]
  );
  return { id: rows[0].id, created: true };
}

router.post('/confirm', async (req, res) => {
  try {
    const { session_id, skip_row_ids, row_order, create_tasks, task_due_date, task_due_time } = req.body;

    const session = session_id ? sessions.get(session_id) : null;
    if (!session || Date.now() - session.createdAt > SESSION_TTL_MS) {
      if (session) sessions.delete(session_id);
      return res.status(410).json({
        success: false,
        error: 'Import session has expired — go back and run the preview again. Nothing was imported.',
      });
    }
    if (session.userId !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Session belongs to a different user' });
    }

    const skip = new Set(Array.isArray(skip_row_ids) ? skip_row_ids.map(Number) : []);
    const byRowId = new Map(session.rows.map(r => [r.row_id, r]));

    // Final order: the client's reordered list, filtered to known, non-skipped
    // rows; any non-skipped row missing from row_order is appended (defensive).
    const orderedIds = [];
    const seen = new Set();
    for (const id of (Array.isArray(row_order) ? row_order.map(Number) : [])) {
      if (byRowId.has(id) && !skip.has(id) && !seen.has(id)) { orderedIds.push(id); seen.add(id); }
    }
    for (const r of session.rows) {
      if (!skip.has(r.row_id) && !seen.has(r.row_id)) { orderedIds.push(r.row_id); seen.add(r.row_id); }
    }

    if (orderedIds.length === 0) {
      return res.status(400).json({ success: false, error: 'Nothing to import — every row was skipped' });
    }

    const makeTasks = create_tasks !== false;
    let dueDate = task_due_date || sydneyTomorrowDateString();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dueDate)) || !sydneyDateAtHourUtc(dueDate, 9)) {
      return res.status(400).json({ success: false, error: 'task_due_date must be a valid YYYY-MM-DD date' });
    }

    // Task time in Sydney local, "HH:mm"; malformed input falls back to 09:00.
    let dueHour = 9;
    let dueMinute = 0;
    const timeMatch = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(task_due_time || '').trim());
    if (timeMatch) {
      dueHour = Number(timeMatch[1]);
      dueMinute = Number(timeMatch[2]);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const exhibition = await findOrCreateAccount(client, session.exhibitionName, req.user.id);
      const employer = session.employerName
        ? await findOrCreateAccount(client, session.employerName, req.user.id)
        : null;

      // Re-check dedup at confirm time — data may have changed since preview.
      const { byEmail, byPhone } = await loadExistingContacts(client);

      let contactsCreated = 0;
      let duplicatesSkipped = 0;
      let tasksCreated = 0;

      for (let i = 0; i < orderedIds.length; i++) {
        const row = byRowId.get(orderedIds[i]);
        const normPhone = normalisePhone(row.phone);

        if ((row.email && byEmail.has(row.email)) || (normPhone && byPhone.has(normPhone))) {
          duplicatesSkipped++;
          continue;
        }

        // Australian mobiles (04… once normalised) belong in the mobile column;
        // everything else lands in phone.
        const isMobile = normPhone && normPhone.startsWith('04');
        const lastName = row.last_name || row.first_name || '(Imported)';

        const contactInsert = await client.query(P(`
          INSERT INTO contacts (account_id, first_name, last_name, title, email, phone, mobile,
            business_unit, contact_owner_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'Simply Seated', ?)
          RETURNING id
        `), [
          employer ? employer.id : exhibition.id,
          row.first_name, lastName, row.title || null, row.email,
          isMobile ? null : row.phone,
          isMobile ? row.phone : null,
          req.user.id,
        ]);
        const contactId = contactInsert.rows[0].id;
        contactsCreated++;

        // Guard the confirm-time dedup against repeats later in this same batch.
        if (row.email) byEmail.set(row.email, { id: contactId });
        if (normPhone) byPhone.set(normPhone, { id: contactId });

        // Event link. When an employer account exists it takes the primary slot
        // and this junction row covers the exhibition; with no employer the
        // exhibition is both primary and event link — the junction row is still
        // written so contact_accounts remains the complete event roster.
        await client.query(P(`
          INSERT INTO contact_accounts (contact_id, account_id, relationship)
          VALUES (?, ?, ?)
          ON CONFLICT (contact_id, account_id) DO NOTHING
        `), [contactId, exhibition.id, session.relationship]);

        if (makeTasks) {
          // Stagger due times by i seconds past the chosen Sydney time so the
          // calling list's due_datetime sort preserves the priority order
          // (all still display as the same minute).
          const dueUtc = sydneyDateAtHourUtc(dueDate, dueHour, dueMinute, i);
          const name = [row.first_name, lastName].filter(Boolean).join(' ');
          await client.query(P(`
            INSERT INTO tasks (subject, status, priority, due_datetime, is_all_day,
              contact_id, account_id, business_unit, task_owner_id)
            VALUES (?, 'Not Started', 'Normal', ?, 0, ?, ?, 'Simply Seated', ?)
          `), [
            `Call: ${name} — ${session.exhibitionName}`,
            dueUtc, contactId, exhibition.id, req.user.id,
          ]);
          tasksCreated++;
        }
      }

      await client.query('COMMIT');
      sessions.delete(session_id);

      res.json({
        success: true,
        contacts_created: contactsCreated,
        duplicates_skipped: duplicatesSkipped,
        tasks_created: tasksCreated,
        exhibition_account_id: exhibition.id,
        exhibition_account_created: exhibition.created,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Express routers are plain functions, so pure parsing helpers can be attached
// directly for the regression test harness (server/routes/__tests__/) without
// changing how server/index.js requires/mounts this module.
router.classifyFields = classifyFields;
router.parseRawText = parseRawText;
router.splitName = splitName;
router.extractPhone = extractPhone;
router.normalisePhone = normalisePhone;
router.TITLE_RE = TITLE_RE;

module.exports = router;
