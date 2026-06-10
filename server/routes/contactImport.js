const express = require('express');
const crypto = require('crypto');
const { pool, P } = require('../database');
const router = express.Router();

// Bearer-token auth for the Contact Capture import feed. Mirrors the
// `Authorization: Bearer <token>` header pattern used by the JWT-protected
// routes, but compares against a static token held in IMPORT_API_TOKEN so
// external capture tools can post without minting a JWT. The secret is never
// hardcoded — if the env var is unset the endpoint fails closed.
function importAuth(req, res, next) {
  const expected = process.env.IMPORT_API_TOKEN;
  if (!expected) {
    return res.status(500).json({ success: false, error: 'Import endpoint not configured' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'No token provided' });
  }

  // Constant-time comparison. timingSafeEqual throws on length mismatch, so
  // length-check first; a differing length is treated as an invalid token.
  const provided = Buffer.from(authHeader.split(' ')[1]);
  const expectedBuf = Buffer.from(expected);
  if (provided.length !== expectedBuf.length ||
      !crypto.timingSafeEqual(provided, expectedBuf)) {
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }
  next();
}

// Trim a string field, returning null for empty/whitespace-only values so they
// land as SQL NULL rather than empty strings.
function clean(v) {
  if (typeof v !== 'string') return v == null ? null : v;
  const t = v.trim();
  return t.length ? t : null;
}

// POST /api/contacts/import — single-contact capture from external forms.
router.post('/', importAuth, async (req, res) => {
  // Log the raw incoming payload so parsing can be verified during testing.
  // Gated behind DEBUG_IMPORT so contact PII isn't written to production logs.
  if (process.env.DEBUG_IMPORT === 'true') {
    console.debug('[CONTACT IMPORT] raw payload:', JSON.stringify(req.body));
  }

  const firstName = clean(req.body.firstName);
  const lastName = clean(req.body.lastName);
  const mobile = clean(req.body.mobile);
  const email = clean(req.body.email);
  const title = clean(req.body.title);
  const organisation = clean(req.body.organisation);

  // Require at least a name (first or last) OR a mobile number.
  if (!firstName && !lastName && !mobile) {
    return res.status(400).json({
      success: false,
      error: 'At least a name (firstName or lastName) or mobile is required',
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let companyId = null;
    let companyCreated = false;

    if (organisation) {
      // Exact-name lookup; create the company if it doesn't already exist.
      const found = await client.query(
        P('SELECT id FROM accounts WHERE name = ? LIMIT 1'),
        [organisation]
      );
      if (found.rows.length) {
        companyId = found.rows[0].id;
      } else {
        const created = await client.query(
          P('INSERT INTO accounts (name) VALUES (?) RETURNING id'),
          [organisation]
        );
        companyId = created.rows[0].id;
        companyCreated = true;
      }
    }

    // contacts.last_name is NOT NULL. Prefer the supplied surname; fall back to
    // the first name, then to a literal marker when only a mobile was supplied.
    // business_unit is left NULL (the CHECK constraint permits NULL) since the
    // capture payload doesn't carry one.
    const lastNameValue = lastName || firstName || '(Imported)';
    const insert = await client.query(
      P(`
        INSERT INTO contacts (account_id, first_name, last_name, title, email, mobile)
        VALUES (?, ?, ?, ?, ?, ?)
        RETURNING id
      `),
      [companyId, firstName, lastNameValue, title, email, mobile]
    );
    const contactId = insert.rows[0].id;

    await client.query('COMMIT');

    return res.status(201).json({
      success: true,
      contactId,
      companyId,
      companyCreated,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    return res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
