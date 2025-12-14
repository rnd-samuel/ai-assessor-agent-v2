// frontend/src/components/report/CompetencyAnalysisList.tsx
import { useState } from 'react';
import CompetencyAnalysisCard from './CompetencyAnalysisCard'; 
import { type CompetencyAnalysis } from '../../types/assessment'; 
import LoadingButton from '../LoadingButton';

interface CompetencyAnalysisListProps {
  reportId: string;
  isViewOnly: boolean;
  onGenerateNext: () => void;
  onReset: () => void;
  onResume: () => void;
  onHighlightEvidence: (quote: string, source: string) => void;
  onAskAI: (context: string, currentText: string, onApply: (t: string) => void) => void;
  data: CompetencyAnalysis[];
  onChange: (newData: CompetencyAnalysis[]) => void;
  isLastPhase: boolean;
  reportStatus: 'CREATED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  processingPhase?: number | null;
  targetLevelsMap: Record<string, string>;
}

export default function CompetencyAnalysisList({
  isViewOnly,
  onGenerateNext,
  onReset,
  onResume,
  onHighlightEvidence,
  onAskAI,
  data,
  onChange,
  isLastPhase,
  reportStatus,
  processingPhase,
  targetLevelsMap
}: CompetencyAnalysisListProps) {
  
  // Filters
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filterCompetency, setFilterCompetency] = useState('');

  const [isGenerating, setIsGenerating] = useState(false);
  const [isResuming, setIsResuming] = useState(false);

  const isProcessing = reportStatus === 'PROCESSING' && processingPhase === 2;

  const handleGenerateSummary = async () => {
    setIsGenerating(true);
    await onGenerateNext();
    setIsGenerating(false);
  };

  const handleResume = async () => {
    setIsResuming(true);
    await onResume();
    setIsResuming(false);
  }

  const handleCardChange = (updatedItem: CompetencyAnalysis) => {
    const newData = data.map((item) =>
        item.id === updatedItem.id ? updatedItem : item
    );
    // TODO: Autosave to backend
    onChange(newData);
  };

  // Filter Logic
  const filteredData = data.filter(item =>
    filterCompetency === '' || item.competencyName === filterCompetency
  );
  const competencies = [...new Set(data.map(d => d.competencyName))];

  return (
    <div className="flex flex-col h-full" onClick={() => setIsFilterOpen(false)}>
      
      {/* Header & Filters */}
      <div className="flex-shrink-0 p-6 border-b border-border bg-bg-light sticky top-0 z-10">
         <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-text-primary">Competency Analysis</h3>
            
            {/* Filter Dropdown */}
            <div className="relative" onClick={(e) => e.stopPropagation()}>
                <button 
                  onClick={() => setIsFilterOpen(!isFilterOpen)}
                  className={`bg-white text-text-secondary border border-border rounded-md text-sm font-semibold px-4 py-2 hover:bg-bg-medium transition-colors flex items-center gap-2 ${isFilterOpen || filterCompetency ? 'border-primary text-primary' : ''}`}
                  disabled={isViewOnly}
                >
                   <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
                   Filter
                </button>
                {isFilterOpen && (
                    <div className="absolute right-0 top-full mt-2 w-64 bg-bg-light rounded-lg shadow-lg border border-border p-4 z-20 animate-fade-in">
                        <label className="text-xs font-semibold text-text-secondary mb-1 block">Competency</label>
                        <select 
                           className="w-full text-sm border border-border rounded px-2 py-1.5 bg-white"
                           value={filterCompetency}
                           onChange={(e) => setFilterCompetency(e.target.value)}
                        >
                            <option value="">All Competencies</option>
                            {competencies.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        {filterCompetency && (
                            <button 
                                className="w-full text-xs text-primary hover:underline pt-2 text-center mt-1"
                                onClick={() => setFilterCompetency('')}
                            >
                                Clear Filters
                            </button>
                        )}
                    </div>
                )}
            </div>
         </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-grow overflow-y-auto p-6 space-y-6 bg-bg-medium/50">
        {/* CASE 1: EMPTY & PROCESSING (Centered Loader) */}
        {filteredData.length === 0 && isProcessing && (
          <div className="flex flex-col items-center justify-center h-64 text-center border-2 border-dashed border-border rounded-lg bg-bg-light/50 animate-fade-in">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-text-primary font-medium">AI is analyzing competencies...</p>
            <p className="text-xs text-text-muted mt-1">This may take a few minutes.</p>
            <button
              onClick={onReset}
              className="mt-6 text-xs text-text-muted hover:text-error underline transition-colors"
            >
              Taking too long? Stop Generation.
            </button>
          </div>
        )}

        {/* CASE 2: EMPTY & NOT PROCESSING (No Data) */}
        {filteredData.length === 0 && !isProcessing && (
          <div className="flex flex-col items-center justify-center h-64 text-center text-text-muted border-2 border-dashed border-border rounded-lg">
            <h3 className="text-lg font-semibold text-text-primary">No Competencies Found</h3>
            <p className="text-text-muted mt-1">No competencies match your filter or generation hasn't started.</p>
          </div>
        )}

        {/* CASE 3: DATA EXISTS (List Cards) */}
        {filteredData.length > 0 && (
          <>
            {filteredData.map((item) => (
              <CompetencyAnalysisCard
                key={item.id}
                data={item}
                targetLevel={targetLevelsMap[item.competencyName] || "3"}
                isViewOnly={isViewOnly}
                onChange={handleCardChange}
                onAskAI={onAskAI}
                onHighlightEvidence={onHighlightEvidence}
              />
            ))}

            {/* CASE 4: DATA EXISTS & PROCESSING (Bottom Loader) */}
            {isProcessing && (
              <div className="w-full p-6 rounded-lg border-2 border-dashed border-primary/30 bg-primary/5 flex flex-col items-center justify-center animate-pulse mt-4">
                <div className="flex items-center gap-2 text-primary font-semibold">
                  <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full"></div>
                  <span>Analyzing next competency...</span>
                </div>
                <p className="text-xs text-text-muted mt-1">Please wait while the AI continues.</p>
                <button onClick={onReset} className="mt-3 text-[10px] text-text-muted hover:text-error underline">
                  Stop Generation
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer Actions */}
      <div className="p-4 border-t border-border bg-bg-light flex justify-end gap-3">

        {/* RESUME BUTTON (Show if failed or partially done) */}
        {reportStatus === 'FAILED' && !isViewOnly && (
          <LoadingButton
            onClick={handleResume}
            isLoading={isResuming}
            loadingText="Resuming..."
            className="bg-primary text-white hover:bg-primary-hover shadow-sm"
            icon={<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>}
          >
            Resume Analysis
          </LoadingButton>
        )}

        {!isViewOnly && data.length > 0 && !isLastPhase && !isProcessing && (
          <LoadingButton
            onClick={handleGenerateSummary}
            isLoading={isGenerating}
            loadingText="Generating..."
            className="flex items-center gap-2"
          >
            Generate Final Summary &rarr;
          </LoadingButton>
        )}

        {/* Show "Processing..." disabled button if active */}
        {reportStatus === 'PROCESSING' && (
          <button disabled className="bg-bg-medium text-text-muted rounded-md text-sm font-semibold px-4 py-2 cursor-not-allowed opacity-70 flex items-center gap-2">
            <div className="animate-spin h-3 w-3 border-2 border-current border-t-transparent rounded-full"></div>
            AI Working...
          </button>
        )}
      </div>
    </div>
  );
}