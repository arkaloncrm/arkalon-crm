import React, { useState, useEffect } from 'react';
import Modal from './Modal.jsx';
import Button from './Button.jsx';
import { notesApi } from '../../api/notes.js';
import { useToast } from '../../context/ToastContext.jsx';

// Quick note composer used by the Hit List and the mobile swipe cards.
// `parent` must contain exactly one of lead_id / contact_id / account_id /
// deal_id — the record the note is filed against. The modal only closes once
// the note has saved successfully.
export default function QuickNoteModal({ open, onClose, parent, recordName, onSaved }) {
  const { addToast } = useToast();
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setContent('');
      setSaving(false);
    }
  }, [open]);

  if (!open) return null;

  const handleSave = async () => {
    if (!content.trim()) return;
    setSaving(true);
    try {
      await notesApi.create({ content: content.trim(), ...parent });
      addToast('Note added', 'success');
      onSaved?.();
      onClose();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to add note', 'error');
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={saving ? () => {} : onClose}
      title={recordName ? `Add Note — ${recordName}` : 'Add Note'}
      size="sm"
    >
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
    </Modal>
  );
}
