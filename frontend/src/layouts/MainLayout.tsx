// frontend/src/layouts/MainLayout.tsx
import { useEffect, type ReactNode } from 'react';
import Sidebar from '../components/Sidebar';
import { io } from 'socket.io-client';
import { useUserStore } from '../state/userStore';
import ToastContainer from '../components/ToastContainer';
import { useToastStore } from '../state/toastStore';

// This component will wrap our pages (like ProjectsDashboard, ReportPage, etc.)
// We use 'children' to render whatever page is active.
export default function MainLayout({ children }: { children: ReactNode }) {
  const userId = useUserStore((state) => state.userId);
  const addToast = useToastStore((state) => state.addToast);

  useEffect(() => {
    if (!userId) return; // Don't connect if there's no user

    // Connect to the backend socket server
    // (We pass the userId in the query to join the correct private room)
    const socket = io('http://localhost:3001', {
      query: { userId },
    });

    socket.on('connect', () => {
      console.log('Socket.io connected:', socket.id);
    });

    // (GBL-2.7) Listen for our custom events from the worker
    socket.on('generation-complete', (data: { message: string }) => {
      console.log('Generation complete:', data.message);
      addToast(data.message, 'success');
    });

    socket.on('generation-failed', (data: { message: string }) => {
      console.error('Generation failed:', data.message);
      addToast(data.message, 'error');
    });

    // Clean up the connection when the component unmounts
    return () => {
      socket.disconnect();
    };
  }, [userId, addToast]);
  return (
    <div className="flex h-screen bg-bg-light">
      <Sidebar />

      {/* Main Content Area */}
      <main className="flex-1 h-screen overflow-y-auto bg-bg-medium">
        {/* This renders the active page (e.g., ProjectsDashboard) */}
        {children}
      </main>

      <ToastContainer />
    </div>
  );
}