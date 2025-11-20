// frontend/src/layouts/MainLayout.tsx
import { useEffect, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom'; // Import useLocation
import Sidebar from '../components/Sidebar';
import { connectSocket } from '../services/socket'; // Import service
import { useUserStore } from '../state/userStore';
import ToastContainer from '../components/ToastContainer';
import { useToastStore } from '../state/toastStore';

export default function MainLayout({ 
  children,
  setRefreshTrigger
}: { 
  children: ReactNode,
  setRefreshTrigger?: (cb: (c: number) => number) => void
}) {
  const userId = useUserStore((state) => state.userId);
  const addToast = useToastStore((state) => state.addToast);
  const location = useLocation(); // Get current route

  useEffect(() => {
    if (!userId) return;

    // Use the singleton service
    const socket = connectSocket(userId);

    const onGenerationComplete = (data: {
      message: string,
      reportId: string,
      status: string
    }) => {
      console.log('Socket Event (MainLayout):', data.message);

      // CHECK: Are we currently viewing this specific report?
      // If yes, we let ReportPage handle the logic (Fetch -> Toast) to avoid race conditions.
      const isOnReportPage = location.pathname.includes(`/reports/${data.reportId}`);

      if (isOnReportPage) {
        console.log('MainLayout: User is on the report page. Skipping global toast to allow local handling.');
        return; 
      }

      // Otherwise (Dashboard, other report, admin panel), show toast immediately
      addToast(data.message, 'success');

      // And trigger a generic refresh (good for Dashboards)
      if (setRefreshTrigger) {
        setRefreshTrigger(c => c + 1);
      }
    };

    const onGenerationFailed = (data: { 
      message: string, 
      reportId: string,
      status: string 
    }) => {
      console.error('Generation failed:', data.message);
      
      const isOnReportPage = location.pathname.includes(`/reports/${data.reportId}`);
      
      // Let ReportPage handle local errors too for consistency
      if (isOnReportPage) {
          return;
      }

      addToast(data.message, 'error');
      if (setRefreshTrigger) setRefreshTrigger(c => c + 1);
    };

    socket.on('generation-complete', onGenerationComplete);
    socket.on('generation-failed', onGenerationFailed);

    return () => {
      socket.off('generation-complete', onGenerationComplete);
      socket.off('generation-failed', onGenerationFailed);
      // We don't disconnect here because we want the socket to persist 
    };
  }, [userId, addToast, setRefreshTrigger, location.pathname]); 

  return (
    <div className="flex h-screen bg-bg-light">
      <Sidebar />
      <main className="flex-1 h-screen overflow-y-auto bg-bg-medium">
        {children}
      </main>
      <ToastContainer />
    </div>
  );
}