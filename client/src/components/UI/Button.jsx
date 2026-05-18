import React from 'react';

const variants = {
  primary: 'bg-arkalon-blue text-white hover:bg-blue-700',
  secondary: 'bg-white text-slate-700 border border-arkalon-lightgrey hover:bg-slate-50',
  danger: 'bg-arkalon-danger text-white hover:bg-red-700',
  ghost: 'text-slate-600 hover:bg-slate-100',
};

const sizes = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-sm',
};

export default function Button({
  children, variant = 'primary', size = 'md',
  className = '', disabled, onClick, type = 'button', ...props
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`
        inline-flex items-center gap-1.5 font-montserrat font-semibold rounded
        transition-colors focus:outline-none focus:ring-2 focus:ring-arkalon-blue focus:ring-offset-1
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variants[variant]} ${sizes[size]} ${className}
      `}
      {...props}
    >
      {children}
    </button>
  );
}
