const router  = require('express').Router();
const prisma   = require('../prismaClient');
const { syncAttendance, diagnoseZk } = require('../zkService');

// GET /api/devices
router.get('/', async (req, res) => {
  try {
    const devices = await prisma.device.findMany({ orderBy: { deviceId: 'asc' } });
    res.json(devices);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/devices/stats
router.get('/stats', async (req, res) => {
  try {
    const devices = await prisma.device.findMany();
    const total   = devices.length;
    const online  = devices.filter(d => d.status === 'online').length;
    const offline = devices.filter(d => d.status === 'offline').length;
    res.json({ total, online, offline, syncing: total - online - offline });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/devices/diagnostics — checks if the backend can reach the ZK device.
// Useful when the device is on a remote LAN reachable only through WireGuard.
router.get('/diagnostics', async (req, res) => {
  try {
    const result = await diagnoseZk();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/devices
router.post('/', async (req, res) => {
  try {
    const { deviceId, name, location, branch, ipAddress } = req.body;
    if (!deviceId || !name) return res.status(400).json({ error: 'deviceId and name are required' });
    const device = await prisma.device.create({
      data: { deviceId, name, location: location || null, branch: branch || null, ipAddress: ipAddress || null },
    });
    res.json(device);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Device ID already exists' });
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/devices/:id
router.patch('/:id', async (req, res) => {
  try {
    const { name, location, branch, ipAddress, status, batteryHealth } = req.body;
    const device = await prisma.device.update({
      where: { deviceId: req.params.id },
      data: {
        ...(name          !== undefined && { name }),
        ...(location      !== undefined && { location:      location      || null }),
        ...(branch        !== undefined && { branch:        branch        || null }),
        ...(ipAddress     !== undefined && { ipAddress:     ipAddress     || null }),
        ...(status        !== undefined && { status }),
        ...(batteryHealth !== undefined && { batteryHealth: batteryHealth ?? null }),
      },
    });
    res.json(device);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/devices/:id
router.delete('/:id', async (req, res) => {
  try {
    await prisma.device.delete({ where: { deviceId: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/devices/:id/sync — triggers global sync and updates this device record
router.post('/:id/sync', async (req, res) => {
  try {
    // Mark as syncing
    await prisma.device.update({
      where: { deviceId: req.params.id },
      data:  { status: 'syncing' },
    }).catch(() => {});

    const result = await syncAttendance();

    await prisma.device.update({
      where: { deviceId: req.params.id },
      data: {
        status:        result.status === 'success' ? 'online' : 'offline',
        lastSyncTime:  new Date(),
        recordsSynced: result.recordCount,
      },
    }).catch(() => {});

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
