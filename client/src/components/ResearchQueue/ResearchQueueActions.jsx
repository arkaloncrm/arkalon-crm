import React, { useState, useRef, useEffect } from 'react';
import { ArrowRight } from 'lucide-react';
import Button from '../UI/Button.jsx';
import Modal from '../UI/Modal.jsx';

const CONVERT_TARGETS = [
  { key: 'lead', label: 'Convert to Lead' },
  { key: 'account', label: 'Convert to Account' },
  { key: 'contact', label: 'Convert to Contact' },
  { key: 'task', label: 'Convert to Task' },
];

const MENU_W = 192;
const MENU_H = 164;

// Convert action — an ArrowRight trigger (icon for list rows, card-sized for
// mobile cards, full button for the detail header) with a Lead/Account/Contact/
// Task menu. The menu is fixed-positioned so it is never clipped by a parent
// with overflow (e.g. the desktop table's horizontal-scroll wrapper).
export function ConvertDropdown({ onConvert, disabled = false, variant = 'icon' }) {
  const [pos, setPos] = useState(null); // null = closed
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!pos) return;
    const onDocMouseDown = (e) => {
      if (triggerRef.current && triggerRef.current.contains(e.target)) return;
      if (menuRef.current && menuRef.current.contains(e.target)) return;
      setPos(null);
    };
    const close = () => setPos(null);
    document.addEventListener('mousedown', onDocMouseDown);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [pos]);

  const toggle = (e) => {
    e.stopPropagation();
    if (pos) { setPos(null); return; }
    const r = triggerRef.current.getBoundingClientRect();
    const openUp = r.bottom + MENU_H > window.innerHeight;
    setPos({
      top: openUp ? Math.max(8, r.top - MENU_H - 4) : r.bottom + 4,
      left: Math.max(8, r.right - MENU_W),
    });
  };

  return (
    <div ref={triggerRef} className="inline-flex">
      {variant === 'button' ? (
        <Button size="sm" onClick={toggle} disabled={disabled}>
          <ArrowRight className="w-3.5 h-3.5" /> Convert
        </Button>
      ) : variant === 'card' ? (
        <button
          type="button"
          onClick={toggle}
          disabled={disabled}
          aria-label="Convert"
          title="Convert"
          className="flex items-center justify-center h-11 w-11 rounded transition-colors text-slate-400 hover:bg-slate-50 hover:text-green-600 disabled:opacity-30"
        >
          <ArrowRight className="w-4 h-4" />
        </button>
      ) : (
        <button
          type="button"
          onClick={toggle}
          disabled={disabled}
          title="Convert"
          className="p-1 text-slate-400 hover:text-green-600 transition-colors disabled:opacity-30"
        >
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      )}

      {pos && (
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: MENU_W }}
          className="bg-white border border-arkalon-lightgrey rounded-lg shadow-lg z-50 py-1"
        >
          {CONVERT_TARGETS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={(e) => { e.stopPropagation(); setPos(null); onConvert(t.key); }}
              className="w-full text-left px-3 py-2 text-sm font-opensans text-slate-700 hover:bg-blue-50/60 transition-colors"
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Reject prompt — captures a reason; the record stays in the queue as an audit
// record once rejected.
export function RejectModal({ isOpen, onClose, onSubmit, loading = false }) {
  const [reason, setReason] = useState('');

  useEffect(() => { if (isOpen) setReason(''); }, [isOpen]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Reject Record" size="sm">
      <p className="text-sm text-slate-600 font-opensans mb-3">
        Add a reason for rejecting this research record. It stays in the queue as a permanent audit record.
      </p>
      <textarea
        rows={3}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason for rejection…"
        className="w-full px-3 py-2 text-sm border border-arkalon-lightgrey rounded font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30 resize-none"
      />
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
        <Button variant="danger" onClick={() => onSubmit(reason)} disabled={loading || !reason.trim()}>
          {loading ? 'Rejecting…' : 'Reject'}
        </Button>
      </div>
    </Modal>
  );
}
