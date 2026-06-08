const { DateTime } = require('luxon');

const TZ = 'Australia/Sydney';
const MODEL = 'claude-sonnet-4-6';

// Build the instruction prompt. We give the model the current Sydney date/time so
// it can resolve relative references ("tomorrow", "Friday") deterministically, and
// we ask for Sydney-LOCAL date/time parts — the server does the UTC conversion.
function buildPrompt(noteText, nowSydney) {
  const nowLabel = nowSydney.toFormat("cccc, yyyy-LL-dd 'at' HH:mm"); // e.g. Monday, 2026-06-08 at 14:30
  return `You convert a CRM note into at most one follow-up task.

Current date and time (Australia/Sydney): ${nowLabel}.

Rules:
- Set action_detected to true ONLY if the note contains BOTH (a) an actionable task or follow-up the user must DO, AND (b) a time or date reference for when. If either is missing, action_detected MUST be false.
- If several actions exist, choose the single most important, earliest-dated follow-up.
- Resolve all relative dates ("today", "tomorrow", "Friday", "next week") against the current Sydney date above. Return them as Sydney-local calendar values, never UTC.
- due_time is 24-hour "HH:MM". If no specific time is mentioned, set due_time to null and is_all_day to true.
- reminder_date / reminder_time: only when the note explicitly mentions a separate reminder or heads-up time; otherwise null.
- subject: a concise imperative task title, e.g. "Send quote for 450 chairs".

Return ONLY valid JSON, no other text:
{
  "action_detected": boolean,
  "subject": string,
  "due_date": "YYYY-MM-DD" or null,
  "due_time": "HH:MM" or null,
  "is_all_day": boolean,
  "reminder_date": "YYYY-MM-DD" or null,
  "reminder_time": "HH:MM" or null
}

Note:
"""${noteText}"""`;
}

// Convert Sydney-local date (+ optional time) into the UTC string tasks store
// ('YYYY-MM-DD HH:mm:ss'), matching how the Task form persists due_datetime.
function sydneyPartsToUtc(dateStr, timeStr) {
  if (!dateStr) return null;
  const dt = DateTime.fromISO(`${dateStr}T${timeStr || '00:00'}`, { zone: TZ });
  if (!dt.isValid) return null;
  return dt.toUTC().toFormat('yyyy-LL-dd HH:mm:ss');
}

// Parse a note into a single task suggestion. NEVER throws — any failure (missing
// API key, API/network error, bad JSON) resolves to action_detected:false so the
// note-save flow is never disrupted. A resolved due date is REQUIRED: without a
// time reference there is no suggestion.
async function parseNoteTask(noteText, now = DateTime.now(), timezone = TZ) {
  const empty = {
    action_detected: false, subject: '', due_datetime: null,
    is_all_day: true, reminder_datetime: null, due_date: null, due_time: null,
  };
  try {
    if (!noteText || !noteText.trim()) return empty;
    if (!process.env.ANTHROPIC_API_KEY) return empty;

    const nowSydney = (now instanceof DateTime ? now : DateTime.fromJSDate(now)).setZone(timezone);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        messages: [{ role: 'user', content: buildPrompt(noteText, nowSydney) }],
      }),
    });

    if (!response.ok) {
      console.error('[NOTE-PARSE] Anthropic API error', response.status);
      return empty;
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    const clean = text.replace(/```json|```/g, '').trim();
    let parsed;
    try { parsed = JSON.parse(clean); } catch { return empty; }

    const isAllDay = !parsed.due_time;
    const due_datetime = sydneyPartsToUtc(parsed.due_date, isAllDay ? null : parsed.due_time);

    // Require BOTH the model's action flag AND a resolvable due date.
    if (!parsed.action_detected || !due_datetime) return empty;

    return {
      action_detected: true,
      subject: String(parsed.subject || '').trim() || 'Follow up',
      due_datetime,
      is_all_day: isAllDay,
      reminder_datetime: sydneyPartsToUtc(parsed.reminder_date, parsed.reminder_time),
      due_date: parsed.due_date || null,
      due_time: isAllDay ? null : parsed.due_time,
    };
  } catch (err) {
    console.error('[NOTE-PARSE] Failed:', err.message);
    return empty;
  }
}

module.exports = { parseNoteTask };
