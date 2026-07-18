// Simple in-memory sliding-window limiter, per user. Good enough for a
// single-user-in-practice CRM on one Railway instance — no external store
// needed, matching the pending-actions map's in-memory approach.
const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 30;

const hits = new Map(); // userId -> timestamps[]

function checkRateLimit(userId) {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  const existing = (hits.get(userId) || []).filter(t => t > cutoff);
  existing.push(now);
  hits.set(userId, existing);
  return existing.length <= MAX_PER_WINDOW;
}

module.exports = { checkRateLimit, MAX_PER_WINDOW };
