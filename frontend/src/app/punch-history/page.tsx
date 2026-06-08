'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Box,
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
import { IconArrowBarToLeft, IconArrowRight, IconSearch } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { api } from '@/lib/api';
import { formatDuration, punchType } from '@/lib/utils';
import type { AttendancePage } from '@/lib/types';

export default function PunchHistoryPage() {
  const [date, setDate]       = useState<Date | null>(new Date());
  const [search, setSearch]   = useState('');
  const [page, setPage]       = useState(1);
  const [limit, setLimit]     = useState(20);
  const [loading, setLoading] = useState(true);
  const [data, setData]       = useState<AttendancePage | null>(null);

  const load = useCallback(async (pg = 1, lim = limit) => {
    setLoading(true);
    try {
      const params: Record<string, string> = {
        date:  dayjs(date ?? new Date()).format('YYYY-MM-DD'),
        page:  String(pg),
        limit: String(lim),
      };
      if (search.trim()) params.deviceUserId = search.trim();
      setData(await api.attendance(params));
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [date, search]);

  useEffect(() => { load(1, limit); setPage(1); }, [date]);  // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Box p="xl">
      <Text fz="sm" c="dimmed" mb={4}>
        Dashboard &rsaquo; <Text span c="#2563eb" fw={500}>Punch History</Text>
      </Text>
      <Title order={2} fw={700} c="#111827" mb={4}>Punch History</Title>
      <Text fz="sm" c="dimmed" mb="xl">All individual punch records from attendance devices</Text>

      <Paper withBorder radius="md" p="md" mb="md">
        <Group gap="sm">
          <TextInput
            placeholder="Search by User ID..."
            leftSection={<IconSearch size={15} />}
            value={search}
            onChange={e => setSearch(e.currentTarget.value)}
            onKeyDown={e => e.key === 'Enter' && load(1)}
            w={220}
          />
          <DatePickerInput
            value={date}
            onChange={setDate}
            maxDate={new Date()}
            clearable={false}
            w={160}
          />
        </Group>
      </Paper>

      <Paper withBorder radius="md" p={0} mb="md">
        <Table highlightOnHover verticalSpacing="sm" style={{ fontSize: 14 }}>
          <Table.Thead style={{ background: '#1e3a5f' }}>
            <Table.Tr>
              {['#', 'User ID', 'Employee Name', 'Punch Time', 'Punch Type', 'Department'].map(h => (
                <Table.Th key={h} style={{ color: '#fff', fontWeight: 600 }}>{h}</Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {loading && Array.from({ length: 8 }).map((_, i) => (
              <Table.Tr key={i}>
                {Array.from({ length: 6 }).map((__, j) => (
                  <Table.Td key={j}><Skeleton h={14} w={80} /></Table.Td>
                ))}
              </Table.Tr>
            ))}
            {!loading && data?.records.map((r, idx) => {
              const pt = punchType(r.punchType);
              const isIn = r.punchType === 0 || r.punchType === 3 || r.punchType === 4;
              return (
                <Table.Tr key={r.id}>
                  <Table.Td c="dimmed" fz="sm">{(page - 1) * limit + idx + 1}</Table.Td>
                  <Table.Td>
                    <Text fz="sm" c="#2563eb" fw={500} style={{ fontFamily: 'monospace' }}>
                      {r.deviceUserId}
                    </Text>
                  </Table.Td>
                  <Table.Td fz="sm" fw={500} c="#111827">{r.employee?.name ?? '—'}</Table.Td>
                  <Table.Td fz="sm" c="#374151">{dayjs(r.punchTime).format('hh:mm A')}</Table.Td>
                  <Table.Td>
                    <Group gap={6}>
                      {isIn ? <IconArrowRight size={13} color="#16a34a" /> : <IconArrowBarToLeft size={13} color="#dc2626" />}
                      <Badge size="sm" variant="light" color={pt.color}>{pt.label}</Badge>
                    </Group>
                  </Table.Td>
                  <Table.Td fz="sm" c="dimmed">{r.employee?.department ?? '—'}</Table.Td>
                </Table.Tr>
              );
            })}
            {!loading && (data?.records.length ?? 0) === 0 && (
              <Table.Tr>
                <Table.Td colSpan={6} ta="center" py="xl" c="dimmed">No punch records for this date.</Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
        {data && (
          <Group justify="space-between" px="md" py="sm" style={{ borderTop: '1px solid #f1f5f9' }} wrap="wrap" gap="sm">
            <Text fz="sm" c="dimmed">
              Showing {Math.min((page - 1) * limit + 1, data.total)}–{Math.min(page * limit, data.total)} of {data.total}
            </Text>
            <Group gap="sm">
              <Group gap={6} align="center">
                <Text fz="sm" c="dimmed">Rows:</Text>
                <Select
                  data={['20', '50', '100']}
                  value={String(limit)}
                  onChange={v => {
                    const lim = parseInt(v ?? '20');
                    setLimit(lim);
                    setPage(1);
                    load(1, lim);
                  }}
                  size="xs"
                  w={70}
                  allowDeselect={false}
                />
              </Group>
              <Pagination
                value={page}
                onChange={pg => { setPage(pg); load(pg, limit); }}
                total={Math.max(1, Math.ceil(data.total / limit))}
                size="sm"
              />
            </Group>
          </Group>
        )}
      </Paper>
    </Box>
  );
}
