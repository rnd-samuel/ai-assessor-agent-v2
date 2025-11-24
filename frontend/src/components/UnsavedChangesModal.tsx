// frontend/src/components/UnsavedChangesModal.tsx

interface UnsavedChangesModalProps {
  isOpen: boolean;
  onStay: () => void;
  onLeave: () => void;
}

export default function UnsavedChangesModal({ isOpen, onStay, onLeave }: UnsavedChangesModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-bg-light rounded-lg shadow-lg p-6 animate-fade-in border border-border">
        <h3 className="text-lg font-semibold text-text-primary">Unsaved Changes</h3>
        <p className="text-sm text-text-secondary mt-2">
          You have unsaved changes. Are you sure you want to leave?
        </p>
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onStay}
            className="bg-white text-text-secondary border border-border rounded-md text-sm font-semibold px-4 py-2 hover:bg-bg-medium transition-colors"
          >
            Stay
          </button>
          <button
            onClick={onLeave}
            className="bg-error text-white rounded-md text-sm font-semibold px-4 py-2 hover:bg-red-700 transition-colors"
          >
            Leave
          </button>
        </div>
      </div>
    </div>
  );
}