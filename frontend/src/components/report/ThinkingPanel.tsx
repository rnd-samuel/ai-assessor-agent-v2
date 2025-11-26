// frontend/src/components/report/ThinkingPanel.tsx
import { useEffect, useRef, useState } from 'react';

interface ThinkingPanelProps {
  log: string;
}

export default function ThinkingPanel({ log }: ThinkingPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Auto-scroll to bottom
  useEffect(() => {
    if (!isCollapsed) {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [log, isCollapsed]);

  // --- COLLAPSED STATE (Floating Pill) ---
  if (isCollapsed) {
    return (
      <div className="fixed bottom-6 left-6 z-50 animate-fade-in">
        <button 
          onClick={() => setIsCollapsed(false)}
          className="bg-primary text-white shadow-lg border border-primary-active/20 rounded-full px-5 py-2.5 flex items-center gap-3 hover:bg-primary-hover transition-all transform hover:scale-105 hover:shadow-xl"
        >
          <div className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-50"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white"></span>
          </div>
          <span className="text-xs font-bold tracking-wide uppercase">AI Processing</span>
          {/* Chevron Up Icon */}
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6"/></svg>
        </button>
      </div>
    );
  }

  // --- EXPANDED STATE (Card) ---
  return (
    <div className="fixed bottom-6 left-6 z-50 w-80 md:w-96 animate-slide-up">
      <div className="w-full bg-bg-light rounded-lg shadow-2xl border border-border overflow-hidden flex flex-col max-h-[400px]">
        
        {/* Header */}
        <div 
          className="px-4 py-3 border-b border-border bg-bg-medium flex items-center justify-between cursor-pointer hover:bg-gray-100 transition-colors" 
          onClick={() => setIsCollapsed(true)}
        >
          <div className="flex items-center gap-3">
            <div className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary"></span>
            </div>
            <div>
              <h3 className="text-sm font-bold text-text-primary leading-none">AI Assessor</h3>
              <p className="text-[10px] text-text-muted mt-0.5">Analyzing documents...</p>
            </div>
          </div>
          
          {/* Chevron Down Icon */}
          <button className="text-text-muted hover:text-text-primary transition-colors">
             <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
          </button>
        </div>

        {/* Log Content */}
        <div className="flex-1 overflow-y-auto p-4 bg-white scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
          <div className="font-mono text-xs text-text-secondary leading-relaxed whitespace-pre-wrap break-words">
            {log || "Initializing connection..."}
          </div>
          
          {/* Typing Indicator at bottom */}
          <div className="mt-2 flex gap-1" ref={bottomRef}>
            <span className="w-1 h-1 bg-primary/40 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
            <span className="w-1 h-1 bg-primary/40 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
            <span className="w-1 h-1 bg-primary/40 rounded-full animate-bounce"></span>
          </div>
        </div>
        
        {/* Footer */}
        <div className="px-4 py-2 bg-gray-50 border-t border-border text-center">
             <p className="text-[10px] text-text-muted">You can minimize this window while you work.</p>
        </div>
      </div>
    </div>
  );
}