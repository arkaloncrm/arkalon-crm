import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { UploadCloud, FileSpreadsheet, Check, AlertTriangle, XCircle, ArrowRight, ArrowLeft } from 'lucide-react';
import Button from '../../components/UI/Button.jsx';
import api from '../../api/axios.js';
import { settingsApi } from '../../api/settings.js';
import { useToast } from '../../context/ToastContext.jsx';

const VALID_BUS = ['ASC', 'Simply Seated', 'Both'];

// normaliseName defined ONCE — used in both account and contact validation
const normaliseName = (value) => String(value || '').trim().toLowerCase();

const validateAccount = (row, index) => {
  const errors = [];
  const warnings = [];

  // Required fields
  if (!row['name *']?.trim()) errors.push('Account name is required');
  const bu = row['business_unit *']?.trim();
  if (!VALID_BUS.includes(bu)) {
    errors.push(`business_unit must be ASC, Simply Seated, or Both — got "${bu}"`);
  }

  // Warn on 'Both' — valid but will not appear in single-BU report filters or charts
  if (bu === 'Both') {
    warnings.push("Business unit 'Both' — this account will not appear in single-BU report filters");
  }

  // Warnings for missing optional but useful fields
  if (!row['industry']?.trim()) warnings.push('Industry is blank');
  if (!row['phone']?.trim()) warnings.push('Phone is blank');

  return {
    row,
    rowNumber: index + 2,
    status: errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'ok',
    errors,
    warnings,
    name: row['name *']?.trim(),
    business_unit: bu,
    website: row['website']?.trim() || null,
    industry: row['industry']?.trim() || null,
    phone: row['phone']?.trim() || null,
    billing_city: row['billing_city']?.trim() || null,
    billing_state: row['billing_state']?.trim() || null,
    billing_country: row['billing_country']?.trim() || 'Australia',
    description: row['description']?.trim() || null,
  };
};

// validateContact defined ONCE with full 4-param signature
const validateContact = (row, index, validatedAccounts, existingDbAccounts) => {
  const errors = [];
  const warnings = [];

  const accountName = row['account_name (must match Accounts tab exactly)']?.trim();
  const lastName = row['last_name *']?.trim();
  const bu = row['business_unit *']?.trim();

  if (!lastName) errors.push('Last name is required');
  if (!VALID_BUS.includes(bu)) {
    errors.push('business_unit must be ASC, Simply Seated, or Both');
  }

  // Cross-tab validation: check both the uploaded Accounts tab AND existing CRM accounts.
  // Use case-insensitive normalised matching to avoid false warnings.
  if (accountName) {
    const normAccountName = normaliseName(accountName);
    const matchesUploadedAccount = validatedAccounts.some(
      a => normaliseName(a.name) === normAccountName && a.status !== 'error'
    );
    const matchesExistingAccount = existingDbAccounts.some(
      a => normaliseName(a.name) === normAccountName
    );
    if (!matchesUploadedAccount && !matchesExistingAccount) {
      warnings.push(`Account "${accountName}" not found in CRM or Accounts tab — will be imported without account link`);
    }
  }

  if (!row['email']?.trim()) warnings.push('Email is blank');

  return {
    row,
    rowNumber: index + 2,
    status: errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'ok',
    errors,
    warnings,
    account_name: accountName || null,
    first_name: row['first_name']?.trim() || null,
    last_name: lastName,
    title: row['title']?.trim() || null,
    email: row['email']?.trim() || null,
    phone: row['phone']?.trim() || null,
    mobile: row['mobile']?.trim() || null,
    business_unit: bu,
    description: row['description']?.trim() || null,
  };
};

const STEPS = ['Upload', 'Preview', 'Confirm', 'Done'];

