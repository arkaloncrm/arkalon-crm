import React, { useState } from 'react';
import logoNavy from '../../assets/logo-navy.png';
import logoIcon from '../../assets/logo-icon.png';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, User, Building2, Briefcase, Package,
  Phone, CheckSquare, BarChart2, Settings, ChevronLeft, ChevronRight
} from 'lucide-react';

const navItems = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
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

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className="flex flex-col h-screen bg-arkalon-navy flex-shrink-0 transition-all duration-200"
      style={{ width: collapsed ? 60 : 220 }}
    >
      {/* Logo */}
      <div className="h-[56px] flex items-center border-b border-white/10 px-3 py-2 overflow-hidden">
        <ArkalonLogo collapsed={collapsed} />
      </div>

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto py-2">
        {navItems.map(({ label, icon: Icon, path }) => (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2.5 mx-1 my-0.5 rounded transition-colors group
               ${isActive
                ? 'bg-arkalon-blue border-l-[3px] border-arkalon-lightblue pl-[13px]'
                : 'border-l-[3px] border-transparent hover:bg-white/10'
              }`
            }
          >
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
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex items-center gap-3 px-4 py-2.5 mx-1 my-0.5 rounded transition-colors
             ${isActive
              ? 'bg-arkalon-blue border-l-[3px] border-arkalon-lightblue pl-[13px]'
              : 'border-l-[3px] border-transparent hover:bg-white/10'
            }`
          }
        >
          <Settings className="w-4 h-4 text-white flex-shrink-0" />
          {!collapsed && (
            <span className="font-montserrat font-semibold text-white text-[13px]">Settings</span>
          )}
        </NavLink>

        <button
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center justify-center w-full py-2 text-white/50 hover:text-white transition-colors"
        >
          {collapsed
            ? <ChevronRight className="w-4 h-4" />
            : <ChevronLeft className="w-4 h-4" />
          }
        </button>
      </div>
    </aside>
  );
}
