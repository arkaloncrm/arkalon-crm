import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronUp, ChevronDown, ChevronRight, ArrowRight, ArrowLeft, CheckCircle2, AlertTriangle, XCircle, Sparkles } from 'lucide-react';
import Modal from '../UI/Modal.jsx';
import Button from '../UI/Button.jsx';
import Badge from '../UI/Badge.jsx';
import { accountsApi } from '../../api/accounts.js';
import { bulkImportApi } from '../../api/bulkImport.js';
import { useToast } from '../../context/ToastContext.jsx';

const inputCls = 'w-full px-3 py-2 text-sm border border-arkalon-lightgrey rounded bg-white font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30';
const labelCls = 'block text-xs font-montserrat font-semibold text-arkalon-navy uppercase tracking-wide mb-1';

// Tomorrow's date in Sydney as YYYY-MM-DD (en-CA locale formats ISO-style).
function sydneyTomorrow() {
  return new Date(Date.now() + 86400000).toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });
}

// Account name text input with suggestions from existing accounts and a
// "will create" hint when nothing matches exactly (case-insensitive).
function AccountNameInput({ label, required, value, onChange, accounts, placeholder }) {
  const [focused, setFocused] = useState(false);

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return [];
    return accounts.filter(a => a.name.toLowerCase().includes(q)).slice(0, 8);
  }, [accounts, value]);

  const exactMatch = useMemo(() => {
    const q = value.trim().toLowerCase();
    return q ? accounts.find(a => a.name.toLowerCase() === q) : null;
  }, [accounts, value]);

  return (
    <div>
      <label className={labelCls}>{label}{required && ' *'}</label>
      <input
        className={inputCls}
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
      />
      {focused && matches.length > 0 && !exactMatch && (
        <div className="mt-1 border border-arkalon-lightgrey rounded bg-white shadow-sm max-h-40 overflow-y-auto">
          {matches.map(a => (
            <button
              key={a.id}
              type="button"
              className="w-full text-left px-3 py-2 text-sm font-opensans hover:bg-blue-50 transition-colors"
              onMouseDown={() => onChange(a.name)}
            >
              {a.name}
              <span className="ml-2 text-xs text-slate-400">{a.business_unit}</span>
            </button>
          ))}
        </div>
      )}
      {value.trim() && !exactMatch && (
        <p className="text-xs text-amber-600 font-opensans mt-1">
          Will create new account “{value.trim()}” (Simply Seated)
        </p>
      )}
    </div>
  );
}

function CollapsibleSection({ title, count, tone, children }) {
  const [open, setOpen] = useState(false);
  if (count === 0) return null;
  const toneCls = tone === 'error' ? 'text-red-600' : 'text-amber-600';
  return (
    <div className="border border-arkalon-lightgrey rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center gap-1.5 px-3 py-2 text-sm font-montserrat font-semibold bg-slate-50 ${toneCls}`}
      >
        <ChevronRight className={`w-4 h-4 transition-transform ${open ? 'rotate-90' : ''}`} />
        {title} ({count})
      </button>
      {open && <div className="p-3 space-y-1.5">{children}</div>}
    </div>
  );
}

