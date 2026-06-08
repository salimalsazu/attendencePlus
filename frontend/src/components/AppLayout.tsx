'use client';
import { AppShell, Avatar, Burger, Group, Menu, Stack, Text, UnstyledButton } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  IconLayoutDashboard,
  IconClipboardList,
  IconCalendarStats,
  IconDevices,
  IconHistory,
  IconSettings,
  IconClock,
  IconUsers,
  IconPencilPlus,
  IconShield,
  IconLogout,
  IconChevronDown,
} from '@tabler/icons-react';
import { useAuth } from './AuthProvider';

const NAV = [
  { label: 'Dashboard',          href: '/',                   icon: IconLayoutDashboard },
  { label: 'Attendance Report',  href: '/attendance',         icon: IconClipboardList   },
  { label: 'Monthly Report',     href: '/monthly-report',     icon: IconCalendarStats   },
  { label: 'Employee List',      href: '/employees',          icon: IconUsers            },
  { label: 'Device Sync',        href: '/device-sync',        icon: IconDevices          },
  { label: 'Punch History',      href: '/punch-history',      icon: IconHistory          },
  { label: 'Manual Attendance',  href: '/manual-attendance',  icon: IconPencilPlus       },
  { label: 'Settings',           href: '/settings',           icon: IconSettings         },
];

const SUPER_ADMIN_NAV = [
  { label: 'User Management', href: '/users', icon: IconShield },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, { toggle }] = useDisclosure();
  const pathname = usePathname();
  const { user, logout } = useAuth();

  // No shell on login page
  if (pathname === '/login') return <>{children}</>;

  const navItems = [
    ...NAV,
    ...(user?.role === 'super_admin' ? SUPER_ADMIN_NAV : []),
  ];

  const initials = user?.name
    ? user.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : 'AD';

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{ width: 220, breakpoint: 'sm', collapsed: { mobile: !mobileOpen } }}
      padding={0}
    >
      {/* Top header */}
      <AppShell.Header
        style={{
          background: '#fff',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          alignItems: 'center',
          paddingLeft: 16,
          paddingRight: 24,
        }}
      >
        <Group justify="space-between" w="100%" h="100%" align="center">
          <Group gap="sm" align="center">
            <Burger opened={mobileOpen} onClick={toggle} hiddenFrom="sm" size="sm" color="#374151" />
            <Group gap={8} align="center" visibleFrom="sm">
              <div
                style={{
                  background: '#2563eb',
                  borderRadius: 8,
                  width: 32,
                  height: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <IconClock size={18} color="#fff" />
              </div>
              <Text fw={700} fz="md" style={{ color: '#111827', letterSpacing: '-0.3px' }}>
                AttendTrack Pro
              </Text>
            </Group>
          </Group>

          {/* Header user menu */}
          {user && (
            <Menu shadow="md" width={180}>
              <Menu.Target>
                <UnstyledButton style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Avatar size={32} radius="xl" color="blue" style={{ background: '#2563eb' }}>
                    {initials}
                  </Avatar>
                  <div style={{ minWidth: 0 }} className="hide-mobile">
                    <Text fz={13} fw={600} c="#111827" lh={1.2}>{user.name}</Text>
                    <Text fz={11} c="#6b7280" lh={1.2}>
                      {user.role === 'super_admin' ? 'Super Admin' : 'Admin'}
                    </Text>
                  </div>
                  <IconChevronDown size={14} color="#6b7280" />
                </UnstyledButton>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>{user.username}</Menu.Label>
                <Menu.Item
                  leftSection={<IconLogout size={14} />}
                  color="red"
                  onClick={logout}
                >
                  Sign Out
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          )}
        </Group>
      </AppShell.Header>

      {/* Dark sidebar */}
      <AppShell.Navbar
        style={{
          background: '#0f1629',
          borderRight: 'none',
          padding: '12px 8px',
        }}
      >
        {/* Logo (mobile only) */}
        <Group gap={8} align="center" px={8} mb={24} hiddenFrom="sm">
          <div
            style={{
              background: '#2563eb',
              borderRadius: 8,
              width: 30,
              height: 30,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <IconClock size={16} color="#fff" />
          </div>
          <Text fw={700} fz="sm" c="white">AttendTrack</Text>
        </Group>

        <Stack gap={2} style={{ flex: 1 }}>
          {navItems.map(({ label, href, icon: Icon }) => {
            const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
            return (
              <UnstyledButton
                key={href}
                component={Link}
                href={href}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 12px',
                  borderRadius: 8,
                  background: isActive ? '#1e3a5f' : 'transparent',
                  color: isActive ? '#fff' : '#94a3b8',
                  fontWeight: isActive ? 600 : 400,
                  fontSize: 14,
                  transition: 'background 0.15s, color 0.15s',
                  textDecoration: 'none',
                }}
                onMouseEnter={e => {
                  if (!isActive) {
                    (e.currentTarget as HTMLElement).style.background = '#1e293b';
                    (e.currentTarget as HTMLElement).style.color = '#e2e8f0';
                  }
                }}
                onMouseLeave={e => {
                  if (!isActive) {
                    (e.currentTarget as HTMLElement).style.background = 'transparent';
                    (e.currentTarget as HTMLElement).style.color = '#94a3b8';
                  }
                }}
              >
                <Icon size={17} color={isActive ? '#60a5fa' : '#64748b'} style={{ flexShrink: 0 }} />
                {label}
              </UnstyledButton>
            );
          })}
        </Stack>

        {/* Bottom user pill */}
        <Group
          gap={10}
          px={12}
          py={10}
          style={{ borderTop: '1px solid #1e293b', marginTop: 16, cursor: 'pointer' }}
          onClick={logout}
          title="Sign out"
        >
          <Avatar size={32} radius="xl" color="blue" style={{ background: '#2563eb' }}>
            {initials}
          </Avatar>
          <div style={{ minWidth: 0, flex: 1 }}>
            <Text fz={13} fw={600} c="white" lh={1.2} truncate>{user?.name ?? 'Admin'}</Text>
            <Text fz={11} c="#64748b" lh={1.2}>
              {user?.role === 'super_admin' ? 'Super Admin' : 'Admin'}
            </Text>
          </div>
          <IconLogout size={15} color="#64748b" />
        </Group>
      </AppShell.Navbar>

      <AppShell.Main style={{ background: '#f8fafc', minHeight: '100vh' }}>
        {children}
      </AppShell.Main>
    </AppShell>
  );
}
