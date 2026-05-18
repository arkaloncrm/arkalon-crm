import React, { useState, useRef, useEffect } from 'react';
import Button from './Button.jsx';
import { useToast } from '../../context/ToastContext.jsx';

// Reusable executive-summary card for record detail pages.
// Props:
//   value      — current saved summary (string)
//   onSave     — async (text) => Promise; fired on explicit Save click
//   entityName — used in the empty-state placeholder ("...for this lead...")
export default function ExecutiveSummary({ value, onSave, entityName = 'record' }) {
  const { addToast } = useToast();
  const [text, setText] = useState(value || '');
  const [baseline, setBaseline] = useState(value || '');
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const taRef = useRef(null);

  // Re-sync when the parent record reloads.
  useEffect(() => {
    setText(value || '');
    setBaseline(value || '');
  }, [value]);

  // Auto-resize the textarea to fit its content.
  useEffect(() => {
    const ta = taRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = `${Math.max(ta.scrollHeight, 56)}px`;
    }
  }, [text]);

  const dirty = text !== baseline;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(text);
      setBaseline(text);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to save executive summary', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="bg-white border border-arkalon-lightgrey border-l-4 rounded-lg overflow-hidden mb-4"
      style={{ borderLeftColor: '#0073C6' }}
    >
      <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-arkalon-lightgrey">
        <h3 className="font-montserrat font-semibold text-arkalon-navy text-sm uppercase tracking-wide">
          Executive Summary
        </h3>
        <div className="flex items-center gap-2">
          {savedFlash && (
            <span className="text-xs font-opensans font-semibold text-green-600">Saved</span>
          )}
          <Button size="sm" onClick={handleSave} disabled={saving || !dirty}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
      <div className="p-4">
        <textarea
          ref={taRef}
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={`Add an executive summary for this ${entityName}...`}
          className="w-full px-3 py-2 text-base text-slate-800 font-opensans leading-relaxed border border-arkalon-lightgrey rounded resize-none focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30"
        />
      </div>
    </div>
  );
}
