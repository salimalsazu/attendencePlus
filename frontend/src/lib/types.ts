export interface Employee {
  id: number;
  deviceUserId: string;
  name: string;
  role: string | null;
  department: string | null;
  designation: string | null;
  status: 'active' | 'inactive';
  createdAt: string;
}

export interface AttendanceRecord {
  id: number;
  deviceUserId: string;
  punchTime: string;
  punchType: number;
  source: string;
  note: string | null;
  createdAt: string;
  employee: Pick<Employee, 'deviceUserId' | 'name' | 'role' | 'department' | 'designation'> | null;
}

export interface AttendancePage {
  total: number;
  page: number;
  limit: number;
  records: AttendanceRecord[];
}

export interface DailySummaryEntry {
  employee: Employee;
  firstPunch: string | null;
  lastPunch: string | null;
  totalPunches: number;
  durationMins: number | null;
  status: 'present' | 'absent';
}

export interface ReportRow {
  employee: Employee;
  firstPunch: string | null;
  lastPunch: string | null;
  totalPunches: number;
  durationMins: number | null;
  delayMins: number;
  earlyLeaveMins: number;
  status: 'present' | 'late' | 'absent' | 'early_leave' | 'on_leave';
  punches: AttendanceRecord[];
}

export interface MonthlyReportDay {
  date: string;
  status: 'present' | 'late' | 'early_leave' | 'absent' | 'holiday' | 'future';
  firstPunch: string | null;
  lastPunch: string | null;
  durationMins: number | null;
  delayMins: number;
  earlyLeaveMins: number;
}

export interface MonthlyReportRow {
  employee: Employee;
  presentDays: number;
  lateDays: number;
  earlyLeaveDays: number;
  absentDays: number;
  workingDays: number;
  totalWorkingMins: number;
  avgCheckInMins: number | null;
  dailyBreakdown: MonthlyReportDay[];
}

export interface MonthlyReportSummary {
  totalEmployees: number;
  workingDaysCount: number;
  avgPresentDays: number;
  totalLateDays: number;
  totalEarlyLeaveDays: number;
}

export interface MonthlyReport {
  month: string;
  weeklyHolidays: number[];
  total: number;
  page: number;
  limit: number;
  rows: MonthlyReportRow[];
  summary: MonthlyReportSummary;
}

export interface AuthUser {
  id: number;
  username: string;
  name: string;
  role: 'admin' | 'super_admin';
}

export interface AppSettings {
  office_start: string;
  office_end: string;
  late_grace_mins: string;
  early_leave_grace_mins: string;
  weekly_holidays: string; // comma-separated JS day nums: 0=Sun…6=Sat
}

export interface ReportSummary {
  totalPresent: number;
  totalLate: number;
  totalAbsent: number;
  totalEarlyLeave: number;
  totalOnLeave: number;
  avgWorkingMins: number;
}

export interface AttendanceReport {
  total: number;
  page: number;
  limit: number;
  rows: ReportRow[];
  summary: ReportSummary;
}

export interface EmployeeHistory {
  employee: Employee;
  records: AttendanceRecord[];
}

export interface SyncLog {
  id: number;
  syncedAt: string;
  recordCount: number;
  status: string;
  message: string | null;
}

export interface SyncResult {
  recordCount: number;
  skipped?: number;
  total?: number;
  status: string;
  message?: string;
}

export interface AppStatus {
  status: string;
  time: string;
  nextSyncAt: string | null;
}

export interface DashboardStats {
  totalEmployees: number;
  presentCount: number;
  presentPct: number;
  lateCount: number;
  lateRatio: number;
  delayCount: number;
  delayRatio: number;
  absentCount: number;
  lastSyncTime: string | null;
}

export interface TrendPoint {
  date: string;
  present: number;
  absent: number;
}

export interface DeptStat {
  department: string;
  total: number;
  present: number;
  pct: number;
}

export interface Device {
  id: number;
  deviceId: string;
  name: string;
  location: string | null;
  branch: string | null;
  ipAddress: string | null;
  status: 'online' | 'offline' | 'syncing';
  batteryHealth: number | null;
  lastSyncTime: string | null;
  recordsSynced: number;
  createdAt: string;
  updatedAt: string;
}

export interface DeviceStats {
  total: number;
  online: number;
  offline: number;
  syncing: number;
}
