import React, { useState, useEffect, useRef } from 'react';
import { ArrowRight, ArrowLeft, Trash2 } from 'lucide-react';
import { myDayApi } from '../../api/myDay.js';
import { useToast } from '../../context/ToastContext.jsx';
import './MyDayPage.css';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const SWIPE_THRESHOLD = 80;
const LONG_PRESS_MS = 550;
const ROLLOVER_KEY = 'myday_last_rollover';

function dateForOffset(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d;
}

function localDateStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dateLabelFor(offset) {
  const d = dateForOffset(offset);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function normalise(data) {
  return {
    today: (data && data.today) || [],
    tomorrow: (data && data.tomorrow) || [],
  };
}

// --- a single notebook line --------------------------------------------------
function TaskRow({ item, onToggle, onPush, onRequestDelete }) {
  const isToday = item.date_bucket === 'today';
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const touch = useRef(null);
  const dragXRef = useRef(0);
  const longPress = useRef(null);
  const gesture = useRef({ longPressed: false, swiped: false });

  const clearLongPress = () => {
    if (longPress.current) {
      clearTimeout(longPress.current);
      longPress.current = null;
    }
  };

  const reset = () => {
    clearLongPress();
    dragXRef.current = 0;
    setDragX(0);
    setDragging(false);
    touch.current = null;
  };

  const handleTouchStart = (e) => {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY, axis: null };
    gesture.current = { longPressed: false, swiped: false };
    clearLongPress();
    longPress.current = setTimeout(() => {
      gesture.current.longPressed = true;
      setDragX(0);
      dragXRef.current = 0;
      onRequestDelete(item);
    }, LONG_PRESS_MS);
  };

  const handleTouchMove = (e) => {
    if (!touch.current) return;
    const t = e.touches[0];
    const dx = t.clientX - touch.current.x;
    const dy = t.clientY - touch.current.y;

    // Lock onto an axis once movement is clearly horizontal or vertical so a
    // swipe never fights the page's vertical scroll.
    if (!touch.current.axis) {
      if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) {
        touch.current.axis = 'x';
        clearLongPress();
        setDragging(true);
      } else if (Math.abs(dy) > 12) {
        reset();
        return;
      } else {
        return;
      }
    }
    if (touch.current.axis !== 'x') return;

    // Only the meaningful direction drags: today pushes right, tomorrow pulls left.
    let d = isToday ? Math.max(0, dx) : Math.min(0, dx);
    d = Math.max(-150, Math.min(150, d));
    dragXRef.current = d;
    setDragX(d);
  };

  const handleTouchEnd = () => {
    clearLongPress();
    if (touch.current && touch.current.axis === 'x') {
      gesture.current.swiped = true;
      const d = dragXRef.current;
      if (isToday && d > SWIPE_THRESHOLD) onPush(item);
      else if (!isToday && d < -SWIPE_THRESHOLD) onPush(item);
    }
    reset();
  };

  // A long-press or a completed swipe is followed by a click — swallow it so it
  // doesn't also toggle completion.
  const guardedToggle = () => {
    if (gesture.current.longPressed || gesture.current.swiped) {
      gesture.current.longPressed = false;
      gesture.current.swiped = false;
      return;
    }
    onToggle(item);
  };

  const done = item.completed;

  return (
    <div
      className={`myday-row${dragging ? ' is-dragging' : ''}`}
      style={{ transform: `translateX(${dragX}px)` }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={reset}
    >
      <span className={`myday-text${done ? ' is-done' : ''}`} onClick={guardedToggle}>
        {item.title}
      </span>

      <button
        type="button"
        className="myday-rowdelete"
        onClick={() => onRequestDelete(item)}
        aria-label="Delete item"
        tabIndex={-1}
      >
        <Trash2 size={15} />
      </button>

      <button
        type="button"
        className="myday-arrow"
        onClick={() => onPush(item)}
        aria-label={isToday ? 'Push to tomorrow' : 'Pull back to today'}
      >
        <svg
          width="28"
          height="20"
          viewBox="0 0 28 20"
          fill="none"
          style={{ opacity: 0.8, transform: isToday ? undefined : 'scaleX(-1)' }}
        >
          <path
            d="M2 10 C8 9, 16 8, 22 10"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M19 6 C21 8, 23 9.5, 22 10 C21 10.5, 19 11, 18 14"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            fill="none"
          />
        </svg>
      </button>
    </div>
  );
}

