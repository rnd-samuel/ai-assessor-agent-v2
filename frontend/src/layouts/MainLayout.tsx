// frontend/src/layouts/MainLayout.tsx
import { type ReactNode } from 'react';
import Sidebar from '../components/Sidebar';

// This component will wrap our pages (like ProjectsDashboard, ReportPage, etc.)
// We use 'children' to render whatever page is active.
export default function MainLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen bg-bg-light">
      <Sidebar />

      {/* Main Content Area */}
      <main className="flex-1 h-screen overflow-y-auto bg-bg-medium">
        {/* This renders the active page (e.g., ProjectsDashboard) */}
        {children}
      </main>
    </div>
  );
}