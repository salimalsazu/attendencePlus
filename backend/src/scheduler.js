const cron = require('node-cron');
const { syncAttendance } = require('./zkService');
const { sendDailyReportEmail } = require('./mailService');
const { getSettings } = require('./settings');

// How often to pull attendance from the device. Configurable via env.
// Default: every 10 minutes.
const SYNC_INTERVAL_MINUTES = parseInt(process.env.SYNC_INTERVAL_MINUTES || '10');
const CRON_EXPR = process.env.SYNC_CRON || `*/${SYNC_INTERVAL_MINUTES} * * * *`;

// The daily report send time (settings.report_time, e.g. "11:00") is admin-editable
// at runtime, so instead of a fixed cron expression we check every minute whether
// the current Asia/Dhaka clock matches it, and send at most once per day.
let lastReportSentDate = null; // 'YYYY-MM-DD' in Asia/Dhaka

function dhakaDateParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(now);
  const get = t => parts.find(p => p.type === t).value;
  return { dateStr: `${get('year')}-${get('month')}-${get('day')}`, hm: `${get('hour')}:${get('minute')}` };
}

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
  try {
    const result = await sendDailyReportEmail({});
    ts(`Daily report emailed to ${result.recipient} (present: ${result.summary.totalPresent}, late: ${result.summary.totalLate}, absent: ${result.summary.totalAbsent}).`);
  } catch (err) {
    ts(`Daily report email failed: ${err?.message || JSON.stringify(err)}`);
  }
}

// Runs every minute; sends the daily report once, at the configured report_time.
async function checkDailyReportTime() {
  try {
    const settings = await getSettings();
    const reportTime = settings.report_time || '11:00';
    const { dateStr, hm } = dhakaDateParts();
    if (hm === reportTime && lastReportSentDate !== dateStr) {
      lastReportSentDate = dateStr;
      await runDailyReport();
    }
  } catch (err) {
    ts(`Daily report time check failed: ${err?.message || JSON.stringify(err)}`);
  }
}

async function startScheduler() {
  // Run one sync immediately on startup to catch anything missed while down.
  await runSync('startup');

  // Then pull from the device on the cron schedule. The device stores every
  // punch locally; this job downloads the full attendance log periodically.
  task = cron.schedule(CRON_EXPR, () => runSync('cron'));
  ts(`Scheduler started. Pulling attendance every ${SYNC_INTERVAL_MINUTES} min (cron: "${CRON_EXPR}").`);

  // Daily attendance report email — checked every minute against the
  // admin-configurable report_time setting (Settings page, Asia/Dhaka).
  cron.schedule('* * * * *', checkDailyReportTime);
  ts('Daily report email scheduler started (checks Settings > report_time every minute, tz: Asia/Dhaka).');
}

module.exports = { startScheduler, getNextRunAt };
