const ZKLib = require('node-zklib');
const prisma = require('./prismaClient');

// Low-level protocol helpers from node-zklib, used by our robust reader below.
const { createTCPHeader, decodeRecordData40 } = require('node-zklib/utils');
const { COMMANDS, MAX_CHUNK, REQUEST_DATA } = require('node-zklib/constants');

const ZK_IP      = process.env.ZK_IP      || '192.168.10.3';
const ZK_PORT    = parseInt(process.env.ZK_PORT    || '4370');
const ZK_TIMEOUT = parseInt(process.env.ZK_TIMEOUT || '10000');

// CMD_REFRESHDATA — forces the device to flush/refresh its internal data
// buffers. Not exposed by node-zklib, so we send it via executeCmd. This is
// key after a device reboot: without it, getAttendances() can serve a stale
// cached snapshot (e.g. only old records) instead of the live attendance log.
const CMD_REFRESHDATA = 1013;

/**
 * ZKTeco timestamp → JS Date.  Same algorithm as node-zklib's parseTimeToDate.
 */
function zkTimeToDate(t) {
  const second = t % 60;  t = (t - second) / 60;
  const minute = t % 60;  t = (t - minute) / 60;
  const hour   = t % 24;  t = (t - hour)   / 24;
  const day    = t % 31 + 1; t = (t - (day - 1)) / 31;
  const month  = t % 12;  t = (t - month)  / 12;
  return new Date(t + 2000, month, day, hour, minute, second);
}

// Plausible ZK timestamp: year must decode to 2015–2035.
function isPlausibleZkTime(t) {
  if (!t || t === 0) return false;
  const yr = zkTimeToDate(t).getFullYear();
  return yr >= 2015 && yr <= 2035;
}

/**
 * Hybrid 40-byte record decoder — handles three layouts seen on this device:
 *
 *  Format 1 (standard/old):
 *    bytes  2-10: userId ASCII
 *    byte  27-30: timestamp UInt32LE
 *
 *  Format 2 (post-log-reorganisation):
 *    bytes 18-26: userId ASCII
 *    bytes  3- 6: timestamp UInt32LE
 *
 *  Format 3 (new records, observed July 2026+):
 *    bytes  8- 9: internal sequence counter (ignored)
 *    bytes 10-18: userId ASCII, null-terminated
 *    byte     34: punch type
 *    bytes 35-38: timestamp UInt32LE
 *
 * Entirely-zero records are deleted/empty slots — returned with a Jan-2000 date
 * so the cutoff filter silently drops them.
 */
function decodeRecord40Hybrid(raw) {
  // Format 1
  const t1 = raw.readUInt32LE(27);
  if (isPlausibleZkTime(t1)) {
    return decodeRecordData40(raw);
  }

  // Format 2
  const t2 = raw.readUInt32LE(3);
  if (isPlausibleZkTime(t2)) {
    const userId = raw.slice(18, 27).toString('ascii').split('\0').shift();
    return { deviceUserId: userId || '', recordTime: zkTimeToDate(t2) };
  }

  // Format 3
  const t3 = raw.readUInt32LE(35);
  if (isPlausibleZkTime(t3)) {
    const userId = raw.slice(10, 19).toString('ascii').split('\0').shift().trim();
    const type   = raw.readUInt8(34);
    return { deviceUserId: userId || '', recordTime: zkTimeToDate(t3), type };
  }

  // Unknown format fallback: scan bytes 20-36 for a plausible timestamp.
  // We skip bytes 0-19 to avoid false positives from the header/counter/userId
  // bytes that happen to encode to a year in the plausible range.
  if (!raw.every(b => b === 0)) {
    // ZKTeco userIds are always numeric strings. If no known userId position
    // (bytes 2-10, 10-18, 18-26) contains a numeric string, this is not an
    // attendance record — it's likely a firmware-emitted metadata record (user
    // info, fingerprint header, etc.) that arrived interleaved with attendance
    // data. These started appearing after a firmware update in July 2026.
    const uidCandidates = [raw.slice(2, 11), raw.slice(10, 19), raw.slice(18, 27)]
      .map(s => s.toString('ascii').split('\0').shift().trim());
    const validUid = uidCandidates.find(s => /^\d+$/.test(s));
    if (!validUid) {
      process.stdout.write(`[DECODER] Skipping non-attendance record (no numeric userId in known positions): ${raw.toString('hex')}\n`);
      return { deviceUserId: '', recordTime: new Date(2000, 0, 1) };
    }

    for (let off = 20; off <= 36; off++) {
      const t = raw.readUInt32LE(off);
      if (isPlausibleZkTime(t)) {
        const d = zkTimeToDate(t);
        process.stdout.write(
          `[DECODER] ⚠ New record format auto-detected — timestamp at offset ${off} → ${d.toLocaleString()} userId="${validUid}" raw=${raw.toString('hex')}\n`
        );
        return { deviceUserId: validUid, recordTime: d };
      }
    }
    // Has a valid numeric userId but no plausible timestamp — log for analysis
    process.stdout.write(`[DECODER] ⚠ Unrecognised non-zero record (numeric userId but no timestamp at offsets 20-36): ${raw.toString('hex')}\n`);
  }

  return { deviceUserId: '', recordTime: new Date(2000, 0, 1) };
}

