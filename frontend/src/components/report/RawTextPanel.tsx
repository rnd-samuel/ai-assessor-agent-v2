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

// Helper: Fuzzy finder
const findQuoteIndex = (fullText: string, quote: string) => {
  if (!quote || !fullText) return -1;
    
  // 1. Exact match
  let idx = fullText.indexOf(quote);
  if (idx !== -1) return idx;

  // 2. Normalized match (ignore extra whitespace)
  // This assumes fullText doesn't have massive gaps, which our ingestion cleanup helps with.
    
  // 3. First 20 chars (Fuzzy Start)
  // Sometimes AI adds punctuation or changes the end slightly.
  const shortStart = quote.substring(0, 20);
  if (shortStart.length > 5) {
    idx = fullText.indexOf(shortStart);
    if (idx !== -1) return idx;
  }

    // 4. First 10 Words (User Idea)
    const words = quote.split(/\s+/).slice(0, 10).join(' ');
  if (words.length > 10) {
    idx = fullText.indexOf(words);
    if (idx !== -1) return idx;
  }

  return -1;
};

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

    const startIdx = findQuoteIndex(content, activeQuote || '');

    if (activeQuote && startIdx !== -1) {
      const before = content.substring(0, startIdx);
      // We highlight roughly the length of the quote (or just the part we found)
      // Ideally we'd find the end index too, but for "first 10 words" fallback, 
      // highlighting just those 10 words is better than nothing.
      const matchLength = activeQuote.length; 
      const highlight = content.substring(startIdx, startIdx + matchLength);
      const after = content.substring(startIdx + matchLength);

      return (
        <div className="whitespace-pre-wrap">
          {before}
          <mark id="active-highlight" className="bg-yellow-200...">{highlight}</mark>
          {after}
        </div>
      );
  };

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