function StepIndicator({ current }) {
  return (
    <div className="flex items-center justify-center mb-6">
      {STEPS.map((label, i) => {
        const complete = i < current;
        const active = i === current;
        return (
          <React.Fragment key={label}>
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-montserrat font-bold
                ${complete ? 'bg-green-500 text-white'
                  : active ? 'bg-arkalon-blue text-white'
                  : 'bg-white border border-arkalon-lightgrey text-slate-400'}`}>
                {complete ? <Check className="w-4 h-4" /> : i + 1}
              </div>
              <span className={`text-sm font-montserrat font-semibold ${active || complete ? 'text-arkalon-navy' : 'text-slate-400'}`}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`w-12 h-px mx-3 ${i < current ? 'bg-green-400' : 'bg-arkalon-lightgrey'}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

const STATUS_STYLES = {
  ok: 'bg-green-50 border-l-4 border-green-500',
  warning: 'bg-amber-50 border-l-4 border-amber-400',
  error: 'bg-red-50 border-l-4 border-red-500',
};

function StatusBadge({ status }) {
  const map = {
    ok: { cls: 'bg-green-100 text-green-700', label: 'Ready', Icon: Check },
    warning: { cls: 'bg-amber-100 text-amber-800', label: 'Warning', Icon: AlertTriangle },
    error: { cls: 'bg-red-100 text-red-700', label: 'Error', Icon: XCircle },
  };
  const { cls, label, Icon } = map[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${cls}`}>
      <Icon className="w-3 h-3" /> {label}
    </span>
  );
}

function SummaryBar({ label, rows }) {
  const ok = rows.filter(r => r.status === 'ok').length;
  const warn = rows.filter(r => r.status === 'warning').length;
  const err = rows.filter(r => r.status === 'error').length;
  return (
    <div className="flex items-center gap-2 text-sm font-opensans mb-3">
      <span className="font-montserrat font-semibold text-arkalon-navy">{label}:</span>
      <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold">{ok} ready</span>
      <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold">{warn} warning{warn === 1 ? '' : 's'}</span>
      <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">{err} error{err === 1 ? '' : 's'}</span>
    </div>
  );
}

export default function BulkImport() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const fileInputRef = useRef(null);

  const [step, setStep] = useState('upload'); // upload | preview | done
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [parsing, setParsing] = useState(false);

  const [previewAccounts, setPreviewAccounts] = useState([]);
  const [previewContacts, setPreviewContacts] = useState([]);
  const [previewTab, setPreviewTab] = useState('accounts');
  const [includeWarnings, setIncludeWarnings] = useState(true);

  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState(null);

  const currentStepIndex = step === 'upload' ? 0 : step === 'done' ? 3 : importing ? 2 : 1;

  const selectFile = (f) => {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith('.xlsx')) {
      setError('Please select an .xlsx file');
      return;
    }
    setError('');
    setFile(f);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    selectFile(e.dataTransfer.files?.[0]);
  };

  const handleParse = () => {
    if (!file) return;
    setParsing(true);
    setError('');
    const reader = new FileReader();

    // reader.onload is async so we can await the existing accounts fetch before validation
    reader.onload = async (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' });
        const accountSheet = wb.Sheets['Accounts'];
        const contactSheet = wb.Sheets['Contacts'];

        if (!accountSheet || !contactSheet) {
          setError('File must have sheets named "Accounts" and "Contacts"');
          setParsing(false);
          return;
        }

        // raw: false prevents phone numbers losing leading zeros (SheetJS auto-casts integers)
        const accounts = XLSX.utils.sheet_to_json(accountSheet, { defval: '', raw: false, range: 1 });
        const contacts = XLSX.utils.sheet_to_json(contactSheet, { defval: '', raw: false, range: 1 });

        // Fetch existing CRM accounts BEFORE validating contacts so contact account_name
        // matching checks both the file AND the live database.
        let existingDbAccounts = [];
        try {
          const res = await api.get('/accounts', { params: { limit: 500 } });
          existingDbAccounts = res.data?.data || [];
        } catch (err) {
          console.warn('Could not fetch existing accounts for validation:', err.message);
        }

        const validatedAccounts = accounts.map(validateAccount);
        const validatedContacts = contacts.map((row, i) =>
          validateContact(row, i, validatedAccounts, existingDbAccounts)
        );

        setPreviewAccounts(validatedAccounts);
        setPreviewContacts(validatedContacts);
        setPreviewTab('accounts');
        setStep('preview');
      } catch (err) {
        setError(`Could not parse file: ${err.message}`);
      } finally {
        setParsing(false);
      }
    };

    reader.onerror = () => {
      setError('Could not read the file');
      setParsing(false);
    };

    reader.readAsArrayBuffer(file);
  };

  const accountsToImport = previewAccounts.filter(a =>
    includeWarnings ? a.status !== 'error' : a.status === 'ok'
  ).length;
  const contactsToImport = previewContacts.filter(c =>
    includeWarnings ? c.status !== 'error' : c.status === 'ok'
  ).length;

  const handleImport = async () => {
    setImporting(true);
    try {
      const res = await settingsApi.runImport({
        accounts: previewAccounts,
        contacts: previewContacts,
        includeWarnings,
      });
      setResults(res.data.data);
      setStep('done');
    } catch (err) {
      addToast(err.response?.data?.error || 'Import failed', 'error');
    } finally {
      setImporting(false);
    }
  };

  const resetAll = () => {
    setStep('upload');
    setFile(null);
    setError('');
    setPreviewAccounts([]);
    setPreviewContacts([]);
    setResults(null);
  };

  const previewRows = previewTab === 'accounts' ? previewAccounts : previewContacts;

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => navigate('/settings')}
          className="flex items-center gap-1 text-arkalon-blue text-sm hover:underline font-opensans">
          <ArrowLeft className="w-3.5 h-3.5" /> Settings
        </button>
        <h2 className="font-montserrat font-bold text-arkalon-navy text-xl">Bulk Import</h2>
      </div>

      <StepIndicator current={currentStepIndex} />

      {/* STEP 1 — UPLOAD */}
      {step === 'upload' && (
        <div className="max-w-xl mx-auto">
          <div
            onDragOver={e => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors
              ${dragActive ? 'border-arkalon-blue bg-blue-50' : 'border-arkalon-lightgrey bg-slate-50 hover:bg-slate-100'}`}
          >
            <UploadCloud className="w-10 h-10 text-slate-400 mx-auto mb-3" />
            <p className="font-montserrat font-semibold text-arkalon-navy text-sm">
              Drop your Excel file here or click to browse
            </p>
            <p className="text-xs text-slate-400 font-opensans mt-1">
              .xlsx files only — must have sheets named "Accounts" and "Contacts"
            </p>
            <input ref={fileInputRef} type="file" accept=".xlsx" className="hidden"
              onChange={e => selectFile(e.target.files?.[0])} />
          </div>

          {file && (
            <div className="flex items-center gap-3 mt-4 px-4 py-3 bg-white border border-arkalon-lightgrey rounded-lg">
              <FileSpreadsheet className="w-6 h-6 text-green-600 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-opensans font-semibold text-arkalon-navy truncate">{file.name}</p>
                <p className="text-xs text-slate-400 font-opensans">{(file.size / 1024).toFixed(1)} KB</p>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-3 px-4 py-2 bg-red-50 border border-red-200 rounded text-sm text-red-700 font-opensans">
              {error}
            </div>
          )}

          <div className="flex justify-end mt-4">
            <Button onClick={handleParse} disabled={!file || parsing}>
              {parsing ? 'Parsing…' : 'Parse & Preview'} <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* STEP 2/3 — PREVIEW & CONFIRM */}
      {step === 'preview' && (
        <div>
          <div className="flex border-b border-arkalon-lightgrey mb-4">
            {[
              { key: 'accounts', label: `Accounts (${previewAccounts.length})` },
              { key: 'contacts', label: `Contacts (${previewContacts.length})` },
            ].map(t => (
              <button key={t.key} onClick={() => setPreviewTab(t.key)}
                className={`px-5 py-2.5 text-sm font-montserrat font-semibold transition-colors border-b-2 -mb-px
                  ${previewTab === t.key ? 'border-arkalon-blue text-arkalon-blue' : 'border-transparent text-slate-500 hover:text-arkalon-navy'}`}>
                {t.label}
              </button>
            ))}
          </div>

          <SummaryBar
            label={previewTab === 'accounts' ? 'Accounts' : 'Contacts'}
            rows={previewRows}
          />

          <div className="bg-white border border-arkalon-lightgrey rounded-lg overflow-hidden mb-4">
            <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
              <table className="w-full text-sm text-left border-collapse">
                <thead className="bg-slate-50 border-b border-arkalon-lightgrey sticky top-0">
                  <tr>
                    {(previewTab === 'accounts'
                      ? ['Row', 'Name', 'BU', 'Industry', 'City', 'Status', 'Issues']
                      : ['Row', 'Name', 'Account', 'BU', 'Title', 'Email', 'Status', 'Issues']
                    ).map(h => (
                      <th key={h} className="px-3 py-2 font-montserrat font-semibold text-xs text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.length === 0 && (
                    <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-400 font-opensans text-sm">No rows found in this sheet.</td></tr>
                  )}
                  {previewRows.map((r, i) => {
                    const issue = r.errors[0] || r.warnings[0] || '';
                    const allIssues = [...r.errors, ...r.warnings].join(' • ');
                    return (
                      <tr key={i} className={`${STATUS_STYLES[r.status]} border-b border-slate-100`}>
                        <td className="px-3 py-2 text-slate-400 font-opensans">{r.rowNumber}</td>
                        {previewTab === 'accounts' ? (
                          <>
                            <td className="px-3 py-2 font-opensans font-semibold text-arkalon-navy">{r.name || <span className="text-red-500">(missing)</span>}</td>
                            <td className="px-3 py-2 font-opensans text-slate-600">{r.business_unit || '—'}</td>
                            <td className="px-3 py-2 font-opensans text-slate-600">{r.industry || '—'}</td>
                            <td className="px-3 py-2 font-opensans text-slate-600">{r.billing_city || '—'}</td>
                          </>
                        ) : (
                          <>
                            <td className="px-3 py-2 font-opensans font-semibold text-arkalon-navy">
                              {[r.first_name, r.last_name].filter(Boolean).join(' ') || <span className="text-red-500">(missing)</span>}
                            </td>
                            <td className="px-3 py-2 font-opensans text-slate-600">{r.account_name || '—'}</td>
                            <td className="px-3 py-2 font-opensans text-slate-600">{r.business_unit || '—'}</td>
                            <td className="px-3 py-2 font-opensans text-slate-600">{r.title || '—'}</td>
                            <td className="px-3 py-2 font-opensans text-slate-600">{r.email || '—'}</td>
                          </>
                        )}
                        <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                        <td className="px-3 py-2 font-opensans text-slate-600 max-w-xs truncate" title={allIssues}>
                          {issue || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white border border-arkalon-lightgrey rounded-lg p-4 flex items-center justify-between flex-wrap gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={includeWarnings}
                onChange={e => setIncludeWarnings(e.target.checked)}
                className="rounded border-arkalon-lightgrey" />
              <span className="text-sm font-opensans text-slate-700">
                Include warning rows <span className="text-slate-400">(amber rows still import; red rows always skipped)</span>
              </span>
            </label>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={resetAll}>Start Over</Button>
              <Button onClick={handleImport} disabled={importing || (accountsToImport + contactsToImport) === 0}>
                {importing
                  ? 'Importing…'
                  : `Import ${accountsToImport} account${accountsToImport === 1 ? '' : 's'} and ${contactsToImport} contact${contactsToImport === 1 ? '' : 's'}`}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 4 — DONE */}
      {step === 'done' && results && (
        <div className="max-w-xl mx-auto">
          <div className="bg-white border border-arkalon-lightgrey rounded-lg p-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center">
                <Check className="w-5 h-5 text-green-600" />
              </div>
              <h3 className="font-montserrat font-bold text-arkalon-navy text-lg">Import complete</h3>
            </div>

            <ResultBlock
              label="Accounts"
              lines={[
                `${results.accounts.imported} imported`,
                ...(results.accounts.skipped_duplicate > 0
                  ? [`${results.accounts.skipped_duplicate} skipped (already exists)`] : []),
                ...(() => {
                  const errCount = previewAccounts.filter(a => a.status === 'error').length;
                  return errCount > 0 ? [`${errCount} skipped (invalid data)`] : [];
                })(),
                ...(!includeWarnings
                  ? (() => {
                      const warnCount = previewAccounts.filter(a => a.status === 'warning').length;
                      return warnCount > 0 ? [`${warnCount} warning rows skipped`] : [];
                    })()
                  : []),
              ]}
            />
            <ResultBlock
              label="Contacts"
              lines={[
                `${results.contacts.imported} imported`,
                ...(results.contacts.imported_without_account > 0
                  ? [`${results.contacts.imported_without_account} imported without account link`] : []),
                ...(results.contacts.skipped_duplicate > 0
                  ? [`${results.contacts.skipped_duplicate} skipped (already exists)`] : []),
                ...(() => {
                  const errCount = previewContacts.filter(c => c.status === 'error').length;
                  return errCount > 0 ? [`${errCount} skipped (invalid data)`] : [];
                })(),
                ...(!includeWarnings
                  ? (() => {
                      const warnCount = previewContacts.filter(c => c.status === 'warning').length;
                      return warnCount > 0 ? [`${warnCount} warning rows skipped`] : [];
                    })()
                  : []),
              ]}
            />

            <div className="flex items-center gap-3 mt-6">
              <button onClick={() => navigate('/accounts')}
                className="text-sm text-arkalon-blue hover:underline font-opensans font-semibold">
                View Accounts →
              </button>
              <button onClick={() => navigate('/contacts')}
                className="text-sm text-arkalon-blue hover:underline font-opensans font-semibold">
                View Contacts →
              </button>
              <Button variant="secondary" size="sm" className="ml-auto" onClick={resetAll}>
                Import another file
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ResultBlock({ label, lines }) {
  return (
    <div className="mb-3">
      <p className="font-montserrat font-semibold text-arkalon-navy text-sm mb-1">{label}</p>
      <ul className="text-sm font-opensans text-slate-600 space-y-0.5">
        {lines.map((l, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="w-1 h-1 rounded-full bg-slate-300" /> {l}
          </li>
        ))}
      </ul>
    </div>
  );
}
