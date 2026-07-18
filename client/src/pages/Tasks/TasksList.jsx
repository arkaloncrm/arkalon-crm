import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Square, CheckSquare, Pencil, Trash2, Phone, UploadCloud } from 'lucide-react';
import Button from '../../components/UI/Button.jsx';
import Badge from '../../components/UI/Badge.jsx';
import EmptyState from '../../components/UI/EmptyState.jsx';
import { Table, Thead, Th, Tbody, Tr, Td } from '../../components/UI/Table.jsx';
import MobileCard, { CardAction } from '../../components/UI/MobileCard.jsx';
import BulkContactImportModal from '../../components/Contacts/BulkContactImportModal.jsx';
import { CallLogPanel } from '../../components/UI/CommLinks.jsx';
import { tasksApi } from '../../api/tasks.js';
import { useToast } from '../../context/ToastContext.jsx';
import { formatLocalDatetime, formatDate } from '../../utils/formatDate.js';
import { TASK_STATUSES, TASK_PRIORITIES, BUSINESS_UNITS } from '../../utils/constants.js';

const PRIORITY_COLOURS = {
  'High': 'bg-red-100 text-red-700',
  'Normal': 'bg-blue-100 text-blue-700',
  'Low': 'bg-gray-100 text-gray-500',
};

const STATUS_COLOURS = {
  'Not Started': 'bg-gray-100 text-gray-600',
  'In Progress': 'bg-blue-100 text-blue-700',
  'Completed': 'bg-green-100 text-green-700',
  'Deferred': 'bg-orange-100 text-orange-700',
  'Waiting on Input': 'bg-yellow-100 text-yellow-700',
};

const BU_COLOURS = {
  'ASC': 'bg-blue-100 text-blue-700',
  'Simply Seated': 'bg-teal-100 text-teal-700',
};

// Dialable link for the linked contact's number (mobile preferred server-side).
// Pill style on mobile for an easy PWA thumb target; plain link in the table.
// The tel: href dials natively; onCall additionally opens the shared
// call-logging panel (CommLinks.jsx), same as the contact/lead list phone links.
function TaskPhone({ phone, pill = false, onCall }) {
  if (!phone) return null;
  const href = `tel:${String(phone).replace(/[\s().-]/g, '')}`;
  const handleClick = e => { e.stopPropagation(); onCall?.(); };
  if (pill) {
    return (
      <a
        href={href}
        onClick={handleClick}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-50 text-arkalon-blue text-sm font-semibold font-opensans active:bg-blue-100"
      >
        <Phone className="w-3.5 h-3.5 flex-shrink-0" />
        {phone}
      </a>
    );
  }
  return (
    <a
      href={href}
      onClick={handleClick}
      className="inline-flex items-center gap-1 text-arkalon-blue hover:underline text-sm font-opensans whitespace-nowrap"
    >
      <Phone className="w-3.5 h-3.5 flex-shrink-0" />
      {phone}
    </a>
  );
}

function isOverdue(task) {
  if (!task.due_datetime || task.status === 'Completed') return false;
  const isoString = task.due_datetime.includes('T') ? task.due_datetime : task.due_datetime.replace(' ', 'T') + 'Z';
  return new Date(isoString) < new Date();
}