// --- one notebook page (used singly on mobile, paired on desktop) ------------
function NotebookPage(props) {
  const {
    side, bucket, items, loading, adding, addText,
    onAddText, onOpenAdd, onCommitAdd, onCancelAdd,
    onToggle, onPush, onRequestDelete,
  } = props;

  const offset = bucket === 'today' ? 0 : 1;
  const dayLabel = DAY_NAMES[dateForOffset(offset).getDay()];
  const dateLabel = dateLabelFor(offset);
  const isEmpty = !loading && items.length === 0;

  return (
    <div className={`myday-page myday-page--${side}`}>
      <div className="myday-rings" aria-hidden="true">
        <span className="myday-ring" />
        <span className="myday-ring" />
        <span className="myday-ring" />
      </div>

      <header className="myday-header">
        <h1 className="myday-day">{dayLabel}</h1>
        <span className="myday-date">{dateLabel}</span>
      </header>
      <div className="myday-rule-copper" />

      <div className="myday-list">
        {loading ? (
          <p className="myday-loading">opening your notebook…</p>
        ) : (
          <>
            {items.map((item) => (
              <TaskRow
                key={item.id}
                item={item}
                onToggle={onToggle}
                onPush={onPush}
                onRequestDelete={onRequestDelete}
              />
            ))}

            {adding ? (
              <input
                className="myday-add-input"
                autoFocus
                value={addText}
                placeholder="write it down…"
                onChange={(e) => onAddText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); onCommitAdd(true); }
                  if (e.key === 'Escape') onCancelAdd();
                }}
                onBlur={() => onCommitAdd(false)}
              />
            ) : (
              <button type="button" className="myday-add-trigger" onClick={onOpenAdd}>
                + add a new item…
              </button>
            )}

            {isEmpty && !adding && (
              <p className="myday-blank">a fresh page — write your first item above</p>
            )}
          </>
        )}
      </div>

      <p className="myday-swipe-hint">
        <span>Swipe item {bucket === 'today' ? 'right' : 'left'}</span>
        <span className="myday-swipe-hint__action">
          {bucket === 'today' ? 'push to tomorrow →' : '← pull to today'}
        </span>
      </p>

      <svg className="myday-scribble" viewBox="0 0 100 100" aria-hidden="true">
        <path
          d="M50 14 L59 41 L88 41 L64 58 L73 86 L50 69 L27 86 L36 58 L12 41 L41 41 Z"
          fill="none" stroke="currentColor" strokeWidth="2.4"
          strokeLinejoin="round" strokeLinecap="round"
        />
      </svg>
      <div className="coffee-ring" aria-hidden="true" />
    </div>
  );
}

