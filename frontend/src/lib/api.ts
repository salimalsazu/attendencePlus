import type {
  AppSettings,
  AppStatus,
  AttendancePage,
  AttendanceRecord,
  AttendanceReport,
  AuthUser,
  DailySummaryEntry,
  DashboardStats,
  DeptStat,
  Device,
  DeviceStats,
  Employee,
  EmployeeHistory,
  MonthlyReport,
  SyncLog,
  SyncResult,
  TrendPoint,
} from './types';
import { getToken } from './auth';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

async function fetchJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { cache: 'no-store', ...init, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  // Auth
  login: (username: string, password: string) =>
    fetchJSON<{ token: string; user: AuthUser }>('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }),

  me: () => fetchJSON<AuthUser>('/api/auth/me'),

  // User management (super_admin only)
  listUsers: () => fetchJSON<(AuthUser & { createdAt: string })[]>('/api/auth/users'),

  createUser: (data: { username: string; name: string; password: string; role: string }) =>
    fetchJSON<AuthUser>('/api/auth/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  deleteUser: (id: number) =>
    fetchJSON<{ ok: boolean }>(`/api/auth/users/${id}`, { method: 'DELETE' }),

  // Status
  status: () => fetchJSON<AppStatus>('/api/status'),

  // Attendance
  dailySummary: (date: string) =>
    fetchJSON<DailySummaryEntry[]>(`/api/attendance/daily-summary?date=${date}`),

  attendance: (params: Record<string, string>) => {
    const q = new URLSearchParams(params).toString();
    return fetchJSON<AttendancePage>(`/api/attendance?${q}`);
  },

  attendanceReport: (params: Record<string, string>) => {
    const q = new URLSearchParams(params).toString();
    return fetchJSON<AttendanceReport>(`/api/attendance/report?${q}`);
  },

  employeeHistory: (deviceUserId: string, date: string) =>
    fetchJSON<EmployeeHistory>(`/api/employees/${encodeURIComponent(deviceUserId)}/attendance?date=${date}`),

  triggerSync: () =>
    fetchJSON<SyncResult>('/api/attendance/sync', { method: 'POST' }),

  fixTzDuplicates: () =>
    fetchJSON<{ shifted: number; deleted: number }>('/api/attendance/fix-tz-duplicates', { method: 'POST' }),

  syncLogs: () =>
    fetchJSON<SyncLog[]>('/api/attendance/sync-logs'),

  // Employees
  employees: () => fetchJSON<Employee[]>('/api/employees'),

  updateEmployee: (deviceUserId: string, data: Partial<Pick<Employee, 'name' | 'role' | 'department' | 'designation'>>) =>
    fetchJSON<Employee>(`/api/employees/${encodeURIComponent(deviceUserId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  // Dashboard
  dashboardStats: (date?: string) =>
    fetchJSON<DashboardStats>(`/api/dashboard/stats${date ? `?date=${date}` : ''}`),

  dashboardTrend: (days = 30) =>
    fetchJSON<TrendPoint[]>(`/api/dashboard/trend?days=${days}`),

  dashboardDepartments: (date?: string) =>
    fetchJSON<DeptStat[]>(`/api/dashboard/departments${date ? `?date=${date}` : ''}`),

  // Devices
  devices: () => fetchJSON<Device[]>('/api/devices'),

  deviceStats: () => fetchJSON<DeviceStats>('/api/devices/stats'),

  createDevice: (data: { deviceId: string; name: string; location?: string; branch?: string; ipAddress?: string }) =>
    fetchJSON<Device>('/api/devices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  updateDevice: (deviceId: string, data: Partial<Device>) =>
    fetchJSON<Device>(`/api/devices/${encodeURIComponent(deviceId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  deleteDevice: (deviceId: string) =>
    fetchJSON<{ ok: boolean }>(`/api/devices/${encodeURIComponent(deviceId)}`, { method: 'DELETE' }),

  syncDevice: (deviceId: string) =>
    fetchJSON<SyncResult>(`/api/devices/${encodeURIComponent(deviceId)}/sync`, { method: 'POST' }),

  // Manual attendance
  createManualPunch: (data: {
    deviceUserId: string;
    date: string;
    time: string;
    punchType: number;
    note?: string;
  }) =>
    fetchJSON<AttendanceRecord>('/api/attendance/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  manualEntries: (params?: Record<string, string>) => {
    const q = params ? new URLSearchParams(params).toString() : '';
    return fetchJSON<AttendancePage>(`/api/attendance/manual-entries${q ? `?${q}` : ''}`);
  },

  deleteManualEntry: (id: number) =>
    fetchJSON<{ ok: boolean }>(`/api/attendance/manual/${id}`, { method: 'DELETE' }),

  // Monthly report
  monthlyReport: (params: Record<string, string>) => {
    const q = new URLSearchParams(params).toString();
    return fetchJSON<MonthlyReport>(`/api/attendance/monthly-report?${q}`);
  },

  // Settings
  getSettings: () => fetchJSON<AppSettings>('/api/settings'),

  updateSettings: (data: Partial<AppSettings>) =>
    fetchJSON<AppSettings>('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
};
