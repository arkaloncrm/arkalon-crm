export const formatCurrency = (value, decimals = 2) => {
  if (value === null || value === undefined || value === '') return '—';
  const num = Number(value);
  if (isNaN(num)) return '—';
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
};

export const formatMrr = (value) => {
  if (value === null || value === undefined || value === '') return '—';
  const num = Number(value);
  if (isNaN(num)) return '—';
  if (num === 0) return '$0/mo';
  return `${formatCurrency(num, 0)}/mo`;
};

export const formatPercentage = (decimalValue) => {
  if (decimalValue === null || decimalValue === undefined) return '—';
  const num = Number(decimalValue);
  if (isNaN(num)) return '—';
  const pct = num > 1 ? num : num * 100;
  return `${Math.round(pct)}%`;
};

export function formatCurrencyCompact(value) {
  if (value == null || isNaN(value)) return '$0';
  if (Math.abs(value) >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `$${(value / 1_000).toFixed(0)}k`;
  }
  return formatCurrency(value, 0);
}
