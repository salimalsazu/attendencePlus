const router = require('express').Router();
const prisma  = require('../prismaClient');
const { getSettings, seedDefaults } = require('../settings');

// GET /api/settings — return all settings as { key: value } map
router.get('/', async (req, res) => {
  try {
    await seedDefaults();
    res.json(await getSettings());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/settings — body: { office_start, office_end, late_grace_mins, early_leave_grace_mins }
router.put('/', async (req, res) => {
  try {
    const allowed = [
      'office_start', 'office_end', 'late_grace_mins', 'early_leave_grace_mins', 'weekly_holidays',
      'report_recipients', 'report_time',
    ];
    const entries = Object.entries(req.body).filter(([k]) => allowed.includes(k));

    for (const [key, value] of entries) {
      await prisma.appSettings.upsert({
        where:  { key },
        update: { value: String(value) },
        create: { key, value: String(value) },
      });
    }

    res.json(await getSettings());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
