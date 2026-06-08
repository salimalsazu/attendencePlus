const router  = require('express').Router();
const prisma   = require('../prismaClient');
const { getSettings, parseTime } = require('../settings');

// GET /api/dashboard/stats?date=2026-06-08
router.get('/stats', async (req, res) => {
  try {
    const targetDate = req.query.date ? new Date(req.query.date) : new Date();
    const from = new Date(targetDate); from.setHours(0, 0, 0, 0);
    const to   = new Date(targetDate); to.setHours(23, 59, 59, 999);

    const settings  = await getSettings();
    const startTime = parseTime(settings.office_start);
    const lateGrace = parseInt(settings.late_grace_mins);

    const [employees, logs, lastSync] = await Promise.all([
      prisma.employee.findMany(),
      prisma.attendanceLog.findMany({
        where:   { punchTime: { gte: from, lte: to } },
        orderBy: { punchTime: 'asc' },
      }),
      prisma.syncLog.findFirst({
        where:   { status: 'success' },
        orderBy: { syncedAt: 'desc' },
      }),
    ]);

    const byUser = {};
    for (const log of logs) {
      if (!byUser[log.deviceUserId]) byUser[log.deviceUserId] = [];
      byUser[log.deviceUserId].push(log);
    }

    let presentCount = 0;
    let lateCount    = 0;
    let delayCount   = 0;

    for (const emp of employees) {
      const userLogs = byUser[emp.deviceUserId] ?? [];
      if (userLogs.length === 0) continue;
      presentCount++;

      const firstPunch  = new Date(userLogs[0].punchTime);
      const officeStart = new Date(firstPunch);
      officeStart.setHours(startTime.hours, startTime.minutes, 0, 0);
      const lateThreshold = new Date(officeStart.getTime() + lateGrace * 60_000);

      if (firstPunch > officeStart)    delayCount++;
      if (firstPunch > lateThreshold)  lateCount++;
    }

    const total = employees.length;

    res.json({
      totalEmployees: total,
      presentCount,
      presentPct:  total > 0 ? Math.round((presentCount / total) * 1000) / 10 : 0,
      lateCount,
      lateRatio:   total > 0 ? Math.round((lateCount  / total) * 1000) / 10 : 0,
      delayCount,
      delayRatio:  total > 0 ? Math.round((delayCount / total) * 1000) / 10 : 0,
      absentCount: total - presentCount,
      lastSyncTime: lastSync?.syncedAt ?? null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/trend?days=30
router.get('/trend', async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days || '30'), 365);

    const rangeStart = new Date();
    rangeStart.setDate(rangeStart.getDate() - (days - 1));
    rangeStart.setHours(0, 0, 0, 0);
    const rangeEnd = new Date(); rangeEnd.setHours(23, 59, 59, 999);

    const [totalEmployees, logs] = await Promise.all([
      prisma.employee.count(),
      prisma.attendanceLog.findMany({
        where:  { punchTime: { gte: rangeStart, lte: rangeEnd } },
        select: { deviceUserId: true, punchTime: true },
      }),
    ]);

    // Group unique users per date
    const byDate = {};
    for (const log of logs) {
      const dateStr = new Date(log.punchTime).toISOString().split('T')[0];
      if (!byDate[dateStr]) byDate[dateStr] = new Set();
      byDate[dateStr].add(log.deviceUserId);
    }

    const results = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const present = byDate[dateStr]?.size ?? 0;
      results.push({ date: dateStr, present, absent: totalEmployees - present });
    }

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/departments?date=2026-06-08
router.get('/departments', async (req, res) => {
  try {
    const targetDate = req.query.date ? new Date(req.query.date) : new Date();
    const from = new Date(targetDate); from.setHours(0, 0, 0, 0);
    const to   = new Date(targetDate); to.setHours(23, 59, 59, 999);

    const [employees, logs] = await Promise.all([
      prisma.employee.findMany(),
      prisma.attendanceLog.findMany({
        where:  { punchTime: { gte: from, lte: to } },
        select: { deviceUserId: true },
        distinct: ['deviceUserId'],
      }),
    ]);

    const presentSet = new Set(logs.map(l => l.deviceUserId));

    const deptMap = {};
    for (const emp of employees) {
      const dept = emp.department?.trim() || 'Other';
      if (!deptMap[dept]) deptMap[dept] = { total: 0, present: 0 };
      deptMap[dept].total++;
      if (presentSet.has(emp.deviceUserId)) deptMap[dept].present++;
    }

    const results = Object.entries(deptMap)
      .map(([department, { total, present }]) => ({
        department,
        total,
        present,
        pct: total > 0 ? Math.round((present / total) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.total - a.total);

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
