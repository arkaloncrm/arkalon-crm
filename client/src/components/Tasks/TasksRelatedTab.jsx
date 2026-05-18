import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Square, CheckSquare } from 'lucide-react';
import Button from '../UI/Button.jsx';
import Badge from '../UI/Badge.jsx';
import { tasksApi } from '../../api/tasks.js';
import { useToast } from '../../context/ToastContext.jsx';
import { formatLocalDatetime, formatDate } from '../../utils/formatDate.js';

const PRIORITY_COLOURS = {
  'High': 'bg-red-100 text-red-700',
  'Normal': 'bg-blue-100 text-blue-700',
  'Low': 'bg-gray-100 text-gray-500',
};

function isOverdue(task) {
  if (!task.due_datetime || task.status === 'Completed') return false;
  const iso = task.due_datetime.includes('T') ? task.due_datetime : task.due_datetime.replace(' ', 'T') + 'Z';
  return new Date(iso) < new Date();
}

// parentType: 'lead' | 'contact' | 'account'
// parentId: string | number
// parentBu: business_unit of the parent record
export default function TasksRelatedTab({ parentType, parentId, parentBu }) {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(null);

  useEffect(() => {
    setLoading(true);
    const params = { [`${parentType}_id`]: parentId };
    tasksApi.getAll(params)
      .then(res => setTasks(res.data.data || []))
      .catch(() => addToast('Failed to load tasks', 'error'))
      .finally(() => setLoading(false));
  }, [parentType, parentId]);

  const handleAddTask = () => {
    const params = new URLSearchParams();
    params.set(`${parentType}_id`, parentId);
    if (parentBu && ['ASC', 'Simply Seated'].includes(parentBu)) {
      params.set('business_unit', parentBu);
    }
    navigate(`/tasks/new?${params.toString()}`);
  };

  const handleComplete = async (task, e) => {
    e.stopPropagation();
    if (task.status === 'Completed') return;
    setCompleting(task.id);
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'Completed' } : t));
    try {
      await tasksApi.complete(task.id);
      addToast('Task marked complete', 'success');
    } catch {
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: task.status } : t));
      addToast('Failed to complete task', 'error');
    } finally {
      setCompleting(null);
    }
  };

  if (loading) {
    return <div className="py-4 text-slate-400 font-opensans text-sm text-center">Loading…</div>;
  }

  return (
    <div>
      <div className="flex justify-end mb-3">
        <Button size="sm" variant="secondary" onClick={handleAddTask}>Add Task</Button>
      </div>
      {tasks.length === 0 ? (
        <p className="text-sm text-slate-400 font-opensans text-center py-4">No tasks linked</p>
      ) : (
        <div className="space-y-1">
          {tasks.map(task => {
            const done = task.status === 'Completed';
            const overdue = isOverdue(task);
            return (
              <div
                key={task.id}
                onClick={() => navigate(`/tasks/${task.id}/edit`)}
                className="flex items-center gap-3 px-3 py-2 rounded hover:bg-slate-50 cursor-pointer transition-colors border border-transparent hover:border-arkalon-lightgrey"
              >
                <button
                  onClick={e => handleComplete(task, e)}
                  disabled={done || completing === task.id}
                  className={`flex-shrink-0 p-0.5 transition-colors ${done ? 'text-green-500' : 'text-slate-300 hover:text-arkalon-blue'}`}
                >
                  {done ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                </button>
                {task.priority && (
                  <Badge className={`${PRIORITY_COLOURS[task.priority] || 'bg-gray-100'} flex-shrink-0 text-xs`}>
                    {task.priority}
                  </Badge>
                )}
                <span className={`flex-1 text-sm font-opensans ${done ? 'line-through text-slate-400' : 'text-arkalon-navy font-semibold'}`}>
                  {task.subject}
                </span>
                {task.due_datetime && (
                  <span className={`text-xs font-opensans flex-shrink-0 ${overdue ? 'text-red-600 font-semibold' : 'text-slate-400'}`}>
                    {task.is_all_day ? formatDate(task.due_datetime) : formatLocalDatetime(task.due_datetime)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
