const express = require('express');
const router = express.Router();

const { buildSystemPrompt, MODEL } = require('../commandBar/systemPrompt');
const { TOOLS, READ_TOOL_NAMES, ALL_TOOL_NAMES } = require('../commandBar/toolDefinitions');
const readTools = require('../commandBar/tools/readTools');
const writeTools = require('../commandBar/tools/writeTools');
const parseTools = require('../commandBar/tools/parseTools');
const { createPendingAction, consumePendingAction } = require('../commandBar/pendingActions');
const { checkRateLimit } = require('../commandBar/rateLimit');

const MAX_MESSAGE_CHARS = 8000;
const MAX_TOOL_ROUNDS = 5;

const READ_HANDLERS = {
  query_deals: readTools.queryDeals,
  query_contacts: readTools.queryContacts,
  query_tasks: readTools.queryTasks,
  pipeline_summary: readTools.pipelineSummary,
  precall_brief: readTools.precallBrief,
  find_records: readTools.findRecords,
};

const PREPARE_HANDLERS = { ...writeTools.PREPARE, ...parseTools.PARSE_PREPARE };
const EXECUTE_HANDLERS = { ...writeTools.EXECUTE, ...parseTools.PARSE_EXECUTE };

async function callAnthropic(system, messages) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      system,
      messages,
      tools: TOOLS,
      tool_choice: { type: 'auto' },
    }),
  });
  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Anthropic API error ${response.status}: ${errText.slice(0, 300)}`);
  }
  return response.json();
}

// Prior turns are stored client-side as plain { role, content } text pairs
// (not raw tool-call tapes) — kept small and simple for the "now push it two
// weeks" multi-turn case, where the model re-resolves the referent from the
// visible conversation text rather than replaying tool state.
function sanitiseConversation(conversation) {
  if (!Array.isArray(conversation)) return [];
  return conversation
    .filter(turn => turn && (turn.role === 'user' || turn.role === 'assistant') && typeof turn.content === 'string')
    .slice(-20)
    .map(turn => ({ role: turn.role, content: turn.content }));
}

async function runCommandLoop({ message, conversation, userId }) {
  const system = buildSystemPrompt();
  const messages = [...sanitiseConversation(conversation), { role: 'user', content: message }];
  const collected = [];

  for (let round = 1; round <= MAX_TOOL_ROUNDS; round++) {
    const response = await callAnthropic(system, messages);

    if (response.usage) {
      console.log(`[COMMAND-BAR] user=${userId} round=${round} tokens in=${response.usage.input_tokens} out=${response.usage.output_tokens}`);
    }

    const assistantContent = response.content || [];
    messages.push({ role: 'assistant', content: assistantContent });

    const toolUses = assistantContent.filter(b => b.type === 'tool_use');
    if (toolUses.length === 0) {
      const text = assistantContent.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
      return { type: 'result', text, data: collected };
    }

    const toolResults = [];
    let confirmation = null;

    for (const tu of toolUses) {
      const name = tu.name;
      const args = tu.input || {};

      // Enforcement boundary: the model can only ever invoke tools we defined,
      // with server-side validation inside each handler. Never eval anything.
      if (!ALL_TOOL_NAMES.includes(name)) {
        toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify({ error: `Unknown tool "${name}"` }), is_error: true });
        continue;
      }

      try {
        if (READ_TOOL_NAMES.includes(name)) {
          const result = await READ_HANDLERS[name](args, { userId });
          collected.push({ tool: name, args, result });
          toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(result) });
        } else if (name === 'draft_email') {
          const result = await parseTools.draftEmail(args, { userId });
          collected.push({ tool: name, args, result });
          toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(result) });
        } else {
          const prepared = await PREPARE_HANDLERS[name](args, { userId });
          if (prepared?.error) {
            toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify({ error: prepared.error }), is_error: true });
          } else if (prepared?.ambiguous) {
            toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(prepared) });
          } else if (prepared?.pending) {
            const pendingActionId = createPendingAction(userId, { toolName: name, execute: prepared.execute, selectable: !!prepared.selectable });
            confirmation = {
              type: 'confirmation',
              pending_action_id: pendingActionId,
              tool_name: name,
              summary: prepared.summary,
              label: prepared.label,
              selectable: !!prepared.selectable,
            };
            break;
          } else {
            toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify({ error: 'Tool returned no result' }), is_error: true });
          }
        }
      } catch (err) {
        console.error(`[COMMAND-BAR] Tool "${name}" failed:`, err.message);
        toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify({ error: 'Internal error executing this tool' }), is_error: true });
      }
    }

    if (confirmation) return confirmation;

    messages.push({ role: 'user', content: toolResults });
  }

  return { type: 'error', error: 'This command needed too many steps to resolve — try being more specific.' };
}

// POST /api/command
router.post('/', async (req, res) => {
  try {
    const userId = req.user.id;

    if (!checkRateLimit(userId)) {
      return res.status(429).json({ success: false, error: 'Too many commands — wait a moment and try again.' });
    }

    const { message, conversation, pending_action_id, confirm, selections } = req.body || {};

    // --- Confirmation path: execute a previously prepared write. A missing
    // or expired/mismatched id must never execute anything.
    if (pending_action_id) {
      const entry = consumePendingAction(pending_action_id, userId);
      if (!entry) {
        return res.status(400).json({ success: false, data: { type: 'error', error: 'This confirmation has expired or is invalid — please try the command again.' } });
      }
      if (confirm === false) {
        return res.json({ success: true, data: { type: 'cancelled' } });
      }

      const executeFn = EXECUTE_HANDLERS[entry.action.toolName];
      if (!executeFn) {
        return res.status(400).json({ success: false, data: { type: 'error', error: 'Unknown pending action type' } });
      }

      const result = await executeFn(entry.action.execute, { userId }, selections);
      return res.json({ success: true, data: { type: 'executed', ...result } });
    }

    // --- Normal message path
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ success: false, error: 'message is required' });
    }
    if (message.length > MAX_MESSAGE_CHARS) {
      return res.status(400).json({ success: false, error: `Command is too long (${message.length} chars) — the limit is ${MAX_MESSAGE_CHARS}.` });
    }

    const result = await runCommandLoop({ message, conversation, userId });
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[COMMAND-BAR] Request failed:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
