import React from 'react';

export default function StatCard({ label, value, sub, icon: Icon, colour = 'text-arkalon-blue' }) {
  return (
    <div className="bento-card p-5 flex items-start gap-3 h-full">
      {Icon && (
        <div className="w-9 h-9 rounded-[10px] bg-surface-sunken flex items-center justify-center flex-shrink-0">
          <Icon className={`w-5 h-5 ${colour}`} />
        </div>
      )}
      <div className="min-w-0">
        <p className="bento-label">{label}</p>
        <p className="text-2xl font-montserrat font-bold mt-1 text-ink-primary truncate">{value}</p>
        {sub && <p className="text-xs text-ink-faint mt-0.5 font-opensans">{sub}</p>}
      </div>
    </div>
  );
}
