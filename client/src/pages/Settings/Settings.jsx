import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { User, SlidersHorizontal, Database, Upload, Download, AlertTriangle, CheckCircle2, HardDrive, List, Lock, Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import Button from '../../components/UI/Button.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { settingsApi } from '../../api/settings.js';
import { picklistsApi } from '../../api/picklists.js';
import api from '../../api/axios.js';

const TABS = [
  { key: 'profile', label: 'My Profile', icon: User },
  { key: 'preferences', label: 'Application Preferences', icon: SlidersHorizontal },
  { key: 'picklists', label: 'Picklists', icon: List },
  { key: 'data', label: 'Data Management', icon: Database },
];

// 'lead_source' -> 'Lead Source'
const prettyListName = (name) =>
  name.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

const inputCls = 'w-full px-3 py-2 text-sm border border-arkalon-lightgrey rounded font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30 bg-white';
const labelCls = 'block text-xs font-montserrat font-semibold text-slate-500 uppercase tracking-wide mb-1';

function SectionCard({ title, children }) {
  return (
    <div className="bg-white border border-arkalon-lightgrey rounded-lg overflow-hidden mb-4">
      <div className="px-4 py-3 bg-slate-50 border-b border-arkalon-lightgrey">
        <h3 className="font-montserrat font-semibold text-arkalon-navy text-sm uppercase tracking-wide">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function ProfileTab() {
  const { addToast } = useToast();
  const { refreshUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [form, setForm] = useState({
    name: '', email: '', avatar_initials: '',
    current_password: '', new_password: '', confirm_new_password: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(null);
  const [googleConnecting, setGoogleConnecting] = useState(false);

  useEffect(() => {
    settingsApi.getProfile()
      .then(res => {
        const u = res.data.data;
        setForm(f => ({ ...f, name: u.name || '', email: u.email || '', avatar_initials: u.avatar_initials || '' }));
      })
      .catch(() => addToast('Failed to load profile', 'error'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    api.get('/google/status')
      .then(res => setGoogleConnected(res.data.data.connected))
      .catch(() => setGoogleConnected(false));
  }, []);

  useEffect(() => {
    if (searchParams.get('google') === 'error') {
      addToast('Google Drive connection failed. Please try again.', 'error');
      setSearchParams({});
    }
  }, []);

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleConnectGoogle = async () => {
    setGoogleConnecting(true);
    try {
      const res = await api.get('/google/auth-url');
      window.location.href = res.data.data.url;
    } catch {
      addToast('Failed to start Google Drive connection', 'error');
      setGoogleConnecting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.new_password && form.new_password !== form.confirm_new_password) {
      addToast('New passwords do not match', 'error');
      return;
    }
    setSaving(true);
    try {
      await settingsApi.updateProfile({
        name: form.name,
        email: form.email,
        avatar_initials: form.avatar_initials,
        current_password: form.current_password || undefined,
        new_password: form.new_password || undefined,
        confirm_new_password: form.confirm_new_password || undefined,
      });
      addToast('Profile updated', 'success');
      setForm(f => ({ ...f, current_password: '', new_password: '', confirm_new_password: '' }));
      // Refetch the auth user so topbar name/initials update immediately
      try { await refreshUser(); } catch {}
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to update profile', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="py-12 text-center text-slate-400 font-opensans text-sm">Loading…</div>;

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl">
      <SectionCard title="My Profile">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Name *</label>
            <input className={inputCls} value={form.name} onChange={e => setField('name', e.target.value)} required />
          </div>
          <div>
            <label className={labelCls}>Avatar Initials</label>
            <input className={inputCls} value={form.avatar_initials} maxLength={2}
              onChange={e => setField('avatar_initials', e.target.value)}
              placeholder="Auto-generated from name if blank" />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Email *</label>
            <input type="email" className={inputCls} value={form.email}
              onChange={e => setField('email', e.target.value)} required />
            <p className="flex items-center gap-1 text-xs text-amber-600 font-opensans mt-1">
              <AlertTriangle className="w-3 h-3" /> Changing email affects login.
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Change Password">
        <p className="text-xs text-slate-400 font-opensans mb-3">Leave blank to keep your current password.</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className={labelCls}>Current Password</label>
            <input type="password" className={inputCls} value={form.current_password}
              onChange={e => setField('current_password', e.target.value)}
              autoComplete="current-password" />
          </div>
          <div>
            <label className={labelCls}>New Password</label>
            <input type="password" className={inputCls} value={form.new_password}
              onChange={e => setField('new_password', e.target.value)}
              autoComplete="new-password" />
          </div>
          <div>
            <label className={labelCls}>Confirm New Password</label>
            <input type="password" className={inputCls} value={form.confirm_new_password}
              onChange={e => setField('confirm_new_password', e.target.value)}
              autoComplete="new-password" />
          </div>
        </div>
        <p className="text-xs text-slate-400 font-opensans mt-2">New password must be at least 8 characters.</p>
      </SectionCard>

      <SectionCard title="Google Drive">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-opensans text-slate-700">
              {googleConnected === null ? 'Checking…' : googleConnected ? 'Google Drive connected' : 'Not connected'}
            </span>
            {googleConnected && <CheckCircle2 className="w-4 h-4 text-green-500" />}
          </div>
          {!googleConnected && googleConnected !== null && (
            <Button type="button" size="sm" variant="secondary" onClick={handleConnectGoogle} disabled={googleConnecting}>
              {googleConnecting ? 'Redirecting…' : 'Connect Google Drive'}
            </Button>
          )}
        </div>
        <p className="text-xs text-slate-400 font-opensans mt-2">
          Required to upload and manage file attachments on deals.
        </p>
      </SectionCard>

      <div className="flex justify-end">
        <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save Profile'}</Button>
      </div>
    </form>
  );
}

function PreferencesTab() {
  const rows = [
    ['App Name', 'Arkalon CRM'],
    ['Version', 'Session 6'],
    ['Database', 'server/arkalon.db'],
    ['Business Units', 'ASC Technologies · Simply Seated'],
    ['Default Timezone', 'Australia/Sydney'],
    ['Currency', 'AUD'],
  ];
  const rates = [
    ['ASC Direct Customer', '14% of MRR × contract term'],
    ['ASC Partner/Referral', '8% of MRR × MIN(term, 36 months)'],
    ['Simply Seated', '10% of gross value'],
  ];
  return (
    <div className="max-w-2xl">
      <SectionCard title="Application Configuration">
        <div className="text-sm font-opensans">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between py-2.5 border-b border-slate-100 last:border-0">
              <span className="font-semibold text-slate-700">{label}</span>
              <span className="text-slate-500">{value}</span>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Commission Rates Reference">
        <div className="space-y-2">
          {rates.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded px-3 py-2">
              <span className="text-sm font-opensans font-semibold text-slate-700">{label}</span>
              <span className="text-sm font-mono text-arkalon-navy">{value}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-400 font-opensans mt-3">Reference only — commission is calculated per deal.</p>
      </SectionCard>
    </div>
  );
}

function DataTab() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [stats, setStats] = useState(null);
  const [exporting, setExporting] = useState('');

  useEffect(() => {
    settingsApi.getStats()
      .then(res => setStats(res.data.data))
      .catch(() => addToast('Failed to load database stats', 'error'));
  }, []);

  const handleExport = async (entity) => {
    setExporting(entity);
    try {
      const response = await settingsApi.exportEntity(entity);
      const url = URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${entity}_export_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      addToast(`Export failed: ${err.message}`, 'error');
    } finally {
      setExporting('');
    }
  };

  const statItems = [
    ['Leads', stats?.leads], ['Contacts', stats?.contacts],
    ['Accounts', stats?.accounts], ['Deals', stats?.deals],
    ['Activities', stats?.activities], ['Tasks', stats?.tasks],
    ['Notes', stats?.notes], ['Products', stats?.products],
  ];

  return (
    <div className="max-w-3xl">
      <SectionCard title="Database Stats">
        <div className="grid grid-cols-4 gap-3">
          {statItems.map(([label, value]) => (
            <div key={label} className="bg-slate-50 border border-slate-100 rounded-lg p-3 text-center">
              <p className="text-2xl font-montserrat font-bold text-arkalon-blue">{value ?? '—'}</p>
              <p className="text-xs font-montserrat font-semibold text-slate-500 uppercase tracking-wide mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Bulk Import">
        <p className="text-sm font-opensans text-slate-500 mb-3">
          Import accounts and contacts in bulk from an Excel file, with a validation preview before anything is committed.
        </p>
        <Button onClick={() => navigate('/settings/import')}>
          <Upload className="w-4 h-4" /> Import Accounts &amp; Contacts
        </Button>
      </SectionCard>

      <SectionCard title="Data Export">
        <p className="text-sm font-opensans text-slate-500 mb-3">
          Download a full Excel export of any module.
        </p>
        <div className="flex flex-wrap gap-3">
          {['accounts', 'contacts', 'deals'].map(entity => (
            <Button key={entity} variant="secondary" disabled={exporting === entity}
              onClick={() => handleExport(entity)}>
              <Download className="w-4 h-4" />
              {exporting === entity ? 'Exporting…' : `Export All ${entity.charAt(0).toUpperCase() + entity.slice(1)}`}
            </Button>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

function PicklistSection({ name, items, onToggle, onDelete, onAdd }) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);

  const activeCount = items.filter(i => i.is_active).length;

  const submitAdd = async (e) => {
    e.preventDefault();
    if (!label.trim()) return;
    setBusy(true);
    const ok = await onAdd(name, label.trim());
    setBusy(false);
    if (ok) { setLabel(''); setAdding(false); }
  };

  return (
    <div className="bg-white border border-arkalon-lightgrey rounded-lg overflow-hidden mb-3">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-arkalon-lightgrey hover:bg-slate-100 transition-colors">
        <div className="flex items-center gap-2">
          {open ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
          <h3 className="font-montserrat font-semibold text-arkalon-navy text-sm uppercase tracking-wide">{prettyListName(name)}</h3>
        </div>
        <span className="text-xs font-opensans text-slate-400">{activeCount} active · {items.length} total</span>
      </button>

      {open && (
        <div className="p-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-arkalon-lightgrey">
                <th className="text-left text-xs font-montserrat font-semibold text-slate-500 uppercase tracking-wide pb-2">Label</th>
                <th className="text-left text-xs font-montserrat font-semibold text-slate-500 uppercase tracking-wide pb-2 w-24">Active</th>
                <th className="text-right text-xs font-montserrat font-semibold text-slate-500 uppercase tracking-wide pb-2 w-16">Delete</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} className="border-b border-slate-100">
                  <td className="py-2">
                    <span className="flex items-center gap-2 font-opensans text-slate-700">
                      {item.is_system && <Lock className="w-3 h-3 text-slate-400 flex-shrink-0" title="System value — cannot be deleted" />}
                      <span className={item.is_active ? '' : 'text-slate-400 line-through'}>{item.label}</span>
                    </span>
                  </td>
                  <td className="py-2">
                    <button type="button" onClick={() => onToggle(name, item)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${item.is_active ? 'bg-arkalon-blue' : 'bg-slate-300'}`}
                      title={item.is_active ? 'Active' : 'Inactive'}>
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${item.is_active ? 'translate-x-4' : 'translate-x-1'}`} />
                    </button>
                  </td>
                  <td className="py-2 text-right">
                    {item.is_system ? (
                      <span className="text-xs text-slate-300 font-opensans">—</span>
                    ) : (
                      <button type="button" onClick={() => onDelete(name, item)}
                        className="p-1 text-slate-300 hover:text-red-500 transition-colors" title="Delete value">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {adding ? (
            <form onSubmit={submitAdd} className="flex items-center gap-2 mt-3">
              <input autoFocus className={`${inputCls} flex-1`} value={label}
                onChange={e => setLabel(e.target.value)} placeholder="New value label…" />
              <Button type="submit" size="sm" disabled={busy || !label.trim()}>{busy ? 'Adding…' : 'Add'}</Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => { setAdding(false); setLabel(''); }}>Cancel</Button>
            </form>
          ) : (
            <div className="mt-3">
              <Button type="button" size="sm" variant="secondary" onClick={() => setAdding(true)}>
                <Plus className="w-3 h-3" /> Add Value
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PicklistsTab() {
  const { addToast } = useToast();
  const [lists, setLists] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    picklistsApi.getAll()
      .then(res => setLists(res.data.data || {}))
      .catch(() => addToast('Failed to load picklists', 'error'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const handleToggle = async (listName, item) => {
    try {
      await picklistsApi.update(listName, item.id, { is_active: !item.is_active });
      load();
    } catch {
      addToast('Failed to update value', 'error');
    }
  };

  const handleDelete = async (listName, item) => {
    if (!window.confirm(`Delete "${item.label}"? It will be hidden from dropdowns but kept on existing records.`)) return;
    try {
      await picklistsApi.remove(listName, item.id);
      addToast('Value removed', 'success');
      load();
    } catch {
      addToast('Failed to delete value', 'error');
    }
  };

  // value defaults to the label for custom additions
  const handleAdd = async (listName, label) => {
    try {
      await picklistsApi.create(listName, { value: label, label });
      addToast('Value added', 'success');
      load();
      return true;
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to add value', 'error');
      return false;
    }
  };

  if (loading) return <div className="py-12 text-center text-slate-400 font-opensans text-sm">Loading…</div>;

  const names = Object.keys(lists || {}).sort();

  return (
    <div className="max-w-3xl">
      <p className="text-sm font-opensans text-slate-500 mb-4">
        Manage the dropdown values used across the CRM. System values can be deactivated but not deleted; custom values you add can be removed.
      </p>
      {names.length === 0 ? (
        <p className="text-sm text-slate-400 font-opensans">No picklists found.</p>
      ) : (
        names.map(name => (
          <PicklistSection key={name} name={name} items={lists[name]}
            onToggle={handleToggle} onDelete={handleDelete} onAdd={handleAdd} />
        ))
      )}
    </div>
  );
}

export default function Settings() {
  const [tab, setTab] = useState('profile');

  return (
    <div>
      <div className="mb-6">
        <h2 className="font-montserrat font-bold text-arkalon-navy text-xl">Settings</h2>
        <p className="text-arkalon-grey text-sm font-opensans mt-0.5">Manage your profile, preferences, and data.</p>
      </div>

      <div className="flex border-b border-arkalon-lightgrey mb-5">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-montserrat font-semibold transition-colors border-b-2 -mb-px
              ${tab === key ? 'border-arkalon-blue text-arkalon-blue' : 'border-transparent text-slate-500 hover:text-arkalon-navy'}`}>
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'profile' && <ProfileTab />}
      {tab === 'preferences' && <PreferencesTab />}
      {tab === 'picklists' && <PicklistsTab />}
      {tab === 'data' && <DataTab />}
    </div>
  );
}
