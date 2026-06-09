const cron = require('node-cron');
const { syncAttendance } = require('./zkService');

let nextRunAt = null;

function computeNextRun() {
  const now = new Date();
  const next = new Date(now);
  next.setSeconds(0, 0);
  if (now.getMinutes() < 30) {
    next.setMinutes(30);
  } else {
    next.setMinutes(0);
    next.setHours(next.getHours() + 1);
  }
  return next;
}

function getNextRunAt() {
  return nextRunAt;
}

async function startScheduler() {
  // One-time full sync on startup
  await syncAttendance();

  // Periodic sync every 30 minutes — connects, fetches, disconnects
  nextRunAt = computeNextRun();
  cron.schedule('*/30 * * * *', async () => {
    console.log('[Scheduler] Running periodic 30-minute sync...');
    await syncAttendance();
    nextRunAt = computeNextRun();
  });
}

module.exports = { startScheduler, getNextRunAt };