/**
 * Robust attendance reader — replaces node-zklib's buggy getAttendances().
 *
 * The library's readWithBuffer() processes only ONE TCP message per 'data'
 * event and relies on exact per-chunk length matching. When the device sends
 * multiple chunks coalesced into fewer TCP packets (which happens for large
 * logs), it reads only the first 65,472-byte chunk and times out on the rest
 * ("N PACKETS REMAIN") — truncating ~15,000 records down to ~1,636.
 *
 * This implementation:
 *   1. Sends CMD_DATA_WRRQ and reads the device-declared total size.
 *   2. Requests every chunk up front (same as the library).
 *   3. DRAINS ALL complete TCP messages from the buffer on each 'data' event
 *      (the missing while-loop), stripping the 8-byte per-chunk sub-header.
 *   4. Resolves the moment the accumulated record bytes reach the declared
 *      size — so it never hangs waiting for a phantom exact-length match.
 *
 * Returns an array of { deviceUserId, recordTime } records.
 */
function readAllAttendances(zk, onProgress = () => {}) {
  return new Promise((resolve, reject) => {
    const tcp = zk.zklibTcp;
    const socket = tcp.socket;
    if (!socket) return reject(new Error('Socket not connected'));

    let phase = 'prepare';   // 'prepare' → waiting for size; 'data' → streaming chunks
    let size = 0;            // device-declared total payload size (bytes)
    let recordData = Buffer.from([]); // accumulated record bytes (4-byte count prefix + N*40)
    let frameBuf  = Buffer.from([]);  // raw TCP reassembly buffer
    let idleTimer = null;

    const cleanup = () => {
      socket.removeListener('data', onData);
      if (idleTimer) clearTimeout(idleTimer);
    };

    const finish = () => {
      cleanup();
      const body = recordData.subarray(4); // drop 4-byte record-count prefix
      const records = [];
      let d = body;
      while (d.length >= 40) {
        const rec = decodeRecord40Hybrid(d.subarray(0, 40));
        records.push({ ...rec, ip: tcp.ip });
        d = d.subarray(40);
      }

      resolve(records);
    };

    // When the device stops sending for IDLE_MS, the stream has ended. If we're
    // in the data phase and already have (nearly) all of it, finish with what we
    // have rather than failing — the device sometimes ends a few bytes short of
    // its own declared size, and the cron re-reads the full log every cycle, so
    // any record missed by a hair is caught on the next run within minutes.
    const IDLE_MS = 8000;
    const armIdle = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        if (phase === 'data' && recordData.length > 4) {
          ts(`Read settled: ${recordData.length}/${size} bytes (${Math.floor((recordData.length - 4) / 40)} records).`);
          return finish();
        }
        cleanup();
        reject(new Error(`Idle timeout: received ${recordData.length}/${size || '?'} bytes`));
      }, IDLE_MS);
    };

    const processFrames = () => {
      // Drain EVERY complete TCP message currently buffered (the key fix).
      // Need >= 6 bytes to read the 2-byte length field at offset 4.
      while (frameBuf.length >= 8) {
        const packetLength = frameBuf.readUIntLE(4, 2); // payload size after 8-byte TCP prefix

        // Guard against a malformed/zero length that would loop forever.
        if (packetLength <= 0) { frameBuf = frameBuf.subarray(8); continue; }
        if (frameBuf.length < 8 + packetLength) break;  // message not fully arrived yet

        const message = frameBuf.subarray(0, 8 + packetLength);
        frameBuf = frameBuf.subarray(8 + packetLength);

        // Need at least 8 (prefix) + 2 (command id) bytes to inspect the command.
        if (message.length < 10) continue;
        const cmdId   = message.readUIntLE(8, 2); // command id right after the 8-byte prefix
        const payload = message.subarray(16);     // data after 8-byte prefix + 8-byte cmd header

        if (phase === 'prepare') {
          if (cmdId === COMMANDS.CMD_DATA) {
            // Small dataset returned inline (no chunking needed).
            recordData = Buffer.concat([recordData, payload]);
            size = recordData.length;
            return finish();
          }
          // The size is carried in CMD_PREPARE_DATA / CMD_ACK_OK, at payload offset 1
          // (4 bytes). Short ack packets (empty payload) arrive first — skip them
          // and keep waiting for the real prepare packet.
          if ((cmdId === COMMANDS.CMD_PREPARE_DATA || cmdId === COMMANDS.CMD_ACK_OK)
              && payload.length >= 5) {
            size = payload.readUIntLE(1, 4); // declared total payload size
            if (size <= 0) continue;         // not a real prepare; ignore
            phase = 'data';
            onProgress(0, size);

            // Request all chunks up front.
            const remain = size % MAX_CHUNK;
            const numberChunks = Math.floor(size / MAX_CHUNK);
            for (let i = 0; i < numberChunks; i++) {
              tcp.sendChunkRequest(i * MAX_CHUNK, MAX_CHUNK);
            }
            if (remain > 0) tcp.sendChunkRequest(numberChunks * MAX_CHUNK, remain);
          }
          // any other command in prepare phase is ignored
        } else {
          // data phase: each CMD_DATA message payload = [8-byte sub-header][chunk data]
          if (cmdId === COMMANDS.CMD_DATA && payload.length >= 8) {
            const chunkData = payload.subarray(8);
            recordData = Buffer.concat([recordData, chunkData]);
            onProgress(recordData.length, size);
            if (size > 0 && recordData.length >= size) return finish();
          }
        }
      }
    };

    const onData = (data) => {
      try {
        armIdle();
        frameBuf = Buffer.concat([frameBuf, data]);
        processFrames();
      } catch (e) {
        // Never let a parse error crash the process — reject so syncAttendance
        // falls back to the library reader.
        cleanup();
        reject(new Error(`Read parse error: ${e.message}`));
      }
    };

    socket.once('close', () => {
      cleanup();
      reject(new Error('Socket closed during attendance read'));
    });
    socket.on('data', onData);
    armIdle();

    // Kick off the request.
    tcp.replyId++;
    const reqBuf = createTCPHeader(COMMANDS.CMD_DATA_WRRQ, tcp.sessionId, tcp.replyId, REQUEST_DATA.GET_ATTENDANCE_LOGS);
    socket.write(reqBuf, null, err => { if (err) { cleanup(); reject(err); } });
  });
}

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

    // getInfo() — logCounts is the device's own count of stored attendance
    // records. Queried BEFORE disableDevice (disabling can break the size query).
    // This is the ground truth: if logCounts >> what getAttendances returns,
    // the bulk read is truncating.
    try {
      const info = await zk.getInfo();
      ts(`Device info — logCounts: ${info.logCounts}, capacity: ${info.logCapacity}, users: ${info.userCounts}`);
    } catch (e) {
      ts(`Warning: getInfo failed (${e?.message || JSON.stringify(e)}).`);
    }

    // --- Read a FRESH, CONSISTENT snapshot of the attendance log ---
    // disableDevice(): freezes the device so it commits pending data and stops
    // mutating the log while we read. CMD_REFRESHDATA: flush internal buffers.
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

    ts('Fetching attendance logs (full read)...');
    // Clear any stale device read buffer before requesting (library hygiene).
    try { await zk.freeData(); } catch (_) {}

    // Primary path: our robust reader that correctly drains ALL chunks.
    // Fallback: the library's getAttendances() if the robust reader throws,
    // so a bad read never leaves us with nothing.
    let logs = [];
    let reportedSize = 0;
    try {
      logs = await readAllAttendances(zk, (recvBytes, totalSize) => {
        if (totalSize > reportedSize) reportedSize = totalSize;
      });
      try { await zk.freeData(); } catch (_) {}
      ts(`Robust read OK — ${logs.length} record(s) parsed from ${reportedSize} bytes (device reports ~${Math.floor(reportedSize / 40)} records).`);
    } catch (e) {
      ts(`Robust read failed (${e?.message}); falling back to library getAttendances().`);
      // Clear any leftover bytes the failed read left on the socket, otherwise
      // the library read parses garbage (wrong record count / 1/1/2000 dates).
      try { await zk.freeData(); } catch (_) {}
      const res = await zk.getAttendances();
      logs = res.data || [];
      ts(`Fallback read returned ${logs.length} record(s).`);
    }

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

      // Diagnostic: date distribution — how many records per year, and how many
      // are zeroed-out (1/1/2000) from device-side deletion.
      const yearCounts = {};
      let zeroCount = 0;
      for (const l of logs) {
        const d = new Date(l.recordTime);
        const yr = d.getFullYear();
        yearCounts[yr] = (yearCounts[yr] || 0) + 1;
        if (yr === 2000 && d.getMonth() === 0 && d.getDate() === 1) zeroCount++;
      }
      ts(`Date distribution: ${JSON.stringify(yearCounts)}`);
      ts(`Zeroed/deleted slots (1/1/2000): ${zeroCount}`);

      // Show last 5 AND first 5 valid non-zero records
      const nonZero = logs.filter(l => {
        const d = new Date(l.recordTime);
        return !(d.getFullYear() === 2000 && d.getMonth() === 0 && d.getDate() === 1);
      });
      if (nonZero.length) {
        const last5nz = nonZero.slice(-5).map(l => `${l.deviceUserId}@${new Date(l.recordTime).toLocaleString()}`);
        ts(`Last 5 non-zero records: ${last5nz.join(' | ')}`);
      }
      ts(`Total non-zero records: ${nonZero.length}, zero/deleted: ${zeroCount}`);
    }

    // Historical data is already synced — we only need to save records from the
    // last SYNC_LOOKBACK_DAYS (default: today only). The whole log is read to
    // reach today's records (they sit in the last chunks), but we insert just
    // the recent ones, keeping every cron run light. skipDuplicates makes
    // re-saving the same punch a no-op.
    const lookbackDays = parseInt(process.env.SYNC_LOOKBACK_DAYS ?? '0');
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - lookbackDays);
    cutoff.setHours(0, 0, 0, 0);

    const recent = valid.filter(l => new Date(l.recordTime) >= cutoff);
    const total = recent.length;
    ts(`Saving ${total} record(s) from ${cutoff.toLocaleDateString()} onward (read ${valid.length} total).`);

    const rows = recent.map(l => ({
      deviceUserId: String(l.deviceUserId),
      punchTime:    new Date(l.recordTime),
      punchType:    l.type ?? 0,
    }));

    const BATCH = 2000;
    for (let i = 0; i < rows.length; i += BATCH) {
      const res = await prisma.attendanceLog.createMany({
        data: rows.slice(i, i + BATCH),
        skipDuplicates: true,
      });
      recordCount += res.count;
    }
    skipped = total - recordCount;

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

