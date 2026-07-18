const { DateTime } = require('luxon');

const TZ = 'Australia/Sydney';
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function sydneyNow() {
  return DateTime.now().setZone(TZ);
}

// Resolve a single absolute or relative date expression to a Sydney-local
// 'YYYY-MM-DD' string. Never throws — returns null on anything unparseable.
// All arithmetic happens in the Australia/Sydney zone so day boundaries never
// shift across the UTC offset (AEST/AEDT).
function resolveDateExpression(expr, nowSydney = sydneyNow()) {
  if (!expr) return null;
  const raw = String(expr).trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const dt = DateTime.fromISO(raw, { zone: TZ });
    return dt.isValid ? dt.toISODate() : null;
  }

  const lower = raw.toLowerCase();

  if (lower === 'today') return nowSydney.toISODate();
  if (lower === 'tomorrow') return nowSydney.plus({ days: 1 }).toISODate();
  if (lower === 'yesterday') return nowSydney.minus({ days: 1 }).toISODate();
  if (lower === 'next week') return nowSydney.plus({ weeks: 1 }).toISODate();
  if (lower === 'next month') return nowSydney.plus({ months: 1 }).toISODate();

  let m = lower.match(/^(?:in\s+)?(\d+)\s+days?(?:\s+from\s+today)?$/);
  if (m) return nowSydney.plus({ days: Number(m[1]) }).toISODate();

  m = lower.match(/^(?:in\s+)?(\d+)\s+weeks?(?:\s+from\s+today)?$/);
  if (m) return nowSydney.plus({ weeks: Number(m[1]) }).toISODate();

  m = lower.match(/^(?:in\s+)?(\d+)\s+months?(?:\s+from\s+today)?$/);
  if (m) return nowSydney.plus({ months: Number(m[1]) }).toISODate();

  m = lower.match(/^next\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/);
  if (m) {
    // Luxon weekday: 1=Monday..7=Sunday
    const targetDow = WEEKDAYS.indexOf(m[1]) === 0 ? 7 : WEEKDAYS.indexOf(m[1]);
    let dt = nowSydney.plus({ days: 1 });
    while (dt.weekday !== targetDow) dt = dt.plus({ days: 1 });
    return dt.toISODate();
  }

  const dt = DateTime.fromISO(raw, { zone: TZ });
  return dt.isValid ? dt.toISODate() : null;
}

// Resolve a date-range expression ("next 6 weeks", "this month") to Sydney
// { from, to } ISO date strings. A single resolvable date collapses to a
// one-day window. Returns null on anything unparseable.
function resolveDateWindow(expr, nowSydney = sydneyNow()) {
  if (!expr) return null;
  const lower = String(expr).trim().toLowerCase();
  if (!lower) return null;

  if (lower === 'this week') {
    return { from: nowSydney.startOf('week').toISODate(), to: nowSydney.endOf('week').toISODate() };
  }
  if (lower === 'this month') {
    return { from: nowSydney.startOf('month').toISODate(), to: nowSydney.endOf('month').toISODate() };
  }
  if (lower === 'this quarter') {
    return { from: nowSydney.startOf('quarter').toISODate(), to: nowSydney.endOf('quarter').toISODate() };
  }

  let m = lower.match(/^next\s+(\d+)\s+days?$/);
  if (m) return { from: nowSydney.toISODate(), to: nowSydney.plus({ days: Number(m[1]) }).toISODate() };

  m = lower.match(/^next\s+(\d+)\s+weeks?$/);
  if (m) return { from: nowSydney.toISODate(), to: nowSydney.plus({ weeks: Number(m[1]) }).toISODate() };

  m = lower.match(/^next\s+(\d+)\s+months?$/);
  if (m) return { from: nowSydney.toISODate(), to: nowSydney.plus({ months: Number(m[1]) }).toISODate() };

  const single = resolveDateExpression(expr, nowSydney);
  if (single) return { from: single, to: single };
  return null;
}

const WORD_NUMBERS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

// Parses a PURE duration phrase ("two weeks", "14 days" — no "from today" /
// "ago" anchor) into a Luxon-plus()-able object. Returns null if it isn't one.
function parseDurationPhrase(expr) {
  if (!expr) return null;
  const lower = String(expr).trim().toLowerCase();
  const numPattern = `(\\d+|${Object.keys(WORD_NUMBERS).join('|')})`;
  const m = lower.match(new RegExp(`^${numPattern}\\s+(day|days|week|weeks|month|months)$`));
  if (!m) return null;
  const amount = /^\d+$/.test(m[1]) ? Number(m[1]) : WORD_NUMBERS[m[1]];
  const unit = m[2].startsWith('day') ? 'days' : m[2].startsWith('week') ? 'weeks' : 'months';
  return { [unit]: amount };
}

// Adds a pure duration phrase to a given Sydney-local base date — NOT
// "today". Use this for "push/move/delay the close date by two weeks",
// where the anchor is the record's CURRENT date, unlike resolveDateExpression
// (which always anchors to today). Falls back to today if baseDateStr is null
// (e.g. a deal with no close_date set yet).
function pushDateByDuration(baseDateStr, durationExpr, nowSydney = sydneyNow()) {
  const duration = parseDurationPhrase(durationExpr);
  if (!duration) return null;
  const base = baseDateStr ? DateTime.fromISO(baseDateStr, { zone: TZ }) : nowSydney;
  if (!base.isValid) return null;
  return base.plus(duration).toISODate();
}

// Resolve a Sydney-local date expression + optional 'HH:MM' time into the UTC
// 'YYYY-MM-DD HH:mm:ss' string tasks/activities store, matching
// parseNoteTask.js's sydneyPartsToUtc conversion.
// Mirrors parseNoteTask.js's sydneyPartsToUtc: no time given means midnight
// Sydney (the codebase's all-day convention), not a guessed business hour.
function resolveDateTimeToUtc(dateExpr, timeStr, nowSydney = sydneyNow()) {
  const dateStr = resolveDateExpression(dateExpr, nowSydney);
  if (!dateStr) return null;
  const timePart = timeStr && /^\d{1,2}:\d{2}$/.test(timeStr) ? timeStr : '00:00';
  const dt = DateTime.fromISO(`${dateStr}T${timePart}`, { zone: TZ });
  if (!dt.isValid) return null;
  return dt.toUTC().toFormat('yyyy-LL-dd HH:mm:ss');
}

// Convert a Sydney-local { from, to } date window (as returned by
// resolveDateWindow) into UTC timestamp-string bounds for comparing against
// TIMESTAMP columns (tasks.due_datetime, activities.start_datetime). Deal
// close_date is a pure DATE column and should compare directly against the
// Sydney date strings instead — never run those through this helper.
function dateWindowToUtcRange(window) {
  if (!window) return null;
  const fromUtc = window.from
    ? DateTime.fromISO(window.from, { zone: TZ }).startOf('day').toUTC().toFormat('yyyy-LL-dd HH:mm:ss')
    : null;
  const toUtc = window.to
    ? DateTime.fromISO(window.to, { zone: TZ }).endOf('day').toUTC().toFormat('yyyy-LL-dd HH:mm:ss')
    : null;
  return { fromUtc, toUtc };
}

module.exports = {
  TZ,
  sydneyNow,
  resolveDateExpression,
  resolveDateWindow,
  resolveDateTimeToUtc,
  dateWindowToUtcRange,
  pushDateByDuration,
};
