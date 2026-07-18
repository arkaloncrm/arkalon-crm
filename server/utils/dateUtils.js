const { DateTime } = require('luxon');

function toSqliteUtc(dt) {
  return dt.toUTC().toFormat('yyyy-LL-dd HH:mm:ss');
}

function getSydneyTodayUtcBounds() {
  const startSydney = DateTime.now()
    .setZone('Australia/Sydney')
    .startOf('day');
  const endSydney = startSydney.plus({ days: 1 });
  return {
    startUtc: toSqliteUtc(startSydney),
    endUtc: toSqliteUtc(endSydney),
  };
}

// 'YYYY-MM-DD' in Sydney local time → UTC storage string at the given hour.
// Luxon resolves the AEST/AEDT offset per-date — never a hardcoded +10:00.
function sydneyDateAtHourUtc(dateStr, hour = 9, minute = 0, second = 0) {
  const dt = DateTime.fromISO(dateStr, { zone: 'Australia/Sydney' });
  if (!dt.isValid) return null;
  return toSqliteUtc(dt.set({ hour, minute, second, millisecond: 0 }));
}

function sydneyTomorrowDateString() {
  return DateTime.now().setZone('Australia/Sydney').plus({ days: 1 }).toISODate();
}

module.exports = { getSydneyTodayUtcBounds, sydneyDateAtHourUtc, sydneyTomorrowDateString };
