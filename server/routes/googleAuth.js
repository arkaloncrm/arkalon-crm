const express = require('express');
const jwt = require('jsonwebtoken');
const { google } = require('googleapis');
const { pool, P } = require('../database');
const { JWT_SECRET } = require('../auth/authMiddleware');
const { encrypt, decrypt } = require('../utils/tokenEncryption');

const router = express.Router();

const REDIRECT_URI = 'https://arkalon-crm-production.up.railway.app/api/auth/google/callback';
const SUCCESS_REDIRECT = 'https://arkalon-crm-production.up.railway.app/deals';
const FAILURE_REDIRECT = 'https://arkalon-crm-production.up.railway.app/settings?google=error';

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    REDIRECT_URI
  );
}

// GET /api/google/auth-url — JWT protected (middleware applied in index.js)
router.get('/auth-url', (req, res) => {
  const state = jwt.sign({ userId: req.user.id }, JWT_SECRET, { expiresIn: '10m' });
  const oauth2Client = getOAuthClient();
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/drive.file'],
    state,
  });
  res.json({ success: true, data: { url } });
});

// GET /api/google/status — JWT protected (middleware applied in index.js)
router.get('/status', async (req, res) => {
  const { rows } = await pool.query(
    P('SELECT google_refresh_token FROM users WHERE id = ?'),
    [req.user.id]
  );
  const connected = !!(rows[0]?.google_refresh_token);
  res.json({ success: true, data: { connected } });
});

// PUBLIC callback — mounted at /api/auth/google/callback in index.js (no authMiddleware)
async function callback(req, res) {
  const { code, state, error } = req.query;
  if (error || !code || !state) {
    return res.redirect(FAILURE_REDIRECT);
  }
  try {
    const decoded = jwt.verify(state, JWT_SECRET);
    const userId = decoded.userId;

    const oauth2Client = getOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);

    const encryptedAccess = encrypt(tokens.access_token);
    const expiry = tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null;

    if (tokens.refresh_token) {
      const encryptedRefresh = encrypt(tokens.refresh_token);
      await pool.query(
        P('UPDATE users SET google_access_token = ?, google_refresh_token = ?, google_token_expiry = ? WHERE id = ?'),
        [encryptedAccess, encryptedRefresh, expiry, userId]
      );
    } else {
      // No new refresh token — user already granted; update access token only
      await pool.query(
        P('UPDATE users SET google_access_token = ?, google_token_expiry = ? WHERE id = ?'),
        [encryptedAccess, expiry, userId]
      );
    }

    res.redirect(SUCCESS_REDIRECT);
  } catch (err) {
    console.error('[Google OAuth callback]', err.message);
    res.redirect(FAILURE_REDIRECT);
  }
}

module.exports = router;
module.exports.callback = callback;
