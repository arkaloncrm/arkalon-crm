import React, { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bell, ChevronDown, User, Settings, LogOut, Search, Menu, ArrowLeft } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import QuickCreateMenu from '../QuickCreate/QuickCreateMenu.jsx';
import api from '../../api/axios.js';
import { STAGE_COLOURS } from '../../utils/constants.js';

const MODULE_TITLES = {
  '/dashboard': 'Dashboard',
  '/leads': 'Leads',
  '/contacts': 'Contacts',
  '/accounts': 'Accounts',
  '/deals': 'Deals',
  '/products': 'Products',
  '/activities': 'Activities',
  '/tasks': 'Tasks',
  '/reports': 'Reports',
  '/settings': 'Settings',
};

const BU_COLOURS = {
  'ASC': 'bg-blue-100 text-blue-700',
  'Simply Seated': 'bg-teal-100 text-teal-700',
  'Both': 'bg-gray-100 text-gray-600',
};

function getTitle(pathname) {
  const match = Object.entries(MODULE_TITLES).find(([key]) => pathname.startsWith(key));
  return match ? match[1] : 'Arkalon CRM';
}

function Badge({ label, className }) {
  if (!label) return null;
  return (
    <span className={`flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${className || 'bg-gray-100 text-gray-600'}`}>
      {label}
    </span>
  );
}

