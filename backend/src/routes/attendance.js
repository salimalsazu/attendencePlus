const router = require('express').Router();
const prisma = require('../prismaClient');
const { syncAttendance } = require('../zkService');
const { getSettings, parseTime } = require('../settings');

// GET /api/attendance/daily-summary?date=2026-06-08
// One row per employee: firstPunch, lastPunch, totalPunches, durationMins, status
router.get('/daily-summary', async (req, res) => {
  try {
    const targetDate = req.query.date ? new Date(req.query.date) : new Date();
    const from = new Date(targetDate); from.setHours(0, 0, 0, 0);
    const to   = new Date(targetDate); to.setHours(23, 59, 59, 999);

    const [employees, logs] = await Promise.all([
      prisma.employee.findMany({ orderBy: { name: 'asc' } }),
      prisma.attendanceLog.findMany({
        where: { punchTime: { gte: from, lte: to } },
        orderBy: { punchTime: 'asc' },
      }),
    ]);

    const byUser = {};
    for (const log of logs) {
      if (!byUser[log.deviceUserId]) byUser[log.deviceUserId] = [];
      byUser[log.deviceUserId].push(log);
    }

    const result = employees.map(emp => {
      const userLogs = byUser[emp.deviceUserId] ?? [];
      const first    = userLogs[0]                                    ?? null;
      const last     = userLogs.length > 1 ? userLogs[userLogs.length - 1] : null;
      const durationMins = first && last
        ? Math.round((new Date(last.punchTime) - new Date(first.punchTime)) / 60000)
        : null;

      return {
        employee:     emp,
        firstPunch:   first?.punchTime ?? null,
        lastPunch:    last?.punchTime  ?? null,
        totalPunches: userLogs.length,
        durationMins,
        status:       userLogs.length > 0 ? 'present' : 'absent',
      };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/attendance?date=2026-06-08&deviceUserId=1&page=1&limit=50
router.get('/', async (req, res) => {
  try {
    const { date, deviceUserId, page = '1', limit = '50' } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
    if (date) {
      const from = new Date(date);
      const to   = new Date(date);
      to.setDate(to.getDate() + 1);
      where.punchTime = { gte: from, lt: to };
    }
    if (deviceUserId) where.deviceUserId = deviceUserId;

    const [records, total] = await Promise.all([
      prisma.attendanceLog.findMany({
        where,
        orderBy: { punchTime: 'desc' },
        skip,
        take: parseInt(limit),
      }),
      prisma.attendanceLog.count({ where }),
    ]);

    const ids = [...new Set(records.map(r => r.deviceUserId))];
    const employees = await prisma.employee.findMany({
      where: { deviceUserId: { in: ids } },
      select: { deviceUserId: true, name: true, role: true, department: true, designation: true },
    });
    const empMap = Object.fromEntries(employees.map(e => [e.deviceUserId, e]));

    res.json({
      total,
      page:    parseInt(page),
      limit:   parseInt(limit),
      records: records.map(r => ({ ...r, employee: empMap[r.deviceUserId] ?? null })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/attendance/sync — trigger manual sync
router.post('/sync', async (req, res) => {
  try {
    const result = await syncAttendance();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/attendance/fix-tz-duplicates
// Comprehensive cleanup for records stored with wrong +6h offset (Bangladesh time treated as UTC).
// Step 1: Shift device records whose stored UTC time is in the future — they are 100% wrong
//         (a real punch cannot be in the future; the offset made them appear ahead by 6h).
// Step 2: Delete the old +6h duplicates that have a correct 6h-earlier copy (from after the fix).
router.post('/fix-tz-duplicates', async (req, res) => {
  try {
    // Step 1: shift wrong future records back by 6 hours.
    // A device record with punchTime > NOW() (UTC) is definitely stored with the wrong offset.
    // We only shift if the corrected time (punchTime - 6h) is in the past, so we don't
    // accidentally touch anything ambiguous.
    const shifted = await prisma.$executeRaw`
      UPDATE "AttendanceLog"
      SET "punchTime" = "punchTime" - INTERVAL '6 hours'
      WHERE source = 'device'
        AND "punchTime" > NOW()
        AND "punchTime" - INTERVAL '6 hours' <= NOW()
    `;

    // Step 2: delete the remaining +6h duplicates where a correct copy (6h earlier) already exists.
    const deleted = await prisma.$executeRaw`
      DELETE FROM "AttendanceLog"
      WHERE source = 'device'
        AND id IN (
          SELECT a1.id
          FROM "AttendanceLog" a1
          WHERE a1.source = 'device'
            AND EXISTS (
              SELECT 1 FROM "AttendanceLog" a2
              WHERE a2."deviceUserId" = a1."deviceUserId"
                AND a2."punchTime" = a1."punchTime" - INTERVAL '6 hours'
                AND a2.source = 'device'
            )
        )
    `;

    res.json({ shifted, deleted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/attendance/sync-logs
router.get('/sync-logs', async (req, res) => {
  try {
    const logs = await prisma.syncLog.findMany({
      orderBy: { syncedAt: 'desc' },
      take: 20,
    });
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/attendance/report?date=&department=&designation=&status=&search=&page=1&limit=10
// One row per employee with enriched status (present/late/absent) and delay minutes
router.get('/report', async (req, res) => {
  try {
    const { date, department, designation, status, search, page = '1', limit = '10' } = req.query;
    const targetDate = date ? new Date(date) : new Date();
    const from = new Date(targetDate); from.setHours(0, 0, 0, 0);
    const to   = new Date(targetDate); to.setHours(23, 59, 59, 999);

    const settings   = await getSettings();
    const startTime  = parseTime(settings.office_start);      // e.g. { hours:9, minutes:30 }
    const endTime    = parseTime(settings.office_end);         // e.g. { hours:18, minutes:30 }
    const lateGrace  = parseInt(settings.late_grace_mins);
    const earlyGrace = parseInt(settings.early_leave_grace_mins);

    // Build employee filter
    const empWhere = {};
    if (department)  empWhere.department  = { contains: department,  mode: 'insensitive' };
    if (designation) empWhere.designation = { contains: designation, mode: 'insensitive' };
    if (search) {
      empWhere.OR = [
        { name:         { contains: search, mode: 'insensitive' } },
        { deviceUserId: { contains: search, mode: 'insensitive' } },
        { department:   { contains: search, mode: 'insensitive' } },
      ];
    }

    const [allEmployees, logs] = await Promise.all([
      prisma.employee.findMany({ where: empWhere, orderBy: { name: 'asc' } }),
      prisma.attendanceLog.findMany({
        where:   { punchTime: { gte: from, lte: to } },
        orderBy: { punchTime: 'asc' },
      }),
    ]);

    const byUser = {};
    for (const log of logs) {
      if (!byUser[log.deviceUserId]) byUser[log.deviceUserId] = [];
      byUser[log.deviceUserId].push(log);
    }

    // Build full rows with enriched status
    const rows = allEmployees.map(emp => {
      const userLogs  = byUser[emp.deviceUserId] ?? [];
      const first     = userLogs[0]                                           ?? null;
      const last      = userLogs.length > 1 ? userLogs[userLogs.length - 1]  : null;
      const durationMins = first && last
        ? Math.round((new Date(last.punchTime) - new Date(first.punchTime)) / 60_000)
        : null;

      let rowStatus    = 'absent';
      let delayMins    = 0;
      let earlyLeaveMins = 0;

      if (first) {
        const fp          = new Date(first.punchTime);
        const officeStart = new Date(fp);
        officeStart.setHours(startTime.hours, startTime.minutes, 0, 0);
        const lateThresh  = new Date(officeStart.getTime() + lateGrace * 60_000);
        delayMins = Math.max(0, Math.round((fp - officeStart) / 60_000));
        rowStatus = fp > lateThresh ? 'late' : 'present';
      }

      // Early leave: last punch before (office_end - grace)
      if (last) {
        const lp         = new Date(last.punchTime);
        const officeEnd  = new Date(lp);
        officeEnd.setHours(endTime.hours, endTime.minutes, 0, 0);
        const earlyThresh = new Date(officeEnd.getTime() - earlyGrace * 60_000);
        if (lp < earlyThresh) {
          earlyLeaveMins = Math.round((officeEnd - lp) / 60_000);
          // Only promote to early_leave if not already late
          if (rowStatus === 'present') rowStatus = 'early_leave';
        }
      }

      return {
        employee:      emp,
        firstPunch:    first?.punchTime ?? null,
        lastPunch:     last?.punchTime  ?? null,
        totalPunches:  userLogs.length,
        durationMins,
        delayMins,
        earlyLeaveMins,
        status:        rowStatus,
        punches:       userLogs,
      };
    });

    // Filter by status after computation
    const filtered = status && status !== 'all'
      ? rows.filter(r => r.status === status)
      : rows;

    const total = filtered.length;
    const skip  = (parseInt(page) - 1) * parseInt(limit);
    const paged = filtered.slice(skip, skip + parseInt(limit));

    // Summary
    const summary = {
      totalPresent:    rows.filter(r => r.status === 'present').length,
      totalLate:       rows.filter(r => r.status === 'late').length,
      totalAbsent:     rows.filter(r => r.status === 'absent').length,
      totalEarlyLeave: rows.filter(r => r.status === 'early_leave').length,
      totalOnLeave:    0,
      avgWorkingMins: (() => {
        const worked = rows.filter(r => r.durationMins !== null);
        return worked.length > 0
          ? Math.round(worked.reduce((s, r) => s + r.durationMins, 0) / worked.length)
          : 0;
      })(),
    };

    res.json({ total, page: parseInt(page), limit: parseInt(limit), rows: paged, summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/attendance/monthly-report?month=2026-06&page=1&limit=20&department=&designation=&search=
router.get('/monthly-report', async (req, res) => {
  try {
    const { month, page = '1', limit = '20', department, designation, search } = req.query;

    const monthDate = month ? new Date(`${month}-01`) : new Date();
    const year = monthDate.getFullYear();
    const mon  = monthDate.getMonth();

    const from = new Date(year, mon, 1, 0, 0, 0, 0);
    const to   = new Date(year, mon + 1, 0, 23, 59, 59, 999); // last day of month

    const today = new Date(); today.setHours(23, 59, 59, 999);
    const logTo = to > today ? today : to; // don't fetch future logs

    const settings  = await getSettings();
    const startTime = parseTime(settings.office_start);
    const endTime   = parseTime(settings.office_end);
    const lateGrace  = parseInt(settings.late_grace_mins);
    const earlyGrace = parseInt(settings.early_leave_grace_mins);

    // Parse holiday days (0=Sun … 6=Sat)
    const holidayNums = new Set(
      (settings.weekly_holidays || '')
        .split(',')
        .map(d => parseInt(d.trim()))
        .filter(d => !isNaN(d) && d >= 0 && d <= 6)
    );

    const empWhere = {};
    if (department)  empWhere.department  = { contains: department,  mode: 'insensitive' };
    if (designation) empWhere.designation = { contains: designation, mode: 'insensitive' };
    if (search) {
      empWhere.OR = [
        { name:         { contains: search, mode: 'insensitive' } },
        { deviceUserId: { contains: search, mode: 'insensitive' } },
        { department:   { contains: search, mode: 'insensitive' } },
      ];
    }

    const [allEmployees, logs] = await Promise.all([
      prisma.employee.findMany({ where: empWhere, orderBy: { name: 'asc' } }),
      prisma.attendanceLog.findMany({
        where:   { punchTime: { gte: from, lte: logTo } },
        orderBy: { punchTime: 'asc' },
      }),
    ]);

    // Group logs by user → date
    const byUserDate = {};
    for (const log of logs) {
      const uid     = log.deviceUserId;
      const dateStr = new Date(log.punchTime).toISOString().split('T')[0];
      if (!byUserDate[uid])          byUserDate[uid]          = {};
      if (!byUserDate[uid][dateStr]) byUserDate[uid][dateStr] = [];
      byUserDate[uid][dateStr].push(log);
    }

    // Build ALL days of the month (including future) with holiday/future flags
    const allDates = [];
    const cursor = new Date(from);
    while (cursor <= to) {
      allDates.push({
        dateStr:   cursor.toISOString().split('T')[0],
        isHoliday: holidayNums.has(cursor.getDay()),
        isFuture:  cursor > today,
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    const workingDays = allDates.filter(d => !d.isHoliday && !d.isFuture).length;

    const rows = allEmployees.map(emp => {
      const userDates = byUserDate[emp.deviceUserId] ?? {};
      let presentDays = 0, lateDays = 0, earlyLeaveDays = 0;
      let totalWorkingMins = 0, checkInSum = 0, checkInCount = 0;

      const dailyBreakdown = allDates.map(({ dateStr, isHoliday, isFuture }) => {
        if (isHoliday) return { date: dateStr, status: 'holiday',  firstPunch: null, lastPunch: null, durationMins: null, delayMins: 0, earlyLeaveMins: 0 };
        if (isFuture)  return { date: dateStr, status: 'future',   firstPunch: null, lastPunch: null, durationMins: null, delayMins: 0, earlyLeaveMins: 0 };

        const dayLogs = userDates[dateStr] ?? [];
        if (dayLogs.length === 0) {
          return { date: dateStr, status: 'absent', firstPunch: null, lastPunch: null, durationMins: null, delayMins: 0, earlyLeaveMins: 0 };
        }

        const first = dayLogs[0];
        const last  = dayLogs.length > 1 ? dayLogs[dayLogs.length - 1] : null;
        const durationMins = first && last
          ? Math.round((new Date(last.punchTime) - new Date(first.punchTime)) / 60_000)
          : null;

        const fp          = new Date(first.punchTime);
        const officeStart = new Date(fp); officeStart.setHours(startTime.hours, startTime.minutes, 0, 0);
        const lateThresh  = new Date(officeStart.getTime() + lateGrace * 60_000);
        const delayMins   = Math.max(0, Math.round((fp - officeStart) / 60_000));
        let dayStatus     = fp > lateThresh ? 'late' : 'present';

        let earlyLeaveMins = 0;
        if (last) {
          const lp        = new Date(last.punchTime);
          const officeEnd = new Date(lp); officeEnd.setHours(endTime.hours, endTime.minutes, 0, 0);
          const earlyThr  = new Date(officeEnd.getTime() - earlyGrace * 60_000);
          if (lp < earlyThr) {
            earlyLeaveMins = Math.round((officeEnd - lp) / 60_000);
            if (dayStatus === 'present') dayStatus = 'early_leave';
          }
        }

        presentDays++;
        if (dayStatus === 'late')        lateDays++;
        if (dayStatus === 'early_leave') earlyLeaveDays++;
        if (durationMins !== null)       totalWorkingMins += durationMins;
        checkInSum += fp.getHours() * 60 + fp.getMinutes();
        checkInCount++;

        return { date: dateStr, status: dayStatus, firstPunch: first.punchTime, lastPunch: last?.punchTime ?? null, durationMins, delayMins, earlyLeaveMins };
      });

      return {
        employee:        emp,
        presentDays,
        lateDays,
        earlyLeaveDays,
        absentDays:      workingDays - presentDays,
        workingDays,
        totalWorkingMins,
        avgCheckInMins:  checkInCount > 0 ? Math.round(checkInSum / checkInCount) : null,
        dailyBreakdown,
      };
    });

    const total = rows.length;
    const skip  = (parseInt(page) - 1) * parseInt(limit);
    const paged = rows.slice(skip, skip + parseInt(limit));

    const summary = {
      totalEmployees:      rows.length,
      workingDaysCount:    workingDays,
      avgPresentDays:      rows.length > 0 ? Math.round(rows.reduce((s, r) => s + r.presentDays, 0) / rows.length * 10) / 10 : 0,
      totalLateDays:       rows.reduce((s, r) => s + r.lateDays, 0),
      totalEarlyLeaveDays: rows.reduce((s, r) => s + r.earlyLeaveDays, 0),
    };

    res.json({
      month:          `${year}-${String(mon + 1).padStart(2, '0')}`,
      weeklyHolidays: Array.from(holidayNums),
      total, page: parseInt(page), limit: parseInt(limit),
      rows: paged, summary,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/attendance/manual — admin creates a punch record manually
router.post('/manual', async (req, res) => {
  try {
    const { deviceUserId, date, time, punchType = 0, note } = req.body;
    if (!deviceUserId || !date || !time)
      return res.status(400).json({ error: 'deviceUserId, date, and time are required' });

    const employee = await prisma.employee.findUnique({ where: { deviceUserId } });
    if (!employee) return res.status(404).json({ error: 'Employee not found' });

    const punchTime = new Date(`${date}T${time}`);
    if (isNaN(punchTime.getTime()))
      return res.status(400).json({ error: 'Invalid date or time' });

    const record = await prisma.attendanceLog.create({
      data: {
        deviceUserId,
        punchTime,
        punchType: parseInt(punchType),
        source: 'manual',
        note:   note?.trim() || null,
      },
    });

    res.json({ ...record, employee });
  } catch (err) {
    if (err.code === 'P2002')
      return res.status(409).json({ error: 'A punch record already exists for this exact time' });
    res.status(500).json({ error: err.message });
  }
});

// GET /api/attendance/manual-entries?page=1&limit=20
router.get('/manual-entries', async (req, res) => {
  try {
    const { page = '1', limit = '20' } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [records, total] = await Promise.all([
      prisma.attendanceLog.findMany({
        where:   { source: 'manual' },
        orderBy: { punchTime: 'desc' },
        skip,
        take: parseInt(limit),
      }),
      prisma.attendanceLog.count({ where: { source: 'manual' } }),
    ]);

    const ids = [...new Set(records.map(r => r.deviceUserId))];
    const employees = await prisma.employee.findMany({
      where:  { deviceUserId: { in: ids } },
      select: { deviceUserId: true, name: true, department: true, designation: true },
    });
    const empMap = Object.fromEntries(employees.map(e => [e.deviceUserId, e]));

    res.json({
      total,
      page:    parseInt(page),
      limit:   parseInt(limit),
      records: records.map(r => ({ ...r, employee: empMap[r.deviceUserId] ?? null })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/attendance/manual/:id — remove a manual entry
router.delete('/manual/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const record = await prisma.attendanceLog.findUnique({ where: { id } });
    if (!record) return res.status(404).json({ error: 'Record not found' });
    if (record.source !== 'manual')
      return res.status(403).json({ error: 'Only manual entries can be deleted' });
    await prisma.attendanceLog.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
