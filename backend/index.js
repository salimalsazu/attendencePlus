require('dotenv/config');
const express = require('express');
const cors    = require('cors');

const attendanceRoutes = require('./src/routes/attendance');
const employeeRoutes   = require('./src/routes/employees');
const dashboardRoutes  = require('./src/routes/dashboard');
const deviceRoutes     = require('./src/routes/devices');
const settingsRoutes   = require('./src/routes/settings');
const authRoutes       = require('./src/routes/auth');
const { requireAuth }  = require('./src/middleware/auth');
const { startScheduler, getNextRunAt } = require('./src/scheduler');
const { seedDefaults, seedUsers } = require('./src/settings');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ── Public routes (no auth required) ──────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.get('/api/health', (_, res) => res.json({ status: 'ok', time: new Date() }));
app.get('/api/status', (_, res) => res.json({ status: 'ok', time: new Date(), nextSyncAt: getNextRunAt() }));

// ── Auth guard — all /api routes below require a valid JWT ─────────────────────
app.use('/api', requireAuth);

// ── Protected routes ───────────────────────────────────────────────────────────
app.use('/api/attendance', attendanceRoutes);
app.use('/api/employees',  employeeRoutes);
app.use('/api/dashboard',  dashboardRoutes);
app.use('/api/devices',    deviceRoutes);
app.use('/api/settings',   settingsRoutes);

app.listen(PORT, async () => {
  console.log(`Server running on http://localhost:${PORT}`);
  await seedDefaults();
  await seedUsers();
  startScheduler();
});
