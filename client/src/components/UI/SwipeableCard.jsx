import React, { useRef, useState, useEffect } from 'react';
import { Phone, StickyNote } from 'lucide-react';

// Finger travel (px) needed to commit to revealing an action.
const THRESHOLD = 70;
// Resting offset (px) once an action is revealed.
const REVEAL = 80;
// Hard clamp so the card never drifts further than one action width.
const MAX = 96;

// Mobile list card with horizontal swipe actions.
//  - swipe right  → reveals a green Call action on the left
//  - swipe left   → reveals a blue Note action on the right
// The swipe only reveals; the user must tap the revealed action to confirm.
// Vertical scrolling is preserved (the gesture only engages once horizontal
// travel clearly dominates) and only one card stays open at a time, arbitrated
// by the shared `openId` / `setOpenId` pair owned by the list.
export default function SwipeableCard({
  swipeId, openId, setOpenId, onClick, onCall, onNote, children, className = '',
}) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const cardRef = useRef(null);
  const offsetRef = useRef(0);
  const gesture = useRef({ x: 0, y: 0, base: 0, engaged: false, ignore: false });
  const swipedRef = useRef(false);

  const isOpen = openId === swipeId;

  useEffect(() => { offsetRef.current = offset; }, [offset]);

  // Snap shut when another card claims the single open slot.
  useEffect(() => { if (!isOpen) setOffset(0); }, [isOpen]);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    const onStart = (e) => {
      if (e.touches.length !== 1) { gesture.current.ignore = true; return; }
      const t = e.touches[0];
      // Never start a swipe from an interactive control inside the card.
      const interactive = e.target.closest('button, a, input, select, textarea, [role="button"]');
      gesture.current = {
        x: t.clientX, y: t.clientY,
        base: offsetRef.current,
        engaged: false,
        ignore: !!interactive,
      };
      swipedRef.current = false;
    };

    const onMove = (e) => {
      const g = gesture.current;
      if (g.ignore) return;
      const t = e.touches[0];
      const dx = t.clientX - g.x;
      const dy = t.clientY - g.y;
      if (!g.engaged) {
        if (Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx)) { g.ignore = true; return; }
        if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) { g.engaged = true; setDragging(true); }
        else return;
      }
      // Gesture is ours — stop the page from scrolling under the card.
      e.preventDefault();
      swipedRef.current = true;
      const next = Math.max(-MAX, Math.min(MAX, g.base + dx));
      setOffset(next);
    };

    const onEnd = () => {
      const g = gesture.current;
      if (!g.engaged) return;
      g.engaged = false;
      setDragging(false);
      const cur = offsetRef.current;
      if (cur >= THRESHOLD) { setOffset(REVEAL); setOpenId(swipeId); }
      else if (cur <= -THRESHOLD) { setOffset(-REVEAL); setOpenId(swipeId); }
      else { setOffset(0); setOpenId((id) => (id === swipeId ? null : id)); }
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [swipeId, setOpenId]);

  const close = () => {
    setOffset(0);
    setOpenId((id) => (id === swipeId ? null : id));
  };

  const handleClick = () => {
    // Suppress the click synthesised right after a drag.
    if (swipedRef.current) { swipedRef.current = false; return; }
    // An open card taps closed rather than navigating.
    if (offsetRef.current !== 0) { close(); return; }
    onClick?.();
  };

  return (
    <div className="relative overflow-hidden rounded-lg">
      {/* Call — revealed by swiping right */}
      <button
        type="button"
        aria-label="Call"
        onClick={() => { close(); onCall?.(); }}
        className="absolute inset-y-0 left-0 w-20 flex flex-col items-center justify-center gap-1 bg-green-600 text-white"
      >
        <Phone className="w-5 h-5" />
        <span className="text-xs font-montserrat font-semibold">Call</span>
      </button>
      {/* Note — revealed by swiping left */}
      <button
        type="button"
        aria-label="Add note"
        onClick={() => { close(); onNote?.(); }}
        className="absolute inset-y-0 right-0 w-20 flex flex-col items-center justify-center gap-1 bg-arkalon-blue text-white"
      >
        <StickyNote className="w-5 h-5" />
        <span className="text-xs font-montserrat font-semibold">Note</span>
      </button>
      {/* Foreground card */}
      <div
        ref={cardRef}
        onClick={handleClick}
        style={{
          transform: `translateX(${offset}px)`,
          transition: dragging ? 'none' : 'transform 0.2s ease',
        }}
        className={`relative z-10 bg-white border border-arkalon-lightgrey rounded-lg p-3 active:bg-blue-50/40 ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
