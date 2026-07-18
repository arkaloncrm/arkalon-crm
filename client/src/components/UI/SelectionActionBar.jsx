import React from 'react';
import { Trash2, X } from 'lucide-react';

// Appears above a list's table/cards once one or more rows are checked.
// Shared across Contacts/Tasks/Leads so the bulk-select UX stays consistent.
export default function SelectionActionBar({ count, onDelete, onClear }) {
  if (count === 0) return null;
  return (
    <div className="flex items-center gap-3 px-3 py-2 mb-3 bg-arkalon-navy text-white rounded-lg">
      <span className="text-sm font-opensans font-semibold">{count} selected</span>
      <button
        onClick={onDelete}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded text-sm font-montserrat font-semibold transition-colors"
      >
        <Trash2 className="w-3.5 h-3.5" /> Delete
      </button>
      <button
        onClick={onClear}
        className="ml-auto p-1 text-white/70 hover:text-white"
        aria-label="Clear selection"
        title="Clear selection"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
