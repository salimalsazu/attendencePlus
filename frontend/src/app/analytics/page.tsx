'use client';
import { Box, Paper, Text, Title } from '@mantine/core';
import { IconChartBar } from '@tabler/icons-react';

export default function AnalyticsPage() {
  return (
    <Box p="xl">
      <Text fz="sm" c="dimmed" mb={4}>
        Dashboard &rsaquo; <Text span c="#2563eb" fw={500}>Analytics</Text>
      </Text>
      <Title order={2} fw={700} c="#111827" mb={4}>Analytics</Title>
      <Text fz="sm" c="dimmed" mb="xl">Advanced attendance analytics and insights</Text>
      <Paper withBorder radius="md" p="xl" ta="center">
        <IconChartBar size={48} color="#cbd5e1" />
        <Text c="dimmed" mt="md">Analytics module coming soon</Text>
      </Paper>
    </Box>
  );
}
