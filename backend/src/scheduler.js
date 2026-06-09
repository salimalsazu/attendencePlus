const { syncAttendance, startRealTimeListener } = require('./zkService');

function getNextRunAt() {
  return null;
}

async function startScheduler() {
  // One-time full sync on startup to catch any punches missed while server was down
  await syncAttendance();

  // Real-time listener: device pushes each punch instantly via TCP.
  // No cron sync needed — cron conflicts with this connection AND the device's
  // getAttendances() only returns old 2024 records after the reboot anyway.
  startRealTimeListener();
}

module.exports = { startScheduler, getNextRunAt };
