// frontend/src/components/report/ExecutiveSummary.tsx
import { useRef, useLayoutEffect } from 'react';
import LoadingButton from '../LoadingButton';

export interface SummaryData {
  id: string;
  overview: string;
  strengths: string;
  areas_for_improvement: string;
  recommendations: string;
}

interface ExecutiveSummaryProps {
  reportId: string;
  isViewOnly: boolean;
  onAskAI: (context: string, currentText: string, onApply: (t: string) => void) => void;
  data: SummaryData | null;
  onChange: (newData: SummaryData) => void;
  reportStatus: 'CREATED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  processingPhase?: number | null;
  onGenerate: () => void;
  onReset: () => void;
  isGenerating: boolean;
}

const AutoTextarea = (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [props.value]);

  return <textarea ref={textareaRef} {...props} />;
};

export default function ExecutiveSummary({
  // reportId,
  isViewOnly,
  onAskAI,
  data,
  onChange,
  reportStatus,
  processingPhase,
  onGenerate,
  onReset,
  isGenerating
}: ExecutiveSummaryProps) {
  
  // Is empty if no data OR if we are currently processing (show loader instead of empty fields)
  const isProcessing = reportStatus === 'PROCESSING' && processingPhase === 3 || isGenerating;
  const hasData = data && (data.overview || data.strengths);

  // Handle Local Updates
  const handleChange = (field: keyof SummaryData, value: string) => {
    if (!data) return;
    const newData = { ...data, [field]: value };
    onChange(newData);
  };

return (
    <div className="flex flex-col h-full overflow-y-auto p-6 space-y-6 bg-bg-medium/50">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-text-primary">Executive Summary</h3>

        <div className="flex gap-2">
          {(reportStatus === 'FAILED' || (reportStatus === 'COMPLETED' && hasData && !isViewOnly)) && !isProcessing && (
            <button 
              onClick={onGenerate} 
              className="text-xs text-primary hover:underline font-medium"
            >
              {reportStatus === 'FAILED' ? 'Retry Generation' : 'Regenerate Summary'}
            </button>
          )}
        </div>
      </div>

      {isProcessing ? (
        <div className="flex flex-col items-center justify-center h-64 text-center border-2 border-dashed border-border rounded-lg bg-bg-light/50">
           <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mb-3"></div>
           <p className="text-text-primary font-medium">AI is writing the summary...</p>
           <p className="text-xs text-text-muted">Drafting narrative: Checking for conflicts</p>
           <button
            onClick={onReset}
            className="mt-6 text-xs text-text-muted hover:text-error underline transition-colors"
           >
            Stop Generation
           </button>
        </div>
      ) : !hasData ? (
         <div className="flex flex-col items-center justify-center h-64 text-center border-2 border-dashed border-border rounded-lg bg-bg-light/50">
            <p className="text-text-muted">No summary generated yet.</p>
            {!isViewOnly && (
                <LoadingButton onClick={onGenerate} className="mt-4">Generate Summary</LoadingButton>
            )}
         </div>
      ) : (
        <>
          {/* 0. Summary / Overview (New) */}
          <div className="relative group bg-bg-light p-4 rounded-lg shadow-sm border border-border">
            <div className="flex justify-between items-center mb-2">
              <label className="text-base font-semibold text-text-primary">Summary Narrative</label>
              {!isViewOnly && (
                <button
                  onClick={() => onAskAI('Refine Narrative', data?.overview || '', (t) => handleChange('overview', t))}
                  className="p-1.5 bg-primary/10 text-primary rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-primary/20"
                >
                   <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
                </button>
              )}
            </div>
            <AutoTextarea
              rows={4}
              className="w-full rounded-md border border-border p-3 bg-white shadow-sm text-sm resize-y focus:border-primary focus:ring-2 focus:ring-primary/50 outline-none disabled:bg-bg-medium"
              value={data?.overview || ''}
              disabled={isViewOnly}
              onChange={(e) => handleChange('overview', e.target.value)}
              placeholder="The assessee is eager to learn..."
            />
          </div>

          {/* 1. Strengths */}
          <div className="relative group bg-bg-light p-4 rounded-lg shadow-sm border border-border">
            <div className="flex justify-between items-center mb-2">
              <label className="text-base font-semibold text-text-primary">Overall Strengths</label>
              {!isViewOnly && (
                <button
                  onClick={() => onAskAI('Refine Strengths', data?.strengths || '', (t) => handleChange('strengths', t))}
                  className="p-1.5 bg-primary/10 text-primary rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-primary/20"
                >
                   <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
                </button>
              )}
            </div>
            <AutoTextarea
              rows={4}
              className="w-full rounded-md border border-border p-3 bg-white shadow-sm text-sm resize-y focus:border-primary focus:ring-2 focus:ring-primary/50 outline-none disabled:bg-bg-medium"
              value={data?.strengths || ''}
              disabled={isViewOnly}
              onChange={(e) => handleChange('strengths', e.target.value)}
            />
          </div>

          {/* 2. Weaknesses */}
          <div className="relative group bg-bg-light p-4 rounded-lg shadow-sm border border-border">
            <div className="flex justify-between items-center mb-2">
              <label className="text-base font-semibold text-text-primary">Overall Weaknesses</label>
              {!isViewOnly && (
                <button
                  onClick={() => onAskAI('Refine Weaknesses', data?.areas_for_improvement || '', (t) => handleChange('areas_for_improvement', t))}
                  className="p-1.5 bg-primary/10 text-primary rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-primary/20"
                >
                   <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
                </button>
              )}
            </div>
            <AutoTextarea
              rows={4}
              className="w-full rounded-md border border-border p-3 bg-white shadow-sm text-sm resize-y focus:border-primary focus:ring-2 focus:ring-primary/50 outline-none disabled:bg-bg-medium"
              value={data?.areas_for_improvement || ''}
              disabled={isViewOnly}
              onChange={(e) => handleChange('areas_for_improvement', e.target.value)}
            />
          </div>

          {/* 3. Recommendations */}
          <div className="relative group bg-bg-light p-4 rounded-lg shadow-sm border border-border">
            <div className="flex justify-between items-center mb-2">
              <label className="text-base font-semibold text-text-primary">Overall Recommendations</label>
              {!isViewOnly && (
                <button
                  onClick={() => onAskAI('Refine Recommendations', data?.recommendations || '', (t) => handleChange('recommendations', t))}
                  className="p-1.5 bg-primary/10 text-primary rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-primary/20"
                >
                   <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
                </button>
              )}
            </div>
            <AutoTextarea
              rows={4}
              className="w-full rounded-md border border-border p-3 bg-white shadow-sm text-sm resize-y focus:border-primary focus:ring-2 focus:ring-primary/50 outline-none disabled:bg-bg-medium"
              value={data?.recommendations || ''}
              disabled={isViewOnly}
              onChange={(e) => handleChange('recommendations', e.target.value)}
            />
          </div>
        </>
      )}
    </div>
  );
}