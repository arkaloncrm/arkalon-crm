import React, { useState, useEffect } from 'react';
import Modal from './Modal.jsx';
import Button from './Button.jsx';
import TaskSuggestion from './TaskSuggestion.jsx';
import { notesApi } from '../../api/notes.js';
import { useToast } from '../../context/ToastContext.jsx';

// Quick note composer used by the Hit List and the mobile swipe cards.
// `parent` must contain exactly one of lead_id / contact_id / account_id /
// deal_id — the record the note is filed against. The note saves and returns
// immediately; a follow-up task suggestion (if any) is fetched afterwards and
// shown without ever blocking or freezing the modal on the parse.
export default function QuickNoteModal({ open, onClose, parent, recordName, onSaved }) {
  const { addToast } = useToast();
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [phase, setPhase] = useState('compose'); // 'compose' | 'suggesting' | 'suggestion'
  const [suggestion, setSuggestion] = useState(null);

  useEffect(() => {
    if (open) {
      setContent('');
      setSaving(false);
      setPhase('compose');
      setSuggestion(null);
    }
  }, [open]);

  if (!open) return null;

  const handleSave = async () => {
    const text = content.trim();
    if (!text) return;
    setSaving(true);
    try {
      await notesApi.create({ content: text, ...parent });
      addToast('Note added', 'success');
      onSaved?.();

      // The note is saved. Never block the modal on the parse — flip to a
      // dismissible phase the user can close at any time, and fetch the
      // suggestion in the background.
      setSaving(false);
      setPhase('suggesting');

      let settled = false;
      const finish = (fn) => { if (!settled) { settled = true; fn(); } };
      // Safety net: never sit waiting indefinitely on the parse.
      const timer = setTimeout(() => finish(() => onClose()), 8000);

      notesApi.suggestTask({ content: text, ...parent })
        .then(res => finish(() => {
          clearTimeout(timer);
          const d = res.data.data;
          if (d?.action_detected) { setSuggestion(d); setPhase('suggestion'); }
          else onClose();
        }))
        .catch(() => finish(() => { clearTimeout(timer); onClose(); }));
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to add note', 'error');
      setSaving(false);
    }
  };

  const title = recordName ? `Add Note — ${recordName}` : 'Add Note';

  return (
    <Modal
      isOpen={open}
      onClose={saving ? () => {} : onClose}
      title={title}
      size="sm"
    >
      {phase === 'suggestion' && suggestion ? (
        <TaskSuggestion suggestion={suggestion} onClose={onClose} />
      ) : phase === 'suggesting' ? (
        <div className="text-sm font-opensans">
          <p className="text-green-600 font-semibold mb-1">Note saved ✓</p>
          <p className="text-slate-400">Checking for a follow-up…</p>
          <div className="flex justify-end mt-4">
            <Button variant="secondary" onClick={onClose}>Done</Button>
          </div>
        </div>
      ) : (
        <>
          <textarea
            autoFocus
            rows={4}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write a note…"
            className="w-full px-3 py-2 text-sm border border-arkalon-lightgrey rounded font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30 resize-none"
          />
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !content.trim()}>
              {saving ? 'Saving…' : 'Save Note'}
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}
