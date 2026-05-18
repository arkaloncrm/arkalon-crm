const express = require('express');
const { pool, P } = require('../database');
const router = express.Router();

const VALID_UNIT_TYPES = ['per month', 'per seat/month', 'per day', 'per item', 'per project', 'flat fee'];
const PRODUCT_COLUMNS = `id, name, sku, description, unit_price, unit_type, business_unit,
  default_commission_pct, is_recurring, is_active, category, notes, created_at, updated_at`;
const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

function normaliseCommissionPct(value) {
  if (value === null || value === undefined || value === '') return { pct: null };
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw < 0 || raw > 100) {
    return { error: 'default_commission_pct must be 0–100' };
  }
  return { pct: raw > 1 ? round2(raw / 100) : round2(raw) };
}

// GET /api/products
router.get('/', async (req, res) => {
  try {
    const { business_unit, is_active, category } = req.query;
    const whereClauses = [];
    const params = [];

    if (business_unit) {
      whereClauses.push('business_unit = ?');
      params.push(business_unit);
    }
    if (is_active !== undefined) {
      whereClauses.push('is_active = ?');
      params.push(is_active === 'true' || is_active === '1' ? 1 : 0);
    }
    if (category) {
      whereClauses.push('category = ?');
      params.push(category);
    }

    const where = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const { rows: products } = await pool.query(P(`
      SELECT ${PRODUCT_COLUMNS}
      FROM products
      ${where}
      ORDER BY name ASC
    `), params);

    res.json({ success: true, data: products });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/products/categories — MUST be before /:id
router.get('/categories', async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT DISTINCT category FROM products WHERE category IS NOT NULL AND category != '' ORDER BY category"
    );
    res.json({ success: true, data: rows.map(row => row.category) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/products/check-sku?sku=ABC&exclude_id=123 — MUST be before /:id
router.get('/check-sku', async (req, res) => {
  try {
    const { sku, exclude_id } = req.query;
    if (!sku?.trim()) return res.json({ success: true, available: false });

    let sql = 'SELECT id FROM products WHERE sku = ?';
    const params = [sku.trim()];
    if (exclude_id) {
      sql += ' AND id != ?';
      params.push(Number(exclude_id));
    }
    const { rows } = await pool.query(P(sql), params);
    res.json({ success: true, available: rows.length === 0 });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/products/:id/toggle-active
router.patch('/:id/toggle-active', async (req, res) => {
  try {
    const existingResult = await pool.query(
      P('SELECT id, is_active FROM products WHERE id = ?'),
      [req.params.id]
    );
    const existing = existingResult.rows[0];
    if (!existing) return res.status(404).json({ success: false, error: 'Product not found' });

    await pool.query(
      P('UPDATE products SET is_active = ?, updated_at = NOW() WHERE id = ?'),
      [existing.is_active ? 0 : 1, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/products/:id/duplicate — safe looping SKU generation
router.post('/:id/duplicate', async (req, res) => {
  try {
    const existingResult = await pool.query(P('SELECT * FROM products WHERE id = ?'), [req.params.id]);
    const existing = existingResult.rows[0];
    if (!existing) return res.status(404).json({ success: false, error: 'Product not found' });

    const baseSku = existing.sku
      ? `${existing.sku}-COPY`
      : `PRODUCT-${existing.id}-COPY`;

    let newSku = baseSku;
    let attempt = 1;
    while ((await pool.query(P('SELECT id FROM products WHERE sku = ?'), [newSku])).rows.length > 0) {
      attempt++;
      newSku = `${baseSku}-${attempt}`;
    }

    const result = await pool.query(P(`
      INSERT INTO products (name, sku, description, unit_price, unit_type, business_unit,
        default_commission_pct, is_recurring, is_active, category, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      RETURNING id
    `), [
      `${existing.name} (Copy)`, newSku, existing.description,
      existing.unit_price, existing.unit_type, existing.business_unit,
      existing.default_commission_pct, existing.is_recurring,
      existing.category || null, existing.notes || null
    ]);
    res.status(201).json({ success: true, data: { id: result.rows[0].id } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/products/:id
router.get('/:id', async (req, res) => {
  try {
    const productResult = await pool.query(P(`
      SELECT ${PRODUCT_COLUMNS}
      FROM products WHERE id = ?
    `), [req.params.id]);
    const product = productResult.rows[0];
    if (!product) return res.status(404).json({ success: false, error: 'Product not found' });

    const countResult = await pool.query(
      P('SELECT COUNT(DISTINCT deal_id) AS deal_count FROM deal_line_items WHERE product_id = ?'),
      [req.params.id]
    );
    const { deal_count } = countResult.rows[0];

    res.json({ success: true, data: { ...product, deal_count } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/products
router.post('/', async (req, res) => {
  try {
    const { name, sku, description, unit_price, unit_type, business_unit,
            default_commission_pct, is_recurring, is_active } = req.body;

    if (!name?.trim()) return res.status(400).json({ success: false, error: 'Product name is required' });
    if (!sku?.trim()) return res.status(400).json({ success: false, error: 'SKU is required' });
    if (!['ASC', 'Simply Seated', 'Both'].includes(business_unit)) {
      return res.status(400).json({ success: false, error: 'business_unit must be ASC, Simply Seated, or Both' });
    }
    if (unit_type && !VALID_UNIT_TYPES.includes(unit_type)) {
      return res.status(400).json({ success: false, error: `unit_type must be one of: ${VALID_UNIT_TYPES.join(', ')}` });
    }

    const commission = normaliseCommissionPct(default_commission_pct);
    if (commission.error) return res.status(400).json({ success: false, error: commission.error });

    const skuConflict = await pool.query(P('SELECT id FROM products WHERE sku = ?'), [sku.trim()]);
    if (skuConflict.rows.length > 0) {
      return res.status(400).json({ success: false, error: `SKU "${sku.trim()}" is already in use` });
    }

    const result = await pool.query(P(`
      INSERT INTO products (name, sku, description, unit_price, unit_type, business_unit,
        default_commission_pct, is_recurring, is_active, category, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id
    `), [
      name.trim(), sku.trim(), description?.trim() || null, round2(unit_price || 0), unit_type || null,
      business_unit, commission.pct, is_recurring ? 1 : 0, is_active !== false ? 1 : 0,
      req.body.category?.trim() || null, req.body.notes?.trim() || null
    ]);

    const { rows } = await pool.query(
      P(`SELECT ${PRODUCT_COLUMNS} FROM products WHERE id = ?`),
      [result.rows[0].id]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ success: false, error: 'A product with that SKU already exists' });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/products/:id
router.put('/:id', async (req, res) => {
  try {
    const existing = await pool.query(P('SELECT id FROM products WHERE id = ?'), [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ success: false, error: 'Product not found' });

    const { name, sku, description, unit_price, unit_type, business_unit,
            default_commission_pct, is_recurring, is_active } = req.body;

    if (!name?.trim()) return res.status(400).json({ success: false, error: 'Product name is required' });
    if (!sku?.trim()) return res.status(400).json({ success: false, error: 'SKU is required' });
    if (!['ASC', 'Simply Seated', 'Both'].includes(business_unit)) {
      return res.status(400).json({ success: false, error: 'business_unit must be ASC, Simply Seated, or Both' });
    }
    if (unit_type && !VALID_UNIT_TYPES.includes(unit_type)) {
      return res.status(400).json({ success: false, error: `unit_type must be one of: ${VALID_UNIT_TYPES.join(', ')}` });
    }

    const commission = normaliseCommissionPct(default_commission_pct);
    if (commission.error) return res.status(400).json({ success: false, error: commission.error });

    const skuConflict = await pool.query(
      P('SELECT id FROM products WHERE sku = ? AND id != ?'),
      [sku.trim(), req.params.id]
    );
    if (skuConflict.rows.length > 0) {
      return res.status(400).json({ success: false, error: `SKU "${sku.trim()}" is already in use` });
    }

    await pool.query(P(`
      UPDATE products SET
        name = ?, sku = ?, description = ?, unit_price = ?, unit_type = ?,
        business_unit = ?, default_commission_pct = ?, is_recurring = ?, is_active = ?,
        category = ?, notes = ?, updated_at = NOW()
      WHERE id = ?
    `), [
      name.trim(), sku.trim(), description?.trim() || null, round2(unit_price || 0), unit_type || null,
      business_unit, commission.pct, is_recurring ? 1 : 0, is_active !== false ? 1 : 0,
      req.body.category?.trim() || null, req.body.notes?.trim() || null,
      req.params.id
    ]);

    const { rows } = await pool.query(
      P(`SELECT ${PRODUCT_COLUMNS} FROM products WHERE id = ?`),
      [req.params.id]
    );
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ success: false, error: 'A product with that SKU already exists' });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/products/:id
router.delete('/:id', async (req, res) => {
  try {
    const existing = await pool.query(P('SELECT id FROM products WHERE id = ?'), [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ success: false, error: 'Product not found' });

    const inUse = await pool.query(
      P('SELECT id FROM deal_line_items WHERE product_id = ? LIMIT 1'),
      [req.params.id]
    );
    if (inUse.rows.length > 0) {
      return res.status(400).json({ success: false, error: 'Cannot delete — product is used in one or more deals' });
    }

    await pool.query(P('DELETE FROM products WHERE id = ?'), [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
