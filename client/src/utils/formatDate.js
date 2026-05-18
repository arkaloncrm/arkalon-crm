export function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-AU', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

export function formatRelative(value) {
  if (!value) return '—';
  const d = new Date(value);
  const now = new Date();
  const diffMs = now - d;
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return formatDate(value);
}

// Convert SQLite UTC string ('YYYY-MM-DD HH:mm:ss') → Australia/Sydney local display
export function formatLocalDatetime(utcString) {
  if (!utcString) return '—';
  const isoString = utcString.includes('T') ? utcString : utcString.replace(' ', 'T') + 'Z';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-AU', {
    timeZone: 'Australia/Sydney',
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// Convert datetime-local input (local Sydney time) → SQLite UTC string before POST/PUT
export function toSqliteUtcFromLocalInput(localValue) {
  if (!localValue) return null;
  const date = new Date(localValue);
  if (isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

// close_date is a pure DATE string ('yyyy-MM-dd') — parse components directly
// rather than new Date(str), which is unreliable across browsers/timezones.
export function closeDateInfo(closeDate) {
  if (!closeDate) return { label: '—', tone: 'none', diffDays: null };
  const parts = String(closeDate).slice(0, 10).split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    return { label: '—', tone: 'none', diffDays: null };
  }
  const close = new Date(parts[0], parts[1] - 1, parts[2]);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((close - today) / 86400000);
  if (diffDays < 0) {
    const n = Math.abs(diffDays);
    return { label: `Overdue by ${n} day${n === 1 ? '' : 's'}`, tone: 'overdue', diffDays };
  }
  if (diffDays === 0) return { label: 'Today', tone: 'today', diffDays };
  return {
    label: `In ${diffDays} day${diffDays === 1 ? '' : 's'}`,
    tone: diffDays <= 7 ? 'soon' : 'later',
    diffDays,
  };
}

// Convert SQLite UTC string → datetime-local value for edit form pre-population
export function fromSqliteUtcToDatetimeLocal(utcString) {
  if (!utcString) return '';
  const normalised = utcString.includes('T') ? utcString : utcString.replace(' ', 'T') + 'Z';
  const date = new Date(normalised);
  if (isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
