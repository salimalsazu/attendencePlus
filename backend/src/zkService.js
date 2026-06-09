const ZKLib = require('node-zklib');
const prisma = require('./prismaClient');

const ZK_IP      = process.env.ZK_IP      || '192.168.10.3';
const ZK_PORT    = parseInt(process.env.ZK_PORT    || '4370');
const ZK_TIMEOUT = parseInt(process.env.ZK_TIMEOUT || '10000');

// CMD_REFRESHDATA — forces the device to flush/refresh its internal data
// buffers. Not exposed by node-zklib, so we send it via executeCmd. This is
// key after a device reboot: without it, getAttendances() can serve a stale
// cached snapshot (e.g. only old records) instead of the live attendance log.
const CMD_REFRESHDATA = 1013;

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

// Full sync — called on startup and on manual trigger.
// Pulls users + the full attendance log from the device and upserts everything.
async function syncAttendance() {
  const zk = new ZKLib(ZK_IP, ZK_PORT, ZK_TIMEOUT, 4000);
  let recordCount = 0;
  let skipped     = 0;
  let deviceDisabled = false;

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

    // --- Critical: read a FRESH, CONSISTENT snapshot of the attendance log ---
    // 1. disableDevice(): freezes the device so it commits pending data and
    //    stops mutating the log while we read — without this, getAttendances()
    //    can return a stale cached snapshot (the old-records-only bug after reboot).
    // 2. CMD_REFRESHDATA: forces the device to refresh its internal data buffers.
    // 3. getInfo(): logCounts tells us how many records the device actually holds,
    //    so we can compare against what we parse and detect truncated reads.
    try {
      await zk.disableDevice();
      deviceDisabled = true;
      ts('Device disabled for consistent read.');
    } catch (e) {
      ts(`Warning: disableDevice failed (${e?.message}); continuing anyway.`);
    }

    try {
      await zk.executeCmd(CMD_REFRESHDATA, '');
      ts('Device data buffers refreshed.');
    } catch (e) {
      ts(`Warning: refreshData failed (${e?.message}); continuing anyway.`);
    }

    try {
      const info = await zk.getInfo();
      ts(`Device info — logCounts: ${info.logCounts}, capacity: ${info.logCapacity}, users: ${info.userCounts}`);
    } catch (e) {
      ts(`Warning: getInfo failed (${e?.message}).`);
    }

    ts('Fetching attendance logs (full read)...');
    const { data: logs } = await zk.getAttendances();
    ts(`Device returned ${logs.length} total record(s).`);

    // Re-enable the device as soon as the read is done — don't hold it disabled
    // longer than necessary (employees can't punch while disabled).
    if (deviceDisabled) {
      try { await zk.enableDevice(); deviceDisabled = false; ts('Device re-enabled.'); }
      catch (e) { ts(`Warning: enableDevice failed (${e?.message}).`); }
    }

    // Diagnostics: show the actual date range the device returned, so it's
    // obvious whether the device is serving current data or stale old records.
    const valid = logs.filter(l => l.recordTime && !isNaN(new Date(l.recordTime)));
    if (valid.length) {
      const times = valid.map(l => new Date(l.recordTime).getTime());
      const min = new Date(Math.min(...times));
      const max = new Date(Math.max(...times));
      ts(`Record date range: ${min.toLocaleString()} → ${max.toLocaleString()}`);
    }

    // Process ALL returned records (not just current month). The unique
    // constraint on (deviceUserId, punchTime) dedups, so already-saved punches
    // are cheaply skipped. This guarantees today's punches are never filtered out.
    const total = valid.length;
    ts(`Processing ${total} record(s)...`);

    for (let i = 0; i < valid.length; i++) {
      if (i > 0 && i % 50 === 0) {
        process.stdout.write(`  ${i}/${total} done, ${recordCount} new...\r`);
      }
      const saved = await savePunch(valid[i]);
      if (saved) recordCount++; else skipped++;
    }

    process.stdout.write('\n');
    ts(`Sync done. New: ${recordCount}, Already existed: ${skipped}.`);

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
    // Safety net: make sure the device is re-enabled even if the read threw.
    if (deviceDisabled) {
      try { await zk.enableDevice(); } catch (_) {}
    }
    try { await zk.disconnect(); } catch (_) {}
  }
}

// Real-time listener — stays connected, device pushes each punch instantly.
// Includes:
//   • Heartbeat log every 10 minutes so operators can confirm the listener is alive.
//   • Watchdog: if no punch arrives for 2 hours the connection is assumed stale
//     (device may have stopped sending events after a reboot) and is recycled so
//     the CMD_REG_EVENT subscription is re-sent on reconnect.
const HEARTBEAT_MS = 10 * 60 * 1000;   // log "still alive" every 10 min
const WATCHDOG_MS  =  2 * 60 * 60 * 1000; // force reconnect after 2 h of silence

async function startRealTimeListener() {
  let retryDelay = 5000;

  while (true) {
    const zk = new ZKLib(ZK_IP, ZK_PORT, ZK_TIMEOUT, 4000);
    try {
      ts('Starting real-time listener...');

      // closedPromise resolves when the TCP socket fires its 'close' event
      // OR when the watchdog forces a reconnect.
      let resolveClose;
      const closedPromise = new Promise(res => { resolveClose = res; });

      await zk.createSocket(null, resolveClose);
      ts('Real-time listener connected. Waiting for punches...');
      retryDelay = 5000; // reset on successful connect

      // Heartbeat — logs every 10 min to confirm the loop is alive
      const heartbeat = setInterval(() => {
        ts('Real-time listener alive — waiting for punches...');
      }, HEARTBEAT_MS);

      // Watchdog — reconnect if the device goes silent for 2 hours.
      // After a device reboot the TCP connection may stay open but the
      // device stops pushing events; recycling the connection re-sends
      // the CMD_REG_EVENT registration command.
      let watchdog = setTimeout(() => {
        ts('Watchdog: no punch received for 2 h — recycling connection to re-register events...');
        resolveClose();
      }, WATCHDOG_MS);

      const resetWatchdog = () => {
        clearTimeout(watchdog);
        watchdog = setTimeout(() => {
          ts('Watchdog: no punch received for 2 h — recycling connection...');
          resolveClose();
        }, WATCHDOG_MS);
      };

      await zk.getRealTimeLogs(async (data) => {
        resetWatchdog(); // got activity — reset the 2-hour timer
        ts(`Real-time punch received — User: ${data.deviceUserId}`);
        await savePunch(data);
      });

      await closedPromise; // block here until socket closes or watchdog fires
      clearInterval(heartbeat);
      clearTimeout(watchdog);
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
