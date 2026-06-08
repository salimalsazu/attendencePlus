'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  Pagination,
  Paper,
  Select,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { MonthPickerInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import {
  IconCalendarStats,
  IconChevronDown,
  IconChevronUp,
  IconDownload,
  IconFilter,
  IconFileTypePdf,
  IconSearch,
  IconX,
} from '@tabler/icons-react';
import dayjs from 'dayjs';
import { api } from '@/lib/api';
import { formatDuration } from '@/lib/utils';
import type { MonthlyReport, MonthlyReportDay, MonthlyReportRow } from '@/lib/types';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface Filters {
  month: Date;
  dept: string;
  desig: string;
  search: string;
}

export default function MonthlyReportPage() {
  const [filters, setFilters] = useState<Filters>({ month: new Date(), dept: '', desig: '', search: '' });
  const [page,    setPage]    = useState(1);
  const [limit,   setLimit]   = useState(20);
  const [loading, setLoading] = useState(true);
  const [report,  setReport]  = useState<MonthlyReport | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchReport = useCallback(async (f: Filters, pg: number, lim: number) => {
    setLoading(true);
    try {
      const params: Record<string, string> = { month: dayjs(f.month).format('YYYY-MM'), page: String(pg), limit: String(lim) };
      if (f.dept.trim())   params.department  = f.dept.trim();
      if (f.desig.trim())  params.designation = f.desig.trim();
      if (f.search.trim()) params.search      = f.search.trim();
      setReport(await api.monthlyReport(params));
    } catch (err) {
      notifications.show({ message: String(err), color: 'red' });
    } finally {
      setLoading(false);
    }
  }, []);

  const setInstant   = (patch: Partial<Filters>) => { const next = { ...filters, ...patch }; setFilters(next); setPage(1); fetchReport(next, 1, limit); };
  const setDebounced = (patch: Partial<Filters>) => {
    const next = { ...filters, ...patch }; setFilters(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setPage(1); fetchReport(next, 1, limit); }, 400);
  };

  useEffect(() => { fetchReport(filters, 1, limit); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const resetFilters = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const fresh: Filters = { month: new Date(), dept: '', desig: '', search: '' };
    setFilters(fresh); setPage(1); fetchReport(fresh, 1, limit);
  };

  const changePage  = (pg: number)        => { setPage(pg); fetchReport(filters, pg, limit); };
  const changeLimit = (val: string | null) => { const lim = parseInt(val ?? '20'); setLimit(lim); setPage(1); fetchReport(filters, 1, lim); };

  const exportPDF = async () => {
    if (!report || report.rows.length === 0) return;
    try {
      const { default: jsPDF }     = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      const doc      = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const monthStr = dayjs(filters.month).format('MMMM YYYY');
      const holidayNames = (report.weeklyHolidays || []).map(n => DAY_NAMES[n]).join(', ') || 'None';

      doc.setFontSize(16); doc.setTextColor(15, 22, 41);
      doc.text('AttendTrack Pro — Monthly Attendance Report', 14, 18);
      doc.setFontSize(10); doc.setTextColor(100);
      doc.text(`Month: ${monthStr}`, 14, 25);
      doc.text(`Weekly Holidays: ${holidayNames}  |  Working Days: ${report.summary.workingDaysCount}`, 14, 30);
      doc.text(`Generated: ${dayjs().format('YYYY-MM-DD HH:mm')}`, 14, 35);

      autoTable(doc, {
        startY: 41,
        head: [['#', 'User ID', 'Employee Name', 'Dept', 'Designation', 'Present', 'Absent', 'Late', 'Early Leave', 'Total Hrs', 'Avg Check-In']],
        body: report.rows.map((r, i) => [
          i + 1,
          `EMP-${r.employee.deviceUserId.padStart(4, '0')}`,
          r.employee.name,
          r.employee.department  ?? '—',
          r.employee.designation ?? '—',
          `${r.presentDays}/${r.workingDays}d`,
          `${r.absentDays}d`,
          `${r.lateDays}d`,
          `${r.earlyLeaveDays}d`,
          formatDuration(r.totalWorkingMins),
          r.avgCheckInMins !== null ? minsToTime(r.avgCheckInMins) : '—',
        ]),
        styles:             { fontSize: 8, cellPadding: 2 },
        headStyles:         { fillColor: [30, 58, 95], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
      });
      doc.save(`monthly-report-${dayjs(filters.month).format('YYYY-MM')}.pdf`);
    } catch (err) {
      notifications.show({ message: `PDF export failed: ${err}`, color: 'red' });
    }
  };

  const totalPages = report ? Math.max(1, Math.ceil(report.total / limit)) : 1;
  const s = report?.summary;
  const holidays = report?.weeklyHolidays ?? [];

  return (
    <Box p="xl">
      <Text fz="sm" c="dimmed" mb={4}>
        Dashboard &rsaquo; <Text span c="#2563eb" fw={500}>Monthly Report</Text>
      </Text>
      <Title order={2} fw={700} c="#111827" mb={4}>Monthly Attendance Report</Title>
      <Text fz="sm" c="dimmed" mb="lg">Full-month attendance summary with calendar view for every employee</Text>

      {/* Filters */}
      <Paper withBorder radius="md" p="md" mb="md">
        <Group gap="sm" wrap="wrap">
          <MonthPickerInput
            value={filters.month}
            onChange={d => d && setInstant({ month: d })}
            maxDate={new Date()}
            clearable={false}
            w={160}
            leftSection={<IconCalendarStats size={15} />}
          />
          <TextInput placeholder="Search by Name, ID or Department..." leftSection={<IconSearch size={15} />}
            value={filters.search} onChange={e => setDebounced({ search: e.currentTarget.value })} w={260} />
          <TextInput placeholder="Department" leftSection={<IconFilter size={15} />}
            value={filters.dept} onChange={e => setDebounced({ dept: e.currentTarget.value })} w={160} />
          <TextInput placeholder="Designation" leftSection={<IconFilter size={15} />}
            value={filters.desig} onChange={e => setDebounced({ desig: e.currentTarget.value })} w={160} />
          <Button variant="default" leftSection={<IconX size={14} />} onClick={resetFilters}>Reset</Button>
          <Button variant="filled" color="red" leftSection={<IconDownload size={15} />}
            onClick={exportPDF} ml="auto" disabled={!report || report.rows.length === 0}>Export PDF</Button>
        </Group>
        {holidays.length > 0 && (
          <Group gap={6} mt="xs">
            <Text fz="xs" c="dimmed">Weekly holidays:</Text>
            {holidays.map(n => (
              <Badge key={n} size="xs" color="gray" variant="light">{DAY_NAMES[n]}</Badge>
            ))}
            <Text fz="xs" c="dimmed">— not counted as working days</Text>
          </Group>
        )}
      </Paper>

      {/* Summary cards */}
      {s && (
        <Group gap="md" mb="md" grow>
          {[
            { label: 'Total Employees',  value: s.totalEmployees,       color: '#2563eb', bg: '#eff6ff' },
            { label: 'Working Days',     value: s.workingDaysCount,     color: '#059669', bg: '#ecfdf5' },
            { label: 'Avg Present Days', value: `${s.avgPresentDays}d`, color: '#7c3aed', bg: '#f5f3ff' },
            { label: 'Total Late Days',  value: s.totalLateDays,        color: '#d97706', bg: '#fffbeb' },
            { label: 'Early Leave Days', value: s.totalEarlyLeaveDays,  color: '#ca8a04', bg: '#fefce8' },
          ].map(c => (
            <Paper key={c.label} withBorder radius="md" p="md" style={{ background: c.bg, borderColor: c.color + '33' }}>
              <Text fz="xs" c="dimmed" tt="uppercase" fw={600}>{c.label}</Text>
              <Text fz="xl" fw={800} c={c.color}>{c.value}</Text>
            </Paper>
          ))}
        </Group>
      )}

      {/* Table */}
      <Paper withBorder radius="md" p={0} mb="md">
        <Table highlightOnHover verticalSpacing="sm" style={{ fontSize: 14 }}>
          <Table.Thead style={{ background: '#1e3a5f' }}>
            <Table.Tr>
              {['#', 'User ID', 'Employee Name', 'Department', 'Designation',
                'Present', 'Absent', 'Late', 'Early Leave', 'Total Hrs', 'Avg Check-In', ''].map(h => (
                <Table.Th key={h} style={{ color: '#fff', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {loading && Array.from({ length: 8 }).map((_, i) => (
              <Table.Tr key={i}>{Array.from({ length: 12 }).map((__, j) => (
                <Table.Td key={j}><Skeleton h={14} w={j === 0 ? 20 : 70} /></Table.Td>
              ))}</Table.Tr>
            ))}

            {!loading && report?.rows.map((row, idx) => (
              <React.Fragment key={row.employee.deviceUserId}>
                <Table.Tr style={{ background: expandedId === row.employee.deviceUserId ? '#f0f9ff' : undefined }}>
                  <Table.Td c="dimmed" fz="sm">{(page - 1) * limit + idx + 1}</Table.Td>
                  <Table.Td>
                    <Text fz="sm" c="#2563eb" fw={500} style={{ fontFamily: 'monospace' }}>
                      EMP-{row.employee.deviceUserId.padStart(4, '0')}
                    </Text>
                  </Table.Td>
                  <Table.Td><Text fz="sm" fw={600} c="#111827">{row.employee.name}</Text></Table.Td>
                  <Table.Td fz="sm" c="#374151">{row.employee.department  ?? '—'}</Table.Td>
                  <Table.Td fz="sm" c="#374151">{row.employee.designation ?? '—'}</Table.Td>
                  <Table.Td>
                    <Group gap={4}>
                      <Badge size="sm" variant="light" color="green">{row.presentDays}d</Badge>
                      <Text fz="xs" c="dimmed">/ {row.workingDays}d</Text>
                    </Group>
                  </Table.Td>
                  <Table.Td><Badge size="sm" variant="light" color="red">{row.absentDays}d</Badge></Table.Td>
                  <Table.Td><Badge size="sm" variant="light" color="orange">{row.lateDays}d</Badge></Table.Td>
                  <Table.Td><Badge size="sm" variant="light" color="yellow">{row.earlyLeaveDays}d</Badge></Table.Td>
                  <Table.Td fz="sm" fw={500}>{formatDuration(row.totalWorkingMins)}</Table.Td>
                  <Table.Td fz="sm" c="#374151">{row.avgCheckInMins !== null ? minsToTime(row.avgCheckInMins) : '—'}</Table.Td>
                  <Table.Td>
                    <ActionIcon variant="subtle" color="blue" size="sm"
                      onClick={() => setExpandedId(prev => prev === row.employee.deviceUserId ? null : row.employee.deviceUserId)}>
                      {expandedId === row.employee.deviceUserId ? <IconChevronUp size={15} /> : <IconChevronDown size={15} />}
                    </ActionIcon>
                  </Table.Td>
                </Table.Tr>

                {expandedId === row.employee.deviceUserId && (
                  <Table.Tr>
                    <Table.Td colSpan={12} style={{ background: '#f8fafc', padding: 0 }}>
                      <MonthCalendar row={row} holidays={holidays} month={report!.month} />
                    </Table.Td>
                  </Table.Tr>
                )}
              </React.Fragment>
            ))}

            {!loading && report?.rows.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={12} ta="center" py="xl" c="dimmed">No records found.</Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>

        {report && (
          <Group justify="space-between" px="md" py="sm" style={{ borderTop: '1px solid #f1f5f9' }} wrap="wrap" gap="sm">
            <Text fz="sm" c="dimmed">
              Showing {Math.min((page - 1) * limit + 1, report.total)}–{Math.min(page * limit, report.total)} of {report.total} employees
            </Text>
            <Group gap="sm">
              <Group gap={6} align="center">
                <Text fz="sm" c="dimmed">Rows:</Text>
                <Select data={['20', '50', '100']} value={String(limit)} onChange={changeLimit} size="xs" w={70} allowDeselect={false} />
              </Group>
              <Pagination value={page} onChange={changePage} total={totalPages} size="sm" siblings={1} />
            </Group>
          </Group>
        )}
      </Paper>
    </Box>
  );
}

/* ──────────────────────────────────────────────
   Month Calendar expanded panel
────────────────────────────────────────────── */
function MonthCalendar({ row, holidays, month }: { row: MonthlyReportRow; holidays: number[]; month: string }) {
  const calRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const exportCalendarPDF = async () => {
    if (!calRef.current) return;
    setExporting(true);
    try {
      const { default: html2canvas } = await import('html2canvas');
      const { default: jsPDF }       = await import('jspdf');

      const canvas = await html2canvas(calRef.current, {
        scale:           2,
        useCORS:         true,
        backgroundColor: '#ffffff',
        logging:         false,
      });

      const imgData  = canvas.toDataURL('image/png');
      const pdf      = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageW    = pdf.internal.pageSize.getWidth();
      const pageH    = pdf.internal.pageSize.getHeight();
      const margin   = 10;
      const maxW     = pageW - margin * 2;
      const maxH     = pageH - margin * 2;
      const ratio    = canvas.width / canvas.height;
      const imgW     = Math.min(maxW, maxH * ratio);
      const imgH     = imgW / ratio;
      const x        = (pageW - imgW) / 2;
      const y        = margin;

      pdf.addImage(imgData, 'PNG', x, y, imgW, imgH);
      pdf.save(`calendar-${row.employee.name.replace(/\s+/g, '-')}-${month}.pdf`);
    } catch (err) {
      notifications.show({ message: `Export failed: ${err}`, color: 'red' });
    } finally {
      setExporting(false);
    }
  };

  const [year, mon] = month.split('-').map(Number);
  const firstDayOfWeek = new Date(year, mon - 1, 1).getDay(); // 0=Sun
  const daysInMonth    = new Date(year, mon, 0).getDate();

  // Build a lookup from date string → day data
  const dayMap: Record<string, MonthlyReportDay> = {};
  for (const d of row.dailyBreakdown) dayMap[d.date] = d;

  // Status display config
  const STATUS: Record<string, { bg: string; text: string; dot: string; label: string }> = {
    present:     { bg: '#dcfce7', text: '#15803d', dot: '#16a34a', label: 'Present' },
    late:        { bg: '#ffedd5', text: '#c2410c', dot: '#ea580c', label: 'Late' },
    early_leave: { bg: '#fef9c3', text: '#92400e', dot: '#ca8a04', label: 'Early' },
    absent:      { bg: '#fee2e2', text: '#b91c1c', dot: '#dc2626', label: 'Absent' },
    holiday:     { bg: '#f1f5f9', text: '#64748b', dot: '#94a3b8', label: 'Holiday' },
    future:      { bg: '#f8fafc', text: '#cbd5e1', dot: '#e2e8f0', label: '—' },
  };

  // Legend
  const legend = [
    { key: 'present',     label: 'Present',     color: '#16a34a' },
    { key: 'late',        label: 'Late',         color: '#ea580c' },
    { key: 'early_leave', label: 'Early Leave',  color: '#ca8a04' },
    { key: 'absent',      label: 'Absent',       color: '#dc2626' },
    { key: 'holiday',     label: 'Holiday',      color: '#94a3b8' },
  ];

  // Build 7-wide grid cells (nulls for empty leading slots)
  const cells: (number | null)[] = [
    ...Array(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // Pad end so grid rows are complete
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <Box p="md" style={{ borderTop: '2px solid #2563eb' }}>
      {/* Header row */}
      <Group justify="space-between" mb="md" wrap="wrap" gap="xs">
        <div>
          <Text fw={700} fz="sm" c="#111827">
            {row.employee.name} — {dayjs(`${month}-01`).format('MMMM YYYY')}
          </Text>
          <Text fz="xs" c="dimmed">
            {row.employee.department ?? 'No Department'} · {row.presentDays}/{row.workingDays} working days attended
          </Text>
        </div>
        <Group gap="md" wrap="wrap">
          {/* Legend */}
          {legend.map(l => (
            <Group key={l.key} gap={4}>
              <div style={{ width: 10, height: 10, borderRadius: 3, background: l.color }} />
              <Text fz="xs" c="dimmed">{l.label}</Text>
            </Group>
          ))}
          {/* Export button */}
          <Button
            size="xs"
            color="red"
            variant="filled"
            leftSection={<IconDownload size={13} />}
            loading={exporting}
            onClick={exportCalendarPDF}
          >
            Export PDF
          </Button>
        </Group>
      </Group>

      {/* Calendar grid — captured by html2canvas */}
      <div ref={calRef} style={{ background: '#fff', padding: 8 }}>
        {/* Employee + month title inside capture area */}
        <Group justify="space-between" mb={8} align="flex-start">
          <div>
            <Text fw={700} fz="sm" c="#111827">
              {row.employee.name} &mdash; {dayjs(`${month}-01`).format('MMMM YYYY')}
            </Text>
            <Text fz="xs" c="dimmed">
              {row.employee.department ?? ''}{row.employee.designation ? ` · ${row.employee.designation}` : ''} &nbsp;|&nbsp;
              Present: {row.presentDays}d &nbsp; Absent: {row.absentDays}d &nbsp; Late: {row.lateDays}d &nbsp; Early Leave: {row.earlyLeaveDays}d
            </Text>
          </div>
          <Group gap={10}>
            {legend.map(l => (
              <Group key={l.key} gap={3}>
                <div style={{ width: 9, height: 9, borderRadius: 2, background: l.color }} />
                <Text fz={10} c="dimmed">{l.label}</Text>
              </Group>
            ))}
          </Group>
        </Group>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 560 }}>
          {/* Day-of-week headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
            {DAY_NAMES.map((name, i) => (
              <div
                key={name}
                style={{
                  textAlign:    'center',
                  padding:      '4px 0',
                  borderRadius: 4,
                  background:   holidays.includes(i) ? '#fef2f2' : '#f1f5f9',
                  fontWeight:   700,
                  fontSize:     12,
                  color:        holidays.includes(i) ? '#dc2626' : '#374151',
                }}
              >
                {name}
                {holidays.includes(i) && (
                  <Text fz={9} c="red.5" fw={400}>holiday</Text>
                )}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
            {cells.map((dayNum, i) => {
              if (dayNum === null) {
                return <div key={`empty-${i}`} style={{ minHeight: 64 }} />;
              }

              const dateStr = `${year}-${String(mon).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
              const day     = dayMap[dateStr];
              const status  = day?.status ?? 'future';
              const cfg     = STATUS[status] ?? STATUS.future;

              return (
                <Tooltip
                  key={dateStr}
                  disabled={status === 'future' || status === 'holiday'}
                  label={
                    <Stack gap={2} p={2}>
                      <Text fz="xs" fw={700}>{dayjs(dateStr).format('ddd, MMM D')}</Text>
                      <Text fz="xs">Status: {cfg.label}</Text>
                      {day?.firstPunch && <Text fz="xs">In:  {dayjs(day.firstPunch).format('hh:mm A')}</Text>}
                      {day?.lastPunch  && <Text fz="xs">Out: {dayjs(day.lastPunch).format('hh:mm A')}</Text>}
                      {day?.durationMins != null && <Text fz="xs">Hrs: {formatDuration(day.durationMins)}</Text>}
                      {(day?.delayMins ?? 0) > 0 && <Text fz="xs" c="orange">Late: +{day!.delayMins}m</Text>}
                      {(day?.earlyLeaveMins ?? 0) > 0 && <Text fz="xs" c="yellow.6">Early: -{day!.earlyLeaveMins}m</Text>}
                    </Stack>
                  }
                  position="top"
                  withArrow
                >
                  <div
                    style={{
                      background:   cfg.bg,
                      border:       `1px solid ${cfg.dot}44`,
                      borderRadius: 6,
                      padding:      '6px 4px',
                      minHeight:    64,
                      textAlign:    'center',
                      cursor:       status === 'future' || status === 'holiday' ? 'default' : 'pointer',
                      opacity:      status === 'future' ? 0.4 : 1,
                      position:     'relative',
                    }}
                  >
                    {/* Date number */}
                    <Text fz="sm" fw={700} c={cfg.text}>{dayNum}</Text>

                    {/* Status dot */}
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: cfg.dot,
                      margin: '2px auto',
                    }} />

                    {/* Status label */}
                    <Text fz={9} fw={600} c={cfg.text} tt="uppercase" style={{ letterSpacing: '0.02em' }}>
                      {cfg.label}
                    </Text>

                    {/* Check-in time */}
                    {day?.firstPunch && status !== 'holiday' && (
                      <Text fz={9} c={cfg.text} style={{ opacity: 0.85 }}>
                        {dayjs(day.firstPunch).format('HH:mm')}
                      </Text>
                    )}

                    {/* Holiday stripe overlay */}
                    {status === 'holiday' && (
                      <div style={{
                        position:        'absolute', inset: 0, borderRadius: 6, pointerEvents: 'none',
                        backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(148,163,184,0.2) 4px, rgba(148,163,184,0.2) 8px)',
                      }} />
                    )}
                  </div>
                </Tooltip>
              );
            })}
          </div>
        </div>
      </div>
      </div>{/* end calRef capture area */}
    </Box>
  );
}

function minsToTime(mins: number) {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}
