const express = require('express');
const multer = require('multer');
const { Readable } = require('stream');
const { google } = require('googleapis');
const { pool, P } = require('../database');
const { encrypt, decrypt } = require('../utils/tokenEncryption');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const REDIRECT_URI = 'https://arkalon-crm-production.up.railway.app/api/auth/google/callback';

async function getDriveClient(userId) {
  const { rows } = await pool.query(
    P('SELECT google_access_token, google_refresh_token, google_token_expiry FROM users WHERE id = ?'),
    [userId]
  );
  const user = rows[0];
  if (!user?.google_refresh_token) throw new Error('Google Drive not connected');

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    REDIRECT_URI
  );
  oauth2Client.setCredentials({
    access_token: decrypt(user.google_access_token),
    refresh_token: decrypt(user.google_refresh_token),
    expiry_date: user.google_token_expiry ? new Date(user.google_token_expiry).getTime() : undefined,
  });

  // Persist refreshed tokens automatically
  oauth2Client.on('tokens', async (tokens) => {
    const encryptedAccess = encrypt(tokens.access_token);
    const expiry = tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null;
    if (tokens.refresh_token) {
      await pool.query(
        P('UPDATE users SET google_access_token = ?, google_refresh_token = ?, google_token_expiry = ? WHERE id = ?'),
        [encryptedAccess, encrypt(tokens.refresh_token), expiry, userId]
      );
    } else {
      await pool.query(
        P('UPDATE users SET google_access_token = ?, google_token_expiry = ? WHERE id = ?'),
        [encryptedAccess, expiry, userId]
      );
    }
  });

  return google.drive({ version: 'v3', auth: oauth2Client });
}

async function findOrCreateFolder(drive, name, parentId) {
  const safeName = name.replace(/'/g, "\\'");
  const q = `name='${safeName}' and mimeType='application/vnd.google-apps.folder' and trashed=false${parentId ? ` and '${parentId}' in parents` : ''}`;
  const list = await drive.files.list({ q, fields: 'files(id)', pageSize: 1 });
  if (list.data.files.length > 0) return list.data.files[0].id;
  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : [],
    },
    fields: 'id',
  });
  return created.data.id;
}

// POST /api/drive/upload/deal/:dealId
router.post('/upload/deal/:dealId', upload.single('file'), async (req, res) => {
  try {
    const { dealId } = req.params;
    if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });

    const { rows: dealRows } = await pool.query(P('SELECT deal_name FROM deals WHERE id = ?'), [dealId]);
    if (!dealRows[0]) return res.status(404).json({ success: false, error: 'Deal not found' });
    const dealName = dealRows[0].deal_name.replace(/[^a-zA-Z0-9 _\-]/g, '').trim() || `Deal ${dealId}`;

    const drive = await getDriveClient(req.user.id);

    const rootId = await findOrCreateFolder(drive, 'Arkalon CRM', null);
    const dealsId = await findOrCreateFolder(drive, 'Deals', rootId);
    const dealFolderId = await findOrCreateFolder(drive, dealName, dealsId);

    const uploaded = await drive.files.create({
      requestBody: {
        name: req.file.originalname,
        parents: [dealFolderId],
      },
      media: {
        mimeType: req.file.mimetype,
        body: Readable.from(req.file.buffer),
      },
      fields: 'id,webViewLink',
    });

    const { rows: [attachment] } = await pool.query(
      P(`INSERT INTO drive_attachments (record_type, record_id, drive_file_id, file_name, mime_type, drive_url)
         VALUES (?, ?, ?, ?, ?, ?) RETURNING *`),
      ['deal', dealId, uploaded.data.id, req.file.originalname, req.file.mimetype, uploaded.data.webViewLink]
    );

    res.json({ success: true, data: attachment });
  } catch (err) {
    console.error('[Drive upload]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/drive/attachments/deal/:dealId
router.get('/attachments/deal/:dealId', async (req, res) => {
  try {
    const { rows } = await pool.query(
      P(`SELECT * FROM drive_attachments WHERE record_type = 'deal' AND record_id = ? ORDER BY created_at DESC`),
      [req.params.dealId]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/drive/attachments/:attachmentId
router.delete('/attachments/:attachmentId', async (req, res) => {
  try {
    const { rows } = await pool.query(
      P('SELECT * FROM drive_attachments WHERE id = ?'),
      [req.params.attachmentId]
    );
    if (!rows[0]) return res.status(404).json({ success: false, error: 'Attachment not found' });

    try {
      const drive = await getDriveClient(req.user.id);
      await drive.files.delete({ fileId: rows[0].drive_file_id });
    } catch (driveErr) {
      // File may already be gone from Drive — log and continue with DB delete
      console.warn('[Drive delete]', driveErr.message);
    }

    await pool.query(P('DELETE FROM drive_attachments WHERE id = ?'), [req.params.attachmentId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
