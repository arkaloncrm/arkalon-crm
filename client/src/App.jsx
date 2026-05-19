import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

import ProtectedRoute from './components/Layout/ProtectedRoute.jsx';
import AppLayout from './components/Layout/AppLayout.jsx';

import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';

import ResearchQueueList from './pages/ResearchQueue/ResearchQueueList.jsx';
import ResearchQueueDetail from './pages/ResearchQueue/ResearchQueueDetail.jsx';
import ResearchQueueForm from './pages/ResearchQueue/ResearchQueueForm.jsx';

import LeadsList from './pages/Leads/LeadsList.jsx';
import LeadDetail from './pages/Leads/LeadDetail.jsx';
import LeadForm from './pages/Leads/LeadForm.jsx';

import ContactsList from './pages/Contacts/ContactsList.jsx';
import ContactDetail from './pages/Contacts/ContactDetail.jsx';
import ContactForm from './pages/Contacts/ContactForm.jsx';

import AccountsList from './pages/Accounts/AccountsList.jsx';
import AccountDetail from './pages/Accounts/AccountDetail.jsx';
import AccountForm from './pages/Accounts/AccountForm.jsx';

import DealsList from './pages/Deals/DealsList.jsx';
import DealDetail from './pages/Deals/DealDetail.jsx';
import DealForm from './pages/Deals/DealForm.jsx';

import ProductsList from './pages/Products/ProductsList.jsx';
import ProductDetail from './pages/Products/ProductDetail.jsx';
import ProductForm from './pages/Products/ProductForm.jsx';

import ActivitiesList from './pages/Activities/ActivitiesList.jsx';
import ActivityForm from './pages/Activities/ActivityForm.jsx';
import ActivityDetail from './pages/Activities/ActivityDetail.jsx';

import TasksList from './pages/Tasks/TasksList.jsx';
import TaskForm from './pages/Tasks/TaskForm.jsx';

import ReportsDashboard from './pages/Reports/ReportsDashboard.jsx';

import Settings from './pages/Settings/Settings.jsx';
import BulkImport from './pages/Settings/BulkImport.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />

        <Route path="research-queue" element={<ResearchQueueList />} />
        <Route path="research-queue/new" element={<ResearchQueueForm />} />
        <Route path="research-queue/:id" element={<ResearchQueueDetail />} />
        <Route path="research-queue/:id/edit" element={<ResearchQueueForm />} />

        <Route path="leads" element={<LeadsList />} />
        <Route path="leads/new" element={<LeadForm />} />
        <Route path="leads/:id" element={<LeadDetail />} />
        <Route path="leads/:id/edit" element={<LeadForm />} />

        <Route path="contacts" element={<ContactsList />} />
        <Route path="contacts/new" element={<ContactForm />} />
        <Route path="contacts/:id" element={<ContactDetail />} />
        <Route path="contacts/:id/edit" element={<ContactForm />} />

        <Route path="accounts" element={<AccountsList />} />
        <Route path="accounts/new" element={<AccountForm />} />
        <Route path="accounts/:id" element={<AccountDetail />} />
        <Route path="accounts/:id/edit" element={<AccountForm />} />

        <Route path="deals" element={<DealsList />} />
        <Route path="deals/new" element={<DealForm />} />
        <Route path="deals/:id" element={<DealDetail />} />
        <Route path="deals/:id/edit" element={<DealForm />} />

        <Route path="products" element={<ProductsList />} />
        <Route path="products/new" element={<ProductForm />} />
        <Route path="products/:id" element={<ProductDetail />} />
        <Route path="products/:id/edit" element={<ProductForm />} />

        <Route path="activities" element={<ActivitiesList />} />
        <Route path="activities/new" element={<ActivityForm />} />
        <Route path="activities/:id" element={<ActivityDetail />} />
        <Route path="activities/:id/edit" element={<ActivityForm />} />

        <Route path="tasks" element={<TasksList />} />
        <Route path="tasks/new" element={<TaskForm />} />
        <Route path="tasks/:id/edit" element={<TaskForm />} />

        <Route path="reports" element={<ReportsDashboard />} />

        <Route path="settings" element={<Settings />} />
        <Route path="settings/import" element={<BulkImport />} />
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
