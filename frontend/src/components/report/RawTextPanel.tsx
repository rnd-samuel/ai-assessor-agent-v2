// frontend/src/components/report/RawTextPanel.tsx
import { useEffect, useRef } from 'react';

interface RawFile {
  id: string;
  file_name: string;
  simulation_method_tag: string;
  file_content: string;
}

interface RawTextPanelProps {
  files: RawFile[];
  activeFileId: string | null;
  setActiveFileId: (id: string) => void;
  activeQuote: string | null;
  onTextSelection: (text: string) => void;
}

export default function RawTextPanel({
  files,
  activeFileId,
  setActiveFileId,
  activeQuote,
  onTextSelection,
}: RawTextPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Scroll to highlight when activeQuote changes
  useEffect(() => {
    if (!activeQuote || !activeFileId) return;

    // Allow time for the DOM to render the <mark> tag
    const timer = setTimeout(() => {
      const element = document.getElementById('active-highlight');
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [activeQuote, activeFileId]);

  // Handle text selection for manual evidence creation
  const handleMouseUp = () => {
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (text) {
      onTextSelection(text);
    }
  };

  if (files.length === 0) {
    return <div className="p-6 text-text-muted">No files available.</div>;
  }

  const activeFile = files.find((f) => f.id === activeFileId) || files[0];

  // Simple highlighting logic: Split by the quote
  // In production, you might need a more robust library if quotes overlap or repeat often.
  const renderContent = () => {
    if (!activeFile) return null;
    const content = activeFile.file_content;

    if (activeQuote && content.includes(activeQuote)) {
      const parts = content.split(activeQuote);
      return (
        <div className="whitespace-pre-wrap">
          {parts.map((part, index) => (
            <span key={index}>
              {part}
              {index < parts.length - 1 && (
                <mark
                  id={index === 0 ? 'active-highlight' : undefined} // ID for scrolling
                  className="bg-yellow-200 text-text-primary rounded-sm"
                >
                  {activeQuote}
                </mark>
              )}
            </span>
          ))}
        </div>
      );
    }

    return <div className="whitespace-pre-wrap">{content}</div>;
  };

  return (
    <div className="h-full flex flex-col border-r border-border overflow-hidden bg-bg-light">
      {/* File Tabs */}
      <div className="flex-shrink-0 border-b border-border overflow-x-auto flex">
        {files.map((file) => (
          <button
            key={file.id}
            onClick={() => setActiveFileId(file.id)}
            className={`flex-shrink-0 whitespace-nowrap py-3 px-4 text-sm font-medium border-b-2 transition-colors ${
              activeFileId === file.id
                ? 'border-primary text-primary bg-primary/5'
                : 'border-transparent text-text-muted hover:border-border hover:text-text-secondary'
            }`}
          >
            {file.simulation_method_tag}
          </button>
        ))}
      </div>

      {/* File Content */}
      <div
        className="flex-grow overflow-y-auto p-6 font-mono text-sm text-text-secondary leading-relaxed"
        onMouseUp={handleMouseUp}
        ref={containerRef}
      >
        {renderContent()}
      </div>
    </div>
  );
}