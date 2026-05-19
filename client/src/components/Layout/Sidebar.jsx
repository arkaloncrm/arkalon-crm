import React, { useState } from 'react';
import logoNavy from '../../assets/logo-navy.png';
import logoIcon from '../../assets/logo-icon.png';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Inbox, Users, User, Building2, Briefcase, Package,
  Phone, CheckSquare, BarChart2, Settings, ChevronLeft, ChevronRight, X, Zap, BookOpen
} from 'lucide-react';

const navItems = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
  { label: 'My Day', icon: BookOpen, path: '/my-day' },
  { label: "Today's List", icon: Zap, path: '/hit-list' },
  { label: 'Research Queue', icon: Inbox, path: '/research-queue' },
  { label: 'Leads', icon: Users, path: '/leads' },
  { label: 'Contacts', icon: User, path: '/contacts' },
  { label: 'Accounts', icon: Building2, path: '/accounts' },
  { label: 'Deals', icon: Briefcase, path: '/deals' },
  { label: 'Products', icon: Package, path: '/products' },
  { label: 'Activities', icon: Phone, path: '/activities' },
  { label: 'Tasks', icon: CheckSquare, path: '/tasks' },
  { label: 'Reports', icon: BarChart2, path: '/reports' },
];

function ArkalonLogo({ collapsed }) {
  const [imgError, setImgError] = useState(false);
  const navigate = useNavigate();

  if (imgError || collapsed) {
    return (
      <button
        onClick={() => navigate('/dashboard')}
        className="flex items-center gap-2 w-full px-3 py-1"
      >
        <img src={logoIcon} alt="Arkalon" className="h-8 w-8 object-contain" />
        {!collapsed && (
          <span className="font-montserrat font-bold text-white text-sm tracking-wide">ARKALON CRM</span>
        )}
      </button>
    );
  }

  return (
    <button onClick={() => navigate('/dashboard')} className="w-full px-3 py-1">
      <img
        src={logoNavy}
        alt="Arkalon CRM"
        className="h-8 w-auto max-w-[150px] object-contain"
        onError={() => setImgError(true)}
      />
    </button>
  );
}

// Nav row styling — shared by nav items and Settings. py-3 on mobile keeps the
// touch target at 44px; md:py-2.5 preserves the original desktop density.
const navLinkClass = ({ isActive }) =>
  `flex items-center gap-3 px-4 py-3 md:py-2.5 mx-1 my-0.5 rounded transition-colors
   ${isActive
    ? 'bg-arkalon-blue border-l-[3px] border-arkalon-lightblue pl-[13px]'
    : 'border-l-[3px] border-transparent hover:bg-white/10'
  }`;

export default function Sidebar({ mobileOpen = false, onClose = () => {} }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <>
      {/* Mobile overlay — tap to dismiss */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Drawer below md, in-flow persistent sidebar at md and up */}
      <aside
        className={`
          bg-arkalon-navy flex flex-col h-screen z-50
          fixed inset-y-0 left-0 transition-transform duration-200
          md:static md:flex-shrink-0
          w-64 ${collapsed ? 'md:w-[60px]' : 'md:w-[220px]'}
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0
        `}
      >
        {/* Logo */}
        <div className="h-[56px] flex items-center justify-between border-b border-white/10 px-3 py-2 overflow-hidden">
          <ArkalonLogo collapsed={collapsed} />
          <button
            onClick={onClose}
            className="md:hidden flex-shrink-0 text-white/70 hover:text-white p-2 -mr-1"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto py-2">
          {navItems.map(({ label, icon: Icon, path }) => (
            <NavLink key={path} to={path} onClick={onClose} className={navLinkClass}>
              <Icon className="w-4 h-4 text-white flex-shrink-0" />
              {!collapsed && (
                <span className="font-montserrat font-semibold text-white text-[13px] truncate">
                  {label}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Bottom: Settings + collapse */}
        <div className="border-t border-white/10 py-2">
          <NavLink to="/settings" onClick={onClose} className={navLinkClass}>
            <Settings className="w-4 h-4 text-white flex-shrink-0" />
            {!collapsed && (
              <span className="font-montserrat font-semibold text-white text-[13px]">Settings</span>
            )}
          </NavLink>

          {/* Collapse toggle is desktop-only — the drawer uses the X button instead */}
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="hidden md:flex items-center justify-center w-full py-2 text-white/50 hover:text-white transition-colors"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed
              ? <ChevronRight className="w-4 h-4" />
              : <ChevronLeft className="w-4 h-4" />
            }
          </button>
        </div>
      </aside>
    </>
  );
}
