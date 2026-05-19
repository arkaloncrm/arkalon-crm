const express = require('express');
const { pool, P } = require('../database');
const router = express.Router();

const BASE_SELECT = `
  SELECT id, user_id, title, date_bucket, task_date, completed,
         sort_order, created_at, updated_at, completed_at, pushed_from
  FROM my_day_items
`;

// Sydney is the business timezone; the DB connection runs in UTC, so derive
// the local calendar date explicitly rather than trusting CURRENT_DATE.
const SYDNEY_TODAY = `(NOW() AT TIME ZONE 'Australia/Sydney')::date`;

// Items relevant to "now": everything still open, plus anything finished today.
// Completed items from earlier days stay in the table (never deleted) but drop
// out of the notebook view so the page only ever shows the current day.
const VISIBLE = `(completed = false OR task_date = ${SYDNEY_TODAY})`;

async function loadBuckets(userId) {
  const { rows } = await pool.query(
    P(`${BASE_SELECT} WHERE user_id = ? AND ${VISIBLE}
       ORDER BY sort_order ASC, created_at ASC`),
    [userId]
  );
  return {
    today: rows.filter((r) => r.date_bucket === 'today'),
    tomorrow: rows.filter((r) => r.date_bucket === 'tomorrow'),
  };
}

// GET /api/my-day — today + tomorrow buckets for the current user
router.get('/', async (req, res) => {
  try {
    res.json({ success: true, data: await loadBuckets(req.user.id) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/my-day — create a new item at the end of its bucket
router.post('/', async (req, res) => {
  try {
    const { title, date_bucket } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, error: 'Title is required' });
    }
    const bucket = date_bucket === 'tomorrow' ? 'tomorrow' : 'today';

    const { rows: maxRows } = await pool.query(
      P(`SELECT COALESCE(MAX(sort_order), 0) + 1 AS next
         FROM my_day_items WHERE user_id = ? AND date_bucket = ?`),
      [req.user.id, bucket]
    );

    const insert = await pool.query(
      P(`INSERT INTO my_day_items (user_id, title, date_bucket, sort_order)
         VALUES (?, ?, ?, ?) RETURNING id`),
      [req.user.id, title.trim(), bucket, maxRows[0].next]
    );

    const { rows } = await pool.query(P(`${BASE_SELECT} WHERE id = ?`), [insert.rows[0].id]);
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/my-day/rollover — daily carry-over (never deletes anything)
router.post('/rollover', async (req, res) => {
  try {
    // 1. Incomplete tomorrow items become today's items.
    await pool.query(
      P(`UPDATE my_day_items
         SET date_bucket = 'today', task_date = ${SYDNEY_TODAY}, updated_at = NOW()
         WHERE user_id = ? AND date_bucket = 'tomorrow' AND completed = false`),
      [req.user.id]
    );
    // 2. Incomplete today items stay in today — refresh their task_date.
    await pool.query(
      P(`UPDATE my_day_items
         SET task_date = ${SYDNEY_TODAY}, updated_at = NOW()
         WHERE user_id = ? AND date_bucket = 'today' AND completed = false`),
      [req.user.id]
    );
    // 3. Completed items keep their bucket and task_date — left untouched.
    res.json({ success: true, data: await loadBuckets(req.user.id) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/my-day/:id/complete — toggle completion
router.patch('/:id/complete', async (req, res) => {
  try {
    const existing = await pool.query(
      P(`SELECT completed FROM my_day_items WHERE id = ? AND user_id = ?`),
      [req.params.id, req.user.id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }

    const nowComplete = !existing.rows[0].completed;
    // Stamp the completion day so the item stays visible only for "today".
    const taskDateSet = nowComplete ? `, task_date = ${SYDNEY_TODAY}` : '';
    await pool.query(
      P(`UPDATE my_day_items
         SET completed = ?,
             completed_at = ${nowComplete ? 'NOW()' : 'NULL'}${taskDateSet},
             updated_at = NOW()
         WHERE id = ? AND user_id = ?`),
      [nowComplete, req.params.id, req.user.id]
    );

    const { rows } = await pool.query(P(`${BASE_SELECT} WHERE id = ?`), [req.params.id]);
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/my-day/:id/push — today<->tomorrow
router.patch('/:id/push', async (req, res) => {
  try {
    const existing = await pool.query(
      P(`SELECT date_bucket FROM my_day_items WHERE id = ? AND user_id = ?`),
      [req.params.id, req.user.id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }

    const from = existing.rows[0].date_bucket;
    const to = from === 'today' ? 'tomorrow' : 'today';

    const { rows: maxRows } = await pool.query(
      P(`SELECT COALESCE(MAX(sort_order), 0) + 1 AS next
         FROM my_day_items WHERE user_id = ? AND date_bucket = ?`),
      [req.user.id, to]
    );

    await pool.query(
      P(`UPDATE my_day_items
         SET date_bucket = ?, pushed_from = ?, sort_order = ?, updated_at = NOW()
         WHERE id = ? AND user_id = ?`),
      [to, from, maxRows[0].next, req.params.id, req.user.id]
    );

    const { rows } = await pool.query(P(`${BASE_SELECT} WHERE id = ?`), [req.params.id]);
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/my-day/:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      P(`DELETE FROM my_day_items WHERE id = ? AND user_id = ?`),
      [req.params.id, req.user.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }
    res.json({ success: true, message: 'Item deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
