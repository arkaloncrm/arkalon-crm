import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, X, Send, Loader2 } from 'lucide-react';
import { sendCommand, confirmCommand } from '../../api/command.js';
import { ResultBlock, ConfirmationCard } from './CommandBarResults.jsx';

const MAX_HISTORY = 20;
let nextTurnId = 1;

// Prior turns sent to the server as plain { role, content } text — matches
// server/routes/command.js sanitiseConversation. Only text turns carry chat
// meaning; confirmation/executed/error turns are UI-only records.
function toApiConversation(turns) {
  return turns
    .filter(t => t.kind === 'text' && t.text)
    .map(t => ({ role: t.role, content: t.text }));
}

export default function CommandBar({ isOpen, onClose, onOpen }) {
  const [turns, setTurns] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [busyTurnId, setBusyTurnId] = useState(null);
  const [selections, setSelections] = useState({}); // turnId -> { itemIndex: boolean }

  const historyRef = useRef([]);
  const historyIndexRef = useRef(-1);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  // Ctrl+K (or Cmd+K) opens from anywhere; Escape closes while open.
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpen();
      } else if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onOpen, onClose]);

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 50);
  }, [isOpen]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns]);

  // Conversation is scoped to one open session — cleared on close.
  const handleClose = useCallback(() => {
    setTurns([]);
    setInput('');
    setSelections({});
    onClose();
  }, [onClose]);

  const pushTurn = (turn) => setTurns(prev => [...prev, { id: nextTurnId++, ...turn }]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    historyRef.current = [text, ...historyRef.current.filter(h => h !== text)].slice(0, MAX_HISTORY);
    historyIndexRef.current = -1;

    pushTurn({ role: 'user', kind: 'text', text });
    setInput('');
    setLoading(true);

    try {
      const conversation = toApiConversation(turns);
      const res = await sendCommand(text, conversation);
      const data = res.data.data;

      if (data.type === 'result') {
        pushTurn({ role: 'assistant', kind: 'text', text: data.text, data: data.data || [] });
      } else if (data.type === 'confirmation') {
        pushTurn({ role: 'assistant', kind: 'confirmation', confirmation: data, resolved: null });
      } else if (data.type === 'error') {
        pushTurn({ role: 'assistant', kind: 'error', text: data.error });
      }
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Something went wrong.';
      pushTurn({ role: 'assistant', kind: 'error', text: msg });
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
      return;
    }
    if (e.key === 'ArrowUp' && !input) {
      const hist = historyRef.current;
      if (hist.length === 0) return;
      e.preventDefault();
      historyIndexRef.current = Math.min(historyIndexRef.current + 1, hist.length - 1);
      setInput(hist[historyIndexRef.current] || '');
    } else if (e.key === 'ArrowDown' && historyIndexRef.current >= 0) {
      e.preventDefault();
      historyIndexRef.current -= 1;
      setInput(historyIndexRef.current >= 0 ? historyRef.current[historyIndexRef.current] : '');
    }
  };

  const toggleItem = (turnId, index) => {
    setSelections(prev => ({
      ...prev,
      [turnId]: { ...prev[turnId], [index]: prev[turnId]?.[index] === false ? true : !(prev[turnId]?.[index] ?? true) },
    }));
  };

  const resolveConfirmation = async (turn, confirm) => {
    setBusyTurnId(turn.id);
    try {
      const confirmation = turn.confirmation;
      let selectionIndices;
      if (confirm && confirmation.selectable) {
        const items = confirmation.summary.items || [];
        const sel = selections[turn.id] || {};
        selectionIndices = items.map((_, i) => i).filter(i => sel[i] !== false);
      }

      const res = await confirmCommand(confirmation.pending_action_id, confirm, selectionIndices);
      const data = res.data.data;

      setTurns(prev => prev.map(t => t.id === turn.id
        ? { ...t, resolved: data.type === 'executed' ? 'executed' : data.type === 'cancelled' ? 'cancelled' : 'expired' }
        : t));

      if (data.type === 'executed') {
        pushTurn({ role: 'assistant', kind: 'text', text: data.summary || 'Done.' });
      } else if (data.type === 'cancelled') {
        pushTurn({ role: 'assistant', kind: 'text', text: 'Cancelled — nothing was changed.' });
      } else if (data.type === 'error') {
        pushTurn({ role: 'assistant', kind: 'error', text: data.error });
      }
    } catch (err) {
      const msg = err.response?.data?.data?.error || err.response?.data?.error || err.message || 'Something went wrong.';
      // A response means the server actually processed the request — the
      // pending action is consumed either way, so the card is done. With NO
      // response (dropped connection, timeout) the server may never have seen
      // it, so leave the card retryable rather than locking Stuart out.
      if (err.response) {
        setTurns(prev => prev.map(t => t.id === turn.id ? { ...t, resolved: 'expired' } : t));
      }
      pushTurn({ role: 'assistant', kind: 'error', text: msg });
    } finally {
      setBusyTurnId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center sm:pt-[8vh]">
      <div className="absolute inset-0 bg-black/40" onClick={handleClose} />

      <div className="relative bg-arkalon-offwhite w-full h-[100dvh] sm:h-auto sm:max-h-[78vh] sm:w-full sm:max-w-2xl sm:rounded-lg shadow-xl flex flex-col overflow-hidden [padding-top:env(safe-area-inset-top)]">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 bg-white border-b border-arkalon-lightgrey flex-shrink-0">
          <Sparkles className="w-5 h-5 text-arkalon-blue flex-shrink-0" />
          <h2 className="font-montserrat font-bold text-arkalon-navy text-sm flex-1">Command Bar</h2>
          <button onClick={handleClose} aria-label="Close" className="p-1.5 text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Conversation */}
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 sm:px-4 py-3 space-y-3">
          {turns.length === 0 && (
            <div className="text-sm text-slate-400 font-opensans px-1 py-6 text-center">
              Try: "Show me open Simply Seated deals closing in the next 6 weeks" or "Create a task to call Informa tomorrow at 9am".
            </div>
          )}

          {turns.map(turn => (
            <div key={turn.id} className={turn.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
              {turn.role === 'user' ? (
                <div className="max-w-[85%] bg-arkalon-blue text-white text-sm font-opensans px-3 py-2 rounded-lg rounded-br-sm whitespace-pre-wrap">
                  {turn.text}
                </div>
              ) : turn.kind === 'error' ? (
                <div className="max-w-[90%] w-full bg-red-50 border border-red-200 text-red-700 text-sm font-opensans px-3 py-2 rounded-lg">
                  {turn.text}
                </div>
              ) : turn.kind === 'confirmation' ? (
                <div className="max-w-[95%] w-full">
                  <ConfirmationCard
                    confirmation={turn.confirmation}
                    resolved={turn.resolved}
                    selected={Object.fromEntries((turn.confirmation.summary.items || []).map((_, i) => [i, selections[turn.id]?.[i] !== false]))}
                    onToggleItem={(i) => toggleItem(turn.id, i)}
                    onConfirm={() => resolveConfirmation(turn, true)}
                    onCancel={() => resolveConfirmation(turn, false)}
                    busy={busyTurnId === turn.id}
                  />
                </div>
              ) : (
                <div className="max-w-[95%] w-full space-y-2">
                  {turn.text && (
                    <div className="bg-white border border-arkalon-lightgrey text-arkalon-navy text-sm font-opensans px-3 py-2 rounded-lg rounded-bl-sm whitespace-pre-wrap">
                      {turn.text}
                    </div>
                  )}
                  {(turn.data || []).map((d, i) => (
                    <ResultBlock key={i} tool={d.tool} result={d.result} navigate={(path) => { handleClose(); navigate(path); }} />
                  ))}
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-white border border-arkalon-lightgrey text-slate-400 text-sm font-opensans px-3 py-2 rounded-lg flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Working…
              </div>
            </div>
          )}
        </div>

        {/* Input — large, dictation-friendly */}
        <div className="flex-shrink-0 border-t border-arkalon-lightgrey bg-white p-3 [padding-bottom:max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              maxLength={8000}
              placeholder="Type or dictate a command…"
              className="flex-1 resize-none text-sm font-opensans px-3 py-2.5 border border-arkalon-lightgrey rounded-lg bg-arkalon-offwhite focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30 focus:border-arkalon-blue min-h-[44px]"
            />
            <button
              onClick={handleSend}
              disabled={loading || !input.trim()}
              aria-label="Send command"
              className="flex-shrink-0 h-11 w-11 flex items-center justify-center bg-arkalon-blue text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
