const { pool, P } = require('../database');

// One row per changed field; entity creations get a single row with
// field=NULL and new_value set to a short JSON summary. `client` is optional —
// pass the transaction client when auditing inside a BEGIN/COMMIT block so the
// audit rows land atomically with the write they describe.
async function auditWrite(client, { entityType, entityId, field = null, oldValue = null, newValue = null, userId }) {
  const runner = client || pool;
  await runner.query(P(`
    INSERT INTO record_audit (entity_type, entity_id, field, old_value, new_value, source, user_id)
    VALUES (?, ?, ?, ?, ?, 'command_bar', ?)
  `), [entityType, entityId, field, oldValue, newValue, userId ?? null]);
}

// Log a creation: one row, field NULL, new_value is a short JSON summary of
// what was created.
async function auditCreate(client, entityType, entityId, summary, userId) {
  await auditWrite(client, {
    entityType,
    entityId,
    field: null,
    oldValue: null,
    newValue: JSON.stringify(summary),
    userId,
  });
}

// Log an update: one row per changed field. `changes` is
// [{ field, oldValue, newValue }, ...] — values are stringified for storage.
async function auditUpdate(client, entityType, entityId, changes, userId) {
  for (const change of changes) {
    await auditWrite(client, {
      entityType,
      entityId,
      field: change.field,
      oldValue: change.oldValue === null || change.oldValue === undefined ? null : String(change.oldValue),
      newValue: change.newValue === null || change.newValue === undefined ? null : String(change.newValue),
      userId,
    });
  }
}

module.exports = { auditWrite, auditCreate, auditUpdate };
