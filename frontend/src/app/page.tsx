'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Grid,
  Group,
  Loader,
  Paper,
  RingProgress,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { AreaChart, DonutChart } from '@mantine/charts';
import { notifications } from '@mantine/notifications';
import {
  IconAlertTriangle,
  IconBuildingSkyscraper,
  IconCheck,
  IconClock,
  IconDevices,
  IconRefresh,
  IconUsers,
  IconUserX,
  IconWifi,
  IconWifiOff,
  IconX,
} from '@tabler/icons-react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { api } from '@/lib/api';
import type { DashboardStats, DeptStat, Device, SyncLog, TrendPoint } from '@/lib/types';

dayjs.extend(relativeTime);

const DEPT_COLORS = ['#2563eb', '#0d9488', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2'];

export default function DashboardPage() {
  const [loading, setLoading]   = useState(true);
  const [syncing, setSyncing]   = useState(false);
  const [stats, setStats]       = useState<DashboardStats | null>(null);
  const [trend, setTrend]       = useState<TrendPoint[]>([]);
  const [depts, setDepts]       = useState<DeptStat[]>([]);
  const [devices, setDevices]   = useState<Device[]>([]);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);

  const load = useCallback(async () => {
    const today = dayjs().format('YYYY-MM-DD');
    const results = await Promise.allSettled([
      api.dashboardStats(today),
      api.dashboardTrend(30),
      api.dashboardDepartments(today),
      api.devices(),
      api.syncLogs(),
    ]);
    if (results[0].status === 'fulfilled') setStats(results[0].value);
    if (results[1].status === 'fulfilled') setTrend(results[1].value);
    if (results[2].status === 'fulfilled') setDepts(results[2].value);
    if (results[3].status === 'fulfilled') setDevices(results[3].value);
    if (results[4].status === 'fulfilled') setSyncLogs(results[4].value);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const triggerSync = async () => {
    setSyncing(true);
    try {
      const result = await api.triggerSync();
      notifications.show({
        title: 'Sync complete',
        message: `${result.recordCount} new record(s) imported`,
        color: 'green',
        icon: <IconCheck size={16} />,
      });
      await load();
    } catch (err) {
      notifications.show({
        title: 'Sync failed',
        message: String(err),
        color: 'red',
        icon: <IconX size={16} />,
      });
    } finally {
      setSyncing(false);
    }
  };

  const lastSync = syncLogs[0];

  // Format trend data for AreaChart
  const trendData = trend.map(t => ({
    date:    dayjs(t.date).format('MMM D'),
    Present: t.present,
    Absent:  t.absent,
  }));

  // Format dept data for DonutChart
  const donutData = depts.slice(0, 6).map((d, i) => ({
    name:  d.department,
    value: d.present,
    color: DEPT_COLORS[i % DEPT_COLORS.length],
  }));

  return (
    <Box p="xl" pb="xl">
      {/* Greeting + sync button */}
      <Group justify="space-between" align="flex-start" mb="xl">
        <div>
          <Title order={2} fw={700} style={{ color: '#111827' }}>
            {greeting()}, Admin {timeEmoji()}
          </Title>
          <Text c="dimmed" fz="sm" mt={2}>Here&apos;s your attendance overview for today</Text>
        </div>
        <Group gap="sm" align="center">
          {lastSync && (
            <Badge
              variant="dot"
              color="green"
              size="lg"
              style={{ fontWeight: 500 }}
            >
              Last Sync: {dayjs(lastSync.syncedAt).fromNow()}
            </Badge>
          )}
          <Button
            leftSection={syncing ? <Loader size={14} color="white" /> : <IconRefresh size={15} />}
            onClick={triggerSync}
            disabled={syncing}
            size="sm"
            style={{ background: '#2563eb' }}
          >
            {syncing ? 'Syncing…' : 'Sync Now'}
          </Button>
        </Group>
      </Group>

      {/* Stats row — 6 cards */}
      <SimpleGrid cols={{ base: 2, sm: 3, lg: 6 }} spacing="md" mb="xl">
        <StatCard
          label="Total Users"
          value={stats?.totalEmployees}
          loading={loading}
          icon={<IconUsers size={20} />}
          iconBg="#eff6ff"
          iconColor="#2563eb"
          sub="+2.4%"
          subColor="green"
        />
        <StatCard
          label="Attendance"
          value={stats ? `${stats.presentCount}` : undefined}
          loading={loading}
          icon={
            stats ? (
              <RingProgress
                size={42}
                thickness={4}
                roundCaps
                sections={[{ value: stats.presentPct, color: '#16a34a' }]}
                label={
                  <Text ta="center" fz={9} fw={700} c="green" lh={1}>
                    {stats.presentPct}%
                  </Text>
                }
              />
            ) : (
              <IconUsers size={20} />
            )
          }
          iconBg="#f0fdf4"
          iconColor="#16a34a"
          sub={stats ? `${stats.presentPct}%` : undefined}
          subColor="green"
        />
        <StatCard
          label="Delay Ratio"
          value={stats ? `${stats.delayRatio}%` : undefined}
          loading={loading}
          icon={<IconAlertTriangle size={20} />}
          iconBg="#fff7ed"
          iconColor="#ea580c"
          sub={stats ? `${stats.delayCount} employees` : undefined}
          subColor="orange"
          subBold
        />
        <StatCard
          label="Late Ratio"
          value={stats ? `${stats.lateRatio}%` : undefined}
          loading={loading}
          icon={<IconClock size={20} />}
          iconBg="#fff1f2"
          iconColor="#dc2626"
          sub={stats ? `${stats.lateCount} employees` : undefined}
          subColor="red"
          subBold
        />
        <StatCard
          label="Sync Time"
          value={stats?.lastSyncTime ? dayjs(stats.lastSyncTime).format('hh:mm') : '--:--'}
          loading={loading}
          icon={<IconRefresh size={20} />}
          iconBg="#eff6ff"
          iconColor="#2563eb"
          sub="Synced Successfully"
          subColor="green"
        />
        <StatCard
          label="Absent Count"
          value={stats?.absentCount}
          loading={loading}
          icon={<IconUserX size={20} />}
          iconBg="#fdf4ff"
          iconColor="#9333ea"
          sub={stats ? `${stats.totalEmployees > 0 ? ((stats.absentCount / stats.totalEmployees) * 100).toFixed(1) : 0}% of total users` : undefined}
          subColor="red"
        />
      </SimpleGrid>

      {/* Charts row */}
      <Grid mb="xl" gutter="md">
        {/* Attendance Trend */}
        <Grid.Col span={{ base: 12, md: 7 }}>
          <Paper withBorder radius="md" p="lg" h="100%">
            <div>
              <Text fw={700} fz="md" c="#111827">Attendance Trend</Text>
              <Text fz="xs" c="dimmed">Daily attendance vs absence — Last 30 days</Text>
            </div>
            {loading ? (
              <Skeleton h={220} mt="md" radius="sm" />
            ) : (
              <AreaChart
                h={220}
                mt="md"
                data={trendData}
                dataKey="date"
                series={[
                  { name: 'Present', color: '#2563eb' },
                  { name: 'Absent',  color: '#dc2626' },
                ]}
                curveType="monotone"
                withDots={false}
                withLegend
                fillOpacity={0.15}
                strokeWidth={2}
                gridAxis="xy"
                tickLine="none"
                xAxisProps={{ interval: 4 }}
              />
            )}
          </Paper>
        </Grid.Col>

        {/* Department-wise Attendance */}
        <Grid.Col span={{ base: 12, md: 5 }}>
          <Paper withBorder radius="md" p="lg" h="100%">
            <div>
              <Text fw={700} fz="md" c="#111827">Department-wise Attendance</Text>
              <Text fz="xs" c="dimmed">Breakdown by department</Text>
            </div>
            {loading ? (
              <Skeleton circle h={160} mx="auto" mt="md" />
            ) : donutData.length > 0 ? (
              <>
                <Group justify="center" mt="md">
                  <DonutChart
                    data={donutData}
                    size={160}
                    thickness={28}
                    tooltipDataSource="segment"
                    withTooltip
                  />
                </Group>
                <Stack gap={6} mt="md">
                  {depts.slice(0, 6).map((d, i) => (
                    <Group key={d.department} justify="space-between">
                      <Group gap={8}>
                        <div style={{
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          background: DEPT_COLORS[i % DEPT_COLORS.length],
                          flexShrink: 0,
                        }} />
                        <Text fz="sm" c="#374151">{d.department}</Text>
                      </Group>
                      <Text fz="sm" fw={700} c="#111827">{d.pct}%</Text>
                    </Group>
                  ))}
                </Stack>
              </>
            ) : (
              <Text c="dimmed" ta="center" py="xl" fz="sm">No department data</Text>
            )}
          </Paper>
        </Grid.Col>
      </Grid>

      {/* Device Sync Status Summary */}
      <Paper withBorder radius="md" p="lg">
        <Group justify="space-between" mb="md">
          <div>
            <Text fw={700} fz="md" c="#111827">Device Sync Status Summary</Text>
            <Text fz="xs" c="dimmed">Real-time status of all registered attendance devices</Text>
          </div>
          <Button
            variant="outline"
            size="xs"
            leftSection={<IconRefresh size={13} />}
            onClick={load}
            loading={loading}
            color="gray"
          >
            Refresh
          </Button>
        </Group>

        {loading ? (
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} h={100} radius="md" />)}
          </SimpleGrid>
        ) : devices.length === 0 ? (
          <Text c="dimmed" ta="center" py="xl" fz="sm">
            No devices registered. Go to Device Sync to add devices.
          </Text>
        ) : (
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
            {devices.map(dev => (
              <DeviceCard key={dev.id} device={dev} />
            ))}
          </SimpleGrid>
        )}
      </Paper>
    </Box>
  );
}

