// frontend/src/components/report/CompetencyAnalysisList.tsx
import { useState, useEffect } from 'react';
import apiService from '../../services/apiService';
import CompetencyAnalysisCard, { type CompetencyAnalysisData } from './CompetencyAnalysisCard';

interface CompetencyAnalysisListProps {
  reportId: string;
  isViewOnly: boolean;
  onGenerateNext: () => void;
  onHighlightEvidence: (quote: string, source: string) => void;
}

export default function CompetencyAnalysisList({
  reportId,
  isViewOnly,
  onGenerateNext,
  onHighlightEvidence,
}: CompetencyAnalysisListProps) {
  const [analysisData, setAnalysisData] = useState<CompetencyAnalysisData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filters
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filterCompetency, setFilterCompetency] = useState('');

  // Fetch Data
  useEffect(() => {
    const fetchData = async () => {
      if (!reportId) return;
      try {
        setIsLoading(true);
        const response = await apiService.get(`/reports/${reportId}/analysis`);
        
        const mappedData = response.data.map((row: any) => ({
            id: row.id,
            competencyName: row.competency,
            levelAchieved: row.level_achieved,
            explanation: row.explanation,
            developmentRecommendations: row.development_recommendations,
            keyBehaviors: row.key_behaviors_status || []
        }));

        setAnalysisData(mappedData);
      } catch (err) {
        console.error("Failed to fetch analysis:", err);
        setError("Failed to load competency analysis.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [reportId]);

  const handleCardChange = (updatedItem: CompetencyAnalysisData) => {
    setAnalysisData((prev) => 
        prev.map((item) => (item.id === updatedItem.id ? updatedItem : item))
    );
    // TODO: Autosave to backend
  };

  const handleAskAI = (context: string, currentText: string) => {
    // In a real app, this would open the "Ask AI" modal in the parent ReportPage.
    // For now, we will just log it or alert.
    // To fix this properly, we should lift the 'modals.askAI' state up or expose a context.
    console.log("Ask AI triggered:", context);
    alert("Ask AI feature coming soon! Context: " + context);
  };

  // Filter Logic
  const filteredData = analysisData.filter(item => 
    filterCompetency === '' || item.competencyName === filterCompetency
  );
  const competencies = [...new Set(analysisData.map(d => d.competencyName))];

  if (isLoading) return <div className="p-10 text-center text-text-muted">Loading analysis...</div>;
  if (error) return <div className="p-10 text-center text-error">{error}</div>;

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
             <div className="text-center p-12 border-2 border-dashed border-border rounded-lg">
                 <h3 className="text-lg font-semibold text-text-primary">Analysis Not Generated</h3>
                 <p className="text-text-muted mt-1">
                     {analysisData.length === 0 
                        ? 'Please go back to the Evidence tab and click "Generate Next Phase".' 
                        : 'No competencies match your filter.'}
                 </p>
             </div>
         ) : (
             filteredData.map((item) => (
                 <CompetencyAnalysisCard
                    key={item.id}
                    data={item}
                    targetLevel="3" // TODO: Pass real target level from Report Context
                    isViewOnly={isViewOnly}
                    onChange={handleCardChange}
                    onAskAI={handleAskAI}
                    onHighlightEvidence={onHighlightEvidence}
                 />
             ))
         )}
      </div>

      {/* Footer Actions */}
      <div className="p-4 border-t border-border bg-bg-light flex justify-end">
         {!isViewOnly && analysisData.length > 0 && (
             <button
                onClick={onGenerateNext}
                className="bg-primary text-white px-5 py-2.5 rounded-md text-sm font-semibold hover:bg-primary-hover shadow-sm transition-all flex items-center gap-2"
             >
                Generate Final Summary &rarr;
             </button>
         )}
      </div>
    </div>
  );
}