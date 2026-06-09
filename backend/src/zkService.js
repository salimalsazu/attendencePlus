const ZKLib = require('node-zklib');
const prisma = require('./prismaClient');

const ZK_IP      = process.env.ZK_IP      || '192.168.10.3';
const ZK_PORT    = parseInt(process.env.ZK_PORT    || '4370');
const ZK_TIMEOUT = parseInt(process.env.ZK_TIMEOUT || '10000');

// ZK devices return timestamps in their local timezone with no TZ info.
// The backend container runs UTC, so new Date(recordTime) misreads local time as UTC.
// Subtract the device's UTC offset to recover the true UTC instant.
const ZK_TZ_OFFSET_MS = parseInt(process.env.ZK_TZ_OFFSET_HOURS ?? '6') * 3_600_000;

function ts(msg) {
  process.stdout.write(`[${new Date().toLocaleTimeString()}] ${msg}\n`);
}

async function savePunch(log) {
  if (!log.deviceUserId || !log.recordTime) return;
  try {
    const punchTime = new Date(new Date(log.recordTime).getTime() - ZK_TZ_OFFSET_MS);
    await prisma.attendanceLog.create({
      data: {
        deviceUserId: String(log.deviceUserId),
        punchTime,
        punchType:    log.type ?? 0,
      },
    });
    ts(`New punch saved — User: ${log.deviceUserId}, Time: ${log.recordTime}`);
    return true;
  } catch (e) {
    if (e.code === 'P2002') return false; // duplicate, skip
    throw e;
  }
}

// One-time full sync for current month — called once on startup
async function syncAttendance() {
  const zk = new ZKLib(ZK_IP, ZK_PORT, ZK_TIMEOUT, 4000);
  let recordCount = 0;
  let skipped     = 0;

  try {
    ts(`Connecting to ZKTeco at ${ZK_IP}:${ZK_PORT}...`);
    await zk.createSocket();
    ts('Connected.');

    // Sync users
    ts('Fetching users...');
    const { data: users } = await zk.getUsers();
    ts(`Found ${users.length} user(s).`);
    for (const u of users) {
      if (!u.userId) continue;
      await prisma.employee.upsert({
        where:  { deviceUserId: String(u.userId) },
        update: {}, // preserve admin-edited name — only set on first import
        create: { deviceUserId: String(u.userId), name: u.name || `User ${u.userId}` },
      });
    }

    // Sync current month logs
    ts('Fetching attendance logs (one-time full sync)...');
    const { data: logs } = await zk.getAttendances();
    ts(`Device returned ${logs.length} total record(s).`);

    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const monthLogs    = logs.filter(l => l.recordTime && new Date(l.recordTime) >= startOfMonth);
    const total        = monthLogs.length;
    ts(`Processing ${total} record(s) for current month...`);

    for (let i = 0; i < monthLogs.length; i++) {
      if (i > 0 && i % 20 === 0) {
        process.stdout.write(`  ${i}/${total} done, ${total - i} remaining, ${recordCount} new...\r`);
      }
      const saved = await savePunch(monthLogs[i]);
      if (saved) recordCount++; else skipped++;
    }

    process.stdout.write('\n');
    ts(`Initial sync done. New: ${recordCount}, Already existed: ${skipped}.`);

    await prisma.syncLog.create({
      data: { recordCount, status: 'success', message: 'initial-sync' },
    });

    return { recordCount, skipped, total, status: 'success' };

  } catch (err) {
    process.stdout.write('\n');
    ts(`Sync error: ${err.message}`);
    await prisma.syncLog.create({
      data: { recordCount: 0, status: 'error', message: err.message },
    });
    return { recordCount: 0, status: 'error', message: err.message };

  } finally {
    try { await zk.disconnect(); } catch (_) {}
  }
}

// Real-time listener — stays connected, device pushes each punch instantly
async function startRealTimeListener() {
  let retryDelay = 5000;

  while (true) {
    const zk = new ZKLib(ZK_IP, ZK_PORT, ZK_TIMEOUT, 4000);
    try {
      ts('Starting real-time listener...');

      // closedPromise resolves when the TCP socket fires its 'close' event
      let resolveClose;
      const closedPromise = new Promise(res => { resolveClose = res; });

      await zk.createSocket(null, resolveClose);
      ts('Real-time listener connected. Waiting for punches...');
      retryDelay = 5000; // reset on successful connect

      // getRealTimeLogs registers the data listener and returns immediately —
      // we must wait on closedPromise to keep this loop alive until the device
      // drops the connection, rather than reconnecting on every iteration.
      await zk.getRealTimeLogs(async (data) => {
        ts(`Real-time punch received — User: ${data.deviceUserId}`);
        await savePunch(data);
      });

      await closedPromise; // block here until socket closes
      ts('Real-time connection closed. Reconnecting...');

    } catch (err) {
      ts(`Real-time listener error: ${err.message}. Retrying in ${retryDelay / 1000}s...`);
    } finally {
      try { await zk.disconnect(); } catch (_) {}
    }

    await new Promise(r => setTimeout(r, retryDelay));
    retryDelay = Math.min(retryDelay * 2, 60000); // exponential backoff, max 60s
  }
}

module.exports = { syncAttendance, startRealTimeListener };
