const express = require('express');
const { pool, P } = require('../database');
const router = express.Router();

// ---------------------------------------------------------------------------
// Mailgun inbound email → research_queue
//
// Mailgun forwards inbound mail as multipart/form-data (Routes with a forward
// action). We accept application/x-www-form-urlencoded as well so a Mailgun
// "Store + notify" config also works without a redeploy.
//
// CRITICAL: Always respond 200. Any non-2xx causes Mailgun to retry, which
// would create duplicate research_queue records. Errors are logged and
// reported in the JSON body, but the status code stays 200.
//
// We deliberately do NOT add a multipart npm package — the fields we need are
// short text values, so a tiny inline parser is enough and keeps the diff
// limited to two files.
// ---------------------------------------------------------------------------

// Walks a multipart/form-data buffer and pulls out the text fields. File
// uploads (parts with a `filename=` in their Content-Disposition) are skipped
// because attachments aren't ingested into research_queue today.
function parseMultipart(buffer, boundary) {
  const fields = {};
  const boundaryBuf = Buffer.from('--' + boundary);
  let pos = buffer.indexOf(boundaryBuf);
  while (pos !== -1) {
    const next = buffer.indexOf(boundaryBuf, pos + boundaryBuf.length);
    if (next === -1) break;
    // +2 skips CRLF after the opening boundary; -2 trims the CRLF before the next one.
    const partStart = pos + boundaryBuf.length + 2;
    const partEnd = next - 2;
    if (partEnd > partStart) {
      const part = buffer.slice(partStart, partEnd);
      const headerEnd = part.indexOf('\r\n\r\n');
      if (headerEnd !== -1) {
        const headers = part.slice(0, headerEnd).toString('utf8');
        const body = part.slice(headerEnd + 4);
        if (!/filename="/i.test(headers)) {
          const nameMatch = /name="([^"]+)"/i.exec(headers);
          if (nameMatch) fields[nameMatch[1]] = body.toString('utf8');
        }
      }
    }
    pos = next;
  }
  return fields;
}

// "Pri Mills <pri@hapori.co>"   → { name: 'Pri Mills', email: 'pri@hapori.co' }
// "\"Pri Mills\" <pri@...>"     → { name: 'Pri Mills', email: '...'           }
// "pri@hapori.co"                → { name: '',           email: 'pri@hapori.co' }
function parseFromField(raw) {
  if (!raw) return { name: '', email: '' };
  const angled = /^\s*"?([^"<]+?)"?\s*<([^>]+)>\s*$/.exec(raw);
  if (angled) return { name: angled[1].trim(), email: angled[2].trim() };
  return { name: '', email: raw.trim() };
}

// "Pri Mills"          → { first_name: 'Pri',   last_name: 'Mills' }
// "Pri B. Mills"       → { first_name: 'Pri',   last_name: 'Mills' }  (middle dropped)
// "Alice"              → { first_name: 'Alice', last_name: null    }
// ""                   → { first_name: null,    last_name: null    }
function splitName(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first_name: null, last_name: null };
  if (parts.length === 1) return { first_name: parts[0], last_name: null };
  return { first_name: parts[0], last_name: parts[parts.length - 1] };
}

// "pri@hapori.co" → "Hapori"   (first label of the domain, capitalised)
// Inbound sender addresses are almost always at the apex domain, not a
// subdomain, so taking the first label is the right heuristic.
function companyFromEmail(email) {
  const at = (email || '').indexOf('@');
  if (at === -1) return null;
  const domain = email.slice(at + 1).toLowerCase();
  const first = domain.split('.')[0];
  if (!first) return null;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

// POST /api/email/ingest — Mailgun inbound webhook target.
// NOTE: must NOT be wrapped in authMiddleware. Mailgun has no JWT to send.
router.post(
  '/ingest',
  // Route-scoped body parsers — content-type sniffing means only one runs.
  // express.json() at app level skips non-application/json content-types,
  // so the body reaches us unread.
  express.urlencoded({ extended: true, limit: '25mb' }),
  express.raw({ type: 'multipart/form-data', limit: '25mb' }),
  async (req, res) => {
    try {
      const ct = (req.headers['content-type'] || '').toLowerCase();
      let fields = {};

      if (ct.startsWith('multipart/form-data') && Buffer.isBuffer(req.body)) {
        const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(ct);
        const boundary = m && (m[1] || m[2]);
        if (boundary) fields = parseMultipart(req.body, boundary.trim());
      } else if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
        fields = req.body;
      }

      const sender = (fields.sender || '').trim();
      const from = (fields.from || '').trim();
      const subject = (fields.subject || '').trim();
      const bodyPlain = (fields['body-plain'] || '').trim();
      const bodyHtml = (fields['body-html'] || '').trim();
      const recipient = (fields.recipient || '').trim();

      const parsedFrom = parseFromField(from);
      const senderEmail = sender || parsedFrom.email || null;
      const contactName = parsedFrom.name || null;
      const { first_name, last_name } = splitName(parsedFrom.name);
      const companyName = companyFromEmail(senderEmail);

      const title = subject || (contactName ? `Email from ${contactName}` : 'Inbound email');
      // Stored on the record for quick triage; the full body lives in source_payload.
      const aiSummary = bodyPlain ? bodyPlain.slice(0, 2000) : null;
      const sourcePayload = JSON.stringify({
        sender, from, subject, recipient,
        body_plain: bodyPlain,
        body_html: bodyHtml,
      });

      await pool.query(P(`
        INSERT INTO research_queue (
          title, company_name, contact_name, first_name, last_name, email,
          candidate_type, status, source, ai_summary, source_payload
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `), [
        title,
        companyName,
        contactName,
        first_name,
        last_name,
        senderEmail,
        'Lead Candidate',
        'New',
        'Email Forward',
        aiSummary,
        sourcePayload,
      ]);

      return res.status(200).json({ success: true });
    } catch (err) {
      // Log loudly but still return 200 — Mailgun retries on non-2xx and would
      // duplicate records once the underlying issue is fixed.
      console.error('[email/ingest] failed:', err);
      return res.status(200).json({ success: false, error: err.message });
    }
  }
);

module.exports = router;
