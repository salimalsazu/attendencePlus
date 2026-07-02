const cron = require('node-cron');
const { syncAttendance } = require('./zkService');
const { sendDailyReportEmail } = require('./mailService');

// How often to pull attendance from the device. Configurable via env.
// Default: every 10 minutes.
const SYNC_INTERVAL_MINUTES = parseInt(process.env.SYNC_INTERVAL_MINUTES || '10');
const CRON_EXPR = process.env.SYNC_CRON || `*/${SYNC_INTERVAL_MINUTES} * * * *`;

// When to email the daily attendance report. Default: 11:00 AM, Asia/Dhaka.
const REPORT_CRON_EXPR = process.env.REPORT_CRON || '0 11 * * *';

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

async function runDailyReport() {
  if (!process.env.REPORT_RECEIVER_EMAIL) {
    ts('Skipping daily report email — REPORT_RECEIVER_EMAIL not set.');
    return;
  }
  try {
    const result = await sendDailyReportEmail({});
    ts(`Daily report emailed to ${result.recipient} (present: ${result.summary.totalPresent}, late: ${result.summary.totalLate}, absent: ${result.summary.totalAbsent}).`);
  } catch (err) {
    ts(`Daily report email failed: ${err?.message || JSON.stringify(err)}`);
  }
}

async function startScheduler() {
  // Run one sync immediately on startup to catch anything missed while down.
  await runSync('startup');

  // Then pull from the device on the cron schedule. The device stores every
  // punch locally; this job downloads the full attendance log periodically.
  task = cron.schedule(CRON_EXPR, () => runSync('cron'));
  ts(`Scheduler started. Pulling attendance every ${SYNC_INTERVAL_MINUTES} min (cron: "${CRON_EXPR}").`);

  // Daily attendance report email, sent once a day at REPORT_CRON_EXPR.
  cron.schedule(REPORT_CRON_EXPR, runDailyReport, { timezone: 'Asia/Dhaka' });
  ts(`Daily report email scheduled (cron: "${REPORT_CRON_EXPR}", tz: Asia/Dhaka).`);
}

module.exports = { startScheduler, getNextRunAt };
