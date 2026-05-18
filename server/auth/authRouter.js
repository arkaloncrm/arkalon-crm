const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool, P } = require('../database');
const { authMiddleware, JWT_SECRET } = require('./authMiddleware');

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password are required' });
  }

  const { rows } = await pool.query(
    P('SELECT * FROM users WHERE email = ?'),
    [email.toLowerCase().trim()]
  );
  const user = rows[0];
  if (!user) {
    return res.status(401).json({ success: false, error: 'Invalid credentials' });
  }

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ success: false, error: 'Invalid credentials' });
  }

  await pool.query(P('UPDATE users SET last_login = NOW() WHERE id = ?'), [user.id]);

  const token = jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role, avatar_initials: user.avatar_initials },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  return res.json({
    success: true,
    data: {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar_initials: user.avatar_initials,
      },
    },
  });
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req, res) => {
  const { rows } = await pool.query(
    P('SELECT id, name, email, role, avatar_initials, created_at, last_login FROM users WHERE id = ?'),
    [req.user.id]
  );
  const user = rows[0];
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });
  return res.json({ success: true, data: user });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  // JWT is stateless — client drops the token
  return res.json({ success: true, message: 'Logged out' });
});

module.exports = router;
