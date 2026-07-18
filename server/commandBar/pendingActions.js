const crypto = require('crypto');

const TTL_MS = 10 * 60 * 1000; // 10 minutes
const store = new Map();

function sweep() {
  const now = Date.now();
  for (const [id, entry] of store) {
    if (entry.expiresAt <= now) store.delete(id);
  }
}

// Runs in the background so expired actions don't linger in memory even if
// nobody calls get/consume for a while. Unref'd so it never keeps the process
// alive on its own.
const sweepTimer = setInterval(sweep, 60 * 1000);
if (sweepTimer.unref) sweepTimer.unref();

// Stores a write tool's pending confirmation. `action` is whatever the tool
// needs at execute time (tool name, resolved args, summary). Scoped to the
// requesting user — a stolen/guessed id from another user's session never
// resolves.
function createPendingAction(userId, action) {
  sweep();
  const id = crypto.randomUUID();
  const now = Date.now();
  store.set(id, { id, userId, action, createdAt: now, expiresAt: now + TTL_MS });
  return id;
}

// Read without consuming — used to render the confirmation card again if needed.
function peekPendingAction(id, userId) {
  sweep();
  const entry = store.get(id);
  if (!entry || entry.userId !== userId) return null;
  return entry;
}

// Read and remove — a pending action can only ever be executed once.
function consumePendingAction(id, userId) {
  sweep();
  const entry = store.get(id);
  if (!entry || entry.userId !== userId) return null;
  store.delete(id);
  return entry;
}

module.exports = { createPendingAction, peekPendingAction, consumePendingAction };
