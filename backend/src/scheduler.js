const { syncAttendance, startRealTimeListener } = require('./zkService');

// getNextRunAt kept for API compatibility — returns null since periodic sync is removed.
function getNextRunAt() {
  return null;
}

async function startScheduler() {
  // One-time full sync on startup to catch any punches missed while server was down
  await syncAttendance();

  // Real-time listener stays connected forever and captures every punch instantly.
  // A separate periodic sync is NOT used because the ZKTeco device only allows one
  // TCP connection at a time — the real-time listener holds it, so any second
  // connection attempt fails. The startup sync above covers missed punches on restart.
  startRealTimeListener();
}

module.exports = { startScheduler, getNextRunAt };
