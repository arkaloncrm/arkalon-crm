import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, X } from 'lucide-react';

const ROUTE_BY_ENTITY = { lead: 'leads', account: 'accounts', contact: 'contacts' };

// Non-blocking amber warning shown on create/edit forms when the duplicate
// check returns possible matches. It never prevents saving.
export default function DuplicateWarning({ matches, entityType, onDismiss }) {
  if (!matches || matches.length === 0) return null;
  const route = ROUTE_BY_ENTITY[entityType] || '';

  return (
    <div className="mb-4 border border-amber-300 bg-amber-50 rounded-lg px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-montserrat font-semibold text-amber-800">
              Possible duplicate{matches.length > 1 ? 's' : ''} found
            </p>
            <ul className="mt-1.5 space-y-1">
              {matches.map(m => (
                <li key={m.id} className="text-sm font-opensans text-amber-800">
                  <Link
                    to={`/${route}/${m.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-arkalon-blue hover:underline"
                  >
                    {m.name}
                  </Link>
                  {m.matched_fields?.length > 0 && (
                    <span className="text-amber-700"> — matches on {m.matched_fields.join(', ')}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-amber-500 hover:text-amber-700 flex-shrink-0"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
