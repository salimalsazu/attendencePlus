const ZKLib = require('node-zklib');
const prisma = require('./prismaClient');

const ZK_IP      = process.env.ZK_IP      || '192.168.10.3';
const ZK_PORT    = parseInt(process.env.ZK_PORT    || '4370');
const ZK_TIMEOUT = parseInt(process.env.ZK_TIMEOUT || '10000');

// Container TZ is Asia/Dhaka (set via TZ env in docker-compose).
// ZK device sends timestamps as local Bangladesh time, which Node.js now
// interprets correctly as Asia/Dhaka — no manual offset needed.

function ts(msg) {
  process.stdout.write(`[${new Date().toLocaleTimeString()}] ${msg}\n`);
}

async function savePunch(log) {
  if (!log.deviceUserId || !log.recordTime) return;
  try {
    // recordTime from ZK device is a local Bangladesh timestamp string.
    // With TZ=Asia/Dhaka in the container, new Date() parses it as the correct UTC instant.
    const punchTime = new Date(log.recordTime);
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
    ts(`Sync error: ${err?.message || JSON.stringify(err)}`);
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
      ts(`Real-time listener error: ${err?.message || JSON.stringify(err)}. Retrying in ${retryDelay / 1000}s...`);
    } finally {
      try { await zk.disconnect(); } catch (_) {}
    }

    await new Promise(r => setTimeout(r, retryDelay));
    retryDelay = Math.min(retryDelay * 2, 60000); // exponential backoff, max 60s
  }
}

// Quick connectivity check — used by /api/devices/diagnostics
// Does a TCP connect to the ZK device, then a short ZK handshake to confirm
// the device is actually a ZKTeco device (not just an open port).
async function diagnoseZk() {
  const result = {
    zkIp:        ZK_IP,
    zkPort:      ZK_PORT,
    timeout:     ZK_TIMEOUT,
    timestamp:   new Date().toISOString(),
    steps:       [],
    ok:          false,
  };
  const log = (step, ok, detail) => result.steps.push({ step, ok, detail });
  const net = require('net');

  // Step 1: outbound TCP connect
  const t0 = Date.now();
  await new Promise(resolve => {
    const sock = new net.Socket();
    let done = false;
    const finish = (ok, detail) => {
      if (done) return;
      done = true;
      log('tcp-connect', ok, { latencyMs: Date.now() - t0, detail });
      try { sock.destroy(); } catch (_) {}
      resolve();
    };
    sock.setTimeout(ZK_TIMEOUT);
    sock.once('connect', () => finish(true, 'TCP socket established'));
    sock.once('timeout', () => finish(false, `Timed out after ${ZK_TIMEOUT}ms`));
    sock.once('error', e => finish(false, e.message));
    sock.connect(ZK_PORT, ZK_IP);
  });

  // Step 2: ZK handshake
  try {
    const zk = new ZKLib(ZK_IP, ZK_PORT, ZK_TIMEOUT, 4000);
    const t1 = Date.now();
    await zk.createSocket();
    log('zk-handshake', true, { latencyMs: Date.now() - t1, detail: 'ZKTeco protocol accepted' });
    try { await zk.disconnect(); } catch (_) {}
    result.ok = true;
  } catch (err) {
    log('zk-handshake', false, { detail: err?.message || String(err) });
  }

  return result;
}

module.exports = { syncAttendance, startRealTimeListener, diagnoseZk };