// Encodes a JS Date into the ZKTeco 4-byte timestamp format (little-endian UInt32).
// Mirror of zkTimeToDate above — must use the same formula in reverse.
// Container TZ is Asia/Dhaka, so getHours() etc. already reflect local time.
function dateToZkTime(date) {
  const year   = date.getFullYear() - 2000;
  const month  = date.getMonth();       // 0-indexed
  const day    = date.getDate();        // 1-indexed
  const hour   = date.getHours();
  const minute = date.getMinutes();
  const second = date.getSeconds();
  const t = second + minute * 60 + hour * 3600 +
            ((day - 1) + month * 31 + year * 12 * 31) * 86400;
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(t, 0);
  return buf;
}

// Reads the 4-byte ZK time from a CMD_GET_TIME response buffer.
// After removeTcpHeader strips the 8-byte TCP prefix, the buffer still
// contains an 8-byte inner ZK command header [cmd, checksum, session, reply]
// before the actual payload. Time data is therefore at offset 8, not 0.
// We scan a few candidate offsets and pick the one whose decoded year looks
// plausible (1990-2100), falling back to raw offset 0 if nothing fits.
function readZkTimeFromBuf(buf) {
  if (!buf || buf.length < 4) return null;
  const candidates = [8, 12, 4, 0];
  for (const off of candidates) {
    if (buf.length < off + 4) continue;
    const t = buf.readUInt32LE(off);
    const d = zkTimeToDate(t);
    if (d.getFullYear() >= 1990 && d.getFullYear() <= 2100) return d;
  }
  return null;
}

