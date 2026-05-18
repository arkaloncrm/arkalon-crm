import React from 'react';
import { Inbox } from 'lucide-react';

export default function EmptyState({ title, description, action, actionLabel }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-4">
        <Inbox className="w-7 h-7 text-slate-400" />
      </div>
      <h3 className="font-montserrat font-semibold text-slate-700 text-base mb-1">{title}</h3>
      {description && (
        <p className="text-slate-400 text-sm mb-5 max-w-xs">{description}</p>
      )}
      {action && actionLabel && (
        <button
          onClick={action}
          className="px-4 py-2 bg-arkalon-blue text-white text-sm font-montserrat font-semibold rounded hover:bg-blue-700 transition-colors"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
