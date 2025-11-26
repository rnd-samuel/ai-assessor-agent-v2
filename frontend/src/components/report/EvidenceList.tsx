// frontend/src/components/report/EvidenceList.tsx
import { useState, useMemo } from 'react';
import EvidenceCard, { type EvidenceCardData } from './EvidenceCard';
import LoadingButton from '../LoadingButton';
import ThinkingPanel from './ThinkingPanel';
import * as XLSX from 'xlsx';
import { useToastStore } from '../../state/toastStore';

// Data Format Helper
const formatDateToDDMMYY = (date: Date) => {
  const d = date.getDate().toString().padStart(2, '0');
  const m = (date.getMonth() + 1).toString().padStart(2, '0'); // Month is 0-indexed
  const y = date.getFullYear().toString().slice(-2);
  return `${d}${m}${y}`;
};

interface EvidenceListProps {
  evidence: EvidenceCardData[];
  dictionary: any;
  rawFiles: any[];
  activeEvidenceId: string | null;
  isViewOnly: boolean;
  reportTitle: string;
  isWaitingForSelection?: boolean;
  onCancelCreate?: () => void;
  // ----------------
  onHighlight: (evidence: EvidenceCardData) => void;
  onEdit: (evidence: EvidenceCardData) => void;
  onDelete: (id: string) => void;
  onCreate: () => void;
  reportStatus: 'CREATED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

  targetPhase: number;
  isThinking: boolean;
  streamLog: string;

  onGeneratePhase1: () => void;
  onGenerateNext: () => void;
  onReset: () => void;
}