// Pushes the server's current time (Asia/Dhaka) to the ZKTeco device.
// Fixes a device whose RTC battery has died and clock reverted to 1/1/2000.
async function syncDeviceTime() {
  const zk = new ZKLib(ZK_IP, ZK_PORT, ZK_TIMEOUT, 4000);
  try {
    await zk.createSocket();

    // Read device time before changing it (for the response)
    let deviceTimeBefore = null;
    try {
      const rawBefore = await zk.executeCmd(COMMANDS.CMD_GET_TIME, '');
      ts(`CMD_GET_TIME raw (hex): ${rawBefore ? rawBefore.toString('hex') : 'null'}`);
      const d = readZkTimeFromBuf(rawBefore);
      if (d) deviceTimeBefore = d.toLocaleString();
    } catch (e) { ts(`GET_TIME before error: ${e.message}`); }

    // Set device time to the server's current local time
    const now = new Date();
    const timeBuf = dateToZkTime(now);
    ts(`CMD_SET_TIME sending (hex): ${timeBuf.toString('hex')} = ${now.toLocaleString()}`);
    await zk.executeCmd(COMMANDS.CMD_SET_TIME, timeBuf);

    // Read back to confirm
    let deviceTimeAfter = null;
    try {
      const rawAfter = await zk.executeCmd(COMMANDS.CMD_GET_TIME, '');
      ts(`CMD_GET_TIME after (hex): ${rawAfter ? rawAfter.toString('hex') : 'null'}`);
      const d = readZkTimeFromBuf(rawAfter);
      if (d) deviceTimeAfter = d.toLocaleString();
    } catch (e) { ts(`GET_TIME after error: ${e.message}`); }

    ts(`Device clock sync done. Before: ${deviceTimeBefore}, After: ${deviceTimeAfter}`);
    return { ok: true, deviceTimeBefore, deviceTimeAfter, serverTime: now.toLocaleString() };
  } finally {
    try { await zk.disconnect(); } catch (_) {}
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

module.exports = { syncAttendance, startRealTimeListener, diagnoseZk, syncDeviceTime };
