export const PUNCH_TYPES: Record<number, { label: string; color: string }> = {
  0: { label: 'Check In',  color: 'green'  },
  1: { label: 'Check Out', color: 'red'    },
  2: { label: 'Break Out', color: 'orange' },
  3: { label: 'Break In',  color: 'blue'   },
  4: { label: 'OT In',     color: 'teal'   },
  5: { label: 'OT Out',    color: 'violet' },
  6: { label: 'Leave',     color: 'grape'  },
  7: { label: 'SMS',       color: 'indigo' },
};

const AVATAR_COLORS = [
  'blue', 'cyan', 'teal', 'green', 'violet', 'indigo', 'orange', 'pink',
] as const;

export function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('');
}

export function avatarColor(name: string): string {
  const hash = [...name].reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function formatDuration(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function punchType(type: number) {
  return PUNCH_TYPES[type] ?? { label: `Type ${type}`, color: 'gray' };
}
