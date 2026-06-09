const cron = require('node-cron');
const { syncAttendance } = require('./zkService');

// How often to pull attendance from the device. Configurable via env.
// Default: every 10 minutes.
const SYNC_INTERVAL_MINUTES = parseInt(process.env.SYNC_INTERVAL_MINUTES || '10');
const CRON_EXPR = process.env.SYNC_CRON || `*/${SYNC_INTERVAL_MINUTES} * * * *`;

// Prevent overlapping runs — the ZKTeco device accepts only ONE TCP
// connection at a time, so a long sync must never collide with the next tick.
let isSyncing = false;
let task = null;

function ts(msg) {
  process.stdout.write(`[${new Date().toLocaleTimeString()}] ${msg}\n`);
}

// Compute the next cron boundary so /api/status can show "next sync at".
function getNextRunAt() {
  if (!SYNC_INTERVAL_MINUTES || SYNC_INTERVAL_MINUTES <= 0) return null;
  const now = new Date();
  const next = new Date(now);
  const nextMinute = (Math.floor(now.getMinutes() / SYNC_INTERVAL_MINUTES) + 1) * SYNC_INTERVAL_MINUTES;
  next.setMinutes(nextMinute, 0, 0);
  return next;
}

async function runSync(trigger) {
  if (isSyncing) {
    ts(`Skipping ${trigger} sync — a sync is already in progress.`);
    return;
  }
  isSyncing = true;
  try {
    ts(`Cron sync started (${trigger}).`);
    const result = await syncAttendance();
    ts(`Cron sync finished (${trigger}). New: ${result.recordCount ?? 0}, status: ${result.status}.`);
  } catch (err) {
    ts(`Cron sync error (${trigger}): ${err?.message || JSON.stringify(err)}`);
  } finally {
    isSyncing = false;
  }
}

async function startScheduler() {
  // Run one sync immediately on startup to catch anything missed while down.
  await runSync('startup');

  // Then pull from the device on the cron schedule. The device stores every
  // punch locally; this job downloads the full attendance log periodically.
  task = cron.schedule(CRON_EXPR, () => runSync('cron'));
  ts(`Scheduler started. Pulling attendance every ${SYNC_INTERVAL_MINUTES} min (cron: "${CRON_EXPR}").`);
}

module.exports = { startScheduler, getNextRunAt };
