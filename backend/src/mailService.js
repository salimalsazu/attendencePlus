const nodemailer = require('nodemailer');
const { getDailyReport } = require('./reportService');
const { getSettings } = require('./settings');

function getTransporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    throw new Error('SMTP is not configured — set SMTP_HOST, SMTP_USER, SMTP_PASS in .env');
  }
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT || '587'),
    secure: parseInt(SMTP_PORT || '587') === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Dhaka',
  });
}

function fmtDate(date) {
  return date.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Dhaka',
  });
}

// Absent/leave rows have no check-in time to show, so this is where we
// surface *why* — leave reason (from the note) or plain "Absent". Present/
// late/early-leave rows already show their check-in time, so this stays
// blank for them rather than repeating the status.
function statusNote(r) {
  if (r.status === 'on_leave') return r.note ? `Leave — ${r.note}` : 'Leave';
  if (r.status === 'absent')   return r.note || 'Absent';
  return '';
}

function buildDailyReportHtml({ date, rows }) {
  const dateStr = fmtDate(date);

  const tableRows = rows.map(r => `
              <tr>
                <td class="name-cell">${escapeHtml(r.employee.name)}</td>
                <td class="dept-col dept-cell">${escapeHtml(r.employee.department || '—')}</td>
                <td>${fmtTime(r.firstPunch)}</td>
                <td>${r.delayMins > 0 ? r.delayMins + ' min' : '—'}</td>
                <td>${escapeHtml(statusNote(r)) || '—'}</td>
              </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>Daily Attendance Report</title>
<style>
  body, table, td, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  body { margin:0; padding:0; width:100% !important; background:#f3f4f6; font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif; }
  table { border-collapse:collapse; }
  .email-wrapper { width:100%; background:#f3f4f6; padding:24px 12px; }
  .email-container { max-width:640px; width:100%; margin:0 auto; background:#ffffff; border-radius:12px; overflow:hidden; border:1px solid #e5e7eb; }
  .header { background:#0f1629; padding:24px 28px; }
  .brand { font-size:12px; color:#93c5fd; font-weight:600; letter-spacing:.05em; text-transform:uppercase; }
  .company { font-size:12px; color:#e5e7eb; margin-top:2px; }
  .title { font-size:20px; color:#ffffff; font-weight:700; margin-top:8px; }
  .subtitle { font-size:13px; color:#cbd5e1; margin-top:2px; }
  .body-pad { padding:20px 24px 24px; }
  .report { width:100%; }
  .report th { padding:10px 12px; text-align:left; font-size:11px; color:#6b7280; text-transform:uppercase; letter-spacing:.03em; border-bottom:2px solid #e5e7eb; white-space:nowrap; }
  .report td { padding:10px 12px; font-size:13px; color:#374151; border-bottom:1px solid #f0f0f0; }
  .name-cell { color:#111827; font-weight:500; }
  .dept-cell { color:#6b7280; }
  .footer { padding:16px 24px; background:#f9fafb; border-top:1px solid #e5e7eb; font-size:12px; color:#9ca3af; }

  @media only screen and (max-width:600px) {
    .email-wrapper { padding:12px 6px !important; }
    .header { padding:16px 14px !important; }
    .title { font-size:17px !important; }
    .body-pad { padding:12px 8px 16px !important; }
    .report th, .report td { padding:8px 6px !important; font-size:12px !important; }
    .dept-col { display:none !important; }
    .footer { padding:14px 16px !important; }
  }
</style>
</head>
<body>
  <div class="email-wrapper">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td align="center">
          <table role="presentation" class="email-container" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td class="header">
                <div class="brand">AttendTrack Pro</div>
                <div class="company">24/7 Sourcing Pvt Ltd</div>
                <div class="title">Daily Attendance Report</div>
                <div class="subtitle">${dateStr}</div>
              </td>
            </tr>
            <tr>
              <td class="body-pad">
                <table role="presentation" class="report" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th class="dept-col">Department</th>
                      <th>Check-In</th>
                      <th>Delay</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>${tableRows}
                  </tbody>
                </table>
              </td>
            </tr>
            <tr>
              <td class="footer">
                This is an automated report generated by AttendTrack Pro. Please do not reply to this email.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </div>
</body>
</html>`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

async function sendDailyReportEmail({ date = new Date(), to } = {}) {
  let recipient = Array.isArray(to) ? to.join(',') : to;
  if (!recipient) {
    const settings = await getSettings();
    recipient = settings.report_recipients || process.env.REPORT_RECEIVER_EMAIL || '';
  }
  recipient = recipient.trim();
  if (!recipient) throw new Error('No recipient configured — add at least one recipient email in Settings.');

  const report = await getDailyReport(date);
  const html = buildDailyReportHtml(report);

  const transporter = getTransporter();
  const info = await transporter.sendMail({
    from: `"AttendTrack Pro" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
    to: recipient,
    subject: `Daily Attendance Report — ${fmtDate(report.date)}`,
    html,
  });

  return { messageId: info.messageId, recipient, summary: report.summary };
}

module.exports = { sendDailyReportEmail, buildDailyReportHtml };
