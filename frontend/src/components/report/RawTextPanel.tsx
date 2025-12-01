// frontend/src/components/report/RawTextPanel.tsx
import { useEffect, useRef, useState } from 'react';

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
  onQuoteNotFound?: () => void;
}

// Helper: Normalize text (Lowercase + Strip all whitespace)
// This handles cases where AI output differs in casing or spacing (newlines vs spaces)
const normalize = (str: string) => str.toLowerCase().replace(/\s+/g, '');

// Helper: Get first sentence (naive splitting by punctuation)
const getFirstSentence = (str: string) => {
  const match = str.match(/[^.?!]+[.?!]+["']?|.+$/);
  return match ? match[0] : str;
};

// // Helper: Fuzzy finder
// const findQuoteIndex = (fullText: string, quote: string) => {
//   if (!quote || !fullText) return -1;
    
//   // 1. Exact match
//   let idx = fullText.indexOf(quote);
//   if (idx !== -1) return idx;

//   // 2. Normalized match (ignore extra whitespace)
//   // This assumes fullText doesn't have massive gaps, which our ingestion cleanup helps with.
    
//   // 3. First 20 chars (Fuzzy Start)
//   // Sometimes AI adds punctuation or changes the end slightly.
//   const shortStart = quote.substring(0, 20);
//   if (shortStart.length > 5) {
//     idx = fullText.indexOf(shortStart);
//     if (idx !== -1) return idx;
//   }

//     // 4. First 10 Words (User Idea)
//     const words = quote.split(/\s+/).slice(0, 10).join(' ');
//   if (words.length > 10) {
//     idx = fullText.indexOf(words);
//     if (idx !== -1) return idx;
//   }

//   return -1;
// };

export default function RawTextPanel({
  files,
  activeFileId,
  setActiveFileId,
  activeQuote,
  onTextSelection,
  onQuoteNotFound,
}: RawTextPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Store match result to avoid recalculating on every render
  const [matchResult, setMatchResult] = useState<{
    start: number;
    end: number;
    type: 'full' | 'partial' | 'none';
  }>({ start: -1, end: -1, type: 'none' });

  // 1. SEARCH LOGIC (The Core Requirement)
  useEffect(() => {
    if (!activeQuote || !activeFileId) return;

    const file = files.find(f => f.id === activeFileId);
    if (!file) return;

    const text = file.file_content;
    const lowerText = text.toLowerCase();
    
    // --- Tier 1: Exact Match ---
    let idx = text.indexOf(activeQuote);
    if (idx !== -1) {
      setMatchResult({ start: idx, end: idx + activeQuote.length, type: 'full' });
      return;
    }

    // --- Tier 2: Normalized Match (Case Insensitive + No Whitespace) ---
    // We search in the stripped version, then map indices back to the original
    const normText = normalize(text);
    const normQuote = normalize(activeQuote);
    const normIdx = normText.indexOf(normQuote);

    if (normIdx !== -1) {
      // Map back to original coordinates
      let count = 0;
      let start = -1;
      
      // Scan original text to find start/end
      for (let i = 0; i < text.length; i++) {
        if (!/\s/.test(text[i])) {
          if (count === normIdx) start = i;
          count++;
          if (count === normIdx + normQuote.length) {
            setMatchResult({ start, end: i + 1, type: 'full' });
            return;
          }
        }
      }
    }

    // --- Tier 3: First Sentence Match ---
    const firstSentence = getFirstSentence(activeQuote);
    idx = lowerText.indexOf(firstSentence.toLowerCase());
    if (idx !== -1 && firstSentence.length > 5) { // Ensure sentence isn't too short
      setMatchResult({ start: idx, end: idx + firstSentence.length, type: 'partial' });
      return;
    }

    // --- Tier 5: Offset Match (Skip first 5 chars, match next 20) ---
    // Handles cases where the first word is changed/hallucinated (e.g. "The user said..." vs "User said...")
    const offset = 5;
    if (activeQuote.length > offset + 10) { 
        const middleChunk = activeQuote.substring(offset, offset + 50);
        idx = lowerText.indexOf(middleChunk.toLowerCase());

        if (idx !== -1) {
            setMatchResult({ start: idx, end: idx + middleChunk.length, type: 'partial' });
            return;
        }
    }

    // --- Tier 4: First 20 Chars Match ---
    const first20 = activeQuote.substring(0, 20);
    idx = lowerText.indexOf(first20.toLowerCase());
    if (idx !== -1 && first20.length >= 10) { // Ensure not trivially short
      setMatchResult({ start: idx, end: idx + first20.length, type: 'partial' });
      return;
    }

    // --- Tier 6: Fail ---
    setMatchResult({ start: -1, end: -1, type: 'none' });
    if (onQuoteNotFound) onQuoteNotFound();

  }, [activeQuote, activeFileId, files, onQuoteNotFound]);

  // 2. Auto-Scroll to Highlight
  useEffect(() => {
    if (matchResult.type === 'none') return;

    // Small delay to allow DOM render
    const timer = setTimeout(() => {
      const element = document.getElementById('active-highlight');
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [matchResult]);

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

  // Simple highlighting logic: Split by the quote
  // In production, you might need a more robust library if quotes overlap or repeat often.
  const renderContent = () => {
    const activeFile = files.find((f) => f.id === activeFileId) || files[0];
    if (!activeFile) return <div className="p-6 text-text-muted">No file selected.</div>;

    const content = activeFile.file_content;
    const { start, end, type } = matchResult;

    if (type !== 'none' && start !== -1) {
      const before = content.substring(0, start);
      const match = content.substring(start, end);
      const after = content.substring(end);

      // Define styles based on type
      // Partial: Lighter, dashed underline to indicate "incomplete"
      const highlightClass = type === 'full'
        ? "bg-yellow-300 text-black rounded-sm"
        : "bg-orange-100 text-black border-b-2 border-orange-400 border-dashed rounded-sm";

      return (
        <div className="whitespace-pre-wrap">
          {before}
          <mark id="active-highlight" className={highlightClass}>
            {match}
          </mark>
          {after}
        </div>
      );
    }

    return <div className="whitespace-pre-wrap">{content}</div>;
  };

  return (
    <div className="h-full flex flex-col border-r border-border overflow-hidden bg-bg-light">
      {/* Tabs */}
      <div className="flex-shrink-0 border-b border-border overflow-x-auto flex bg-bg-medium/30 scrollbar-hide">
        {files.map((file) => (
          <button
            key={file.id}
            onClick={() => setActiveFileId(file.id)}
            className={`flex-shrink-0 whitespace-nowrap py-3 px-4 text-xs font-semibold border-b-2 transition-colors ${
              activeFileId === file.id
                ? 'border-primary text-primary bg-white'
                : 'border-transparent text-text-muted hover:text-text-secondary hover:bg-white/50'
            }`}
          >
            {file.file_name} <span className="opacity-50 ml-1 font-normal">({file.simulation_method_tag})</span>
          </button>
        ))}
      </div>

      {/* Content */}
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