export default function TopBar({ onMenuClick = () => {} }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState({ accounts: [], contacts: [], leads: [], deals: [] });
  const [showResults, setShowResults] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const searchRef = useRef(null);
  const inputRef = useRef(null);

  // Focus the search field when the mobile search overlay opens.
  useEffect(() => {
    if (mobileSearchOpen) inputRef.current?.focus();
  }, [mobileSearchOpen]);

  useEffect(() => {
    const handler = (e) => { if (!userMenuRef.current?.contains(e.target)) setUserMenuOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Debounced live search across Accounts, Contacts, Leads, Deals — min 2 chars
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults({ accounts: [], contacts: [], leads: [], deals: [] });
      setShowResults(false);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const [accounts, contacts, leads, deals] = await Promise.all([
          api.get('/accounts', { params: { search: query, limit: 5 } }),
          api.get('/contacts', { params: { search: query, limit: 5 } }),
          api.get('/leads', { params: { search: query, limit: 5 } }),
          api.get('/deals', { params: { search: query, limit: 5 } }),
        ]);
        setResults({
          accounts: (accounts.data.data || []).slice(0, 5),
          contacts: (contacts.data.data || []).slice(0, 5),
          leads: (leads.data.data || []).slice(0, 5),
          deals: (deals.data.data || []).slice(0, 5),
        });
        setShowResults(true);
      } catch (err) {
        console.error('Search error', err);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const closeSearch = () => {
    setShowResults(false);
    setQuery('');
    setMobileSearchOpen(false);
  };

  // Close on outside click or Escape
  useEffect(() => {
    const handleMouse = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) closeSearch();
    };
    const handleKey = (e) => {
      if (e.key === 'Escape') closeSearch();
    };
    document.addEventListener('mousedown', handleMouse);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleMouse);
      document.removeEventListener('keydown', handleKey);
    };
  }, []);

  const goTo = (path) => {
    navigate(path);
    closeSearch();
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const totalResults =
    results.accounts.length + results.contacts.length + results.leads.length + results.deals.length;

  const sectionHeaderCls =
    'px-3 py-1.5 text-[11px] font-montserrat font-semibold text-slate-400 uppercase tracking-wide bg-slate-50 border-b border-arkalon-lightgrey';
  const rowCls =
    'w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-slate-50 transition-colors text-left border-b border-slate-100 last:border-0';

  return (
    <header className="relative h-[52px] bg-white border-b border-arkalon-lightgrey flex items-center px-3 sm:px-5 gap-2 sm:gap-4 flex-shrink-0">
      {/* Mobile menu button */}
      <button
        onClick={onMenuClick}
        className="md:hidden flex-shrink-0 p-2 -ml-1 text-slate-500 hover:text-arkalon-navy"
        aria-label="Open menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Page title */}
      <h1 className="font-montserrat font-bold text-arkalon-navy text-base sm:text-lg truncate min-w-0 md:w-36 md:flex-shrink-0">
        {getTitle(location.pathname)}
      </h1>

      {/* Global search — inline on md+, full-width overlay on mobile when toggled */}
      <div
        ref={searchRef}
        className={`${
          mobileSearchOpen
            ? 'absolute inset-0 z-30 flex items-center gap-2 bg-white px-3'
            : 'hidden'
        } md:static md:flex md:items-center md:flex-1 md:max-w-md md:mx-auto md:px-0 md:bg-transparent`}
      >
        <button
          type="button"
          onClick={closeSearch}
          className="md:hidden flex-shrink-0 p-2 text-slate-500 hover:text-arkalon-navy"
          aria-label="Close search"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => { if (query.trim().length >= 2 && totalResults > 0) setShowResults(true); }}
            placeholder="Search Arkalon CRM..."
            className="w-full pl-9 pr-3 py-1.5 text-sm border border-arkalon-lightgrey rounded bg-arkalon-offwhite focus:outline-none focus:ring-2 focus:ring-arkalon-blue/30 focus:border-arkalon-blue font-opensans"
          />

        {query.trim().length >= 2 && (loading || showResults) && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-arkalon-lightgrey rounded-lg shadow-lg z-50 max-h-[28rem] overflow-y-auto">
            {loading ? (
              <div className="px-3 py-3 text-sm text-slate-400 font-opensans">Searching…</div>
            ) : totalResults === 0 ? (
              <div className="px-3 py-3 text-sm text-slate-400 font-opensans">No results found</div>
            ) : (
              <>
                {results.accounts.length > 0 && (
                  <div>
                    <div className={sectionHeaderCls}>Accounts</div>
                    {results.accounts.map((a) => (
                      <button key={`account-${a.id}`} onClick={() => goTo(`/accounts/${a.id}`)} className={rowCls}>
                        <span className="truncate font-opensans text-sm text-arkalon-navy font-semibold">{a.name}</span>
                        <Badge label={a.business_unit} className={BU_COLOURS[a.business_unit]} />
                      </button>
                    ))}
                  </div>
                )}

                {results.contacts.length > 0 && (
                  <div>
                    <div className={sectionHeaderCls}>Contacts</div>
                    {results.contacts.map((c) => (
                      <button key={`contact-${c.id}`} onClick={() => goTo(`/contacts/${c.id}`)} className={rowCls}>
                        <span className="truncate font-opensans text-sm text-arkalon-navy font-semibold">
                          {[c.first_name, c.last_name].filter(Boolean).join(' ') || '—'}
                        </span>
                        {c.account_name && (
                          <span className="flex-shrink-0 text-xs text-slate-400 font-opensans truncate max-w-[45%]">
                            {c.account_name}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {results.leads.length > 0 && (
                  <div>
                    <div className={sectionHeaderCls}>Leads</div>
                    {results.leads.map((l) => (
                      <button key={`lead-${l.id}`} onClick={() => goTo(`/leads/${l.id}`)} className={rowCls}>
                        <span className="truncate font-opensans text-sm text-arkalon-navy font-semibold">
                          {l.company || `${l.first_name || ''} ${l.last_name || ''}`.trim() || '—'}
                        </span>
                        <Badge label={l.business_unit} className={BU_COLOURS[l.business_unit]} />
                      </button>
                    ))}
                  </div>
                )}

                {results.deals.length > 0 && (
                  <div>
                    <div className={sectionHeaderCls}>Deals</div>
                    {results.deals.map((d) => (
                      <button key={`deal-${d.id}`} onClick={() => goTo(`/deals/${d.id}`)} className={rowCls}>
                        <span className="truncate font-opensans text-sm text-arkalon-navy font-semibold">{d.deal_name}</span>
                        <Badge label={d.stage} className={STAGE_COLOURS[d.stage]} />
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 ml-auto flex-shrink-0">
        {/* Mobile search trigger */}
        <button
          type="button"
          onClick={() => setMobileSearchOpen(true)}
          className="md:hidden flex-shrink-0 p-2 text-slate-500 hover:text-arkalon-navy"
          aria-label="Search"
        >
          <Search className="w-5 h-5" />
        </button>

        {/* Quick create */}
        <QuickCreateMenu />

        {/* Notifications */}
        <button className="relative text-slate-500 hover:text-arkalon-navy transition-colors">
          <Bell className="w-5 h-5" />
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-arkalon-danger text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            0
          </span>
        </button>

        {/* User avatar dropdown */}
        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setUserMenuOpen((o) => !o)}
            className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
          >
            <div className="w-8 h-8 rounded-full bg-arkalon-navy flex items-center justify-center">
              <span className="text-white font-montserrat font-bold text-xs">
                {user?.avatar_initials || 'SM'}
              </span>
            </div>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {userMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-44 bg-white border border-arkalon-lightgrey rounded-lg shadow-lg z-50 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-arkalon-lightgrey">
                <p className="font-montserrat font-semibold text-arkalon-navy text-xs">{user?.name}</p>
                <p className="text-slate-400 text-[11px] font-opensans truncate">{user?.email}</p>
              </div>
              <button
                onClick={() => { setUserMenuOpen(false); navigate('/settings'); }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors font-opensans"
              >
                <Settings className="w-4 h-4 text-slate-400" />
                Settings
              </button>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-arkalon-danger hover:bg-red-50 transition-colors font-opensans border-t border-arkalon-lightgrey"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
