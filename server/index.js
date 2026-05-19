require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDb } = require('./database');
const { runMigration: migration004 } = require('./database/migrations/004_deals_columns');
const { runMigration: migration006 } = require('./database/migrations/006_products_columns');
const authRouter = require('./auth/authRouter');
const { authMiddleware } = require('./auth/authMiddleware');
const errorHandler = require('./middleware/errorHandler');

const leadsRouter = require('./routes/leads');
const contactsRouter = require('./routes/contacts');
const accountsRouter = require('./routes/accounts');
const dealsRouter = require('./routes/deals');
const productsRouter = require('./routes/products');
const activitiesRouter = require('./routes/activities');
const tasksRouter = require('./routes/tasks');
const reportsRouter = require('./routes/reports');
const aiIngestRouter = require('./routes/aiIngest');
const notesRouter = require('./routes/notes');
const settingsRouter = require('./routes/settings');
const validationRouter = require('./routes/validation');
const researchQueueRouter = require('./routes/researchQueue');
const scanRouter = require('./routes/scan');
const myDayRouter = require('./routes/myDay');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: ['http://localhost:3000', 'http://localhost:5173'] }));
// Bulk import posts the full validated preview payload — raise the body limit.
app.use(express.json({ limit: '5mb' }));

// Public routes
app.use('/api/auth', authRouter);
app.use('/api/ai', aiIngestRouter);

// Protected routes — JWT required
app.use('/api/leads', authMiddleware, leadsRouter);
app.use('/api/contacts', authMiddleware, contactsRouter);
app.use('/api/accounts', authMiddleware, accountsRouter);
app.use('/api/deals', authMiddleware, dealsRouter);
app.use('/api/products', authMiddleware, productsRouter);
app.use('/api/activities', authMiddleware, activitiesRouter);
app.use('/api/tasks', authMiddleware, tasksRouter);
app.use('/api/reports', authMiddleware, reportsRouter);
app.use('/api/notes', authMiddleware, notesRouter);
app.use('/api/settings', authMiddleware, settingsRouter);
app.use('/api/validation', authMiddleware, validationRouter);
app.use('/api/research-queue', authMiddleware, researchQueueRouter);
app.use('/api/scan', authMiddleware, scanRouter);
app.use('/api/my-day', authMiddleware, myDayRouter);

// Serve the built React client in production (Railway single-service deploy)
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use(errorHandler);

async function start() {
  await initDb();
  await migration004();
  await migration006();

  app.listen(PORT, () => {
    console.log('');
    console.log('╔════════════════════════════════════════════╗');
    console.log('║         ARKALON CRM — SERVER READY         ║');
    console.log('╠════════════════════════════════════════════╣');
    console.log(`║  Server running on port ${PORT}                ║`);
    console.log('║  Database: PostgreSQL (pg)                 ║');
    console.log('╠════════════════════════════════════════════╣');
    console.log('║  Default login credentials:                ║');
    console.log('║  Email: stuart@arkalon.com.au              ║');
    console.log('║  Password: Arkalon2024!                    ║');
    console.log('╠════════════════════════════════════════════╣');
    console.log('║  AI Ingest: POST /api/ai/ingest            ║');
    console.log('║  API Key: arkalon-ai-key-2024              ║');
    console.log('║  Header: X-API-Key: arkalon-ai-key-2024   ║');
    console.log('╚════════════════════════════════════════════╝');
    console.log('');
  });
}

start().catch((err) => {
  console.error('[FATAL] Server failed to start:', err);
  process.exit(1);
});
