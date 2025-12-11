// frontend/src/components/report/CompetencyAnalysisList.tsx
import { useState } from 'react';
import CompetencyAnalysisCard from './CompetencyAnalysisCard'; // Types handled inside Card now
import { type CompetencyAnalysis } from '../../types/assessment'; // Import from shared types
import LoadingButton from '../LoadingButton';

interface CompetencyAnalysisListProps {
  reportId: string;
  isViewOnly: boolean;
  onGenerateNext: () => void;
  onReset: () => void;
  onHighlightEvidence: (quote: string, source: string) => void;
  onAskAI: (context: string, currentText: string, onApply: (t: string) => void) => void;
  data: CompetencyAnalysis[];
  onChange: (newData: CompetencyAnalysis[]) => void;
  isLastPhase: boolean;
  reportStatus: 'CREATED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
}

export default function CompetencyAnalysisList({
  isViewOnly,
  onGenerateNext,
  onReset,
  onHighlightEvidence,
  onAskAI,
  data,
  onChange,
  isLastPhase,
  reportStatus
}: CompetencyAnalysisListProps) {
  
  // Filters
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filterCompetency, setFilterCompetency] = useState('');

  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerateSummary = async () => {
    setIsGenerating(true);
    await onGenerateNext();
    setIsGenerating(false);
  };

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
         {filteredData.length === 0 ? (
             <div className="flex flex-col items-center justify-center h-64 text-center text-text-muted border-2 border-dashed border-border rounded-lg">
                {data.length === 0 ? (
                  <div className="space-y-3">
                    <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
                    <p className="text-text-primary font-medium">Generating Analysis...</p>
                    <p className="text-xs text-text-muted">This may take a moment.</p>
                  </div>
                ) : (
                  <>
                    <h3 className="text-lg font-semibold text-text-primary">No Competencies Found</h3>
                    <p className="text-text-muted mt-1">No competencies match your filter.</p>
                  </>
                )}
             </div>
         ) : (
             filteredData.map((item) => (
                 <CompetencyAnalysisCard
                    key={item.id}
                    data={item}
                    targetLevel="3" // TODO: Pass real target level from Report Context
                    isViewOnly={isViewOnly}
                    onChange={handleCardChange}
                    onAskAI={onAskAI}
                    onHighlightEvidence={onHighlightEvidence}
                 />
             ))
         )}
      </div>

      {/* Footer Actions */}
      <div className="p-4 border-t border-border bg-bg-light flex justify-end gap-3">
        {reportStatus === 'PROCESSING' && (
          <button
            onClick={onReset}
            className="text-xs text-error hover: underline font-medium"
          >
            Stop Generation
          </button>
        )}
        {!isViewOnly && data.length > 0 && !isLastPhase && (
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