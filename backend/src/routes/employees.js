const router = require('express').Router();
const prisma = require('../prismaClient');

// GET /api/employees
router.get('/', async (req, res) => {
  try {
    const employees = await prisma.employee.findMany({ orderBy: { name: 'asc' } });
    res.json(employees);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/employees/:deviceUserId/attendance?date=2026-06-08
// Returns { employee, records } so the frontend can show both in one call
router.get('/:deviceUserId/attendance', async (req, res) => {
  try {
    const { date } = req.query;
    const employee = await prisma.employee.findUnique({
      where: { deviceUserId: req.params.deviceUserId },
    });
    if (!employee) return res.status(404).json({ error: 'Employee not found' });

    const where = { deviceUserId: req.params.deviceUserId };
    if (date) {
      const from = new Date(date);
      const to   = new Date(date);
      to.setDate(to.getDate() + 1);
      where.punchTime = { gte: from, lt: to };
    }

    const records = await prisma.attendanceLog.findMany({
      where,
      orderBy: { punchTime: 'asc' },
    });

    res.json({ employee, records });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/employees/:id — update name / role / department / designation
router.patch('/:id', async (req, res) => {
  try {
    const { name, role, department, designation } = req.body;
    const emp = await prisma.employee.update({
      where: { deviceUserId: req.params.id },
      data: {
        ...(name        !== undefined && { name }),
        ...(role        !== undefined && { role:        role        || null }),
        ...(department  !== undefined && { department:  department  || null }),
        ...(designation !== undefined && { designation: designation || null }),
      },
    });
    res.json(emp);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