export default function EvidenceList({
  evidence,
  dictionary,
  rawFiles,
  activeEvidenceId,
  isViewOnly,
  reportTitle,
  isWaitingForSelection = false,
  onCancelCreate,
  onHighlight,
  onEdit,
  onDelete,
  onCreate,
  reportStatus,
  targetPhase,
  isThinking,
  streamLog,
  onGeneratePhase1,
  onGenerateNext,
  onReset,
}: EvidenceListProps) {
  // --- Filter State ---
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filters, setFilters] = useState({
    competency: '',
    level: '',
    source: '',
  });

  const addToast = useToastStore((state) => state.addToast);

  const [isSkipModalOpen, setIsSkipModalOpen] = useState(false);
  const [isGenEvidenceLoading, setIsGenEvidenceLoading] = useState(false);
  const [isNextPhaseLoading, setIsNextPhaseLoading] = useState(false);

  // --- Derived Data ---
  const competencyMap = useMemo(() => {
    const map = new Map<string, string>();
    if (dictionary?.kompetensi) {
      dictionary.kompetensi.forEach((c: any) => {
        map.set(c.id, c.name || c.namaKompetensi);
      });
    }
    return map;
  }, [dictionary]);

  const sourceList = useMemo(() => 
    [...new Set(rawFiles.map((f) => f.simulation_method_tag))], 
  [rawFiles]);

  const levelList = useMemo(() => 
    [...new Set(evidence.map((e) => e.level))].sort(), 
  [evidence]);

  // --- Filtering Logic ---
  const filteredEvidence = useMemo(() => {
    return evidence.filter((ev) => {
      return (
        (filters.competency === '' || ev.competency === filters.competency) &&
        (filters.level === '' || ev.level === filters.level) &&
        (filters.source === '' || ev.source === filters.source)
      );
    });
  }, [evidence, filters]);

  // 1. Robust Map using NAMES as keys (since AI outputs Names)
  const competencyNames = useMemo(() => {
    const names: string[] = [];
    if (dictionary?.kompetensi) {
      dictionary.kompetensi.forEach((c: any) => {
        // Prefer 'name', fallback to 'namaKompetensi'
        const name = c.name || c.namaKompetensi;
        if (name) names.push(name);
      });
    }
    return names.sort();
  }, [dictionary]);

  // --- Export Logic ---
  const handleExport = () => {
    const dataToExport = filteredEvidence.map((ev) => ({
      Competency: competencyMap.get(ev.competency) || ev.competency,
      Level: ev.level,
      'Key Behavior': ev.kb,
      Source: ev.source,
      Evidence: ev.quote,
      Reasoning: ev.reasoning,
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Evidence');

    ws['!cols'] = [
      { wch: 25 }, // Competency
      { wch: 10 }, // Level
      { wch: 40 }, // Key Behavior
      { wch: 20 }, // Source
      { wch: 60 }, // Evidence
      { wch: 60 }, // Reasoning
    ];

    const datePrefix = formatDateToDDMMYY(new Date());
    const safeTitle = reportTitle.replace(/[^a-zA-Z0-9]/g, '_');
    const newFilename = `${datePrefix}_Evidence_${safeTitle}.xlsx`;

    XLSX.writeFile(wb, newFilename);
  };

  const handleNextClick = () => {
      // If status is CREATED, it means AI generation hasn't run/finished

      if (evidence.length === 0) {
        addToast('Please collect at least one piece of evidence before proceeding.', 'info');
        return;
      }

      if (reportStatus === 'CREATED') {
          setIsSkipModalOpen(true);
      } else {
          handleNextPhase();
      }
  };

  const handleGenerateEvidence = async() => {
    setIsGenEvidenceLoading(true);
    await onGeneratePhase1();
    setIsGenEvidenceLoading(false);
  }

  const handleNextPhase = async () => {
    setIsNextPhaseLoading(true);
    await onGenerateNext();
    setIsNextPhaseLoading(false);
  }

  return (
    <div className="flex flex-col h-full relative">
      {/* Header & Filters */}
      <div className="flex-shrink-0 p-4 border-b border-border bg-bg-light sticky top-0 z-10">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-text-primary">
            Evidence ({filteredEvidence.length})
          </h3>
          <div className="flex gap-2">
             <div className="relative">
                <button
                  onClick={() => setIsFilterOpen(!isFilterOpen)}
                  className={`px-3 py-1.5 text-sm font-medium border rounded-md flex items-center gap-2 transition-colors ${
                    isFilterOpen || filters.competency || filters.level || filters.source
                      ? 'bg-primary/10 border-primary text-primary'
                      : 'bg-white border-border text-text-secondary hover:bg-bg-medium'
                  }`}
                >
                   <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
                   Filter
                </button>
                
                {/* Filter Dropdown */}
                {isFilterOpen && (
                  <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-lg shadow-xl border border-border p-4 z-20 space-y-3">
                    <div>
                      <label className="text-xs font-semibold text-text-secondary mb-1 block">Competency</label>
                      <select
                        className="w-full text-sm border border-border rounded px-2 py-1"
                        value={filters.competency}
                        onChange={(e) => setFilters({ ...filters, competency: e.target.value })}
                      >
                        <option value="">All</option>
                        {competencyNames.map((name) => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-text-secondary mb-1 block">Level</label>
                      <select
                        className="w-full text-sm border border-border rounded px-2 py-1"
                        value={filters.level}
                        onChange={(e) => setFilters({ ...filters, level: e.target.value })}
                      >
                        <option value="">All</option>
                        {levelList.map((l) => (
                          <option key={l} value={l}>{l}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-text-secondary mb-1 block">Source</label>
                      <select
                        className="w-full text-sm border border-border rounded px-2 py-1"
                        value={filters.source}
                        onChange={(e) => setFilters({ ...filters, source: e.target.value })}
                      >
                        <option value="">All</option>
                        {sourceList.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                    <button 
                        className="w-full text-xs text-primary hover:underline pt-2 text-center"
                        onClick={() => setFilters({ competency: '', level: '', source: '' })}
                    >
                        Clear Filters
                    </button>
                  </div>
                )}
             </div>

             {(reportStatus === 'CREATED' || reportStatus === 'FAILED' || evidence.length === 0) && (
                <LoadingButton
                  onClick={handleGenerateEvidence}
                  isLoading={isGenEvidenceLoading}
                  loadingText="Generating..."
                  disabled={isViewOnly}
                  className="bg-gradient-to-r from-indigo-500 to-purple-600 border-none hover:from-indigo-600 hover:to-purple-700 text-white shadow-sm"
                  icon={<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/><path d="m12 8-2.5 3 1.5 4.5"/><path d="m17.5 8-2.5 3 1.5 4.5"/><path d="m7 8-2.5 3 1.5 4.5"/></svg>}
                >
                  {reportStatus === 'FAILED' ? 'Retry AI Generation' : 'Generate Evidence'}
                </LoadingButton>
             )}

             {/* --- UPDATED BUTTON LOGIC --- */}
             <button
                onClick={isWaitingForSelection ? onCancelCreate : onCreate}
                disabled={isViewOnly}
                className={`${isWaitingForSelection 
                  ? 'bg-warning text-text-primary hover:bg-amber-400' 
                  : 'bg-primary text-white hover:bg-primary-hover'} 
                  text-sm font-medium px-3 py-1.5 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm`}
             >
               {isWaitingForSelection ? 'Cancel Selection' : '+ Evidence'}
             </button>
          </div>
        </div>
      </div>

      {/* Scrollable List */}
      <div className="flex-grow overflow-y-auto p-4 space-y-4 bg-bg-medium/30">
        {filteredEvidence.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center text-text-muted border-2 border-dashed border-border rounded-lg bg-bg-light/50">
          
          {/* PRIORITY: Check loading first to prevent blink */}
          {(reportStatus === 'PROCESSING' || isGenEvidenceLoading) ? (
            <div className="animate-fade-in flex flex-col items-center">
              <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
              <p className="text-text-primary font-medium">AI is analyzing documents...</p>
              <p className="text-xs text-text-muted mt-1">This may take a minute.</p>

              <button
                onClick={onReset}
                className="mt-6 text-xs text-text-muted hover:text-error underline transition-colors"
              >
                Taking too long? Click here to Reset.
              </button>
            </div>
          ) : reportStatus === 'CREATED' ? (
            <div className="max-w-xs space-y-4 animate-fade-in">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto text-primary">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              </div>
              <h3 className="text-lg font-semibold text-text-primary">Ready to Assess</h3>
              <p className="text-sm">
                You can manually highlight text on the left to create evidence, or let the AI find it for you.
              </p>
              <LoadingButton
                onClick={handleGenerateEvidence}
                isLoading={isGenEvidenceLoading}
                loadingText="Starting..."
                disabled={isViewOnly}
                className="bg-gradient-to-r from-indigo-500 to-purple-600 border-none hover:from-indigo-600 hover:to-purple-700 text-white shadow-sm mx-auto"
                icon={<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/><path d="m12 8-2.5 3 1.5 4.5"/><path d="m17.5 8-2.5 3 1.5 4.5"/><path d="m7 8-2.5 3 1.5 4.5"/></svg>}
              >
                Start AI Generation
              </LoadingButton>
            </div>
          ) : (
            <p>No evidence matches your filters.</p>
          )}
        </div>
      ) : (
        <>
          {filteredEvidence.map((ev) => (
            <EvidenceCard
              key={ev.id}
              evidence={ev}
              dictionary={dictionary}
              isActive={activeEvidenceId === ev.id}
              isViewOnly={isViewOnly}
                onClick={() => onHighlight(ev)}
                onEdit={onEdit}
                onDelete={onDelete}
            />
          ))}
          {reportStatus === 'PROCESSING' && (
            <div className="w-full p-4 rounded-lg border-2 border-dashed border-primary/30 bg-primary/5 flex flex-col items-center justify-center animate-pulse mt-4">
              <div className="flex items-center gap-2 text-primary font-semibold">
                <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full"></div>
                <span>Analyzing next competency...</span>
              </div>
              <p className="text-xs text-text-muted mt-1">More evidence is being generated.</p>
              {/* We also add the reset button here in case it gets stuck with partial data */}
              <button onClick={onReset} className="mt-2 text-[10px] text-text-muted hover:text-error underline">Reset Status</button>
            </div>
          )}
        </>
      )}
      </div>

      {/* Footer Actions */}
      <div className="p-4 border-t border-border bg-bg-light flex justify-between items-center">
        <button
          onClick={handleExport}
          className="text-sm text-text-secondary hover:text-primary font-medium flex items-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Export List
        </button>

        {!isViewOnly && targetPhase > 1 && reportStatus !== 'PROCESSING' && (
          <LoadingButton
            onClick={handleNextClick}
            isLoading={isNextPhaseLoading}
            loadingText="Processing..."
            disabled={evidence.length === 0}
          >
            Generate Next Phase &rarr;
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
      {/* FLOATING THINKING PANEL */}
      {/* It sits on top of everything but doesn't block interaction with the list */}
      {isThinking && <ThinkingPanel log={streamLog} />}

      {/* --- Skip Confirmation Modal --- */}
      {isSkipModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md bg-bg-light rounded-lg shadow-lg p-6">
            <h3 className="text-lg font-semibold text-text-primary">Skip AI Generation?</h3>
            <p className="text-sm text-text-secondary mt-2">
              You haven't run the automatic AI evidence generation.
              Are you sure you want to proceed to analysis with only the manually collected evidence?
            </p>
            <div className="flex justify-end gap-3 mt-6">
              <button
                className="bg-white text-text-secondary border border-border rounded-md text-sm font-semibold px-4 py-2 hover:bg-bg-medium"
                onClick={() => setIsSkipModalOpen(false)}
              >
                Cancel
              </button>
              <LoadingButton
                onClick={() => {
                  setIsNextPhaseLoading(true);
                  onGenerateNext();
                  setIsSkipModalOpen(false);
                  setIsNextPhaseLoading(false);
                }}
                isLoading={isNextPhaseLoading}
                loadingText="Proceeding..."
              >
                Proceed Anyway
              </LoadingButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}