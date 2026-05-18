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

module.exports = { getSydneyTodayUtcBounds };