export default function TasksList() {
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [buFilter, setBuFilter] = useState('');
  const [quickFilter, setQuickFilter] = useState(''); // 'due_today' | 'overdue' | ''
  const [completing, setCompleting] = useState(null);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [call, setCall] = useState(null);

  const fetchTasks = useCallback(() => {
    setLoading(true);
    const params = {};
    if (buFilter) params.business_unit = buFilter;
    if (statusFilter) params.status = statusFilter;
    if (priorityFilter) params.priority = priorityFilter;
    if (quickFilter === 'due_today') params.due_today = 'true';
    if (quickFilter === 'overdue') params.overdue = 'true';

    tasksApi.getAll(params)
      .then(res => setTasks(res.data.data || []))
      .catch(() => addToast('Failed to load tasks', 'error'))
      .finally(() => setLoading(false));
  }, [buFilter, statusFilter, priorityFilter, quickFilter]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  // Toggle: completes an open task, reopens a Completed one (back to
  // 'Not Started' with completed_at cleared). Optimistic with revert on error.
  const handleComplete = async (task, e) => {
    e.stopPropagation();
    const reopening = task.status === 'Completed';
    setCompleting(task.id);
    setTasks(prev => prev.map(t => t.id === task.id
      ? { ...t, status: reopening ? 'Not Started' : 'Completed', completed_at: reopening ? null : t.completed_at }
      : t));
    try {
      if (reopening) {
        await tasksApi.update(task.id, { status: 'Not Started', completed_at: null });
        addToast('Task reopened', 'success');
      } else {
        await tasksApi.complete(task.id);
        addToast('Task completed', 'success');
      }
    } catch {
      setTasks(prev => prev.map(t => t.id === task.id
        ? { ...t, status: task.status, completed_at: task.completed_at }
        : t));
      addToast(reopening ? 'Failed to reopen task' : 'Failed to complete task', 'error');
    } finally {
      setCompleting(null);
    }
  };

  // Opens the shared call-logging panel (CommLinks.jsx) for the task's linked
  // contact — the tel: href on TaskPhone dials natively, this just layers the
  // outcome-logging prompt on top, same flow as the Contacts/Leads lists.
  // Passes contact_id/account_id/deal_id together so the logged Activity
  // carries every link the task itself has.
  const handleCall = (row) => {
    const link = {};
    if (row.contact_id) link.contact_id = row.contact_id;
    if (row.account_id) link.account_id = row.account_id;
    if (row.deal_id) link.deal_id = row.deal_id;
    setCall({
      phone: row.contact_phone,
      name: row.contact_name || row.account_name || row.lead_company || 'Contact',
      email: null,
      businessUnit: row.business_unit,
      link,
      timestamp: new Date().toISOString(),
    });
  };

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Delete this task?')) return;
    try {
      await tasksApi.delete(id);
      addToast('Task deleted', 'success');
      setTasks(prev => prev.filter(t => t.id !== id));
    } catch {
      addToast('Failed to delete task', 'error');
    }
  };

  const searchLower = search.toLowerCase();
  const filtered = tasks.filter(row => {
    if (!search) return true;
    return (row.subject?.toLowerCase() || '').includes(searchLower) ||
      (row.contact_name?.toLowerCase() || '').includes(searchLower) ||
      (row.lead_company?.toLowerCase() || '').includes(searchLower) ||
      (row.account_name?.toLowerCase() || '').includes(searchLower);
  });

  const QUICK_FILTERS = [
    { key: 'due_today', label: 'Due Today' },
    { key: 'overdue', label: 'Overdue' },
    { key: '', label: 'All Open' },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="font-montserrat font-bold text-arkalon-navy text-xl">Tasks</h2>
          <span className="bg-slate-100 text-slate-500 text-xs font-montserrat font-semibold px-2 py-0.5 rounded-full">
            {filtered.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setShowBulkImport(true)}>
            <UploadCloud className="w-4 h-4" /> Bulk Import
          </Button>
          <Button onClick={() => navigate('/tasks/new')}>+ New Task</Button>
        </div>
      </div>

      <BulkContactImportModal
        isOpen={showBulkImport}
        onClose={() => setShowBulkImport(false)}
        onImported={fetchTasks}
      />

      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search tasks…"
          className="px-3 py-2 text-sm border border-arkalon-lightgrey rounded bg-white font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30 w-52"
        />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-arkalon-lightgrey rounded bg-white font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30">
          <option value="">All Statuses</option>
          {TASK_STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>
        <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-arkalon-lightgrey rounded bg-white font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30">
          <option value="">All Priorities</option>
          {TASK_PRIORITIES.map(p => <option key={p}>{p}</option>)}
        </select>
        <select value={buFilter} onChange={e => setBuFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-arkalon-lightgrey rounded bg-white font-opensans focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30">
          <option value="">All Business Units</option>
          {BUSINESS_UNITS.map(u => <option key={u}>{u}</option>)}
        </select>
      </div>

      {/* Quick filter pills */}
      <div className="flex items-center gap-2 mb-4">
        {QUICK_FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setQuickFilter(f.key)}
            className={`px-3 py-1 text-xs font-montserrat font-semibold rounded-full border transition-colors ${
              quickFilter === f.key
                ? 'bg-arkalon-blue text-white border-arkalon-blue'
                : 'bg-white text-slate-500 border-arkalon-lightgrey hover:border-arkalon-blue hover:text-arkalon-blue'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="bg-white border border-arkalon-lightgrey rounded-lg p-8 text-center text-slate-400 font-opensans text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-arkalon-lightgrey rounded-lg overflow-hidden">
          <EmptyState
            title="No tasks"
            description="Stay on top of follow-ups and to-dos."
            action={() => navigate('/tasks/new')}
            actionLabel="Create your first task"
          />
        </div>
      ) : (
        <>
          {/* Mobile: stacked cards */}
          <div className="sm:hidden space-y-3">
            {filtered.map(row => {
              const done = row.status === 'Completed';
              const overdue = isOverdue(row);
              return (
                <MobileCard key={row.id} onClick={() => navigate(`/tasks/${row.id}/edit`)}>
                  <div className="flex items-start gap-2">
                    <button
                      onClick={e => handleComplete(row, e)}
                      disabled={completing === row.id}
                      className={`flex-shrink-0 p-0.5 ${done ? 'text-green-500 hover:text-slate-400' : 'text-slate-300 hover:text-arkalon-blue'}`}
                      aria-label={done ? 'Reopen task' : 'Mark complete'}
                    >
                      {done ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
                    </button>
                    <span className={`font-semibold font-opensans text-sm flex-1 min-w-0 ${done ? 'line-through text-slate-400' : 'text-arkalon-navy'}`}>
                      {row.subject}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    {row.priority && <Badge className={PRIORITY_COLOURS[row.priority] || 'bg-gray-100 text-gray-600'}>{row.priority}</Badge>}
                    {row.status && <Badge className={STATUS_COLOURS[row.status] || 'bg-gray-100 text-gray-600'}>{row.status}</Badge>}
                    {row.business_unit && <Badge className={BU_COLOURS[row.business_unit] || 'bg-gray-100 text-gray-600'}>{row.business_unit}</Badge>}
                  </div>
                  {row.contact_phone && (
                    <div className="mt-2">
                      <TaskPhone phone={row.contact_phone} pill onCall={() => handleCall(row)} />
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-slate-100">
                    <span className={`text-xs font-opensans truncate ${overdue ? 'text-red-600 font-semibold' : 'text-slate-400'}`}>
                      {row.due_datetime
                        ? (row.is_all_day ? formatDate(row.due_datetime) : formatLocalDatetime(row.due_datetime))
                        : 'No due date'}
                    </span>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <CardAction label="Edit" onClick={() => navigate(`/tasks/${row.id}/edit`)}>
                        <Pencil className="w-4 h-4" />
                      </CardAction>
                      <CardAction label="Delete" danger onClick={(e) => handleDelete(row.id, e)}>
                        <Trash2 className="w-4 h-4" />
                      </CardAction>
                    </div>
                  </div>
                </MobileCard>
              );
            })}
          </div>
          {/* Desktop: table */}
          <div className="hidden sm:block bg-white border border-arkalon-lightgrey rounded-lg overflow-hidden">
          <Table>
            <Thead>
              <tr>
                <Th style={{ width: 36 }}></Th>
                <Th>Subject</Th>
                <Th>Priority</Th>
                <Th>Status</Th>
                <Th>Due</Th>
                <Th>Phone</Th>
                <Th>Related To</Th>
                <Th>Business Unit</Th>
                <Th></Th>
              </tr>
            </Thead>
            <Tbody>
              {filtered.map(row => {
                const done = row.status === 'Completed';
                const overdue = isOverdue(row);
                return (
                  <Tr key={row.id} className="cursor-pointer" onClick={() => navigate(`/tasks/${row.id}/edit`)}>
                    <Td>
                      <button
                        onClick={e => handleComplete(row, e)}
                        disabled={completing === row.id}
                        className={`p-0.5 transition-colors ${done ? 'text-green-500 hover:text-slate-400' : 'text-slate-300 hover:text-arkalon-blue'}`}
                        aria-label={done ? 'Reopen task' : 'Mark complete'}
                        title={done ? 'Reopen task' : 'Mark complete'}
                      >
                        {done ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                      </button>
                    </Td>
                    <Td>
                      <span className={`font-semibold font-opensans ${done ? 'line-through text-slate-400' : 'text-arkalon-navy'}`}>
                        {row.subject}
                      </span>
                    </Td>
                    <Td>
                      {row.priority && (
                        <Badge className={PRIORITY_COLOURS[row.priority] || 'bg-gray-100 text-gray-600'}>
                          {row.priority}
                        </Badge>
                      )}
                    </Td>
                    <Td>
                      {row.status && (
                        <Badge className={STATUS_COLOURS[row.status] || 'bg-gray-100 text-gray-600'}>
                          {row.status}
                        </Badge>
                      )}
                    </Td>
                    <Td>
                      {row.due_datetime ? (
                        <span className={`text-sm font-opensans ${overdue ? 'text-red-600 font-semibold' : 'text-slate-500'}`}>
                          {row.is_all_day ? formatDate(row.due_datetime) : formatLocalDatetime(row.due_datetime)}
                        </span>
                      ) : '—'}
                    </Td>
                    <Td>
                      {row.contact_phone ? <TaskPhone phone={row.contact_phone} onCall={() => handleCall(row)} /> : '—'}
                    </Td>
                    <Td className="text-slate-500">
                      {row.contact_name || row.lead_company || row.account_name || row.deal_name || '—'}
                    </Td>
                    <Td>
                      {row.business_unit && (
                        <Badge className={BU_COLOURS[row.business_unit] || 'bg-gray-100 text-gray-600'}>
                          {row.business_unit}
                        </Badge>
                      )}
                    </Td>
                    <Td>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={e => { e.stopPropagation(); navigate(`/tasks/${row.id}/edit`); }}
                          className="p-1 text-slate-400 hover:text-arkalon-blue"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={e => handleDelete(row.id, e)}
                          className="p-1 text-slate-400 hover:text-red-500"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
          </div>
        </>
      )}

      <CallLogPanel call={call} onClose={() => setCall(null)} />
    </div>
  );
}
