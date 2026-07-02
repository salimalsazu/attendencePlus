'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  ActionIcon,
  Avatar,
  Badge,
  Box,
  Button,
  Divider,
  Group,
  Modal,
  Pagination,
  Paper,
  Select,
  SimpleGrid,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import {
  IconCheck,
  IconCpu,
  IconDevices,
  IconEdit,
  IconRefresh,
  IconSearch,
  IconUser,
  IconUserCheck,
  IconUserOff,
  IconUsers,
} from '@tabler/icons-react';
import dayjs from 'dayjs';
import { api } from '@/lib/api';
import { avatarColor, getInitials } from '@/lib/utils';
import type { Employee } from '@/lib/types';


export default function EmployeesPage() {
  const [employees,  setEmployees]  = useState<Employee[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [syncing,    setSyncing]    = useState(false);
  const [search,     setSearch]     = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [page,       setPage]       = useState(1);
  const [pageSize,   setPageSize]   = useState(20);
  const [editTarget, setEditTarget] = useState<Employee | null>(null);
  const [saving,     setSaving]     = useState(false);
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null);

  const form = useForm({
    initialValues: { name: '', department: '', designation: '', role: '' },
    validate: { name: v => (v.trim() ? null : 'Name is required') },
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setEmployees(await api.employees());
    } catch {
      /* swallow — connection error shown via notification elsewhere */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openEdit = (emp: Employee) => {
    setEditTarget(emp);
    form.setValues({
      name:        emp.name,
      department:  emp.department  ?? '',
      designation: emp.designation ?? '',
      role:        emp.role        ?? '',
    });
  };

  const save = async (values: typeof form.values) => {
    if (!editTarget) return;
    setSaving(true);
    try {
      const updated = await api.updateEmployee(editTarget.deviceUserId, {
        name:        values.name.trim(),
        department:  values.department.trim()  || undefined,
        designation: values.designation.trim() || undefined,
        role:        values.role.trim()        || undefined,
      });
      setEmployees(prev => prev.map(e => e.deviceUserId === updated.deviceUserId ? updated : e));
      notifications.show({ message: 'Employee updated successfully', color: 'green', icon: <IconCheck size={16} /> });
      setEditTarget(null);
    } catch (err) {
      notifications.show({ message: String(err), color: 'red' });
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (emp: Employee) => {
    const nextStatus = emp.status === 'active' ? 'inactive' : 'active';
    setStatusBusyId(emp.deviceUserId);
    try {
      const updated = await api.updateEmployeeStatus(emp.deviceUserId, nextStatus);
      setEmployees(prev => prev.map(e => e.deviceUserId === updated.deviceUserId ? updated : e));
      notifications.show({
        message: `${updated.name} marked ${nextStatus === 'active' ? 'active' : 'inactive'}`,
        color: nextStatus === 'active' ? 'green' : 'gray',
        icon: <IconCheck size={16} />,
      });
    } catch (err) {
      notifications.show({ message: String(err), color: 'red' });
    } finally {
      setStatusBusyId(null);
    }
  };

  const triggerSync = async () => {
    setSyncing(true);
    try {
      const r = await api.triggerSync();
      notifications.show({
        title: 'Sync complete',
        message: `${r.recordCount} new record(s) synced from device`,
        color: 'green',
        icon: <IconCheck size={16} />,
      });
      await load();
    } catch (err) {
      notifications.show({ message: String(err), color: 'red' });
    } finally {
      setSyncing(false);
    }
  };

  // Client-side filter + pagination
  const filtered = employees.filter(emp => {
    const q = search.toLowerCase();
    const dq = deptFilter.toLowerCase();
    const matchSearch = !q || emp.name.toLowerCase().includes(q) ||
      emp.deviceUserId.toLowerCase().includes(q) ||
      (emp.department ?? '').toLowerCase().includes(q);
    const matchDept = !dq || (emp.department ?? '').toLowerCase().includes(dq);
    return matchSearch && matchDept;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged      = filtered.slice((page - 1) * pageSize, page * pageSize);

  // Unique departments for stats
  const departments = [...new Set(employees.map(e => e.department).filter(Boolean))];
  const withDept    = employees.filter(e => e.department).length;

  return (
    <Box p="xl">
      {/* Breadcrumb */}
      <Text fz="sm" c="dimmed" mb={4}>
        Dashboard &rsaquo; <Text span c="#2563eb" fw={500}>Employee List</Text>
      </Text>
      <Title order={2} fw={700} c="#111827" mb={4}>Employee List</Title>
      <Text fz="sm" c="dimmed" mb="lg">
        Employee information is synced from your biometric device. Admins can edit department, designation, and role.
      </Text>

      {/* Summary stat cards */}
      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md" mb="xl">
        {[
          {
            label: 'Total Employees',
            value: loading ? null : employees.length,
            icon: <IconUsers size={20} />,
            iconBg: '#eff6ff', iconColor: '#2563eb',
          },
          {
            label: 'Departments',
            value: loading ? null : departments.length,
            icon: <IconDevices size={20} />,
            iconBg: '#f0fdf4', iconColor: '#16a34a',
          },
          {
            label: 'Profile Complete',
            value: loading ? null : `${employees.length > 0 ? Math.round((withDept / employees.length) * 100) : 0}%`,
            icon: <IconUser size={20} />,
            iconBg: '#fff7ed', iconColor: '#ea580c',
          },
          {
            label: 'Pending Info',
            value: loading ? null : employees.length - withDept,
            icon: <IconCpu size={20} />,
            iconBg: '#fdf4ff', iconColor: '#9333ea',
          },
        ].map(c => (
          <Paper key={c.label} withBorder radius="md" p="md">
            <Group justify="space-between" align="center" wrap="nowrap">
              <div>
                <Text fz={11} c="dimmed" fw={500} style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {c.label}
                </Text>
                {c.value === null
                  ? <Skeleton h={24} w={50} mt={4} />
                  : <Text fw={800} fz="xl" c="#111827">{c.value}</Text>}
              </div>
              <div style={{
                background: c.iconBg, color: c.iconColor,
                width: 42, height: 42, borderRadius: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                {c.icon}
              </div>
            </Group>
          </Paper>
        ))}
      </SimpleGrid>

      {/* Toolbar */}
      <Paper withBorder radius="md" p="md" mb="md">
        <Group justify="space-between" wrap="wrap" gap="sm">
          <Group gap="sm">
            <TextInput
              placeholder="Search by name, ID or department..."
              leftSection={<IconSearch size={15} />}
              value={search}
              onChange={e => { setSearch(e.currentTarget.value); setPage(1); }}
              w={280}
            />
            <TextInput
              placeholder="Filter by department..."
              value={deptFilter}
              onChange={e => { setDeptFilter(e.currentTarget.value); setPage(1); }}
              w={180}
            />
          </Group>
          <Button
            leftSection={syncing ? undefined : <IconRefresh size={14} />}
            loading={syncing}
            onClick={triggerSync}
            style={{ background: '#2563eb' }}
          >
            Sync from Device
          </Button>
        </Group>
      </Paper>

      {/* Table */}
      <Paper withBorder radius="md" p={0} mb="md">
        <Table highlightOnHover verticalSpacing="sm" style={{ fontSize: 14 }}>
          <Table.Thead style={{ background: '#1e3a5f' }}>
            <Table.Tr>
              {['#', 'Employee', 'Device User ID', 'Department', 'Designation', 'Role', 'Status', 'Joined', 'Actions']
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
                <Table.Td><Skeleton h={14} w={20} /></Table.Td>
                <Table.Td>
                  <Group gap="sm" wrap="nowrap">
                    <Skeleton circle h={36} w={36} />
                    <Stack gap={4}><Skeleton h={13} w={120} /><Skeleton h={11} w={80} /></Stack>
                  </Group>
                </Table.Td>
                {Array.from({ length: 6 }).map((__, j) => (
                  <Table.Td key={j}><Skeleton h={13} w={80} /></Table.Td>
                ))}
                <Table.Td><Skeleton circle h={28} w={28} /></Table.Td>
              </Table.Tr>
            ))}

            {!loading && paged.map((emp, idx) => (
              <Table.Tr key={emp.id}>
                <Table.Td c="dimmed" fz="sm">{(page - 1) * pageSize + idx + 1}</Table.Td>

                {/* Employee cell */}
                <Table.Td>
                  <Group gap="sm" wrap="nowrap">
                    <Avatar color={avatarColor(emp.name)} radius="xl" size={36}>
                      {getInitials(emp.name)}
                    </Avatar>
                    <div>
                      <Text fz="sm" fw={600} c="#111827">{emp.name}</Text>
                      {emp.designation && (
                        <Text fz="xs" c="dimmed">{emp.designation}</Text>
                      )}
                    </div>
                  </Group>
                </Table.Td>

                {/* Device user ID — read-only from device */}
                <Table.Td>
                  <Group gap={6} wrap="nowrap">
                    <Text fz="sm" c="#2563eb" fw={500} style={{ fontFamily: 'monospace' }}>
                      {emp.deviceUserId}
                    </Text>
                    <Tooltip label="Synced from device" withArrow>
                      <Badge size="xs" variant="outline" color="gray" style={{ cursor: 'default' }}>
                        device
                      </Badge>
                    </Tooltip>
                  </Group>
                </Table.Td>

                <Table.Td>
                  {emp.department
                    ? <Badge variant="light" color="blue" size="sm">{emp.department}</Badge>
                    : <Text fz="sm" c="dimmed">—</Text>}
                </Table.Td>

                <Table.Td fz="sm" c={emp.designation ? '#374151' : 'dimmed'}>
                  {emp.designation ?? '—'}
                </Table.Td>

                <Table.Td>
                  {emp.role
                    ? <Badge variant="outline" color="gray" size="sm">{emp.role}</Badge>
                    : <Text fz="sm" c="dimmed">—</Text>}
                </Table.Td>

                <Table.Td>
                  <Badge
                    variant="light"
                    color={emp.status === 'active' ? 'green' : 'gray'}
                    size="sm"
                  >
                    {emp.status === 'active' ? 'Active' : 'Inactive'}
                  </Badge>
                </Table.Td>

                <Table.Td fz="sm" c="dimmed">
                  {dayjs(emp.createdAt).format('DD MMM YYYY')}
                </Table.Td>

                <Table.Td>
                  <Group gap={4} wrap="nowrap">
                    <Tooltip label="Edit employee info" withArrow>
                      <ActionIcon variant="subtle" color="blue" size="sm" onClick={() => openEdit(emp)}>
                        <IconEdit size={15} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label={emp.status === 'active' ? 'Deactivate employee' : 'Activate employee'} withArrow>
                      <ActionIcon
                        variant="subtle"
                        color={emp.status === 'active' ? 'red' : 'green'}
                        size="sm"
                        loading={statusBusyId === emp.deviceUserId}
                        onClick={() => toggleStatus(emp)}
                      >
                        {emp.status === 'active' ? <IconUserOff size={15} /> : <IconUserCheck size={15} />}
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}

            {!loading && filtered.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={9} ta="center" py="xl" c="dimmed">
                  {employees.length === 0
                    ? 'No employees yet. Click "Sync from Device" to import employees.'
                    : 'No employees match the current filter.'}
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>

        {/* Pagination */}
        <Group justify="space-between" px="md" py="sm" style={{ borderTop: '1px solid #f1f5f9' }} wrap="wrap" gap="sm">
          <Text fz="sm" c="dimmed">
            Showing {Math.min((page - 1) * pageSize + 1, Math.max(1, filtered.length))}–{Math.min(page * pageSize, filtered.length)} of {filtered.length}
          </Text>
          <Group gap="sm">
            <Group gap={6} align="center">
              <Text fz="sm" c="dimmed">Rows:</Text>
              <Select
                data={['20', '50', '100']}
                value={String(pageSize)}
                onChange={v => { setPageSize(parseInt(v ?? '20')); setPage(1); }}
                size="xs"
                w={70}
                allowDeselect={false}
              />
            </Group>
            <Pagination value={page} onChange={setPage} total={totalPages} size="sm" siblings={1} />
          </Group>
        </Group>
      </Paper>

      {/* Edit modal */}
      <Modal
        opened={!!editTarget}
        onClose={() => setEditTarget(null)}
        title={
          editTarget ? (
            <Group gap="sm">
              <Avatar color={avatarColor(editTarget.name)} size={36} radius="md">
                {getInitials(editTarget.name)}
              </Avatar>
              <div>
                <Text fw={700} fz="sm">{editTarget.name}</Text>
                <Text fz="xs" c="dimmed">Device ID: {editTarget.deviceUserId}</Text>
              </div>
            </Group>
          ) : 'Edit Employee'
        }
        size="md"
        radius="md"
      >
        {editTarget && (
          <form onSubmit={form.onSubmit(save)}>
            <Stack gap="md">
              {/* Read-only device info */}
              <Paper withBorder radius="sm" p="sm" style={{ background: '#f8fafc' }}>
                <Text fz="xs" fw={600} c="dimmed" mb={6} style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  From Device (read-only)
                </Text>
                <SimpleGrid cols={2} spacing="sm">
                  <div>
                    <Text fz="xs" c="dimmed">Device User ID</Text>
                    <Text fz="sm" fw={600} style={{ fontFamily: 'monospace' }}>{editTarget.deviceUserId}</Text>
                  </div>
                  <div>
                    <Text fz="xs" c="dimmed">Added</Text>
                    <Text fz="sm" fw={500}>{dayjs(editTarget.createdAt).format('DD MMM YYYY')}</Text>
                  </div>
                </SimpleGrid>
              </Paper>

              <Divider label="Editable Information" labelPosition="left" />

              <TextInput
                label="Full Name"
                description="Name as it appears in reports"
                {...form.getInputProps('name')}
              />

              <SimpleGrid cols={2} spacing="sm">
                <TextInput
                  label="Department"
                  placeholder="e.g. Engineering, HR, Finance"
                  {...form.getInputProps('department')}
                />
                <TextInput
                  label="Designation"
                  placeholder="e.g. Senior Developer"
                  {...form.getInputProps('designation')}
                />
              </SimpleGrid>

              <TextInput
                label="Role"
                placeholder="e.g. Manager, Staff, Admin"
                {...form.getInputProps('role')}
              />

              <Group justify="flex-end" mt="xs" gap="sm">
                <Button variant="default" onClick={() => setEditTarget(null)}>Cancel</Button>
                <Button type="submit" loading={saving} style={{ background: '#2563eb' }}>
                  Save Changes
                </Button>
              </Group>
            </Stack>
          </form>
        )}
      </Modal>
    </Box>
  );
}
