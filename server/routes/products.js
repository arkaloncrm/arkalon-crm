const express = require('express');
const { db } = require('../database');
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
router.get('/', (req, res) => {
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
    const products = db.prepare(`
      SELECT ${PRODUCT_COLUMNS}
      FROM products
      ${where}
      ORDER BY name ASC
    `).all(...params);

    res.json({ success: true, data: products });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/products/categories — MUST be before /:id
router.get('/categories', (req, res) => {
  try {
    const rows = db.prepare(
      "SELECT DISTINCT category FROM products WHERE category IS NOT NULL AND category != '' ORDER BY category"
    ).all();
    res.json({ success: true, data: rows.map(row => row.category) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/products/check-sku?sku=ABC&exclude_id=123 — MUST be before /:id
router.get('/check-sku', (req, res) => {
  try {
    const { sku, exclude_id } = req.query;
    if (!sku?.trim()) return res.json({ success: true, available: false });

    let sql = 'SELECT id FROM products WHERE sku = ?';
    const params = [sku.trim()];
    if (exclude_id) {
      sql += ' AND id != ?';
      params.push(Number(exclude_id));
    }
    const existing = db.prepare(sql).get(...params);
    res.json({ success: true, available: !existing });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/products/:id/toggle-active
router.patch('/:id/toggle-active', (req, res) => {
  try {
    const existing = db.prepare('SELECT id, is_active FROM products WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Product not found' });

    db.prepare('UPDATE products SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(existing.is_active ? 0 : 1, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/products/:id/duplicate — safe looping SKU generation
router.post('/:id/duplicate', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Product not found' });

    const baseSku = existing.sku
      ? `${existing.sku}-COPY`
      : `PRODUCT-${existing.id}-COPY`;

    let newSku = baseSku;
    let attempt = 1;
    while (db.prepare('SELECT id FROM products WHERE sku = ?').get(newSku)) {
      attempt++;
      newSku = `${baseSku}-${attempt}`;
    }

    const result = db.prepare(`
      INSERT INTO products (name, sku, description, unit_price, unit_type, business_unit,
        default_commission_pct, is_recurring, is_active, category, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `).run(
      `${existing.name} (Copy)`, newSku, existing.description,
      existing.unit_price, existing.unit_type, existing.business_unit,
      existing.default_commission_pct, existing.is_recurring,
      existing.category || null, existing.notes || null
    );
    res.status(201).json({ success: true, data: { id: result.lastInsertRowid } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/products/:id
router.get('/:id', (req, res) => {
  try {
    const product = db.prepare(`
      SELECT ${PRODUCT_COLUMNS}
      FROM products WHERE id = ?
    `).get(req.params.id);
    if (!product) return res.status(404).json({ success: false, error: 'Product not found' });

    const { deal_count } = db.prepare(
      'SELECT COUNT(DISTINCT deal_id) AS deal_count FROM deal_line_items WHERE product_id = ?'
    ).get(req.params.id);

    res.json({ success: true, data: { ...product, deal_count } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/products
router.post('/', (req, res) => {
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

    const skuConflict = db.prepare('SELECT id FROM products WHERE sku = ?').get(sku.trim());
    if (skuConflict) {
      return res.status(400).json({ success: false, error: `SKU "${sku.trim()}" is already in use` });
    }

    const result = db.prepare(`
      INSERT INTO products (name, sku, description, unit_price, unit_type, business_unit,
        default_commission_pct, is_recurring, is_active, category, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name.trim(), sku.trim(), description?.trim() || null, round2(unit_price || 0), unit_type || null,
      business_unit, commission.pct, is_recurring ? 1 : 0, is_active !== false ? 1 : 0,
      req.body.category?.trim() || null, req.body.notes?.trim() || null
    );

    const product = db.prepare(`SELECT ${PRODUCT_COLUMNS} FROM products WHERE id = ?`).get(result.lastInsertRowid);
    res.status(201).json({ success: true, data: product });
  } catch (err) {
    if (err.message?.includes('UNIQUE')) {
      return res.status(400).json({ success: false, error: 'A product with that SKU already exists' });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/products/:id
router.put('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT id FROM products WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Product not found' });

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

    const skuConflict = db.prepare('SELECT id FROM products WHERE sku = ? AND id != ?')
      .get(sku.trim(), req.params.id);
    if (skuConflict) {
      return res.status(400).json({ success: false, error: `SKU "${sku.trim()}" is already in use` });
    }

    db.prepare(`
      UPDATE products SET
        name = ?, sku = ?, description = ?, unit_price = ?, unit_type = ?,
        business_unit = ?, default_commission_pct = ?, is_recurring = ?, is_active = ?,
        category = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      name.trim(), sku.trim(), description?.trim() || null, round2(unit_price || 0), unit_type || null,
      business_unit, commission.pct, is_recurring ? 1 : 0, is_active !== false ? 1 : 0,
      req.body.category?.trim() || null, req.body.notes?.trim() || null,
      req.params.id
    );

    const product = db.prepare(`SELECT ${PRODUCT_COLUMNS} FROM products WHERE id = ?`).get(req.params.id);
    res.json({ success: true, data: product });
  } catch (err) {
    if (err.message?.includes('UNIQUE')) {
      return res.status(400).json({ success: false, error: 'A product with that SKU already exists' });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/products/:id
router.delete('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT id FROM products WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Product not found' });

    const inUse = db.prepare('SELECT id FROM deal_line_items WHERE product_id = ? LIMIT 1').get(req.params.id);
    if (inUse) {
      return res.status(400).json({ success: false, error: 'Cannot delete — product is used in one or more deals' });
    }

    db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
