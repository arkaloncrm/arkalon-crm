import React, { useState, useRef, useEffect } from 'react';
import { Plus, UserPlus, User, Building2, Briefcase, CheckSquare, Phone } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../context/ToastContext.jsx';

export default function QuickCreateMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();
  const { addToast } = useToast();

  useEffect(() => {
    const handler = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const items = [
    { label: 'New Lead', icon: UserPlus, action: () => navigate('/leads/new') },
    { label: 'New Contact', icon: User, action: () => navigate('/contacts/new') },
    { label: 'New Account', icon: Building2, action: () => navigate('/accounts/new') },
    { label: 'New Deal', icon: Briefcase, action: () => navigate('/deals/new') },
    { label: 'New Task', icon: CheckSquare, action: () => navigate('/tasks/new') },
    { label: 'Log Activity', icon: Phone, action: () => navigate('/activities/new') },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 sm:py-1.5 bg-arkalon-blue text-white text-sm font-montserrat font-semibold rounded-full hover:bg-blue-700 transition-colors"
      >
        <Plus className="w-4 h-4" />
        <span className="hidden sm:inline">Create</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-arkalon-lightgrey rounded-lg shadow-lg z-50 overflow-hidden">
          {items.map(({ label, icon: Icon, action }) => (
            <button
              key={label}
              onClick={() => { setOpen(false); action(); }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-blue-50 hover:text-arkalon-blue transition-colors font-opensans text-left"
            >
              <Icon className="w-4 h-4 text-slate-400" />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
