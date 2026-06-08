const bcrypt = require('bcryptjs');
const prisma = require('./prismaClient');

const DEFAULTS = {
  office_start:           '09:30',
  office_end:             '18:30',
  late_grace_mins:        '15',
  early_leave_grace_mins: '15',
  weekly_holidays:        '5',   // comma-separated JS day nums: 0=Sun 1=Mon … 6=Sat
};

// Returns { office_start, office_end, late_grace_mins, early_leave_grace_mins }
async function getSettings() {
  const rows = await prisma.appSettings.findMany();
  const db   = Object.fromEntries(rows.map(r => [r.key, r.value]));
  return { ...DEFAULTS, ...db };
}

// Seed defaults on first run (called once at startup)
async function seedDefaults() {
  for (const [key, value] of Object.entries(DEFAULTS)) {
    await prisma.appSettings.upsert({
      where:  { key },
      update: {},           // never overwrite admin-set values
      create: { key, value },
    });
  }
}

// Parse "HH:MM" → { hours, minutes }
function parseTime(str) {
  const [h, m] = (str || '09:00').split(':').map(Number);
  return { hours: h || 0, minutes: m || 0 };
}

// Seed default super admin on first run
async function seedUsers() {
  const count = await prisma.user.count();
  if (count > 0) return;
  const hashed = await bcrypt.hash('Admin@123', 10);
  await prisma.user.create({
    data: { username: 'superadmin', name: 'Super Admin', role: 'super_admin', password: hashed },
  });
  console.log('Default super admin created — username: superadmin  password: Admin@123');
  console.log('Please change the password after first login.');
}

module.exports = { getSettings, seedDefaults, seedUsers, parseTime };
