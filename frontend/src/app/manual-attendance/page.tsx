'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Divider,
  Grid,
  Group,
  Paper,
  Select,
  Skeleton,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  ThemeIcon,
  Title,
  Tooltip,
} from '@mantine/core';
import { DatePickerInput, TimeInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import {
  IconAlertCircle,
  IconArrowBarToLeft,
  IconArrowRight,
  IconCheck,
  IconInfoCircle,
  IconPencilPlus,
  IconSearch,
  IconTrash,
} from '@tabler/icons-react';
import dayjs from 'dayjs';
import { api } from '@/lib/api';
import { avatarColor, getInitials, punchType } from '@/lib/utils';
import type { AttendanceRecord, Employee } from '@/lib/types';

const PUNCH_TYPE_OPTIONS = [
  { value: '0', label: 'Check-In' },
  { value: '1', label: 'Check-Out' },
  { value: '2', label: 'Break Out' },
  { value: '3', label: 'Break In' },
  { value: '4', label: 'OT In' },
  { value: '5', label: 'OT Out' },
  { value: '6', label: 'Leave' },
];

export default function ManualAttendancePage() {
  const [employees,    setEmployees]    = useState<Employee[]>([]);
  const [empLoading,   setEmpLoading]   = useState(true);
  const [manualLogs,   setManualLogs]   = useState<AttendanceRecord[]>([]);
  const [logsLoading,  setLogsLoading]  = useState(true);
  const [submitting,   setSubmitting]   = useState(false);
  const [empSearch,    setEmpSearch]    = useState('');
  const [selectedEmp,  setSelectedEmp]  = useState<Employee | null>(null);
  const [date,         setDate]         = useState<Date | null>(new Date());
  const [time,         setTime]         = useState(dayjs().format('HH:mm'));
  const [punchTypeVal, setPunchTypeVal] = useState('0');
  const [note,         setNote]         = useState('');

  const loadEmployees = useCallback(async () => {
    setEmpLoading(true);
    try { setEmployees(await api.employees()); } catch { /* */ }
    finally { setEmpLoading(false); }
  }, []);

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const res = await api.manualEntries({ limit: '20' });
      setManualLogs(res.records);
    } catch { /* */ }
    finally { setLogsLoading(false); }
  }, []);

  useEffect(() => { loadEmployees(); loadLogs(); }, [loadEmployees, loadLogs]);

  // Filter employees for autocomplete
  const filteredEmps = employees.filter(e => {
    const q = empSearch.toLowerCase();
    return !q ||
      e.name.toLowerCase().includes(q) ||
      e.deviceUserId.toLowerCase().includes(q) ||
      (e.department ?? '').toLowerCase().includes(q);
  }).slice(0, 8);

  const submit = async () => {
    if (!selectedEmp) {
      notifications.show({ message: 'Please select an employee', color: 'red' }); return;
    }
    if (!date) {
      notifications.show({ message: 'Please select a date', color: 'red' }); return;
    }
    if (!time) {
      notifications.show({ message: 'Please enter a time', color: 'red' }); return;
    }

    const isLeave = punchTypeVal === '6';

    setSubmitting(true);
    try {
      await api.createManualPunch({
        deviceUserId: selectedEmp.deviceUserId,
        date:         dayjs(date).format('YYYY-MM-DD'),
        time:         time.length === 5 ? `${time}:00` : time,
        punchType:    parseInt(punchTypeVal),
        note:         note.trim() || (isLeave ? 'Leave' : undefined),
      });
      notifications.show({
        title: isLeave ? 'Marked on leave' : 'Punch recorded',
        message: isLeave
          ? `${selectedEmp.name} — marked on leave for ${dayjs(date).format('DD MMM YYYY')}`
          : `${selectedEmp.name} — ${PUNCH_TYPE_OPTIONS.find(o => o.value === punchTypeVal)?.label} at ${time}`,
        color: 'green',
        icon: <IconCheck size={16} />,
      });
      // Reset form
      setSelectedEmp(null);
      setEmpSearch('');
      setDate(new Date());
      setTime(dayjs().format('HH:mm'));
      setPunchTypeVal('0');
      setNote('');
      await loadLogs();
    } catch (err) {
      notifications.show({ message: String(err), color: 'red' });
    } finally {
      setSubmitting(false);
    }
  };

  const deleteEntry = async (id: number) => {
    if (!confirm('Delete this manual entry?')) return;
    try {
      await api.deleteManualEntry(id);
      notifications.show({ message: 'Entry deleted', color: 'orange' });
      setManualLogs(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      notifications.show({ message: String(err), color: 'red' });
    }
  };

  return (
    <Box p="xl">
      {/* Breadcrumb */}
      <Text fz="sm" c="dimmed" mb={4}>
        Dashboard &rsaquo; <Text span c="#2563eb" fw={500}>Manual Attendance</Text>
      </Text>
      <Title order={2} fw={700} c="#111827" mb={4}>Manual Attendance Entry</Title>
      <Text fz="sm" c="dimmed" mb="lg">
        Use this form to record attendance manually when the biometric device is offline or unavailable.
      </Text>

      {/* Info alert */}
      <Alert
        icon={<IconInfoCircle size={16} />}
        color="blue"
        variant="light"
        mb="xl"
        radius="md"
      >
        Manual entries are clearly marked in the system and appear in attendance reports alongside device records.
        Only use this to correct missing or erroneous punch data.
      </Alert>

      <Grid gutter="xl">
        {/* Form */}
        <Grid.Col span={{ base: 12, md: 5 }}>
          <Paper withBorder radius="md" p="lg">
            <Group gap={8} mb="md">
              <ThemeIcon size={36} radius="md" style={{ background: '#eff6ff', color: '#2563eb' }} variant="filled">
                <IconPencilPlus size={18} />
              </ThemeIcon>
              <div>
                <Text fw={700} fz="sm" c="#111827">New Manual Entry</Text>
                <Text fz="xs" c="dimmed">Fill all fields below</Text>
              </div>
            </Group>

            <Divider mb="md" />

            {/* Employee picker */}
            <Stack gap="xs" mb="sm">
              <Text fz="sm" fw={500} c="#374151">Employee <span style={{ color: '#dc2626' }}>*</span></Text>
              <TextInput
                placeholder="Search by name, ID or department..."
                leftSection={<IconSearch size={14} />}
                value={selectedEmp ? `${selectedEmp.name} (${selectedEmp.deviceUserId})` : empSearch}
                onChange={e => {
                  setEmpSearch(e.currentTarget.value);
                  if (selectedEmp) setSelectedEmp(null);
                }}
                onFocus={() => { if (selectedEmp) { setEmpSearch(''); setSelectedEmp(null); } }}
              />

              {/* Dropdown suggestions */}
              {!selectedEmp && empSearch && (
                <Paper withBorder radius="sm" p={0} style={{ overflow: 'hidden' }}>
                  {empLoading ? (
                    <Box p="xs"><Skeleton h={14} /></Box>
                  ) : filteredEmps.length === 0 ? (
                    <Text fz="sm" c="dimmed" p="sm">No employees found</Text>
                  ) : (
                    filteredEmps.map(emp => (
                      <Box
                        key={emp.id}
                        p="sm"
                        style={{
                          cursor: 'pointer',
                          borderBottom: '1px solid #f1f5f9',
                          transition: 'background 0.1s',
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f0f9ff'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                        onClick={() => { setSelectedEmp(emp); setEmpSearch(''); }}
                      >
                        <Group gap="sm" wrap="nowrap">
                          <div
                            style={{
                              width: 32, height: 32, borderRadius: '50%',
                              background: `var(--mantine-color-${avatarColor(emp.name)}-1)`,
                              color: `var(--mantine-color-${avatarColor(emp.name)}-7)`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontWeight: 700, fontSize: 12, flexShrink: 0,
                            }}
                          >
                            {getInitials(emp.name)}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <Text fz="sm" fw={600} c="#111827" truncate>{emp.name}</Text>
                            <Text fz="xs" c="dimmed">
                              {emp.deviceUserId} {emp.department ? `· ${emp.department}` : ''}
                            </Text>
                          </div>
                        </Group>
                      </Box>
                    ))
                  )}
                </Paper>
              )}

              {/* Selected employee chip */}
              {selectedEmp && (
                <Paper withBorder radius="sm" p="sm" style={{ background: '#f0f9ff', borderColor: '#93c5fd' }}>
                  <Group justify="space-between" wrap="nowrap">
                    <Group gap="sm" wrap="nowrap">
                      <div
                        style={{
                          width: 36, height: 36, borderRadius: '50%',
                          background: `var(--mantine-color-${avatarColor(selectedEmp.name)}-1)`,
                          color: `var(--mantine-color-${avatarColor(selectedEmp.name)}-7)`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontWeight: 700, fontSize: 13, flexShrink: 0,
                        }}
                      >
                        {getInitials(selectedEmp.name)}
                      </div>
                      <div>
                        <Text fz="sm" fw={700} c="#111827">{selectedEmp.name}</Text>
                        <Text fz="xs" c="dimmed">
                          ID: {selectedEmp.deviceUserId}
                          {selectedEmp.department ? ` · ${selectedEmp.department}` : ''}
                        </Text>
                      </div>
                    </Group>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      size="sm"
                      onClick={() => { setSelectedEmp(null); setEmpSearch(''); }}
                    >
                      ✕
                    </ActionIcon>
                  </Group>
                </Paper>
              )}
            </Stack>

            <Grid gutter="sm" mb="sm">
              <Grid.Col span={7}>
                <DatePickerInput
                  label={<Text fz="sm" fw={500} c="#374151">Date <span style={{ color: '#dc2626' }}>*</span></Text>}
                  value={date}
                  onChange={setDate}
                  maxDate={new Date()}
                  clearable={false}
                />
              </Grid.Col>
              <Grid.Col span={5}>
                <TimeInput
                  label={<Text fz="sm" fw={500} c="#374151">Time <span style={{ color: '#dc2626' }}>*</span></Text>}
                  value={time}
                  onChange={e => setTime(e.currentTarget.value)}
                />
              </Grid.Col>
            </Grid>

            <Select
              label={<Text fz="sm" fw={500} c="#374151">Punch Type <span style={{ color: '#dc2626' }}>*</span></Text>}
              data={PUNCH_TYPE_OPTIONS}
              value={punchTypeVal}
              onChange={v => setPunchTypeVal(v ?? '0')}
              mb="sm"
            />

            <Textarea
              label={punchTypeVal === '6' ? 'Leave reason (optional)' : 'Note (optional)'}
              placeholder={
                punchTypeVal === '6'
                  ? "e.g. 'Sick leave', 'Casual leave — approved'"
                  : "Reason for manual entry, e.g. 'Device was offline — employee confirmed present'"
              }
              value={note}
              onChange={e => setNote(e.currentTarget.value)}
              rows={3}
              mb="lg"
            />

            <Button
              fullWidth
              size="md"
              leftSection={<IconPencilPlus size={16} />}
              onClick={submit}
              loading={submitting}
              style={{ background: '#2563eb' }}
            >
              {punchTypeVal === '6' ? 'Mark as Leave' : 'Record Attendance'}
            </Button>
          </Paper>
        </Grid.Col>

        {/* Recent manual entries */}
        <Grid.Col span={{ base: 12, md: 7 }}>
          <Paper withBorder radius="md" p={0} style={{ overflow: 'hidden' }}>
            <Group px="lg" py="md" style={{ borderBottom: '1px solid #f1f5f9' }}>
              <Text fw={700} fz="sm" c="#111827">Recent Manual Entries</Text>
              <Badge variant="light" color="orange" size="sm" ml="auto">Manual only</Badge>
            </Group>

            <Table highlightOnHover verticalSpacing="sm" style={{ fontSize: 14 }}>
              <Table.Thead style={{ background: '#1e3a5f' }}>
                <Table.Tr>
                  {['Employee', 'Date & Time', 'Type', 'Note', 'Action'].map(h => (
                    <Table.Th key={h} style={{ color: '#fff', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</Table.Th>
                  ))}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {logsLoading && Array.from({ length: 5 }).map((_, i) => (
                  <Table.Tr key={i}>
                    {Array.from({ length: 5 }).map((__, j) => (
                      <Table.Td key={j}><Skeleton h={13} w={j === 0 ? 120 : 80} /></Table.Td>
                    ))}
                  </Table.Tr>
                ))}

                {!logsLoading && manualLogs.map(r => {
                  const pt    = punchType(r.punchType);
                  const isIn  = r.punchType === 0 || r.punchType === 3 || r.punchType === 4;
                  const emp   = r.employee;
                  return (
                    <Table.Tr key={r.id}>
                      <Table.Td>
                        <div>
                          <Text fz="sm" fw={600} c="#111827">{emp?.name ?? r.deviceUserId}</Text>
                          {emp?.department && (
                            <Text fz="xs" c="dimmed">{emp.department}</Text>
                          )}
                        </div>
                      </Table.Td>
                      <Table.Td>
                        <Text fz="sm" fw={500} c="#374151">
                          {dayjs(r.punchTime).format('DD MMM YYYY')}
                        </Text>
                        <Text fz="xs" c="dimmed">{dayjs(r.punchTime).format('hh:mm A')}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Group gap={5}>
                          {r.punchType !== 6 && (isIn
                            ? <IconArrowRight size={12} color="#16a34a" />
                            : <IconArrowBarToLeft size={12} color="#dc2626" />)}
                          <Badge size="xs" variant="light" color={pt.color}>{pt.label}</Badge>
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Text fz="xs" c="dimmed" style={{ maxWidth: 160 }} lineClamp={1}>
                          {r.note ?? '—'}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Tooltip label="Delete entry" withArrow>
                          <ActionIcon
                            variant="subtle"
                            color="red"
                            size="sm"
                            onClick={() => deleteEntry(r.id)}
                          >
                            <IconTrash size={13} />
                          </ActionIcon>
                        </Tooltip>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}

                {!logsLoading && manualLogs.length === 0 && (
                  <Table.Tr>
                    <Table.Td colSpan={5} ta="center" py="xl" c="dimmed">
                      No manual entries yet.
                    </Table.Td>
                  </Table.Tr>
                )}
              </Table.Tbody>
            </Table>
          </Paper>
        </Grid.Col>
      </Grid>
    </Box>
  );
}
