import React, { useState } from 'react';
import { Check, X, Copy } from 'lucide-react';

function money(n) {
  if (n === null || n === undefined) return '—';
  return `$${Number(n).toLocaleString('en-AU', { maximumFractionDigits: 2 })}`;
}

const cardCls = 'bg-white border border-arkalon-lightgrey rounded-lg overflow-hidden';
const headerCls = 'px-3 py-2 bg-arkalon-offwhite border-b border-arkalon-lightgrey text-[11px] font-montserrat font-semibold text-slate-500 uppercase tracking-wide';
const rowCls = 'flex items-center justify-between gap-3 px-3 py-2 border-b border-slate-100 last:border-0 text-sm font-opensans';

// A generic rows table: desktop shows a real table, mobile stacks each row as
// a small card — matching the rest of the app's list/MobileCard split.
function RowTable({ title, columns, rows, emptyText, onRowClick }) {
  if (!rows || rows.length === 0) {
    return (
      <div className={cardCls}>
        <div className={headerCls}>{title}</div>
        <div className="px-3 py-4 text-sm text-slate-400 font-opensans">{emptyText || 'No results.'}</div>
      </div>
    );
  }
  return (
    <div className={cardCls}>
      <div className={headerCls}>{title} ({rows.length})</div>
      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm font-opensans">
          <thead>
            <tr className="text-left text-[11px] text-slate-400 uppercase tracking-wide">
              {columns.map(c => <th key={c.key} className="px-3 py-1.5 font-montserrat font-semibold">{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.id ?? i}
                className={`border-t border-slate-100 ${onRowClick ? 'cursor-pointer hover:bg-slate-50' : ''}`}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map(c => <td key={c.key} className="px-3 py-2 text-arkalon-navy">{c.render ? c.render(row) : (row[c.key] ?? '—')}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Mobile cards */}
      <div className="sm:hidden divide-y divide-slate-100">
        {rows.map((row, i) => (
          <div key={row.id ?? i} className="px-3 py-2.5 active:bg-blue-50/40" onClick={onRowClick ? () => onRowClick(row) : undefined}>
            {columns.map(c => (
              <div key={c.key} className="flex items-center justify-between text-sm font-opensans py-0.5">
                <span className="text-slate-400 text-xs">{c.label}</span>
                <span className="text-arkalon-navy text-right">{c.render ? c.render(row) : (row[c.key] ?? '—')}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function DealsTable({ result, navigate }) {
  if (result?.error) return <ErrorBlock message={result.error} />;
  return (
    <RowTable
      title="Deals"
      emptyText="No deals matched."
      rows={result.deals}
      onRowClick={navigate ? (row) => navigate(`/deals/${row.id}`) : undefined}
      columns={[
        { key: 'deal_name', label: 'Deal' },
        { key: 'account_name', label: 'Account' },
        { key: 'stage', label: 'Stage' },
        { key: 'close_date', label: 'Close' },
        { key: 'gross_total_value', label: 'Value', render: r => money(r.gross_total_value) },
      ]}
    />
  );
}

function ContactsTable({ result, navigate }) {
  if (result?.error) return <ErrorBlock message={result.error} />;
  return (
    <RowTable
      title="Contacts"
      emptyText="No contacts matched."
      rows={result.contacts}
      onRowClick={navigate ? (row) => navigate(`/contacts/${row.id}`) : undefined}
      columns={[
        { key: 'name', label: 'Name', render: r => [r.first_name, r.last_name].filter(Boolean).join(' ') || '—' },
        { key: 'account_name', label: 'Account' },
        { key: 'phone', label: 'Phone', render: r => r.mobile || r.phone || '—' },
        { key: 'email', label: 'Email' },
      ]}
    />
  );
}

function TasksTable({ result }) {
  if (result?.error) return <ErrorBlock message={result.error} />;
  return (
    <RowTable
      title="Tasks"
      emptyText="No tasks matched."
      rows={result.tasks}
      columns={[
        { key: 'subject', label: 'Subject' },
        { key: 'due_datetime', label: 'Due' },
        { key: 'status', label: 'Status' },
        { key: 'priority', label: 'Priority' },
      ]}
    />
  );
}

function PipelineSummary({ result }) {
  if (result?.error) return <ErrorBlock message={result.error} />;
  const { totals, by_stage } = result;
  return (
    <div className={cardCls}>
      <div className={headerCls}>Pipeline Summary</div>
      <div className="px-3 py-2.5 grid grid-cols-2 gap-2 text-sm font-opensans border-b border-slate-100">
        <div>
          <div className="text-[11px] text-slate-400">Open deals</div>
          <div className="font-montserrat font-bold text-arkalon-navy">{totals.count}</div>
        </div>
        <div>
          <div className="text-[11px] text-slate-400">Weighted total</div>
          <div className="font-montserrat font-bold text-arkalon-navy">{money(totals.weighted_total)}</div>
        </div>
        <div>
          <div className="text-[11px] text-slate-400">Gross total</div>
          <div className="font-opensans text-arkalon-navy">{money(totals.gross_total)}</div>
        </div>
      </div>
      {(by_stage || []).map(s => (
        <div key={s.stage} className={rowCls}>
          <span className="text-slate-600">{s.stage}</span>
          <span className="text-arkalon-navy font-semibold">{s.count} · {money(s.weighted_total)}</span>
        </div>
      ))}
    </div>
  );
}

function PrecallBrief({ result }) {
  if (result?.error) return <ErrorBlock message={result.error} />;
  if (result?.ambiguous) return <AmbiguousBlock result={result} />;
  return (
    <div className={cardCls}>
      <div className={headerCls}>Pre-call Brief</div>
      <div className="px-3 py-2.5 space-y-3 text-sm font-opensans">
        <div>
          <div className="text-[11px] font-semibold text-slate-400 uppercase mb-1">Recent activity</div>
          {(result.recent_activities || []).length === 0 && <div className="text-slate-400">None.</div>}
          {(result.recent_activities || []).map((a, i) => (
            <div key={i} className="text-arkalon-navy">{a.type}: {a.subject}{a.outcome ? ` (${a.outcome})` : ''}</div>
          ))}
        </div>
        <div>
          <div className="text-[11px] font-semibold text-slate-400 uppercase mb-1">Open deals</div>
          {(result.open_deals || []).length === 0 && <div className="text-slate-400">None.</div>}
          {(result.open_deals || []).map((d, i) => (
            <div key={i} className="text-arkalon-navy">{d.deal_name} — {d.stage}, {money(d.gross_total_value)}</div>
          ))}
        </div>
        <div>
          <div className="text-[11px] font-semibold text-slate-400 uppercase mb-1">Open tasks</div>
          {(result.open_tasks || []).length === 0 && <div className="text-slate-400">None.</div>}
          {(result.open_tasks || []).map((t, i) => (
            <div key={i} className="text-arkalon-navy">{t.subject} — due {t.due_datetime || 'no date'}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AmbiguousBlock({ result }) {
  return (
    <div className={cardCls}>
      <div className={headerCls}>Which one did you mean?</div>
      <div className="px-3 py-2 text-sm font-opensans text-slate-500">{result.message}</div>
      {(result.matches || []).map(m => (
        <div key={`${m.type}-${m.id}`} className={rowCls}>
          <span className="text-arkalon-navy">{m.name}</span>
          <span className="text-[10px] uppercase text-slate-400">{m.type}</span>
        </div>
      ))}
    </div>
  );
}

function FindRecordsBlock({ result }) {
  if (result?.error) return <ErrorBlock message={result.error} />;
  const accounts = result.accounts || [];
  const contacts = result.contacts || [];
  return (
    <div className={cardCls}>
      <div className={headerCls}>Matches</div>
      {accounts.map(a => <div key={`a-${a.id}`} className={rowCls}><span>{a.name}</span><span className="text-[10px] uppercase text-slate-400">account</span></div>)}
      {contacts.map(c => <div key={`c-${c.id}`} className={rowCls}><span>{[c.first_name, c.last_name].filter(Boolean).join(' ')}</span><span className="text-[10px] uppercase text-slate-400">contact</span></div>)}
      {accounts.length === 0 && contacts.length === 0 && <div className="px-3 py-3 text-sm text-slate-400 font-opensans">No matches.</div>}
    </div>
  );
}

function DraftEmailBlock({ result }) {
  const [copied, setCopied] = useState(false);
  if (result?.error) return <ErrorBlock message={result.error} />;
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(result.draft_text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard may be unavailable — the text is still selectable */ }
  };
  return (
    <div className={cardCls}>
      <div className={`${headerCls} flex items-center justify-between`}>
        <span>Draft Email</span>
        <button onClick={handleCopy} className="flex items-center gap-1 text-arkalon-blue normal-case font-semibold">
          <Copy className="w-3 h-3" /> {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="px-3 py-2.5 text-sm font-opensans text-arkalon-navy whitespace-pre-wrap">{result.draft_text}</pre>
      {result.log_as_activity_hint && (
        <div className="px-3 py-2 border-t border-slate-100 text-xs text-slate-400 font-opensans">{result.log_as_activity_hint}</div>
      )}
    </div>
  );
}

function ErrorBlock({ message }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-sm text-red-700 font-opensans">{message}</div>
  );
}

// Renders one read-tool (or draft_email) result block, keyed by tool name.
export function ResultBlock({ tool, result, navigate }) {
  switch (tool) {
    case 'query_deals': return <DealsTable result={result} navigate={navigate} />;
    case 'query_contacts': return <ContactsTable result={result} navigate={navigate} />;
    case 'query_tasks': return <TasksTable result={result} />;
    case 'pipeline_summary': return <PipelineSummary result={result} />;
    case 'precall_brief': return <PrecallBrief result={result} />;
    case 'find_records': return <FindRecordsBlock result={result} />;
    case 'draft_email': return <DraftEmailBlock result={result} />;
    default:
      if (result?.ambiguous) return <AmbiguousBlock result={result} />;
      if (result?.error) return <ErrorBlock message={result.error} />;
      return null;
  }
}

// Formats a confirmation summary object into readable label/value rows —
// every field that will be written, per Section 5.
function summaryRows(summary) {
  const SKIP = new Set(['action']);
  const LABELS = {
    deal_name: 'Deal', account_name: 'Account', account_will_be_created: 'New account',
    event_account_name: 'Event', event_account_will_be_created: 'New event account',
    business_unit: 'Business unit', deal_type: 'Deal type', stage: 'Stage', value: 'Value',
    close_date: 'Close date', contract_term_months: 'Contract term',
    first_name: 'First name', last_name: 'Last name', phone: 'Phone', mobile: 'Mobile',
    email: 'Email', title: 'Title', subject: 'Subject', due_date: 'Due date', due_time: 'Due time',
    priority: 'Priority', contact_name: 'Contact', deal_name_ref: 'Deal', type: 'Type', body: 'Notes',
    outcome: 'Outcome', date: 'Date', linked_type: 'Linked to', linked_name: 'Record',
    will_create_task: 'Also creates task', task_subject: 'Task', task_due: 'Task due',
    deal_id: 'Deal #', changes: 'Changes', contact_linked: 'Matched existing contact',
    activity_summary: 'Summary', follow_up_tasks: 'Follow-up tasks', suggested_stage: 'Suggested stage',
  };
  return Object.entries(summary)
    .filter(([k, v]) => !SKIP.has(k) && v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0))
    .map(([k, v]) => ({ key: k, label: LABELS[k] || k, value: v }));
}

function formatValue(key, value) {
  if (key === 'account_will_be_created' || key === 'event_account_will_be_created') {
    return value ? 'Yes — will be created' : 'No — links to existing account';
  }
  if (key === 'contact_linked') return value ? 'Yes' : 'No — will remain unlinked';
  if (key === 'value') return money(value);
  if (key === 'changes' && typeof value === 'object') {
    return (
      <div className="space-y-0.5">
        {Object.entries(value).map(([f, c]) => (
          <div key={f}>{f}: {String(c.from ?? '—')} → <strong>{String(c.to)}</strong></div>
        ))}
      </div>
    );
  }
  if (key === 'follow_up_tasks' && Array.isArray(value)) {
    return value.map(t => `${t.subject} (${t.due_date || 'no date'})`).join(', ');
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

// The write-tool confirmation card. `turn.confirmation` carries the pending
// action; `selected` (for selectable actions like extract_tasks_from_text) is
// local UI state the parent owns so Confirm can read it back out.
export function ConfirmationCard({ confirmation, resolved, selected, onToggleItem, onConfirm, onCancel, busy }) {
  const { summary, label, selectable } = confirmation;
  const items = selectable ? summary.items : null;

  return (
    <div className="bg-white border-2 border-arkalon-blue/30 rounded-lg overflow-hidden">
      <div className="px-3 py-2 bg-blue-50 border-b border-arkalon-blue/20 text-sm font-montserrat font-semibold text-arkalon-navy">
        {label || 'Confirm this action'}
      </div>
      <div className="px-3 py-2.5 text-sm font-opensans divide-y divide-slate-100">
        {summaryRows(summary).filter(r => r.key !== 'items').map(r => (
          <div key={r.key} className="flex items-start justify-between gap-3 py-1.5">
            <span className="text-slate-400 flex-shrink-0">{r.label}</span>
            <span className="text-arkalon-navy text-right">{formatValue(r.key, r.value)}</span>
          </div>
        ))}
      </div>

      {items && (
        <div className="border-t border-slate-100 divide-y divide-slate-100">
          {items.map((item, i) => (
            <label key={i} className={`flex items-center gap-2.5 px-3 py-2 text-sm font-opensans ${!item.resolvable ? 'opacity-50' : ''}`}>
              <input
                type="checkbox"
                checked={!!selected[i]}
                disabled={!item.resolvable}
                onChange={() => onToggleItem(i)}
                className="w-4 h-4 accent-arkalon-blue"
              />
              <span className="flex-1 text-arkalon-navy">{item.subject}</span>
              <span className="text-xs text-slate-400">{item.resolvable ? item.due_date : 'unresolved date'}</span>
            </label>
          ))}
        </div>
      )}

      {!resolved ? (
        <div className="flex items-center gap-2 px-3 py-2.5 border-t border-slate-100 bg-arkalon-offwhite">
          <button
            onClick={onConfirm}
            disabled={busy}
            className="flex-1 inline-flex items-center justify-center gap-1.5 bg-arkalon-blue text-white font-montserrat font-semibold text-sm px-3 py-2 rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <Check className="w-4 h-4" /> Confirm
          </button>
          <button
            onClick={onCancel}
            disabled={busy}
            className="flex-1 inline-flex items-center justify-center gap-1.5 bg-white border border-arkalon-lightgrey text-slate-600 font-montserrat font-semibold text-sm px-3 py-2 rounded hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            <X className="w-4 h-4" /> Cancel
          </button>
        </div>
      ) : (
        <div className={`px-3 py-2 border-t border-slate-100 text-sm font-opensans flex items-center gap-1.5 ${resolved === 'executed' ? 'text-green-700 bg-green-50' : 'text-slate-400 bg-slate-50'}`}>
          {resolved === 'executed' ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
          {resolved === 'executed' ? 'Confirmed' : resolved === 'cancelled' ? 'Cancelled' : 'Expired'}
        </div>
      )}
    </div>
  );
}
