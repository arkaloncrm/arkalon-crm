import api from './axios.js';

// Sends a Command Bar message. `conversation` is the prior turns as plain
// { role, content } text pairs (see server/routes/command.js
// sanitiseConversation) — enough for the model to resolve "now push it two
// weeks" against the visible chat text.
export function sendCommand(message, conversation) {
  return api.post('/command', { message, conversation });
}

// Confirms (or cancels) a pending write. `selections` is only meaningful for
// selectable actions (extract_tasks_from_text) — an array of item indices to
// actually create.
export function confirmCommand(pendingActionId, confirm, selections) {
  return api.post('/command', { pending_action_id: pendingActionId, confirm, selections });
}
