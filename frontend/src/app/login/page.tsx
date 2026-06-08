'use client';
import { useState } from 'react';
import {
  Box,
  Button,
  Center,
  Group,
  Paper,
  PasswordInput,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconClock, IconLock, IconUser } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { setToken } from '@/lib/auth';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setLoading(true);
    try {
      const { token } = await api.login(username.trim(), password);
      setToken(token);
      router.replace('/');
    } catch (err) {
      notifications.show({
        message: err instanceof Error ? err.message : 'Login failed',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0f1629 0%, #1e3a5f 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <Box w="100%" maw={420}>
        {/* Logo */}
        <Center mb={32}>
          <Group gap={12} align="center">
            <div
              style={{
                background: '#2563eb',
                borderRadius: 12,
                width: 48,
                height: 48,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 20px rgba(37,99,235,0.4)',
              }}
            >
              <IconClock size={26} color="#fff" />
            </div>
            <div>
              <Text fw={800} fz={22} c="white" lh={1.1}>AttendTrack Pro</Text>
              <Text fz={12} c="#64748b" lh={1}>Attendance Management System</Text>
            </div>
          </Group>
        </Center>

        {/* Card */}
        <Paper
          radius="xl"
          p={36}
          style={{ background: '#fff', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}
        >
          <Title order={3} fw={700} c="#111827" mb={4} ta="center">
            Sign in to your account
          </Title>
          <Text fz="sm" c="dimmed" ta="center" mb={28}>
            Enter your credentials to access the dashboard
          </Text>

          <form onSubmit={handleSubmit}>
            <TextInput
              label="Username"
              placeholder="Enter your username"
              leftSection={<IconUser size={16} />}
              value={username}
              onChange={e => setUsername(e.currentTarget.value)}
              mb="md"
              size="md"
              autoComplete="username"
              styles={{ label: { fontWeight: 600, fontSize: 13 } }}
            />

            <PasswordInput
              label="Password"
              placeholder="Enter your password"
              leftSection={<IconLock size={16} />}
              value={password}
              onChange={e => setPassword(e.currentTarget.value)}
              mb={28}
              size="md"
              autoComplete="current-password"
              styles={{ label: { fontWeight: 600, fontSize: 13 } }}
            />

            <Button
              type="submit"
              fullWidth
              size="md"
              loading={loading}
              style={{ background: '#2563eb', fontWeight: 600 }}
            >
              Sign In
            </Button>
          </form>
        </Paper>

        <Text fz={12} c="#475569" ta="center" mt={20}>
          Default: <Text span c="#94a3b8" fw={500}>superadmin</Text>
          {' / '}
          <Text span c="#94a3b8" fw={500}>Admin@123</Text>
        </Text>
      </Box>
    </Box>
  );
}