/* ── Stat card ── */
function StatCard({
  label, value, loading, icon, iconBg, iconColor, sub, subColor, subBold,
}: {
  label: string;
  value: string | number | undefined;
  loading: boolean;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  sub?: string;
  subColor?: string;
  subBold?: boolean;
}) {
  return (
    <Paper withBorder radius="md" p="md" style={{ background: '#fff' }}>
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <div style={{ minWidth: 0, flex: 1 }}>
          <Text fz={12} c="dimmed" fw={500} mb={4} style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {label}
          </Text>
          {loading ? (
            <Skeleton h={28} w={70} mt={2} />
          ) : (
            <Text fw={800} fz="xl" c="#111827" lh={1.2}>{value ?? '—'}</Text>
          )}
          {sub && !loading && (
            <Text fz={11} c={subColor ?? 'dimmed'} mt={4} fw={subBold ? 600 : 400}>
              {sub}
            </Text>
          )}
        </div>
        <ThemeIcon
          size={42}
          radius="md"
          style={{ background: iconBg, color: iconColor, flexShrink: 0 }}
          variant="filled"
        >
          {icon}
        </ThemeIcon>
      </Group>
    </Paper>
  );
}

/* ── Device card ── */
function DeviceCard({ device }: { device: Device }) {
  const isOnline  = device.status === 'online';
  const isOffline = device.status === 'offline';

  return (
    <Paper
      radius="md"
      p="md"
      style={{
        border: `1.5px solid ${isOnline ? '#bbf7d0' : isOffline ? '#fecaca' : '#fed7aa'}`,
        background: '#fff',
      }}
    >
      <Group justify="space-between" mb={8}>
        <Text fz={12} fw={600} c="dimmed" style={{ fontFamily: 'monospace' }}>
          {device.deviceId}
        </Text>
        <Badge
          size="sm"
          variant="light"
          color={isOnline ? 'green' : isOffline ? 'red' : 'orange'}
        >
          {device.status.charAt(0).toUpperCase() + device.status.slice(1)}
        </Badge>
      </Group>

      <Group gap={6} mb={6}>
        <IconDevices size={15} color="#6b7280" />
        <Text fz="sm" fw={600} c="#111827">{device.name}</Text>
      </Group>

      <Group gap={6} mb={4}>
        <IconBuildingSkyscraper size={13} color="#9ca3af" />
        <Text fz={12} c="dimmed">{[device.location, device.branch].filter(Boolean).join(', ') || '—'}</Text>
      </Group>

      <Group gap={6}>
        <IconClock size={13} color="#9ca3af" />
        <Text fz={12} c="dimmed">
          Last Sync: {device.lastSyncTime ? dayjs(device.lastSyncTime).format('hh:mm A') : '—'}
        </Text>
      </Group>
    </Paper>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

function timeEmoji() {
  const h = new Date().getHours();
  if (h < 12) return '👋';
  if (h < 17) return '☀️';
  return '🌙';
}