export default function BulkContactImportModal({ isOpen, onClose, onImported }) {
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [step, setStep] = useState(1);
  const [accounts, setAccounts] = useState([]);

  // Step 1 state
  const [exhibitionName, setExhibitionName] = useState('');
  const [employerName, setEmployerName] = useState('');
  const [relationship, setRelationship] = useState('exhibitor');
  const [rawText, setRawText] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);

  // Step 2 state
  const [preview, setPreview] = useState(null);
  const [rows, setRows] = useState([]);
  const [skippedIds, setSkippedIds] = useState(new Set());
  const [dueDate, setDueDate] = useState(sydneyTomorrow());
  const [createTasks, setCreateTasks] = useState(true);
  const [importLoading, setImportLoading] = useState(false);

  // Step 3 state
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    accountsApi.getAll().then(res => setAccounts(res.data.data || [])).catch(() => {});
  }, [isOpen]);

  const reset = () => {
    setStep(1);
    setExhibitionName('');
    setEmployerName('');
    setRelationship('exhibitor');
    setRawText('');
    setPreview(null);
    setRows([]);
    setSkippedIds(new Set());
    setDueDate(sydneyTomorrow());
    setCreateTasks(true);
    setResult(null);
  };

  const handleClose = () => { reset(); onClose(); };

  const handlePreview = async () => {
    if (!exhibitionName.trim()) { addToast('Enter the exhibition / event name', 'warning'); return; }
    if (!rawText.trim()) { addToast('Paste some rows first', 'warning'); return; }
    setPreviewLoading(true);
    try {
      const res = await bulkImportApi.preview({
        exhibition_account_name: exhibitionName.trim(),
        employer_account_name: employerName.trim() || undefined,
        raw_text: rawText,
        default_relationship: relationship,
      });
      const data = res.data;
      setPreview(data);
      setRows(data.rows || []);
      setSkippedIds(new Set());
      setStep(2);
    } catch (err) {
      addToast(err.response?.data?.error || 'Preview failed', 'error');
    } finally {
      setPreviewLoading(false);
    }
  };

  const toggleSkip = (rowId) => {
    setSkippedIds(prev => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId); else next.add(rowId);
      return next;
    });
  };

  const moveRow = (index, delta) => {
    setRows(prev => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const importCount = rows.filter(r => !skippedIds.has(r.row_id)).length;

  const handleImport = async () => {
    setImportLoading(true);
    try {
      const res = await bulkImportApi.confirm({
        session_id: preview.session_id,
        skip_row_ids: [...skippedIds],
        row_order: rows.filter(r => !skippedIds.has(r.row_id)).map(r => r.row_id),
        create_tasks: createTasks,
        task_due_date: dueDate,
      });
      setResult(res.data);
      setStep(3);
      onImported?.();
    } catch (err) {
      const status = err.response?.status;
      const msg = err.response?.data?.error ||
        (status === 410 ? 'Session expired — run the preview again' : 'Import failed');
      addToast(msg, 'error');
      if (status === 410) setStep(1);
    } finally {
      setImportLoading(false);
    }
  };

  const stepTitle = step === 1 ? 'Bulk Import Contacts'
    : step === 2 ? 'Preview Import'
    : 'Import Complete';

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={stepTitle} size="xl">
      {step === 1 && (
        <div className="space-y-4">
          <AccountNameInput
            label="Exhibition / Event"
            required
            value={exhibitionName}
            onChange={setExhibitionName}
            accounts={accounts}
            placeholder="e.g. Vital Expo 2026 Melbourne"
          />
          <AccountNameInput
            label="Employer / Organiser company (optional)"
            value={employerName}
            onChange={setEmployerName}
            accounts={accounts}
            placeholder="e.g. Informer Group"
          />

          <div>
            <label className={labelCls}>These contacts are</label>
            <div className="flex gap-2">
              {[['organiser', 'Organisers'], ['exhibitor', 'Exhibitors']].map(([val, lbl]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setRelationship(val)}
                  className={`px-4 py-1.5 text-sm font-montserrat font-semibold rounded-full border transition-colors ${
                    relationship === val
                      ? 'bg-arkalon-blue text-white border-arkalon-blue'
                      : 'bg-white text-slate-500 border-arkalon-lightgrey hover:border-arkalon-blue hover:text-arkalon-blue'
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-400 font-opensans mt-1">Organisers are called first in the calling list.</p>
          </div>

          <div>
            <label className={labelCls}>Paste rows from your spreadsheet</label>
            <textarea
              className={`${inputCls} h-40 font-mono text-xs`}
              value={rawText}
              onChange={e => setRawText(e.target.value)}
              placeholder={'Jane Smith\t0412 345 678\tjane@company.com.au\nBob Jones\t0413 111 222\tbob@another.com.au'}
            />
            <p className="text-xs text-slate-400 font-opensans mt-1">
              Tab-separated (straight from Excel / Sheets) or comma-separated. Columns: Name, Phone, Email — with optional Company first.
            </p>
          </div>

          <div className="flex justify-end">
            <Button onClick={handlePreview} disabled={previewLoading}>
              {previewLoading ? 'Parsing…' : 'Preview'} <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {step === 2 && preview && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 text-sm font-opensans">
            <Badge className={preview.exhibition_account.will_create ? 'bg-amber-100 text-amber-800' : 'bg-teal-100 text-teal-700'}>
              {preview.exhibition_account.name}{preview.exhibition_account.will_create ? ' — new account' : ''}
            </Badge>
            {preview.employer_account && (
              <Badge className={preview.employer_account.will_create ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-700'}>
                {preview.employer_account.name}{preview.employer_account.will_create ? ' — new account' : ''}
              </Badge>
            )}
          </div>

          <div>
            <h3 className="text-sm font-montserrat font-semibold text-arkalon-navy mb-2">
              To be imported ({importCount})
            </h3>
            <div className="border border-arkalon-lightgrey rounded-lg overflow-x-auto">
              <table className="w-full text-sm font-opensans">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="px-2 py-1.5 w-8"></th>
                    <th className="px-2 py-1.5 w-14 text-xs font-montserrat text-slate-500">Order</th>
                    <th className="px-2 py-1.5 text-xs font-montserrat text-slate-500">Name</th>
                    <th className="px-2 py-1.5 text-xs font-montserrat text-slate-500">Phone</th>
                    <th className="px-2 py-1.5 text-xs font-montserrat text-slate-500">Email</th>
                    <th className="px-2 py-1.5 w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const skipped = skippedIds.has(r.row_id);
                    return (
                      <tr key={r.row_id} className={`border-t border-slate-100 ${skipped ? 'opacity-40' : ''}`}>
                        <td className="px-2 py-1.5">
                          <input
                            type="checkbox"
                            checked={!skipped}
                            onChange={() => toggleSkip(r.row_id)}
                            aria-label={skipped ? 'Include row' : 'Skip row'}
                          />
                        </td>
                        <td className="px-2 py-1.5 text-slate-400">{i + 1}</td>
                        <td className="px-2 py-1.5 text-arkalon-navy font-semibold whitespace-nowrap">
                          {[r.first_name, r.last_name].filter(Boolean).join(' ') || '—'}
                          {r.warm && <Sparkles className="inline w-3.5 h-3.5 ml-1 text-amber-500" title="Known name — has history in CRM" />}
                          {r.company && <span className="block text-xs font-normal text-slate-400">{r.company}</span>}
                        </td>
                        <td className="px-2 py-1.5 text-slate-600 whitespace-nowrap">{r.phone || '—'}</td>
                        <td className="px-2 py-1.5 text-slate-600">{r.email || '—'}</td>
                        <td className="px-2 py-1.5">
                          <div className="flex items-center gap-0.5">
                            <button type="button" onClick={() => moveRow(i, -1)} disabled={i === 0}
                              className="p-1 text-slate-400 hover:text-arkalon-blue disabled:opacity-30" aria-label="Move up">
                              <ChevronUp className="w-4 h-4" />
                            </button>
                            <button type="button" onClick={() => moveRow(i, 1)} disabled={i === rows.length - 1}
                              className="p-1 text-slate-400 hover:text-arkalon-blue disabled:opacity-30" aria-label="Move down">
                              <ChevronDown className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && (
                    <tr><td colSpan={6} className="px-3 py-4 text-center text-slate-400">No importable rows found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <CollapsibleSection title="Duplicates skipped" count={preview.duplicates.length} tone="warning">
            {preview.duplicates.map((d, i) => (
              <div key={i} className="flex items-start gap-1.5 text-xs font-opensans text-slate-600">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                <span>
                  <span className="font-semibold">{[d.first_name, d.last_name].filter(Boolean).join(' ') || d.email || d.phone}</span>
                  {' — '}{d.reason}
                </span>
              </div>
            ))}
          </CollapsibleSection>

          <CollapsibleSection title="Couldn't parse" count={preview.parse_errors.length} tone="error">
            {preview.parse_errors.map((p, i) => (
              <div key={i} className="flex items-start gap-1.5 text-xs font-opensans text-slate-600">
                <XCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                <span>Line {p.line}: <span className="font-mono">{p.raw}</span> — {p.reason}</span>
              </div>
            ))}
          </CollapsibleSection>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-1">
            <label className="flex items-center gap-2 text-sm font-opensans text-slate-700">
              <input type="checkbox" checked={createTasks} onChange={e => setCreateTasks(e.target.checked)} />
              Create call tasks
            </label>
            {createTasks && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-opensans text-slate-500">Tasks due</span>
                <input
                  type="date"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  className="px-3 py-1.5 text-sm border border-arkalon-lightgrey rounded bg-white font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30"
                />
                <span className="text-xs text-slate-400 font-opensans">9:00 am Sydney</span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <Button variant="secondary" onClick={() => setStep(1)}>
              <ArrowLeft className="w-4 h-4" /> Back
            </Button>
            <Button onClick={handleImport} disabled={importLoading || importCount === 0}>
              {importLoading ? 'Importing…' : `Import${createTasks ? ' & Create Tasks' : ''} (${importCount})`}
            </Button>
          </div>
        </div>
      )}

      {step === 3 && result && (
        <div className="text-center py-6 space-y-4">
          <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
          <p className="font-opensans text-sm text-slate-700">
            <span className="font-semibold">{result.contacts_created}</span> contact{result.contacts_created === 1 ? '' : 's'} imported
            {result.tasks_created > 0 && <>, <span className="font-semibold">{result.tasks_created}</span> call task{result.tasks_created === 1 ? '' : 's'} created</>}
            {result.duplicates_skipped > 0 && <>. {result.duplicates_skipped} duplicate{result.duplicates_skipped === 1 ? '' : 's'} skipped</>}.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Button variant="secondary" onClick={handleClose}>Close</Button>
            {result.tasks_created > 0 && (
              <Button onClick={() => { handleClose(); navigate('/tasks'); }}>
                View calling list <ArrowRight className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
