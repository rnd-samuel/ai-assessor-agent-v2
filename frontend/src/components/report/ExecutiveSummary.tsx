// frontend/src/components/report/ExecutiveSummary.tsx
import { useState, useEffect } from 'react';
import apiService from '../../services/apiService';

interface SummaryData {
  id: string;
  strengths: string;
  areas_for_improvement: string;
  recommendations: string;
}

interface ExecutiveSummaryProps {
  reportId: string;
  isViewOnly: boolean;
  onAskAI: (context: string, currentText: string, onApply: (t: string) => void) => void;
}

export default function ExecutiveSummary({
  reportId,
  isViewOnly,
  onAskAI,
}: ExecutiveSummaryProps) {
  const [data, setData] = useState<SummaryData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Data Fetching
  useEffect(() => {
    const fetchData = async () => {
      if (!reportId) return;
      try {
        setIsLoading(true);
        const response = await apiService.get(`/reports/${reportId}/summary`);
        setData(response.data);
      } catch (err) {
        console.error("Failed to fetch summary:", err);
        setError("Failed to load executive summary.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [reportId]);

  // Handle Local Updates (Debounced save would go here in production)
  const handleChange = (field: keyof SummaryData, value: string) => {
    if (!data) return;
    setData({ ...data, [field]: value });
    // TODO: Autosave to backend
  };

  if (isLoading) return <div className="p-10 text-center text-text-muted">Loading summary...</div>;
  if (error) return <div className="p-10 text-center text-error">{error}</div>;

  if (!data) {
    return (
      <div className="text-center p-12 border-2 border-dashed border-border rounded-lg m-6">
        <h3 className="text-lg font-semibold text-text-primary">Summary Not Generated</h3>
        <p className="text-text-muted mt-1">
          Please go back to the Analysis tab and click "Generate Final Summary".
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto p-6 space-y-6 bg-bg-medium/50">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-text-primary">Executive Summary</h3>
      </div>

      {/* 1. Strengths */}
      <div className="relative group bg-bg-light p-4 rounded-lg shadow-sm border border-border">
        <div className="flex justify-between items-center mb-2">
          <label className="text-base font-semibold text-text-primary">Strengths</label>
          {!isViewOnly && (
            <button
              onClick={() => onAskAI(
                'Refine Strengths Section',
                data.strengths,
                (newText) => handleChange('strengths', newText)
            )}
              className="p-1.5 bg-primary/10 text-primary rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-primary/20"
              title="Ask AI to refine"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
            </button>
          )}
        </div>
        <textarea
          rows={4}
          className="w-full rounded-md border border-border p-3 bg-white shadow-sm text-sm resize-y focus:border-primary focus:ring-2 focus:ring-primary/50 outline-none disabled:bg-bg-medium"
          value={data.strengths}
          disabled={isViewOnly}
          onChange={(e) => handleChange('strengths', e.target.value)}
        />
      </div>

      {/* 2. Areas for Improvement */}
      <div className="relative group bg-bg-light p-4 rounded-lg shadow-sm border border-border">
        <div className="flex justify-between items-center mb-2">
          <label className="text-base font-semibold text-text-primary">Areas for Improvement</label>
          {!isViewOnly && (
            <button
              onClick={() => onAskAI(
                'Refine Improvements Section',
                data.areas_for_improvement,
                (newText) => handleChange('areas_for_improvement', newText)
              )}
              className="p-1.5 bg-primary/10 text-primary rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-primary/20"
              title="Ask AI to refine"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
            </button>
          )}
        </div>
        <textarea
          rows={4}
          className="w-full rounded-md border border-border p-3 bg-white shadow-sm text-sm resize-y focus:border-primary focus:ring-2 focus:ring-primary/50 outline-none disabled:bg-bg-medium"
          value={data.areas_for_improvement}
          disabled={isViewOnly}
          onChange={(e) => handleChange('areas_for_improvement', e.target.value)}
        />
      </div>

      {/* 3. Recommendations */}
      <div className="relative group bg-bg-light p-4 rounded-lg shadow-sm border border-border">
        <div className="flex justify-between items-center mb-2">
          <label className="text-base font-semibold text-text-primary">Development Recommendations</label>
          {!isViewOnly && (
            <button
              onClick={() => onAskAI(
                'Refine Recommendations Section',
                data.recommendations,
                (newText) => handleChange('recommendations', newText)
              )}
              className="p-1.5 bg-primary/10 text-primary rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-primary/20"
              title="Ask AI to refine"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
            </button>
          )}
        </div>
        <textarea
          rows={4}
          className="w-full rounded-md border border-border p-3 bg-white shadow-sm text-sm resize-y focus:border-primary focus:ring-2 focus:ring-primary/50 outline-none disabled:bg-bg-medium"
          value={data.recommendations}
          disabled={isViewOnly}
          onChange={(e) => handleChange('recommendations', e.target.value)}
        />
      </div>
    </div>
  );
}