import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';
import TopBar from './TopBar.jsx';
import { ToastProvider } from '../../context/ToastContext.jsx';

export default function AppLayout() {
  return (
    <ToastProvider>
      <div className="flex h-screen overflow-hidden bg-arkalon-offwhite">
        <Sidebar />
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <TopBar />
          <main className="flex-1 overflow-y-auto p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
