'use client';
import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Divider,
  Group,
  NumberInput,
  Paper,
  Stack,
  TagsInput,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { DatePickerInput, TimeInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import { IconCalendarOff, IconCheck, IconClock, IconDeviceFloppy, IconMailForward, IconSend, IconSettings } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { api } from '@/lib/api';
import type { AppSettings } from '@/lib/types';

const DAYS = [
  { num: 0, label: 'Sunday' },
  { num: 1, label: 'Monday' },
  { num: 2, label: 'Tuesday' },
  { num: 3, label: 'Wednesday' },
  { num: 4, label: 'Thursday' },
  { num: 5, label: 'Friday' },
  { num: 6, label: 'Saturday' },
];

function parseHolidays(str: string | undefined): string[] {
  if (!str) return [];
  return str.split(',').map(s => s.trim()).filter(s => s !== '');
}

function serializeHolidays(arr: string[]): string {
  return arr.join(',');
}

function parseEmails(str: string | undefined): string[] {
  if (!str) return [];
  return str.split(',').map(s => s.trim()).filter(s => s !== '');
}

function serializeEmails(arr: string[]): string {
  return arr.join(',');
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>({
    office_start:           '09:30',
    office_end:             '18:30',
    late_grace_mins:        '15',
    early_leave_grace_mins: '15',
    weekly_holidays:        '',
    report_recipients:      '',
    report_time:            '11:00',
  });
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [manualEmail, setManualEmail] = useState('');
  const [manualDate,  setManualDate]  = useState<Date | null>(new Date());
  const [sendingManual, setSendingManual] = useState(false);

  useEffect(() => {
    api.getSettings()
      .then(s => setSettings(s))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const updated = await api.updateSettings(settings);
      setSettings(updated);
      notifications.show({ message: 'Settings saved successfully', color: 'green' });
    } catch (err) {
      notifications.show({ message: String(err), color: 'red' });
    } finally {
      setSaving(false);
    }
  };

  const sendManualReport = async () => {
    const to = manualEmail.trim();
    if (!to) return;
    setSendingManual(true);
    try {
      const date   = dayjs(manualDate ?? new Date()).format('YYYY-MM-DD');
      const result = await api.sendTestReport({ to, date });
      notifications.show({
        message: `${dayjs(date).format('DD MMM YYYY')} report sent to ${result.recipient}`,
        color: 'green',
        icon: <IconCheck size={16} />,
      });
      setManualEmail('');
    } catch (err) {
      notifications.show({ message: String(err), color: 'red' });
    } finally {
      setSendingManual(false);
    }
  };

  const holidayValues = parseHolidays(settings.weekly_holidays);

  const toggleHoliday = (dayNum: string, checked: boolean) => {
    const current = new Set(holidayValues);
    checked ? current.add(dayNum) : current.delete(dayNum);
    setSettings(s => ({ ...s, weekly_holidays: serializeHolidays(Array.from(current).sort()) }));
  };

  const holidayDayNames = DAYS
    .filter(d => holidayValues.includes(String(d.num)))
    .map(d => d.label);

  return (
    <Box p="xl" maw={700}>
      <Text fz="sm" c="dimmed" mb={4}>
        Dashboard &rsaquo; <Text span c="#2563eb" fw={500}>Settings</Text>
      </Text>
      <Title order={2} fw={700} c="#111827" mb={4}>Settings</Title>
      <Text fz="sm" c="dimmed" mb="xl">Configure office hours, attendance rules and holidays</Text>

      {/* Office Hours */}
      <Paper withBorder radius="md" p="xl" mb="md">
        <Group gap="xs" mb="md">
          <IconClock size={18} color="#2563eb" />
          <Text fw={700} fz="md" c="#111827">Office Hours</Text>
        </Group>
        <Text fz="sm" c="dimmed" mb="lg">
          Attendance status is computed against these times. Changes apply immediately to new report queries.
        </Text>

        <Stack gap="lg">
          <Group grow gap="md" align="flex-start">
            <div>
              <Text fz="sm" fw={600} c="#374151" mb={6}>Check-In Time (Office Start)</Text>
              <TimeInput
                value={settings.office_start}
                onChange={e => setSettings(s => ({ ...s, office_start: e.currentTarget.value }))}
                leftSection={<IconClock size={15} />}
                disabled={loading}
                size="md"
              />
              <Text fz="xs" c="dimmed" mt={4}>Employees arriving after this time + grace are marked Late</Text>
            </div>
            <div>
              <Text fz="sm" fw={600} c="#374151" mb={6}>Check-Out Time (Office End)</Text>
              <TimeInput
                value={settings.office_end}
                onChange={e => setSettings(s => ({ ...s, office_end: e.currentTarget.value }))}
                leftSection={<IconClock size={15} />}
                disabled={loading}
                size="md"
              />
              <Text fz="xs" c="dimmed" mt={4}>Employees leaving before this time - grace are marked Early Leave</Text>
            </div>
          </Group>

          <Divider label="Grace Periods" labelPosition="left" />

          <Group grow gap="md" align="flex-start">
            <div>
              <Text fz="sm" fw={600} c="#374151" mb={6}>Late Arrival Grace (minutes)</Text>
              <NumberInput
                value={parseInt(settings.late_grace_mins)}
                onChange={v => setSettings(s => ({ ...s, late_grace_mins: String(v ?? 0) }))}
                min={0} max={120} disabled={loading} size="md"
              />
              <Text fz="xs" c="dimmed" mt={4}>Buffer before marking as Late (e.g. 15 mins)</Text>
            </div>
            <div>
              <Text fz="sm" fw={600} c="#374151" mb={6}>Early Leave Grace (minutes)</Text>
              <NumberInput
                value={parseInt(settings.early_leave_grace_mins)}
                onChange={v => setSettings(s => ({ ...s, early_leave_grace_mins: String(v ?? 0) }))}
                min={0} max={120} disabled={loading} size="md"
              />
              <Text fz="xs" c="dimmed" mt={4}>Buffer before marking as Early Leave (e.g. 15 mins)</Text>
            </div>
          </Group>
        </Stack>

        <Divider my="xl" />

        <Paper bg="#f0f9ff" radius="md" p="md" style={{ border: '1px solid #bae6fd' }}>
          <Group gap="xs" mb="xs">
            <IconSettings size={15} color="#0ea5e9" />
            <Text fz="sm" fw={600} c="#0369a1">Current Rules Preview</Text>
          </Group>
          <Stack gap={4}>
            <Text fz="sm" c="#374151">
              <strong>Late:</strong> Check-in after{' '}
              <strong>{addMins(settings.office_start, parseInt(settings.late_grace_mins) || 0)}</strong>
            </Text>
            <Text fz="sm" c="#374151">
              <strong>Early Leave:</strong> Check-out before{' '}
              <strong>{subMins(settings.office_end, parseInt(settings.early_leave_grace_mins) || 0)}</strong>
            </Text>
          </Stack>
        </Paper>
      </Paper>

      {/* Weekly Holidays */}
      <Paper withBorder radius="md" p="xl" mb="md">
        <Group gap="xs" mb="md">
          <IconCalendarOff size={18} color="#dc2626" />
          <Text fw={700} fz="md" c="#111827">Weekly Holidays</Text>
        </Group>
        <Text fz="sm" c="dimmed" mb="lg">
          Days marked as weekly holidays are shown in the calendar but are <strong>not counted as working days</strong> or absent days.
        </Text>

        <Group gap="xl" wrap="wrap">
          {DAYS.map(day => (
            <Checkbox
              key={day.num}
              label={day.label}
              checked={holidayValues.includes(String(day.num))}
              onChange={e => toggleHoliday(String(day.num), e.currentTarget.checked)}
              disabled={loading}
              styles={{ label: { fontWeight: 500, cursor: 'pointer' } }}
            />
          ))}
        </Group>

        {holidayDayNames.length > 0 && (
          <Paper bg="#fef2f2" radius="md" p="sm" mt="md" style={{ border: '1px solid #fecaca' }}>
            <Text fz="sm" c="#dc2626" fw={500}>
              Weekly holidays: <strong>{holidayDayNames.join(', ')}</strong>
            </Text>
          </Paper>
        )}
        {holidayDayNames.length === 0 && (
          <Paper bg="#f0fdf4" radius="md" p="sm" mt="md" style={{ border: '1px solid #bbf7d0' }}>
            <Text fz="sm" c="#16a34a" fw={500}>No weekly holidays configured — all days are working days.</Text>
          </Paper>
        )}
      </Paper>

      {/* Daily Email Report */}
      <Paper withBorder radius="md" p="xl" mb="md">
        <Group gap="xs" mb="md">
          <IconMailForward size={18} color="#2563eb" />
          <Text fw={700} fz="md" c="#111827">Daily Attendance Report Email</Text>
        </Group>
        <Text fz="sm" c="dimmed" mb="lg">
          A daily attendance report is automatically emailed to the recipients below at the configured time, every day.
        </Text>

        <Stack gap="lg">
          <div>
            <Text fz="sm" fw={600} c="#374151" mb={6}>Recipient Emails</Text>
            <TagsInput
              value={parseEmails(settings.report_recipients)}
              onChange={vals => setSettings(s => ({ ...s, report_recipients: serializeEmails(vals) }))}
              placeholder="Type an email and press Enter"
              disabled={loading}
              size="md"
              splitChars={[',', ' ', ';']}
            />
            <Text fz="xs" c="dimmed" mt={4}>Add one or more emails — everyone here receives the daily report automatically</Text>
          </div>

          <div>
            <Text fz="sm" fw={600} c="#374151" mb={6}>Send Time</Text>
            <TimeInput
              value={settings.report_time}
              onChange={e => setSettings(s => ({ ...s, report_time: e.currentTarget.value }))}
              leftSection={<IconClock size={15} />}
              disabled={loading}
              size="md"
              w={160}
            />
            <Text fz="xs" c="dimmed" mt={4}>The report is auto-sent once a day at this time (Asia/Dhaka)</Text>
          </div>
        </Stack>

        <Divider my="lg" label="Manual Send" labelPosition="left" />

        <Group gap="xs" align="flex-end">
          <div>
            <Text fz="xs" fw={600} c="#374151" mb={6}>Report date</Text>
            <DatePickerInput
              value={manualDate}
              onChange={setManualDate}
              maxDate={new Date()}
              clearable={false}
              size="md"
              w={160}
            />
          </div>
          <div>
            <Text fz="xs" fw={600} c="#374151" mb={6}>Send to a specific email</Text>
            <TextInput
              value={manualEmail}
              onChange={e => setManualEmail(e.currentTarget.value)}
              placeholder="someone@example.com"
              size="md"
              w={240}
            />
          </div>
          <Button
            leftSection={<IconSend size={16} />}
            onClick={sendManualReport}
            loading={sendingManual}
            disabled={!manualEmail.trim()}
            variant="outline"
            size="md"
          >
            Send
          </Button>
        </Group>
        <Text fz="xs" c="dimmed" mt={6}>Send that day&apos;s attendance report — including past dates — to any email.</Text>
      </Paper>

      <Group>
        <Button
          leftSection={<IconDeviceFloppy size={16} />}
          onClick={save}
          loading={saving}
          disabled={loading}
          style={{ background: '#2563eb' }}
          size="md"
        >
          Save Settings
        </Button>
      </Group>
    </Box>
  );
}

function addMins(timeStr: string, mins: number) {
  const [h, m] = (timeStr || '00:00').split(':').map(Number);
  const total  = h * 60 + m + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function subMins(timeStr: string, mins: number) {
  const [h, m] = (timeStr || '00:00').split(':').map(Number);
  const total  = h * 60 + m - mins;
  const hh     = Math.floor(((total % 1440) + 1440) / 60) % 24;
  const mm     = ((total % 60) + 60) % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
