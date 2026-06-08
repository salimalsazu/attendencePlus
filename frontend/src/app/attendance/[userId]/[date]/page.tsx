'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ActionIcon,
  Avatar,
  Badge,
  Card,
  Divider,
  Group,
  Paper,
  Skeleton,
  Stack,
  Text,
  Timeline,
  Title,
} from '@mantine/core';
import {
  IconArrowLeft,
  IconArrowRight,
  IconArrowBarToLeft,
  IconBuildingFactory2,
  IconCoffee,
  IconPlayerPause,
  IconPlayerPlay,
  IconUserCircle,
} from '@tabler/icons-react';
import dayjs from 'dayjs';
import { api } from '@/lib/api';
import { avatarColor, formatDuration, getInitials, punchType } from '@/lib/utils';
import type { AttendanceRecord, Employee } from '@/lib/types';

const PUNCH_ICONS: Record<number, React.ReactNode> = {
  0: <IconArrowRight    size={14} />,
  1: <IconArrowBarToLeft size={14} />,
  2: <IconCoffee     size={14} />,
  3: <IconPlayerPlay size={14} />,
  4: <IconPlayerPlay size={14} />,
  5: <IconPlayerPause size={14} />,
};

export default function HistoryPage() {
  const params   = useParams();
  const router   = useRouter();
  const userId   = decodeURIComponent(params?.userId as string);
  const date     = params?.date as string;

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [records,  setRecords]  = useState<AttendanceRecord[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  useEffect(() => {
    if (!userId || !date) return;
    api.employeeHistory(userId, date)
      .then(data => {
        setEmployee(data.employee);
        setRecords(data.records);
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, [userId, date]);

  // Compute stats
  const first = records[0];
  const last  = records[records.length - 1];
  const durationMins =
    first && last && records.length > 1
      ? Math.round((new Date(last.punchTime).getTime() - new Date(first.punchTime).getTime()) / 60000)
      : null;

  const formattedDate = dayjs(date).format('dddd, MMMM D, YYYY');

  return (
    <Stack gap="xl" maw={680}>
      {/* Back */}
      <Group gap="xs">
        <ActionIcon variant="subtle" color="gray" onClick={() => router.push('/attendance')}>
          <IconArrowLeft size={18} />
        </ActionIcon>
        <Text fz="sm" c="dimmed">Back to Daily Overview</Text>
      </Group>

      {/* Employee card */}
      {loading ? (
        <Paper withBorder radius="md" p="lg">
          <Group>
            <Skeleton circle h={56} w={56} />
            <Stack gap={6}>
              <Skeleton h={18} w={180} />
              <Skeleton h={14} w={120} />
            </Stack>
          </Group>
        </Paper>
      ) : error ? (
        <Text c="red">{error}</Text>
      ) : employee ? (
        <Paper withBorder radius="md" p="lg">
          <Group justify="space-between" wrap="wrap" gap="md">
            <Group gap="md">
              <Avatar color={avatarColor(employee.name)} size={56} radius="md">
                {getInitials(employee.name)}
              </Avatar>
              <div>
                <Title order={3} fw={700}>{employee.name}</Title>
                <Group gap="xs" mt={4}>
                  {employee.department && (
                    <Group gap={4} wrap="nowrap">
                      <IconBuildingFactory2 size={13} color="var(--mantine-color-dimmed)" />
                      <Text fz="xs" c="dimmed">{employee.department}</Text>
                    </Group>
                  )}
                  {employee.designation && (
                    <Group gap={4} wrap="nowrap">
                      <IconUserCircle size={13} color="var(--mantine-color-dimmed)" />
                      <Text fz="xs" c="dimmed">{employee.designation}</Text>
                    </Group>
                  )}
                  {employee.role && (
                    <Badge variant="outline" color="gray" size="xs">{employee.role}</Badge>
                  )}
                </Group>
              </div>
            </Group>
            <Text fz="sm" c="dimmed" ta={{ base: 'left', sm: 'right' }}>{formattedDate}</Text>
          </Group>
        </Paper>
      ) : null}

      {/* Stats row */}
      <Group grow>
        <Card withBorder radius="md" p="md">
          <Text fz="xs" c="dimmed" tt="uppercase" fw={600}>Total Punches</Text>
          {loading ? <Skeleton h={24} w={40} mt={4} /> : (
            <Text fw={800} fz="xl">{records.length}</Text>
          )}
        </Card>
        <Card withBorder radius="md" p="md">
          <Text fz="xs" c="dimmed" tt="uppercase" fw={600}>Time on Site</Text>
          {loading ? <Skeleton h={24} w={60} mt={4} /> : (
            <Text fw={800} fz="xl">{durationMins !== null ? formatDuration(durationMins) : '—'}</Text>
          )}
        </Card>
        <Card withBorder radius="md" p="md">
          <Text fz="xs" c="dimmed" tt="uppercase" fw={600}>User ID</Text>
          {loading ? <Skeleton h={24} w={60} mt={4} /> : (
            <Text fw={800} fz="md" style={{ fontFamily: 'monospace' }}>{userId}</Text>
          )}
        </Card>
      </Group>

      <Divider label="Punch Timeline" labelPosition="left" />

      {/* Timeline */}
      {loading ? (
        <Stack gap="md" pl="md">
          {Array.from({ length: 4 }).map((_, i) => (
            <Group key={i} gap="md">
              <Skeleton circle h={24} w={24} />
              <Stack gap={4}><Skeleton h={14} w={80} /><Skeleton h={11} w={120} /></Stack>
            </Group>
          ))}
        </Stack>
      ) : records.length === 0 ? (
        <Text c="dimmed" ta="center" py="xl">No punch records for this date</Text>
      ) : (
        <Timeline active={records.length - 1} bulletSize={28} lineWidth={2} pl="sm">
          {records.map((r, i) => {
            const pt   = punchType(r.punchType);
            const icon = PUNCH_ICONS[r.punchType] ?? <IconArrowRight size={14} />;
            const time = dayjs(r.punchTime);
            const gap  = i > 0
              ? Math.round((new Date(r.punchTime).getTime() - new Date(records[i - 1].punchTime).getTime()) / 60000)
              : null;

            return (
              <Timeline.Item
                key={r.id}
                color={pt.color}
                bullet={icon}
                title={
                  <Group gap="xs" align="center">
                    <Text fw={700} fz="md">{time.format('h:mm A')}</Text>
                    <Badge color={pt.color} variant="light" size="sm">{pt.label}</Badge>
                  </Group>
                }
              >
                <Text fz="xs" c="dimmed" mt={2}>
                  {time.format('MMM D, YYYY')}
                  {gap !== null && gap > 0 && ` · ${formatDuration(gap)} after previous`}
                </Text>
              </Timeline.Item>
            );
          })}
        </Timeline>
      )}
    </Stack>
  );
}
