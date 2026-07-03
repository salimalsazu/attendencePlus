'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Checkbox,
  Group,
  Pagination,
  Paper,
  Select,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
  Timeline,
  Title,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import {
  IconArrowBarToLeft,
  IconArrowRight,
  IconDownload,
  IconEye,
  IconFilter,
  IconRefresh,
  IconSearch,
  IconX,
} from '@tabler/icons-react';
import dayjs from 'dayjs';
import { api } from '@/lib/api';
import { formatDuration, punchType } from '@/lib/utils';
import type { AttendanceRecord, AttendanceReport, ReportRow } from '@/lib/types';

const STATUS_OPTIONS = [
  { value: 'all',         label: 'All Status' },
  { value: 'present',     label: 'Present' },
  { value: 'late',        label: 'Late' },
  { value: 'early_leave', label: 'Early Leave' },
  { value: 'absent',      label: 'Absent' },
  { value: 'on_leave',    label: 'On Leave' },
];

interface Filters {
  date: Date | null;
  dept: string;
  desig: string;
  status: string;
  search: string;
}

export default function AttendanceReportPage() {
  const [filters, setFilters] = useState<Filters>({
    date:   new Date(),
    dept:   '',
    desig:  '',
    status: 'all',
    search: '',
  });
  const [page,        setPage]        = useState(1);
  const [limit,       setLimit]       = useState(20);
  const [loading,     setLoading]     = useState(true);
  const [report,      setReport]      = useState<AttendanceReport | null>(null);
  const [expandedId,  setExpandedId]  = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchReport = useCallback(async (f: Filters, pg: number, lim: number) => {
    setLoading(true);
    setSelectedIds(new Set()); // clear selection on any reload
    try {
      const params: Record<string, string> = {
        date:  dayjs(f.date ?? new Date()).format('YYYY-MM-DD'),
        page:  String(pg),
        limit: String(lim),
      };
      if (f.dept.trim())      params.department  = f.dept.trim();
      if (f.desig.trim())     params.designation = f.desig.trim();
      if (f.status !== 'all') params.status      = f.status;
      if (f.search.trim())    params.search      = f.search.trim();

      setReport(await api.attendanceReport(params));
    } catch (err) {
      notifications.show({ message: String(err), color: 'red' });
    } finally {
      setLoading(false);
    }
  }, []);

  const setInstant = (patch: Partial<Filters>) => {
    const next = { ...filters, ...patch };
    setFilters(next);
    setPage(1);
    fetchReport(next, 1, limit);
  };

  const setDebounced = (patch: Partial<Filters>) => {
    const next = { ...filters, ...patch };
    setFilters(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      fetchReport(next, 1, limit);
    }, 400);
  };

  useEffect(() => { fetchReport(filters, 1, limit); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const resetFilters = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const fresh: Filters = { date: new Date(), dept: '', desig: '', status: 'all', search: '' };
    setFilters(fresh);
    setPage(1);
    fetchReport(fresh, 1, limit);
  };

  const changePage  = (pg: number)        => { setPage(pg); fetchReport(filters, pg, limit); };
  const changeLimit = (val: string | null) => {
    const lim = parseInt(val ?? '20');
    setLimit(lim); setPage(1); fetchReport(filters, 1, lim);
  };

  /* ── Selection helpers ── */
  const visibleIds  = report?.rows.map(r => r.employee.deviceUserId) ?? [];
  const allChecked  = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id));
  const someChecked = visibleIds.some(id => selectedIds.has(id)) && !allChecked;

  const toggleRow = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allChecked) {
      // deselect all visible
      setSelectedIds(prev => {
        const next = new Set(prev);
        visibleIds.forEach(id => next.delete(id));
        return next;
      });
    } else {
      // select all visible
      setSelectedIds(prev => {
        const next = new Set(prev);
        visibleIds.forEach(id => next.add(id));
        return next;
      });
    }
  };

  /* ── PDF export ── */
  const exportPDF = async () => {
    if (!report || report.rows.length === 0) return;

    // Export only selected rows; if nothing selected, export all visible
    const rowsToExport = selectedIds.size > 0
      ? report.rows.filter(r => selectedIds.has(r.employee.deviceUserId))
      : report.rows;

    try {
      const { default: jsPDF }     = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');

      const doc     = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const dateStr = dayjs(filters.date ?? new Date()).format('MMMM D, YYYY');

      doc.setFontSize(16);
      doc.setTextColor(15, 22, 41);
      doc.text('AttendTrack Pro — Attendance Report', 14, 18);
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Date: ${dateStr}`, 14, 25);
      doc.text(`Generated: ${dayjs().format('YYYY-MM-DD HH:mm')}`, 14, 30);
      if (selectedIds.size > 0) {
        doc.setTextColor(37, 99, 235);
        doc.text(`Exporting ${rowsToExport.length} selected employee(s)`, 14, 35);
      } else {
        const s = report.summary;
        doc.text(
          `Present: ${s.totalPresent}  |  Late: ${s.totalLate}  |  Early Leave: ${s.totalEarlyLeave}  |  Absent: ${s.totalAbsent}`,
          14, 35,
        );
      }

      autoTable(doc, {
        startY: 41,
        head: [['#', 'User ID', 'Employee Name', 'Designation', 'Department',
                'Check-In', 'Check-Out', 'Working Hrs', 'Status', 'Note', 'Delay']],
        body: rowsToExport.map((r, i) => [
          i + 1,
          `EMP-${r.employee.deviceUserId.padStart(4, '0')}`,
          r.employee.name,
          r.employee.designation ?? '—',
          r.employee.department  ?? '—',
          r.firstPunch ? dayjs(r.firstPunch).format('hh:mm A') : '—',
          r.lastPunch  ? dayjs(r.lastPunch).format('hh:mm A')  : '—',
          r.durationMins !== null ? formatDuration(r.durationMins) : '—',
          statusLabel(r.status),
          r.note ?? '—',
          r.delayMins > 0 ? `+${r.delayMins} min` : '—',
        ]),
        styles:             { fontSize: 8, cellPadding: 2 },
        headStyles:         { fillColor: [30, 58, 95], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { cellWidth: 8 },
          1: { cellWidth: 22 },
          7: { cellWidth: 22 },
          8: { cellWidth: 22 },
          9: { cellWidth: 30 },
          10: { cellWidth: 22 },
        },
      });

      doc.save(`attendance-${dayjs(filters.date ?? new Date()).format('YYYY-MM-DD')}.pdf`);
    } catch (err) {
      notifications.show({ message: `PDF export failed: ${err}`, color: 'red' });
    }
  };

  const totalPages = report ? Math.max(1, Math.ceil(report.total / limit)) : 1;
  const s = report?.summary;

  return (
    <Box p="xl">
      <Text fz="sm" c="dimmed" mb={4}>
        Dashboard &rsaquo; <Text span c="#2563eb" fw={500}>User Attendance Report</Text>
      </Text>
      <Title order={2} fw={700} c="#111827" mb={4}>User Attendance Report</Title>
      <Text fz="sm" c="dimmed" mb="lg">Detailed attendance records for all employees</Text>

      {/* Filters */}
      <Paper withBorder radius="md" p="md" mb="md">
        <Group gap="sm" wrap="wrap">
          <TextInput
            placeholder="Search by Name, ID or Department..."
            leftSection={<IconSearch size={15} />}
            value={filters.search}
            onChange={e => setDebounced({ search: e.currentTarget.value })}
            w={260}
          />
          <TextInput
            placeholder="Department"
            leftSection={<IconFilter size={15} />}
            value={filters.dept}
            onChange={e => setDebounced({ dept: e.currentTarget.value })}
            w={160}
          />
          <TextInput
            placeholder="Designation"
            leftSection={<IconFilter size={15} />}
            value={filters.desig}
            onChange={e => setDebounced({ desig: e.currentTarget.value })}
            w={160}
          />
          <DatePickerInput
            value={filters.date}
            onChange={d => setInstant({ date: d })}
            maxDate={new Date()}
            clearable={false}
            w={160}
            leftSection={<IconSearch size={15} />}
          />
        </Group>
        <Group gap="sm" mt="sm">
          <Select
            data={STATUS_OPTIONS}
            value={filters.status}
            onChange={v => setInstant({ status: v ?? 'all' })}
            w={155}
            allowDeselect={false}
          />
          <Button variant="default" leftSection={<IconX size={14} />} onClick={resetFilters}>
            Reset
          </Button>

          {/* Selection info + export */}
          <Group gap="xs" ml="auto">
            {selectedIds.size > 0 && (
              <>
                <Badge color="blue" variant="light" size="lg">
                  {selectedIds.size} selected
                </Badge>
                <Button
                  variant="subtle"
                  color="gray"
                  size="sm"
                  onClick={() => setSelectedIds(new Set())}
                >
                  Clear
                </Button>
              </>
            )}
            <Button
              variant="filled"
              color="red"
              leftSection={<IconDownload size={15} />}
              onClick={exportPDF}
              disabled={!report || report.rows.length === 0}
            >
              {selectedIds.size > 0 ? `Export ${selectedIds.size} Row(s)` : 'Export PDF'}
            </Button>
          </Group>
        </Group>
      </Paper>

      {/* Table */}
      <Paper withBorder radius="md" p={0} mb="md">
        <Table highlightOnHover verticalSpacing="sm" style={{ fontSize: 14 }}>
          <Table.Thead style={{ background: '#1e3a5f' }}>
            <Table.Tr>
              {/* Select-all checkbox */}
              <Table.Th style={{ width: 40 }}>
                <Checkbox
                  checked={allChecked}
                  indeterminate={someChecked}
                  onChange={toggleAll}
                  styles={{ input: { cursor: 'pointer' } }}
                />
              </Table.Th>
              {['#', 'User ID', 'Employee Name', 'Designation', 'Department',
                'First Check-In', 'Last Check-Out', 'Working Hrs', 'Status', 'Note', 'Delay', 'Actions']
                .map(h => (
                  <Table.Th key={h} style={{ color: '#fff', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {h}
                  </Table.Th>
                ))}
            </Table.Tr>
          </Table.Thead>

          <Table.Tbody>
            {loading && Array.from({ length: 8 }).map((_, i) => (
              <Table.Tr key={i}>
                {Array.from({ length: 13 }).map((__, j) => (
                  <Table.Td key={j}><Skeleton h={14} w={j === 0 ? 20 : 80} /></Table.Td>
                ))}
              </Table.Tr>
            ))}

            {!loading && report?.rows.map((row, idx) => {
              const isChecked = selectedIds.has(row.employee.deviceUserId);
              return (
                <React.Fragment key={row.employee.deviceUserId}>
                  <Table.Tr
                    style={{
                      background: isChecked
                        ? '#eff6ff'
                        : expandedId === row.employee.deviceUserId
                          ? '#f0f9ff'
                          : undefined,
                      outline: isChecked ? '1px solid #bfdbfe' : undefined,
                    }}
                  >
                    <Table.Td>
                      <Checkbox
                        checked={isChecked}
                        onChange={() => toggleRow(row.employee.deviceUserId)}
                        styles={{ input: { cursor: 'pointer' } }}
                      />
                    </Table.Td>
                    <Table.Td c="dimmed" fz="sm">{(page - 1) * limit + idx + 1}</Table.Td>
                    <Table.Td>
                      <Text fz="sm" c="#2563eb" fw={500} style={{ fontFamily: 'monospace' }}>
                        EMP-{row.employee.deviceUserId.padStart(4, '0')}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text fz="sm" fw={600} c="#111827">{row.employee.name}</Text>
                    </Table.Td>
                    <Table.Td fz="sm" c="#374151">{row.employee.designation ?? '—'}</Table.Td>
                    <Table.Td fz="sm" c="#374151">{row.employee.department ?? '—'}</Table.Td>
                    <Table.Td>
                      {row.firstPunch
                        ? <Text fz="sm" fw={600} c="#374151">{dayjs(row.firstPunch).format('hh:mm A')}</Text>
                        : <Text fz="sm" c="dimmed">—</Text>}
                    </Table.Td>
                    <Table.Td>
                      {row.lastPunch
                        ? <Text fz="sm" fw={600} c="#374151">{dayjs(row.lastPunch).format('hh:mm A')}</Text>
                        : <Text fz="sm" c="dimmed">—</Text>}
                    </Table.Td>
                    <Table.Td>
                      {row.durationMins !== null
                        ? <Text fz="sm" fw={500}>{formatDuration(row.durationMins)}</Text>
                        : <Text fz="sm" c="dimmed">—</Text>}
                    </Table.Td>
                    <Table.Td>
                      <StatusBadge status={row.status} />
                    </Table.Td>
                    <Table.Td>
                      {row.note
                        ? <Text fz="xs" c="dimmed" style={{ maxWidth: 160 }} lineClamp={1}>{row.note}</Text>
                        : <Text fz="sm" c="dimmed">—</Text>}
                    </Table.Td>
                    <Table.Td>
                      {row.delayMins > 0
                        ? <Text fz="sm" fw={600} c="orange">+{row.delayMins} mins</Text>
                        : <Text fz="sm" c="dimmed">—</Text>}
                    </Table.Td>
                    <Table.Td>
                      <ActionIcon
                        variant="subtle"
                        color="blue"
                        size="sm"
                        onClick={() =>
                          setExpandedId(prev =>
                            prev === row.employee.deviceUserId ? null : row.employee.deviceUserId
                          )
                        }
                      >
                        <IconEye size={15} />
                      </ActionIcon>
                    </Table.Td>
                  </Table.Tr>

                  {expandedId === row.employee.deviceUserId && (
                    <Table.Tr>
                      <Table.Td colSpan={13} style={{ background: '#f8fafc', padding: 0 }}>
                        <PunchHistoryPanel row={row} onClose={() => setExpandedId(null)} />
                      </Table.Td>
                    </Table.Tr>
                  )}
                </React.Fragment>
              );
            })}

            {!loading && report?.rows.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={13} ta="center" py="xl" c="dimmed">
                  No records found for the selected filters.
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>

        {report && (
          <Group justify="space-between" px="md" py="sm" style={{ borderTop: '1px solid #f1f5f9' }} wrap="wrap" gap="sm">
            <Text fz="sm" c="dimmed">
              Showing {Math.min((page - 1) * limit + 1, report.total)}–{Math.min(page * limit, report.total)} of{' '}
              {report.total} records
              {selectedIds.size > 0 && (
                <Text span c="blue" fw={600}> · {selectedIds.size} selected</Text>
              )}
            </Text>
            <Group gap="sm">
              <Group gap={6} align="center">
                <Text fz="sm" c="dimmed">Rows:</Text>
                <Select
                  data={['20', '50', '100']}
                  value={String(limit)}
                  onChange={changeLimit}
                  size="xs"
                  w={70}
                  allowDeselect={false}
                />
              </Group>
              <Pagination
                value={page}
                onChange={changePage}
                total={totalPages}
                size="sm"
                siblings={1}
              />
            </Group>
          </Group>
        )}
      </Paper>

      {/* Summary bar */}
      {s && (
        <Paper withBorder radius="md" px="lg" py="sm">
          <Group gap="xl" wrap="wrap">
            <Group gap={6}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#16a34a' }} />
              <Text fz="sm" fw={500}>Total Present: <strong>{s.totalPresent}</strong></Text>
            </Group>
            <Group gap={6}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#dc2626' }} />
              <Text fz="sm" fw={500}>Total Absent: <strong>{s.totalAbsent}</strong></Text>
            </Group>
            <Group gap={6}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#f59e0b' }} />
              <Text fz="sm" fw={500}>Late Arrivals: <strong>{s.totalLate}</strong></Text>
            </Group>
            <Group gap={6}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#eab308' }} />
              <Text fz="sm" fw={500}>Early Leave: <strong>{s.totalEarlyLeave}</strong></Text>
            </Group>
            <Group gap={6}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#8b5cf6' }} />
              <Text fz="sm" fw={500}>On Leave: <strong>{s.totalOnLeave}</strong></Text>
            </Group>
            <Badge variant="light" color="blue" size="lg" leftSection={<IconRefresh size={12} />}>
              Avg Working Hours: {formatDuration(s.avgWorkingMins)}
            </Badge>
          </Group>
        </Paper>
      )}
    </Box>
  );
}

/* ── Status badge ── */
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; label: string }> = {
    present:     { color: 'green',  label: 'Present' },
    late:        { color: 'orange', label: 'Late' },
    early_leave: { color: 'yellow', label: 'Early Leave' },
    absent:      { color: 'red',    label: 'Absent' },
    on_leave:    { color: 'violet', label: 'On Leave' },
  };
  const cfg = map[status] ?? { color: 'gray', label: status };
  return <Badge size="sm" variant="light" color={cfg.color}>{cfg.label}</Badge>;
}

function statusLabel(s: string) {
  const m: Record<string, string> = {
    present: 'Present', late: 'Late', early_leave: 'Early Leave',
    absent: 'Absent', on_leave: 'On Leave',
  };
  return m[s] ?? s;
}

/* ── Punch history inline panel ── */
function PunchHistoryPanel({ row, onClose }: { row: ReportRow; onClose: () => void }) {
  const { employee, punches, firstPunch } = row;

  return (
    <Box p="md" style={{ borderTop: '2px solid #2563eb' }}>
      <Group justify="space-between" mb="sm">
        <div>
          <Text fw={700} fz="sm" c="#111827">
            Punch History — {employee.name} (EMP-{employee.deviceUserId.padStart(4, '0')})
          </Text>
          <Text fz="xs" c="dimmed">
            {firstPunch ? dayjs(firstPunch).format('MMMM D, YYYY') : '—'} ·{' '}
            {employee.department ?? 'No Department'}
          </Text>
        </div>
        <ActionIcon variant="subtle" color="gray" onClick={onClose} size="sm">
          <IconX size={14} />
        </ActionIcon>
      </Group>

      {punches.length === 0 ? (
        <Text c="dimmed" fz="sm">No punch records.</Text>
      ) : (
        <Timeline active={punches.length - 1} bulletSize={24} lineWidth={2}>
          {punches.map(p => {
            const pt = punchType(p.punchType);
            const isNeutral = p.punchType === 6 || p.punchType === 7;
            const isIn = p.punchType === 0 || p.punchType === 3 || p.punchType === 4;
            return (
              <Timeline.Item
                key={p.id}
                color={pt.color}
                bullet={isNeutral ? undefined : (isIn ? <IconArrowRight size={12} /> : <IconArrowBarToLeft size={12} />)}
                title={
                  <Group gap="xs">
                    <Text fw={700} fz="sm">{dayjs(p.punchTime).format('hh:mm A')}</Text>
                    <Badge size="xs" color={isNeutral ? pt.color : (isIn ? 'green' : 'red')} variant="light">
                      {pt.label}
                    </Badge>
                  </Group>
                }
              >
                <Text fz="xs" c="dimmed">Device · {dayjs(p.punchTime).format('MMM D, YYYY')}</Text>
              </Timeline.Item>
            );
          })}
        </Timeline>
      )}
    </Box>
  );
}
