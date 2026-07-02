const router = require('express').Router();
const { sendDailyReportEmail } = require('../mailService');

// POST /api/reports/send-test — trigger the daily report email on demand (UI test button)
// Body: { date?: "2026-07-02", to?: "someone@example.com" }
// Without `to`, sends to the saved recipients in Settings. With `to`, sends a
// one-off copy to that address instead (used by the "send to a chosen user" button).
router.post('/send-test', async (req, res) => {
  try {
    const date = req.body?.date ? new Date(req.body.date) : new Date();
    const to   = req.body?.to?.trim() || undefined;
    const result = await sendDailyReportEmail({ date, to });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
