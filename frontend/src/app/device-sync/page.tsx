'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Collapse,
  Group,
  Select,
  Loader,
  Modal,
  Pagination,
  Paper,
  SimpleGrid,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
  ThemeIcon,
  Title,
  Tooltip,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import {
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconDevices,
  IconDownload,
  IconEdit,
  IconPlus,
  IconRefresh,
  IconTrash,
  IconWifi,
  IconWifiOff,
  IconX,
} from '@tabler/icons-react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { api } from '@/lib/api';
import type { Device, DeviceStats, SyncLog } from '@/lib/types';

dayjs.extend(relativeTime);

export default function DeviceSyncPage() {
  const [loading, setLoading]         = useState(true);
  const [devices, setDevices]         = useState<Device[]>([]);
  const [stats, setStats]             = useState<DeviceStats | null>(null);
  const [syncLogs, setSyncLogs]       = useState<SyncLog[]>([]);
  const [page, setPage]               = useState(1);
  const [pageSize, setPageSize]       = useState(20);
  const [search, setSearch]           = useState('');
  const [logOpen, setLogOpen]         = useState(true);
  const [addOpen, setAddOpen]         = useState(false);
  const [editTarget, setEditTarget]   = useState<Device | null>(null);
  const [syncingId, setSyncingId]       = useState<string | null>(null);
  const [savingDevice, setSavingDevice] = useState(false);
  const [fixingTz, setFixingTz]         = useState(false);

  const addForm = useForm({
    initialValues: { deviceId: '', name: '', location: '', branch: '', ipAddress: '' },
    validate: {
      deviceId: v => (v.trim() ? null : 'Device ID is required'),
      name:     v => (v.trim() ? null : 'Name is required'),
    },
  });

  const editForm = useForm({
    initialValues: { name: '', location: '', branch: '', ipAddress: '' },
    validate: { name: v => (v.trim() ? null : 'Name is required') },
  });

  const load = useCallback(async () => {
    setLoading(true);
    const [devRes, logRes] = await Promise.allSettled([
      api.devices(),
      api.syncLogs(),
    ]);
    if (devRes.status === 'fulfilled') {
      setDevices(devRes.value);
      setStats({
        total:   devRes.value.length,
        online:  devRes.value.filter(d => d.status === 'online').length,
        offline: devRes.value.filter(d => d.status === 'offline').length,
        syncing: devRes.value.filter(d => d.status === 'syncing').length,
      });
    }
    if (logRes.status === 'fulfilled') setSyncLogs(logRes.value);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = devices.filter(d =>
    !search || d.deviceId.toLowerCase().includes(search.toLowerCase()) ||
    d.name.toLowerCase().includes(search.toLowerCase())
  );
  const paged     = filtered.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  const syncDevice = async (deviceId: string) => {
    setSyncingId(deviceId);
    try {
      const r = await api.syncDevice(deviceId);
      notifications.show({
        title: 'Sync complete',
        message: `${r.recordCount} record(s) imported`,
        color: 'green',
        icon: <IconCheck size={16} />,
      });
      await load();
    } catch (err) {
      notifications.show({ message: String(err), color: 'red' });
    } finally {
      setSyncingId(null);
    }
  };

  const syncAll = async () => {
    setSyncingId('ALL');
    try {
      const r = await api.triggerSync();
      notifications.show({
        title: 'Sync complete',
        message: `${r.recordCount} record(s) imported`,
        color: 'green',
        icon: <IconCheck size={16} />,
      });
      await load();
    } catch (err) {
      notifications.show({ message: String(err), color: 'red' });
    } finally {
      setSyncingId(null);
    }
  };

  const deleteDevice = async (deviceId: string) => {
    if (!confirm(`Delete device ${deviceId}?`)) return;
    try {
      await api.deleteDevice(deviceId);
      notifications.show({ message: 'Device deleted', color: 'orange' });
      await load();
    } catch (err) {
      notifications.show({ message: String(err), color: 'red' });
    }
  };

  const openEdit = (device: Device) => {
    setEditTarget(device);
    editForm.setValues({
      name:      device.name,
      location:  device.location  ?? '',
      branch:    device.branch    ?? '',
      ipAddress: device.ipAddress ?? '',
    });
  };

  const saveAdd = async (values: typeof addForm.values) => {
    setSavingDevice(true);
    try {
      await api.createDevice({
        deviceId:  values.deviceId.trim(),
        name:      values.name.trim(),
        location:  values.location.trim()  || undefined,
        branch:    values.branch.trim()    || undefined,
        ipAddress: values.ipAddress.trim() || undefined,
      });
      notifications.show({ message: 'Device added', color: 'green', icon: <IconCheck size={16} /> });
      addForm.reset();
      setAddOpen(false);
      await load();
    } catch (err) {
      notifications.show({ message: String(err), color: 'red' });
    } finally {
      setSavingDevice(false);
    }
  };

  const saveEdit = async (values: typeof editForm.values) => {
    if (!editTarget) return;
    setSavingDevice(true);
    try {
      await api.updateDevice(editTarget.deviceId, {
        name:      values.name.trim(),
        location:  values.location.trim()  || undefined,
        branch:    values.branch.trim()    || undefined,
        ipAddress: values.ipAddress.trim() || undefined,
      });
      notifications.show({ message: 'Device updated', color: 'green', icon: <IconCheck size={16} /> });
      setEditTarget(null);
      await load();
    } catch (err) {
      notifications.show({ message: String(err), color: 'red' });
    } finally {
      setSavingDevice(false);
    }
  };

  const fixTzDuplicates = async () => {
    if (!confirm('This will delete old duplicate records that have incorrect +6h timestamps. Continue?')) return;
    setFixingTz(true);
    try {
      const r = await api.fixTzDuplicates();
      notifications.show({
        title: 'Cleanup complete',
        message: `${r.shifted} record(s) corrected, ${r.deleted} duplicate(s) removed`,
        color: 'teal',
        icon: <IconCheck size={16} />,
      });
    } catch (err) {
      notifications.show({ message: String(err), color: 'red' });
    } finally {
      setFixingTz(false);
    }
  };

  const exportCSV = () => {
    const headers = 'Device ID,Name,Location,Branch,IP Address,Status,Battery,Last Sync,Records\n';
    const rows = devices.map(d =>
      [d.deviceId, d.name, d.location ?? '', d.branch ?? '', d.ipAddress ?? '',
       d.status, d.batteryHealth ?? '', d.lastSyncTime ? dayjs(d.lastSyncTime).format('YYYY-MM-DD HH:mm') : '',
       d.recordsSynced].join(',')
    ).join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'devices.csv';
    a.click();
  };

  return (
    <Box p="xl">
      <Text fz="sm" c="dimmed" mb={4}>
        Dashboard &rsaquo; <Text span c="#2563eb" fw={500}>Device Sync</Text>
      </Text>
      <Title order={2} fw={700} c="#111827" mb={4}>Device Sync Management</Title>
      <Text fz="sm" c="dimmed" mb="xl">Monitor and manage all biometric/attendance devices in real-time</Text>

      {/* Stat cards */}
      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md" mb="xl">
        {[
          { label: 'TOTAL DEVICES',   value: stats?.total,   icon: <IconDevices size={22} />,  color: '#eff6ff', iconColor: '#2563eb' },
          { label: 'ONLINE DEVICES',  value: stats?.online,  icon: <IconWifi size={22} />,      color: '#f0fdf4', iconColor: '#16a34a' },
          { label: 'OFFLINE DEVICES', value: stats?.offline, icon: <IconWifiOff size={22} />,  color: '#fff1f2', iconColor: '#dc2626' },
        ].map(c => (
          <Paper key={c.label} withBorder radius="md" p="lg">
            <Group justify="space-between" align="center">
              <div>
                <Text fz={11} c="dimmed" fw={600} style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {c.label}
                </Text>
                {loading
                  ? <Skeleton h={32} w={50} mt={4} />
                  : <Text fw={800} fz={28} c="#111827">{c.value ?? 0}</Text>}
              </div>
              <ThemeIcon size={48} radius="md" style={{ background: c.color, color: c.iconColor }} variant="filled">
                {c.icon}
              </ThemeIcon>
            </Group>
          </Paper>
        ))}
      </SimpleGrid>

      {/* Toolbar */}
      <Paper withBorder radius="md" p="md" mb="md">
        <Group justify="space-between" wrap="wrap" gap="sm">
          <Group gap="sm">
            <TextInput
              placeholder="Search by Device ID or Name..."
              leftSection={<IconRefresh size={14} />}
              value={search}
              onChange={e => { setSearch(e.currentTarget.value); setPage(1); }}
              w={260}
            />
            <Button
              variant="outline"
              color="gray"
              leftSection={<IconDevices size={14} />}
            >
              Location / Status
            </Button>
          </Group>
          <Group gap="sm">
            <Button
              leftSection={syncingId === 'ALL' ? <Loader size={13} color="white" /> : <IconRefresh size={14} />}
              onClick={syncAll}
              disabled={!!syncingId}
              style={{ background: '#2563eb' }}
            >
              Sync All Devices
            </Button>
            <Button
              variant="light"
              color="orange"
              leftSection={fixingTz ? <Loader size={13} /> : <IconX size={14} />}
              onClick={fixTzDuplicates}
              loading={fixingTz}
            >
              Fix Duplicate Records
            </Button>
            <Button variant="default" leftSection={<IconDownload size={14} />} onClick={exportCSV}>
              Export CSV
            </Button>
            <Button
              variant="filled"
              color="green"
              leftSection={<IconPlus size={14} />}
              onClick={() => setAddOpen(true)}
            >
              Add Device
            </Button>
          </Group>
        </Group>
      </Paper>

      {/* Table */}
      <Paper withBorder radius="md" p={0} mb="md">
        <Table highlightOnHover verticalSpacing="sm" style={{ fontSize: 14 }}>
          <Table.Thead style={{ background: '#1e3a5f' }}>
            <Table.Tr>
              {['#', 'Device ID', 'Device Name', 'Location / Branch', 'IP Address',
                'Last Sync Time', 'Records Synced', 'Sync Status', 'Battery / Health', 'Actions']
                .map(h => (
                  <Table.Th key={h} style={{ color: '#fff', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</Table.Th>
                ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {loading && Array.from({ length: 5 }).map((_, i) => (
              <Table.Tr key={i}>
                {Array.from({ length: 10 }).map((__, j) => (
                  <Table.Td key={j}><Skeleton h={14} w={j === 0 ? 20 : 80} /></Table.Td>
                ))}
              </Table.Tr>
            ))}

            {!loading && paged.map((dev, idx) => (
              <Table.Tr key={dev.id}>
                <Table.Td c="dimmed" fz="sm">{(page - 1) * pageSize + idx + 1}</Table.Td>
                <Table.Td>
                  <Text fz="sm" c="#2563eb" fw={500} style={{ fontFamily: 'monospace' }}>
                    {dev.deviceId}
                  </Text>
                </Table.Td>
                <Table.Td fz="sm" fw={600} c="#111827">{dev.name}</Table.Td>
                <Table.Td fz="sm" c="#374151">
                  {[dev.location, dev.branch].filter(Boolean).join(' – ') || '—'}
                </Table.Td>
                <Table.Td fz="sm" c="dimmed" style={{ fontFamily: 'monospace' }}>
                  {dev.ipAddress ?? '—'}
                </Table.Td>
                <Table.Td fz="sm" c="#374151">
                  {dev.lastSyncTime ? dayjs(dev.lastSyncTime).format('DD MMM YYYY, hh:mm A') : '—'}
                </Table.Td>
                <Table.Td fz="sm" fw={600} c="#111827">{dev.recordsSynced.toLocaleString()}</Table.Td>
                <Table.Td>
                  <Badge
                    size="sm"
                    variant="light"
                    color={dev.status === 'online' ? 'green' : dev.status === 'syncing' ? 'yellow' : 'red'}
                  >
                    {dev.status.charAt(0).toUpperCase() + dev.status.slice(1)}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  {dev.batteryHealth !== null ? (
                    <Group gap={4}>
                      <div
                        style={{
                          width: 8, height: 8, borderRadius: '50%',
                          background: dev.batteryHealth > 50 ? '#16a34a' : dev.batteryHealth > 20 ? '#f59e0b' : '#dc2626',
                        }}
                      />
                      <Text fz="sm" c="#374151">{dev.batteryHealth}%</Text>
                    </Group>
                  ) : (
                    <Text fz="sm" c="dimmed">—</Text>
                  )}
                </Table.Td>
                <Table.Td>
                  <Group gap={4} wrap="nowrap">
                    <Tooltip label="Sync" withArrow>
                      <ActionIcon
                        variant="subtle"
                        color="blue"
                        size="sm"
                        loading={syncingId === dev.deviceId}
                        onClick={() => syncDevice(dev.deviceId)}
                      >
                        <IconRefresh size={14} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Edit" withArrow>
                      <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => openEdit(dev)}>
                        <IconEdit size={14} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Delete" withArrow>
                      <ActionIcon variant="subtle" color="red" size="sm" onClick={() => deleteDevice(dev.deviceId)}>
                        <IconTrash size={14} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}

            {!loading && paged.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={10} ta="center" py="xl" c="dimmed">
                  No devices found. Click &ldquo;Add Device&rdquo; to register one.
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>

        <Group justify="space-between" px="md" py="sm" style={{ borderTop: '1px solid #f1f5f9' }} wrap="wrap" gap="sm">
          <Text fz="sm" c="dimmed">
            Showing {Math.min((page - 1) * pageSize + 1, Math.max(1, filtered.length))}–{Math.min(page * pageSize, filtered.length)} of {filtered.length} devices
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

      {/* Sync Log */}
      <Paper withBorder radius="md" p={0}>
        <Group
          px="lg"
          py="md"
          justify="space-between"
          style={{ cursor: 'pointer', borderBottom: logOpen ? '1px solid #f1f5f9' : 'none' }}
          onClick={() => setLogOpen(v => !v)}
        >
          <Group gap={8}>
            <IconRefresh size={16} color="#2563eb" />
            <Text fw={700} fz="sm" c="#111827">Sync Log</Text>
            <Text fz="sm" c="dimmed">Recent sync activity</Text>
          </Group>
          <ActionIcon variant="subtle" color="gray" size="sm">
            {logOpen ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
          </ActionIcon>
        </Group>

        <Collapse in={logOpen}>
          <Stack gap={0}>
            {syncLogs.map(log => (
              <Group
                key={log.id}
                px="lg"
                py="sm"
                justify="space-between"
                style={{ borderBottom: '1px solid #f8fafc' }}
              >
                <Group gap={12}>
                  <div
                    style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: log.status === 'success' ? '#f0fdf4' : log.status === 'error' ? '#fff1f2' : '#fffbeb',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    {log.status === 'success'
                      ? <IconCheck size={14} color="#16a34a" />
                      : <IconX size={14} color="#dc2626" />}
                  </div>
                  <div>
                    <Text fz="sm" fw={600} c="#111827">
                      Sync {log.status === 'success' ? 'completed' : 'failed'}
                    </Text>
                    <Text fz="xs" c="dimmed">
                      {log.recordCount} record(s){log.message ? ` · ${log.message}` : ''}
                    </Text>
                  </div>
                </Group>
                <Text fz="xs" c="dimmed">{dayjs(log.syncedAt).format('DD MMM YYYY, hh:mm A')}</Text>
              </Group>
            ))}
            {syncLogs.length === 0 && (
              <Text ta="center" py="xl" c="dimmed" fz="sm">No sync history.</Text>
            )}
          </Stack>
        </Collapse>
      </Paper>

      {/* Add device modal */}
      <Modal
        opened={addOpen}
        onClose={() => { setAddOpen(false); addForm.reset(); }}
        title={<Text fw={700}>Add New Device</Text>}
        size="sm"
        radius="md"
      >
        <form onSubmit={addForm.onSubmit(saveAdd)}>
          <Stack gap="sm">
            <TextInput label="Device ID" placeholder="e.g. DEV-001" {...addForm.getInputProps('deviceId')} />
            <TextInput label="Device Name" placeholder="e.g. Main Entrance BioScan" {...addForm.getInputProps('name')} />
            <TextInput label="Location" placeholder="e.g. Lobby, Floor 1" {...addForm.getInputProps('location')} />
            <TextInput label="Branch" placeholder="e.g. Head Office" {...addForm.getInputProps('branch')} />
            <TextInput label="IP Address" placeholder="e.g. 192.168.1.101" {...addForm.getInputProps('ipAddress')} />
            <Group justify="flex-end" mt="xs">
              <Button variant="default" onClick={() => { setAddOpen(false); addForm.reset(); }}>Cancel</Button>
              <Button type="submit" loading={savingDevice} style={{ background: '#2563eb' }}>Add Device</Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      {/* Edit device modal */}
      <Modal
        opened={!!editTarget}
        onClose={() => setEditTarget(null)}
        title={<Text fw={700}>Edit Device — {editTarget?.deviceId}</Text>}
        size="sm"
        radius="md"
      >
        <form onSubmit={editForm.onSubmit(saveEdit)}>
          <Stack gap="sm">
            <TextInput label="Device Name" {...editForm.getInputProps('name')} />
            <TextInput label="Location" {...editForm.getInputProps('location')} />
            <TextInput label="Branch" {...editForm.getInputProps('branch')} />
            <TextInput label="IP Address" {...editForm.getInputProps('ipAddress')} />
            <Group justify="flex-end" mt="xs">
              <Button variant="default" onClick={() => setEditTarget(null)}>Cancel</Button>
              <Button type="submit" loading={savingDevice} style={{ background: '#2563eb' }}>Save</Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Box>
  );
}