export default function MyDayPage() {
  const { addToast } = useToast();
  const [items, setItems] = useState({ today: [], tomorrow: [] });
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('today');
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches
  );
  const [adding, setAdding] = useState(null);
  const [addText, setAddText] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const handler = (e) => setIsDesktop(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Run the daily rollover the first time the page opens on a new calendar day.
  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const today = localDateStr();
        const last = localStorage.getItem(ROLLOVER_KEY);
        const res = last === today ? await myDayApi.getAll() : await myDayApi.rollover();
        if (last !== today) localStorage.setItem(ROLLOVER_KEY, today);
        if (active) setItems(normalise(res.data.data));
      } catch (err) {
        if (active) addToast('Could not open My Day', 'error');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [addToast]);

  const replaceItem = (updated) => {
    setItems((prev) => {
      const next = { today: [...prev.today], tomorrow: [...prev.tomorrow] };
      for (const b of ['today', 'tomorrow']) {
        const i = next[b].findIndex((it) => it.id === updated.id);
        if (i !== -1) next[b][i] = updated;
      }
      return next;
    });
  };

  const handleToggle = async (item) => {
    try {
      const res = await myDayApi.toggleComplete(item.id);
      replaceItem(res.data.data);
    } catch (err) {
      addToast('Could not update item', 'error');
    }
  };

  const handlePush = async (item) => {
    const from = item.date_bucket;
    const to = from === 'today' ? 'tomorrow' : 'today';
    try {
      const res = await myDayApi.push(item.id);
      setItems((prev) => ({
        ...prev,
        [from]: prev[from].filter((it) => it.id !== item.id),
        [to]: [...prev[to], res.data.data],
      }));
    } catch (err) {
      addToast('Could not move item', 'error');
    }
  };

  const handleAdd = async (bucket, keepOpen) => {
    const title = addText.trim();
    setAddText('');
    setAdding(keepOpen && title ? bucket : null);
    if (!title) return;
    try {
      const res = await myDayApi.create({ title, date_bucket: bucket });
      setItems((prev) => ({ ...prev, [bucket]: [...prev[bucket], res.data.data] }));
    } catch (err) {
      addToast(err.response?.data?.error || 'Could not add item', 'error');
    }
  };

  const handleDelete = async () => {
    const item = confirmDelete;
    setConfirmDelete(null);
    if (!item) return;
    try {
      await myDayApi.delete(item.id);
      setItems((prev) => ({
        ...prev,
        [item.date_bucket]: prev[item.date_bucket].filter((it) => it.id !== item.id),
      }));
    } catch (err) {
      addToast('Could not delete item', 'error');
    }
  };

  const pageProps = (bucket, side) => ({
    side,
    bucket,
    items: items[bucket],
    loading,
    adding: adding === bucket,
    addText,
    onAddText: setAddText,
    onOpenAdd: () => { setAddText(''); setAdding(bucket); },
    onCommitAdd: (keepOpen) => handleAdd(bucket, keepOpen),
    onCancelAdd: () => { setAddText(''); setAdding(null); },
    onToggle: handleToggle,
    onPush: handlePush,
    onRequestDelete: setConfirmDelete,
  });

  const todayDone = items.today.filter((i) => i.completed).length;
  const todayTotal = items.today.length;
  const pct = todayTotal ? Math.round((todayDone / todayTotal) * 100) : 0;

  return (
    <div className="myday-root">
      <div className="myday-frame">
        {isDesktop ? (
          <div className="myday-spread">
            <NotebookPage {...pageProps('today', 'left')} />
            <div className="myday-spine" aria-hidden="true" />
            <NotebookPage {...pageProps('tomorrow', 'right')} />
          </div>
        ) : (
          <>
            <div className="myday-tabs">
              <button
                type="button"
                className={`myday-tab myday-tab--today${view === 'today' ? ' is-active' : ''}`}
                onClick={() => setView('today')}
              >
                Today
              </button>
              <button
                type="button"
                className={`myday-tab myday-tab--tomorrow${view === 'tomorrow' ? ' is-active' : ''}`}
                onClick={() => setView('tomorrow')}
              >
                Tomorrow
              </button>
            </div>
            <NotebookPage {...pageProps(view, 'single')} />
          </>
        )}

        <div className="myday-progress">
          <div className="myday-progress__text">
            <span className="myday-progress__count">{todayDone}</span>
            {' of '}
            <span className="myday-progress__count">{todayTotal}</span>
            {' done today'}
          </div>
          <div className="myday-progress__bar">
            <div className="myday-progress__fill" style={{ width: `${pct}%` }} />
          </div>
          {!isDesktop && (
            <button
              type="button"
              className="myday-progress__btn"
              onClick={() => setView((v) => (v === 'today' ? 'tomorrow' : 'today'))}
              aria-label={view === 'today' ? 'Go to tomorrow' : 'Go to today'}
            >
              {view === 'today' ? <ArrowRight size={20} /> : <ArrowLeft size={20} />}
            </button>
          )}
        </div>
      </div>

      {confirmDelete && (
        <div className="myday-confirm" onClick={() => setConfirmDelete(null)}>
          <div className="myday-confirm__card" onClick={(e) => e.stopPropagation()}>
            <p className="myday-confirm__title">Tear this out?</p>
            <p className="myday-confirm__body">“{confirmDelete.title}”</p>
            <div className="myday-confirm__actions">
              <button
                type="button"
                className="myday-confirm__cancel"
                onClick={() => setConfirmDelete(null)}
              >
                Keep it
              </button>
              <button
                type="button"
                className="myday-confirm__delete"
                onClick={handleDelete}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
