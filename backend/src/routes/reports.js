const router = require('express').Router();
const { sendDailyReportEmail } = require('../mailService');

// POST /api/reports/send-test — trigger the daily report email on demand (UI test button)
// Body: { date?: "2026-07-02" } — defaults to today
router.post('/send-test', async (req, res) => {
  try {
    const date = req.body?.date ? new Date(req.body.date) : new Date();
    const result = await sendDailyReportEmail({ date });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
