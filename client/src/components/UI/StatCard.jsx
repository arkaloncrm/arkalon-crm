import React from 'react';

export default function StatCard({ label, value, sub, icon: Icon, colour = 'text-arkalon-blue' }) {
  return (
    <div className="bg-white border border-arkalon-lightgrey rounded-lg p-4 flex items-start gap-3">
      {Icon && (
        <div className={`w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0`}>
          <Icon className={`w-5 h-5 ${colour}`} />
        </div>
      )}
      <div>
        <p className="text-xs font-montserrat font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
        <p className={`text-2xl font-montserrat font-bold mt-0.5 ${colour}`}>{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5 font-opensans">{sub}</p>}
      </div>
    </div>
  );
}
