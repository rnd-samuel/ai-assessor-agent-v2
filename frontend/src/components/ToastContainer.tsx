// frontend/src/components/ToastContainer.tsx
import { useToastStore } from '../state/toastStore';

// Helper to get the right icon and colors for each toast type
const getToastStyles = (type: 'success' | 'error' | 'info') => {
  switch (type) {
    case 'success':
      return {
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
        ),
        bg: 'bg-success',
      };
    case 'error':
      return {
        icon: (
           <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        ),
        bg: 'bg-error',
      };
    default:
      return {
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
        ),
        bg: 'bg-info',
      };
  }
};

export default function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  return (
    <div className="fixed bottom-4 right-4 z-50 w-full max-w-sm space-y-3">
      {toasts.map((toast) => {
        const { icon, bg } = getToastStyles(toast.type);
        return (
          <div
            key={toast.id}
            className="w-full rounded-lg shadow-lg bg-bg-light p-4 flex items-start gap-3 border border-border animate-fade-in"
          >
            <div
              className={`w-6 h-6 ${bg} text-white rounded-full flex items-center justify-center flex-shrink-0 mt-0.5`}
            >
              {icon}
            </div>
            <div className="flex-grow">
              <h4 className="text-sm font-semibold text-text-primary">
                {toast.type === 'success' ? 'Success' : toast.type === 'error' ? 'Error' : 'Notification'}
              </h4>
              <p className="text-sm text-text-secondary mt-1">{toast.message}</p>
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-text-muted hover:text-text-primary flex-shrink-0"
            >
              &times;
            </button>
          </div>
        );
      })}
    </div>
  );
}