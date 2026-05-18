export function formatDuration(minutes) {
  if (minutes === null || minutes === undefined || minutes === '') return '—';
  const value = Number(minutes);
  if (Number.isNaN(value)) return '—';
  if (value === 0) return '0m';
  if (value < 60) return `${value}m`;
  const h = Math.floor(value / 60);
  const m = value % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
