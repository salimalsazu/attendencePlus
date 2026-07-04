const prisma = require('./prismaClient');
const { getSettings, parseTime } = require('./settings');

// Device sync auto-creates an Employee stub (name "User <id>" / "Unknown (<id>)")
// for any device user who hasn't been given a real name yet. Those aren't real
// staff, so the email report should skip them.
const PLACEHOLDER_NAME = /^(user\s*\(?\d+\)?|unknown\s*\(?\d+\)?|\d+)$/i;
function hasRealName(emp) {
  return !PLACEHOLDER_NAME.test((emp.name || '').trim());
}

// Builds one row per named employee for the given date, with enriched status
// (present/late/absent/early_leave) and delay minutes. Shared by the
// /api/attendance/report endpoint and the daily email report.
async function getDailyReport(targetDate = new Date()) {
  const from = new Date(targetDate); from.setHours(0, 0, 0, 0);
  const to   = new Date(targetDate); to.setHours(23, 59, 59, 999);

  const settings   = await getSettings();
  const startTime  = parseTime(settings.office_start);
  const endTime    = parseTime(settings.office_end);
  const lateGrace  = parseInt(settings.late_grace_mins);
  const earlyGrace = parseInt(settings.early_leave_grace_mins);

  const [allEmployees, logs] = await Promise.all([
    prisma.employee.findMany({ where: { status: 'active' }, orderBy: { name: 'asc' } }),
    prisma.attendanceLog.findMany({
      where:   { punchTime: { gte: from, lte: to } },
      orderBy: { punchTime: 'asc' },
    }),
  ]);

  // Active-by-default device stubs (see PLACEHOLDER_NAME above) still need to
  // be screened out, so keep this filter on top of the active-status query.
  const employees = allEmployees.filter(hasRealName);

  const byUser = {};
  for (const log of logs) {
    if (!byUser[log.deviceUserId]) byUser[log.deviceUserId] = [];
    byUser[log.deviceUserId].push(log);
  }

  const rows = employees.map(emp => {
    const userLogs = byUser[emp.deviceUserId] ?? [];
    const leaveLog = userLogs.find(l => l.punchType === 6);
    const first    = userLogs[0]                                  ?? null;
    const last     = userLogs.length > 1 ? userLogs[userLogs.length - 1] : null;
    const durationMins = first && last
      ? Math.round((new Date(last.punchTime) - new Date(first.punchTime)) / 60_000)
      : null;

    let rowStatus      = 'absent';
    let delayMins       = 0;
    let earlyLeaveMins  = 0;

    if (leaveLog) {
      rowStatus = 'on_leave';
    } else {
      if (first) {
        const fp          = new Date(first.punchTime);
        const officeStart = new Date(fp);
        officeStart.setHours(startTime.hours, startTime.minutes, 0, 0);
        const lateThresh  = new Date(officeStart.getTime() + lateGrace * 60_000);
        delayMins = Math.max(0, Math.round((fp - officeStart) / 60_000));
        rowStatus = fp > lateThresh ? 'late' : 'present';
      }

      if (last) {
        const lp         = new Date(last.punchTime);
        const officeEnd  = new Date(lp);
        officeEnd.setHours(endTime.hours, endTime.minutes, 0, 0);
        const earlyThresh = new Date(officeEnd.getTime() - earlyGrace * 60_000);
        if (lp < earlyThresh) {
          earlyLeaveMins = Math.round((officeEnd - lp) / 60_000);
          if (rowStatus === 'present') rowStatus = 'early_leave';
        }
      }
    }

    return {
      employee: emp,
      firstPunch: rowStatus === 'on_leave' ? null : (first?.punchTime ?? null),
      lastPunch:  rowStatus === 'on_leave' ? null : (last?.punchTime  ?? null),
      totalPunches: userLogs.length,
      durationMins: rowStatus === 'on_leave' ? null : durationMins,
      note: leaveLog?.note ?? (userLogs.find(l => l.note)?.note ?? null),
      delayMins,
      earlyLeaveMins,
      status: rowStatus,
    };
  });

  const summary = {
    totalEmployees:  rows.length,
    totalPresent:    rows.filter(r => r.status === 'present').length,
    totalLate:       rows.filter(r => r.status === 'late').length,
    totalAbsent:     rows.filter(r => r.status === 'absent').length,
    totalEarlyLeave: rows.filter(r => r.status === 'early_leave').length,
    totalOnLeave:    rows.filter(r => r.status === 'on_leave').length,
  };

  return { date: from, rows, summary };
}

module.exports = { getDailyReport };
