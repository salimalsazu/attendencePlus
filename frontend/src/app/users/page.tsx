'use client';
import { useEffect, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  Modal,
  Paper,
  PasswordInput,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconPlus, IconTrash, IconShield, IconUser } from '@tabler/icons-react';
import { api } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import type { AuthUser } from '@/lib/types';
import { useRouter } from 'next/navigation';

interface UserRow extends AuthUser { createdAt: string }

export default function UsersPage() {
  const { user: me } = useAuth();
  const router = useRouter();

  const [users,   setUsers]   = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [opened,  setOpened]  = useState(false);

  // form
  const [username, setUsername] = useState('');
  const [name,     setName]     = useState('');
  const [password, setPassword] = useState('');
  const [role,     setRole]     = useState<'admin' | 'super_admin'>('admin');
  const [saving,   setSaving]   = useState(false);

  useEffect(() => {
    if (me && me.role !== 'super_admin') { router.replace('/'); return; }
    load();
  }, [me]);

  const load = () => {
    setLoading(true);
    api.listUsers()
      .then(setUsers)
      .catch(e => notifications.show({ message: String(e), color: 'red' }))
      .finally(() => setLoading(false));
  };

  const openAdd = () => {
    setUsername(''); setName(''); setPassword(''); setRole('admin');
    setOpened(true);
  };

  const saveUser = async () => {
    if (!username.trim() || !name.trim() || !password) {
      notifications.show({ message: 'All fields are required', color: 'red' }); return;
    }
    setSaving(true);
    try {
      await api.createUser({ username: username.trim(), name: name.trim(), password, role });
      notifications.show({ message: 'User created successfully', color: 'green' });
      setOpened(false);
      load();
    } catch (e) {
      notifications.show({ message: String(e), color: 'red' });
    } finally {
      setSaving(false);
    }
  };

  const deleteUser = async (u: UserRow) => {
    if (!confirm(`Delete user "${u.name}" (${u.username})?`)) return;
    try {
      await api.deleteUser(u.id);
      notifications.show({ message: 'User deleted', color: 'green' });
      setUsers(prev => prev.filter(x => x.id !== u.id));
    } catch (e) {
      notifications.show({ message: String(e), color: 'red' });
    }
  };

  return (
    <Box p="xl" maw={860}>
      <Text fz="sm" c="dimmed" mb={4}>
        Dashboard &rsaquo; <Text span c="#2563eb" fw={500}>User Management</Text>
      </Text>
      <Group justify="space-between" align="flex-end" mb="xl">
        <div>
          <Title order={2} fw={700} c="#111827" mb={4}>User Management</Title>
          <Text fz="sm" c="dimmed">Manage admin accounts (super admin only)</Text>
        </div>
        <Button
          leftSection={<IconPlus size={16} />}
          onClick={openAdd}
          style={{ background: '#2563eb' }}
        >
          Add User
        </Button>
      </Group>

      <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
        <Table highlightOnHover>
          <Table.Thead style={{ background: '#f8fafc' }}>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Username</Table.Th>
              <Table.Th>Role</Table.Th>
              <Table.Th>Created</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {loading && (
              <Table.Tr>
                <Table.Td colSpan={5}>
                  <Text c="dimmed" fz="sm" ta="center" py="md">Loading…</Text>
                </Table.Td>
              </Table.Tr>
            )}
            {!loading && users.map(u => (
              <Table.Tr key={u.id}>
                <Table.Td>
                  <Group gap={8}>
                    {u.role === 'super_admin'
                      ? <IconShield size={15} color="#2563eb" />
                      : <IconUser size={15} color="#64748b" />}
                    <Text fw={500} fz="sm">{u.name}</Text>
                  </Group>
                </Table.Td>
                <Table.Td><Text fz="sm" c="dimmed">@{u.username}</Text></Table.Td>
                <Table.Td>
                  <Badge
                    color={u.role === 'super_admin' ? 'blue' : 'gray'}
                    variant="light"
                    size="sm"
                  >
                    {u.role === 'super_admin' ? 'Super Admin' : 'Admin'}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Text fz="sm" c="dimmed">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </Text>
                </Table.Td>
                <Table.Td>
                  {u.id !== me?.id && (
                    <ActionIcon
                      color="red"
                      variant="subtle"
                      onClick={() => deleteUser(u)}
                      title="Delete user"
                    >
                      <IconTrash size={15} />
                    </ActionIcon>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>

      {/* Add user modal */}
      <Modal opened={opened} onClose={() => setOpened(false)} title="Add New User" size="sm">
        <Stack gap="md">
          <TextInput
            label="Full Name"
            placeholder="John Doe"
            value={name}
            onChange={e => setName(e.currentTarget.value)}
            required
          />
          <TextInput
            label="Username"
            placeholder="johndoe"
            value={username}
            onChange={e => setUsername(e.currentTarget.value)}
            required
          />
          <PasswordInput
            label="Password"
            placeholder="Min 6 characters"
            value={password}
            onChange={e => setPassword(e.currentTarget.value)}
            required
          />
          <Select
            label="Role"
            value={role}
            onChange={v => setRole(v as 'admin' | 'super_admin')}
            data={[
              { value: 'admin', label: 'Admin' },
              { value: 'super_admin', label: 'Super Admin' },
            ]}
          />
          <Group justify="flex-end" mt="xs">
            <Button variant="default" onClick={() => setOpened(false)}>Cancel</Button>
            <Button
              onClick={saveUser}
              loading={saving}
              style={{ background: '#2563eb' }}
            >
              Create User
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Box>
  );
}
