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

// 'YYYY-MM-DD' in Sydney local time → UTC storage string at the given time.
// Luxon resolves the AEST/AEDT offset per-date — never a hardcoded +10:00.
// minute/second are applied via plus() so overflow (e.g. second=90 from the
// bulk-import stagger) rolls over correctly instead of producing an invalid date.
function sydneyDateAtHourUtc(dateStr, hour = 9, minute = 0, second = 0) {
  const dt = DateTime.fromISO(dateStr, { zone: 'Australia/Sydney' });
  if (!dt.isValid) return null;
  return toSqliteUtc(
    dt.set({ hour, minute: 0, second: 0, millisecond: 0 }).plus({ minutes: minute, seconds: second })
  );
}

function sydneyTomorrowDateString() {
  return DateTime.now().setZone('Australia/Sydney').plus({ days: 1 }).toISODate();
}

module.exports = { getSydneyTodayUtcBounds, sydneyDateAtHourUtc, sydneyTomorrowDateString };
