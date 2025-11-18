// frontend/src/pages/ReportPage.tsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import apiService from '../services/apiService';
import { useToastStore } from '../state/toastStore';
import ProjectContextModal from '../components/ProjectContextModal';
import CompetencyAnalysisList from '../components/report/CompetencyAnalysisList';

// Component Imports
import RawTextPanel from '../components/report/RawTextPanel';
import EvidenceList from '../components/report/EvidenceList';
import { type EvidenceCardData } from '../components/report/EvidenceCard';

import ExecutiveSummary from '../components/report/ExecutiveSummary';

// --- Data Types ---
interface ReportData {
  title: string;
  status: 'CREATED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  projectId: string;
  currentPhase: number;
  evidence: EvidenceCardData[];
  rawFiles: {
    id: string;
    file_name: string;
    simulation_method_tag: string;
    file_content: string;
  }[];
  dictionary: any;
}

type AnalysisTab = 'evidence' | 'competency' | 'summary';

interface ModalsState {
  viewContext: boolean;
  projectContext: boolean;
  deleteEvidence: boolean;
  createEvidence: boolean;
  changeEvidence: boolean;
  askAI: boolean;
}

// --- Create/Edit Modal ---
interface CreateChangeModalProps {
  reportId: string;
  evidenceToEdit: EvidenceCardData | null;
  selectedEvidenceText: string;
  source: string;
  dictionary: any;
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  addToast: (message: string, type: 'success' | 'error') => void;
}

function CreateChangeModal({
  reportId,
  evidenceToEdit,
  selectedEvidenceText,
  source,
  dictionary,
  isOpen,
  onClose,
  onSave,
  addToast
}: CreateChangeModalProps) {
  const [competency, setCompetency] = useState('');
  const [level, setLevel] = useState('');
  const [kb, setKb] = useState('');
  const [reasoning, setReasoning] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [competencyList, setCompetencyList] = useState<{id: string, name: string}[]>([]);
  const [levelList, setLevelList] = useState<string[]>([]);
  const [kbList, setKbList] = useState<string[]>([]);

  useEffect(() => {
    if (dictionary?.kompetensi) {
      const competencies = dictionary.kompetensi.map((c: any) => ({
        id: c.id,
        name: c.name || c.namaKompetensi,
      }));
      setCompetencyList(competencies);
      if (!evidenceToEdit && competencies.length > 0) setCompetency(competencies[0].id);
    }
  }, [dictionary, evidenceToEdit, isOpen]);

  useEffect(() => {
    if (competency && dictionary?.kompetensi) {
      const comp = dictionary.kompetensi.find((c: any) => c.id === competency);
      const levels = comp?.level?.map((l: { nomor: string }) => l.nomor) || [];
      setLevelList(levels);
      if (!evidenceToEdit || evidenceToEdit.competency !== competency) setLevel(levels[0] || '');
    }
  }, [competency, dictionary, evidenceToEdit]);

  useEffect(() => {
    if (competency && level && dictionary?.kompetensi) {
      const comp = dictionary.kompetensi.find((c: any) => c.id === competency);
      const lvl = comp?.level?.find((l: any) => l.nomor === level);
      const kbs = lvl?.keyBehavior || [];
      setKbList(kbs);
      if (!evidenceToEdit || evidenceToEdit.level !== level) setKb(kbs[0] || '');
    }
  }, [competency, level, dictionary, evidenceToEdit]);

  useEffect(() => {
    if (evidenceToEdit && isOpen) {
      setCompetency(evidenceToEdit.competency);
      setLevel(evidenceToEdit.level);
      setKb(evidenceToEdit.kb);
      setReasoning(evidenceToEdit.reasoning);
    }
  }, [evidenceToEdit, isOpen]);

  const quoteText = evidenceToEdit ? selectedEvidenceText || evidenceToEdit.quote : selectedEvidenceText;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const payload = {
        reportId,
        competency,
        level,
        kb,
        quote: quoteText,
        source: source,
        reasoning,
      };

      if (evidenceToEdit) {
        if (!window.confirm("Are you sure you want to change this evidence?")) {
          setIsSaving(false);
          return;
        }
        await apiService.put(`/reports/evidence/${evidenceToEdit.id}`, payload);
        addToast("Evidence updated.", 'success');
      } else {
        await apiService.post('/reports/evidence', payload);
        addToast("Evidence created.", 'success');
      }

      onSave();
      onClose();
    } catch (error) {
      console.error("Failed to save evidence:", error);
      addToast("Error: Could not save evidence.", 'error');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-30 pointer-events-none">
      <div className="fixed top-0 right-0 h-full w-full max-w-lg bg-bg-light shadow-lg flex flex-col pointer-events-auto">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h3 className="text-xl font-semibold text-text-primary">
            {evidenceToEdit ? 'Change Evidence' : 'Create New Evidence'}
          </h3>
          <button className="text-text-muted hover:text-text-primary" onClick={onClose}>&times;</button>
        </div>
        <div className="flex-grow p-6 space-y-4 overflow-y-auto">
           <div className="bg-bg-medium p-3 rounded border border-primary/20">
              <p className="text-xs font-bold text-primary uppercase mb-1">Selected Quote</p>
              <p className="text-sm italic text-text-secondary">"{quoteText}"</p>
           </div>
           <div>
            <label className="text-sm font-medium text-text-primary mb-1 block">Competency</label>
            <select className="w-full rounded-md border border-border px-3 py-2 bg-light shadow-sm text-sm"
              value={competency} onChange={(e) => setCompetency(e.target.value)}>
              {competencyList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
                <label className="text-sm font-medium text-text-primary mb-1 block">Level</label>
                <select className="w-full rounded-md border border-border px-3 py-2 bg-light shadow-sm text-sm"
                value={level} onChange={(e) => setLevel(e.target.value)}>
                {levelList.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
            </div>
            <div>
                <label className="text-sm font-medium text-text-primary mb-1 block">Key Behavior</label>
                <select className="w-full rounded-md border border-border px-3 py-2 bg-light shadow-sm text-sm truncate"
                value={kb} onChange={(e) => setKb(e.target.value)}>
                {kbList.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-text-primary mb-1 block">Reasoning</label>
            <textarea rows={4} className="w-full rounded-md border border-border p-3 bg-light shadow-sm text-sm"
              value={reasoning} onChange={(e) => setReasoning(e.target.value)}
              placeholder="Explain why..." />
          </div>
        </div>
        <div className="p-6 bg-bg-medium border-t border-border flex justify-end gap-3">
          <button className="bg-white text-text-secondary border border-border rounded-md text-sm font-semibold px-4 py-2" onClick={onClose}>Cancel</button>
          <button
            className={`bg-primary text-white rounded-md text-sm font-semibold px-4 py-2 ${(!quoteText || isSaving) ? 'opacity-50 cursor-not-allowed' : ''}`}
            disabled={!quoteText || isSaving}
            onClick={handleSave}
          >
            {isSaving ? 'Saving...' : (evidenceToEdit ? 'Save Changes' : 'Create')}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Main Report Page Component ---
export default function ReportPage({ 
  refreshTrigger, 
  setRefreshTrigger 
}: { 
  refreshTrigger: number,
  setRefreshTrigger: (cb: (c: number) => number) => void
}) {
  const { id: reportId } = useParams();
  const addToast = useToastStore((state) => state.addToast);

  // --- State ---
  const [isLoading, setIsLoading] = useState(true);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  
  // Tabs & Phases
  const [analysisTab, setAnalysisTab] = useState<AnalysisTab>('evidence');
  const [highestPhaseVisible, setHighestPhaseVisible] = useState<AnalysisTab>('evidence');

  // Panel Visibility & Resizing
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(true);
  
  const activeFileIdInit = reportData?.rawFiles?.[0]?.id || null;
  const [activeFileId, setActiveFileId] = useState<string | null>(activeFileIdInit);
  
  // Interaction State
  const [activeEvidenceId, setActiveEvidenceId] = useState<string | null>(null);
  const [activeQuote, setActiveQuote] = useState<string | null>(null);
  const [selectedText, setSelectedText] = useState('');

  // Waiting for manual selection
  const [isWaitingForSelection, setIsWaitingForSelection] = useState(false);
  
  // Modals
  const [modals, setModals] = useState<ModalsState>({
    viewContext: false,
    projectContext: false,
    createEvidence: false,
    changeEvidence: false,
    deleteEvidence: false,
    askAI: false
  });
  const [evidenceToEdit, setEvidenceToEdit] = useState<EvidenceCardData | null>(null);
  const [evidenceToDelete, setEvidenceToDelete] = useState<string | null>(null);

  // Refs for Resizing
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  const isInitialLoad = useRef(true);

  // --- Derived ---
  const isViewOnly = false; // TODO: Implement RBAC

  const isEvidenceLocked = highestPhaseVisible !== 'evidence';

  const activeFile = reportData?.rawFiles.find(f => f.id === activeFileId);
  
  // --- Data Fetching ---
  const fetchReportData = async () => {
    if (!reportId) return;
    try {
      setIsLoading(true);
      const response = await apiService.get<ReportData>(`/reports/${reportId}/data`);
      setReportData(response.data);
      
      // Set initial file tab if none selected
      if (!activeFileId && response.data.rawFiles.length > 0) {
        setActiveFileId(response.data.rawFiles[0].id);
      }

      // --- NEW: Restore Progress ---
      const phase = response.data.currentPhase;
      
      // 1. Reveal Tabs
      if (phase >= 2) setHighestPhaseVisible('competency');
      if (phase >= 3) setHighestPhaseVisible('summary');

      // 2. Auto-switch to the latest tab (Only on initial load)
      if (isInitialLoad.current) {
         if (phase === 2) setAnalysisTab('competency');
         if (phase === 3) setAnalysisTab('summary');
         isInitialLoad.current = false;
      }

    } catch (err) {
      console.error("Failed to load report:", err);
      addToast("Failed to load report data.", 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReportData();
  }, [reportId, refreshTrigger]);

  // --- 1. Resizing Handler (The React Way) ---
  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault(); // Prevent text selection start
    isDraggingRef.current = true;
    
    // Add global styles to prevent cursor flickering and text selection
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (e: MouseEvent) => {
        if (!isDraggingRef.current || !containerRef.current || !leftPanelRef.current || !handleRef.current) return;
        
        const containerRect = containerRef.current.getBoundingClientRect();
        let newLeftWidth = e.clientX - containerRect.left;
        
        // Limits (200px min width)
        const minWidth = 200;
        const maxWidth = containerRef.current.offsetWidth - 200;
        newLeftWidth = Math.max(minWidth, Math.min(newLeftWidth, maxWidth));

        // Apply styles directly for performance
        leftPanelRef.current.style.width = `${newLeftWidth}px`;
        handleRef.current.style.left = `${newLeftWidth}px`;
    };

    const onMouseUp = () => {
        isDraggingRef.current = false;
        // Clean up global styles
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        // Clean up listeners
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    };

    // Attach global listeners
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, []);

  // --- 2. Panel Visibility Logic (Reset widths on toggle) ---
  useEffect(() => {
    const leftPanel = leftPanelRef.current;
    const handle = handleRef.current;

    if (!leftPanel) return;

    if (showLeftPanel && !showRightPanel) {
      // Full Left
      leftPanel.style.width = '100%';
      if (handle) handle.style.display = 'none';
    } else if (!showLeftPanel && showRightPanel) {
      // Full Right (Left width 0)
      leftPanel.style.width = '0px';
      if (handle) handle.style.display = 'none';
    } else if (showLeftPanel && showRightPanel) {
      // Split View
      if (handle) {
        handle.style.display = 'block';
        // Reset to 50% only if it was previously collapsed or full
        if (leftPanel.style.width === '100%' || leftPanel.style.width === '0px') {
            leftPanel.style.width = '50%';
            handle.style.left = '50%';
        } else {
            // Ensure handle syncs with current width
            handle.style.left = leftPanel.style.width;
        }
      }
    }
  }, [showLeftPanel, showRightPanel]);

  // --- Handlers ---
  const handleHighlight = (evidence: EvidenceCardData) => {
    const targetFile = reportData?.rawFiles.find(f => f.simulation_method_tag === evidence.source);
    if (targetFile) {
        setActiveFileId(targetFile.id);
        setActiveEvidenceId(evidence.id);
        setActiveQuote(evidence.quote);
    } else {
        addToast("Source file for this evidence not found.", 'error');
    }
  };

  const handleQuoteSelection = (quote: string, source: string) => {
    const targetFile = reportData?.rawFiles.find(f => f.simulation_method_tag === source);

    if (targetFile) {
      setActiveFileId(targetFile.id);
      setActiveQuote(quote);
      setActiveEvidenceId(null);
    } else {
      addToast(`Source file "${source}" not found.`, 'error');
    }
  };

  const handleTextSelection = (text: string) => {
    setSelectedText(text);

    if (isWaitingForSelection) {
        setIsWaitingForSelection(false);
        setEvidenceToEdit(null);
        setModals(prev => ({ ...prev, createEvidence: true }));
    }
  };
  
  const handleCreateManual = () => {
    if (selectedText) {
        // Scenario A: Text already highlighted
        setEvidenceToEdit(null);
        setModals(prev => ({ ...prev, createEvidence: true }));
        setIsWaitingForSelection(false);
    } else {
        // Scenario B: No text highlighted -> Enter Waiting Mode
        setIsWaitingForSelection(true);
        // Optionally clear old selection to avoid confusion
        setSelectedText('');
    }
  };

  const handleDelete = async () => {
    if (!evidenceToDelete) return;
    try {
        await apiService.delete(`/reports/evidence/${evidenceToDelete}`);
        addToast("Evidence deleted.", 'success');
        setEvidenceToDelete(null);
        setModals(prev => ({ ...prev, deleteEvidence: false }));
        setRefreshTrigger(c => c + 1);
    } catch (error) {
        console.error(error);
        addToast("Failed to delete evidence.", 'error');
    }
  };

  const handleGeneratePhase1 = async () => {
    if (!reportId) return;
    try {
      await apiService.post(`/reports/${reportId}/generate/phase1`);
      addToast("AI evidence generation started...", 'info');
      // Optimistically update status so UI reflects change immediately
      setReportData(prev => prev ? { ...prev, status: 'PROCESSING' } : null);
    } catch (error) {
      console.error(error);
      addToast("Failed to start AI generation.", 'error');
    }
  };

  // (RP-7.11) Trigger Phase 2
  const handleGeneratePhase2 = async () => {
    if (!reportId) return;
    try {
      // 1. Call the new endpoint to start the job
      await apiService.post(`/reports/${reportId}/generate/phase2`);


      addToast("Phase 2 analysis started...", 'info');

      // 2. Reveal the next tab (UI Logic)
      // In a real app with sockets, we might wait for the 'complete' event.
      // For now, we switch immediately to show the "Processing" or empty state.
      setHighestPhaseVisible('competency');
      setAnalysisTab('competency');
      
    } catch (error: any) {
      console.error(error);

      if (error.response && error.response.status === 400) {
        addToast(error.response.data.message, 'error');
      } else {
        addToast("Failed to start Phase 2 generation.", 'error');
      }
    }
  };

  const handleGeneratePhase3 = async () => {
  if (!reportId) return;
  try {
    await apiService.post(`/reports/${reportId}/generate/phase3`);
    addToast("Phase 3 (Executive Summary) generation started...", 'info');
    setHighestPhaseVisible('summary');
    setAnalysisTab('summary');
  } catch (error: any) {
    console.error(error);
    if (error.response && error.response.status === 400) {
      addToast(error.response.data.message, 'error');
    } else {
      addToast("Failed to start Phase 3 generation.", 'error');
    }
  }
};

// Inside ReportPage component
const handleAskAI = (context: string, currentText: string) => {
    console.log("Ask AI Request:", context);
    // In Sprint 4, this will open the 'modals.askAI' and pass the text.
    // For now:
    setModals(prev => ({ ...prev, askAI: true }));
};
  
  if (isLoading && !reportData) {
      return <div className="flex h-screen items-center justify-center text-text-muted">Loading Report...</div>;
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-bg-medium">
      
      {/* Header */}
      <header className="flex-shrink-0 h-16 bg-bg-light border-b border-border flex items-center justify-between px-6 z-20">
        <div className="flex items-center gap-4">
            <h1 className="text-lg font-bold text-text-primary truncate max-w-md" title={reportData?.title}>
                {reportData?.title}
            </h1>
            <button onClick={() => setModals(prev => ({ ...prev, viewContext: true }))} className="text-xs font-medium text-primary bg-primary/10 px-2 py-1 rounded hover:bg-primary/20">
                View Context
            </button>
        </div>
        <div className="flex items-center gap-3">
             {/* Toggle Panels */}
             <div className="flex items-center bg-bg-medium rounded p-0.5 border border-border mr-2">
                <button onClick={() => setShowLeftPanel(!showLeftPanel)} className={`p-1.5 rounded hover:bg-white ${!showLeftPanel ? 'text-text-muted' : 'text-primary'}`} title="Toggle Left Panel">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg>
                </button>
                <button onClick={() => setShowRightPanel(!showRightPanel)} className={`p-1.5 rounded hover:bg-white ${!showRightPanel ? 'text-text-muted' : 'text-primary'}`} title="Toggle Right Panel">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="15" y1="3" x2="15" y2="21"></line></svg>
                </button>
             </div>

             {/* Tab Navigation (Conditional) */}
             <div className="flex bg-bg-medium rounded-lg p-1 border border-border">
                <button 
                    onClick={() => setAnalysisTab('evidence')}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${analysisTab === 'evidence' ? 'bg-white text-primary shadow-sm' : 'text-text-muted hover:text-text-secondary'}`}
                >
                    1. Evidence
                </button>
                
                {(highestPhaseVisible === 'competency' || highestPhaseVisible === 'summary') && (
                    <button 
                        onClick={() => setAnalysisTab('competency')}
                        className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${analysisTab === 'competency' ? 'bg-white text-primary shadow-sm' : 'text-text-muted hover:text-text-secondary'}`}
                    >
                        2. Analysis
                    </button>
                )}
                
                {highestPhaseVisible === 'summary' && (
                    <button 
                        onClick={() => setAnalysisTab('summary')}
                        className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${analysisTab === 'summary' ? 'bg-white text-primary shadow-sm' : 'text-text-muted hover:text-text-secondary'}`}
                    >
                        3. Summary
                    </button>
                )}
             </div>
             <button className="bg-primary text-white text-sm font-semibold px-4 py-2 rounded-md hover:bg-primary-hover">
                Save Report
             </button>
        </div>
      </header>

      {/* Main Split View (Resizable) */}
      <div ref={containerRef} className="flex flex-1 overflow-hidden relative">
        
        {/* LEFT PANEL */}
        {showLeftPanel && (
            <div 
                ref={leftPanelRef}
                className="h-full overflow-hidden border-r border-border bg-bg-light flex flex-col flex-shrink-0"
                style={{ width: '50%' }}
            >
                {isWaitingForSelection && !isEvidenceLocked && (
                    <div className="bg-info/10 border-b border-info/20 p-2.5 text-center shadow-inner">
                        <p className="text-sm text-info font-semibold flex items-center justify-center gap-2 animate-pulse">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"/><path d="m5 12 7 7 7-7"/></svg>
                            Please select text from the document below to create evidence...
                        </p>
                    </div>
                )}

                <RawTextPanel 
                    files={reportData?.rawFiles || []}
                    activeFileId={activeFileId}
                    setActiveFileId={setActiveFileId}
                    activeQuote={activeQuote}
                    onTextSelection={handleTextSelection}
                />
                <div className="bg-bg-medium p-2 border-t border-border text-xs text-text-muted flex justify-between items-center flex-shrink-0">
                    <span>
                      {isEvidenceLocked
                        ? 'Evidence collection is locked because competency analysis has been done.'
                        : selectedText
                          ? 'Text selected. Click "+ Add Manual" on the right.'
                          : isWaitingForSelection
                            ? 'Waiting for selection...'
                            : 'Highlight text above to capture evidence.'
                      }
                    </span>
                    {!isEvidenceLocked && selectedText && (
                      <span className="font-mono bg-white px-1 rounded border border-border max-w-[150px] truncate">
                        {selectedText}
                    </span>
                    )}
                </div>
            </div>
        )}

        {/* RESIZE HANDLE */}
        {showLeftPanel && showRightPanel && (
            <div 
                ref={handleRef}
                onMouseDown={startResizing}
                className="absolute top-0 bottom-0 w-1 bg-transparent hover:bg-primary/50 cursor-col-resize z-10 transition-colors"
                style={{ left: '50%' }}
            >
                {/* Visual Line (Thin) */}
                <div className="w-px h-full bg-border group-hover:bg-primary"></div>
            </div>
        )}

        {/* RIGHT PANEL */}
        {showRightPanel && (
            <div className="flex-grow h-full overflow-hidden bg-bg-medium flex flex-col">
                {analysisTab === 'evidence' && (
                    <EvidenceList 
                        evidence={reportData?.evidence || []}
                        dictionary={reportData?.dictionary}
                        rawFiles={reportData?.rawFiles || []}
                        activeEvidenceId={activeEvidenceId}
                        reportTitle={reportData?.title || 'Report'}
                        isViewOnly={isViewOnly || isEvidenceLocked}
                        onHighlight={handleHighlight}
                        onCreate={handleCreateManual}
                        onEdit={(ev) => {
                            setEvidenceToEdit(ev);
                            setSelectedText(ev.quote); 
                            setModals(prev => ({ ...prev, changeEvidence: true }));
                        }}
                        onDelete={(id) => {
                            setEvidenceToDelete(id);
                            setModals(prev => ({ ...prev, deleteEvidence: true }));
                        }}
                        reportStatus={reportData?.status || 'CREATED'}
                        onGeneratePhase1={handleGeneratePhase1}
                        onGenerateNext={handleGeneratePhase2}
                    />
                )}
                
                {analysisTab === 'competency' && (
                    <CompetencyAnalysisList
                        reportId={reportId || ''}
                        isViewOnly={isViewOnly}
                        onGenerateNext={handleGeneratePhase3}
                        onHighlightEvidence={handleQuoteSelection}
                    />
                )}

                {analysisTab === 'summary' && (
                    <ExecutiveSummary
                        reportId={reportId || ''}
                        isViewOnly={isViewOnly}
                        onAskAI={handleAskAI}
                    />
                )}
            </div>
        )}
      </div>

      {/* --- Modals --- */}
      
      <CreateChangeModal 
        isOpen={modals.createEvidence || modals.changeEvidence}
        onClose={() => setModals(prev => ({ ...prev, createEvidence: false, changeEvidence: false }))}
        onSave={() => setRefreshTrigger(c => c + 1)}
        reportId={reportId || ''}
        evidenceToEdit={evidenceToEdit}
        selectedEvidenceText={selectedText}
        source={activeFile?.simulation_method_tag || ''}
        dictionary={reportData?.dictionary}
        addToast={addToast}
      />

      {modals.deleteEvidence && (
         <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="w-full max-w-sm bg-bg-light rounded-lg shadow-lg p-6">
                <h3 className="text-lg font-semibold text-text-primary">Delete Evidence?</h3>
                <p className="text-sm text-text-secondary mt-2">This action cannot be undone.</p>
                <div className="flex justify-end gap-3 mt-6">
                    <button className="bg-white text-text-secondary border border-border rounded-md text-sm font-semibold px-4 py-2" onClick={() => setModals(prev => ({ ...prev, deleteEvidence: false }))}>Cancel</button>
                    <button className="bg-error text-white rounded-md text-sm font-semibold px-4 py-2 hover:bg-red-700" onClick={handleDelete}>Delete</button>
                </div>
            </div>
         </div>
      )}

      <ProjectContextModal
        isOpen={modals.projectContext}
        onClose={() => setModals(prev => ({ ...prev, projectContext: false }))}
        projectId={reportData?.projectId || ''}
      />

      {modals.viewContext && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex justify-end z-50" onClick={() => setModals(prev => ({ ...prev, viewContext: false }))}>
             <div className="w-96 bg-bg-light h-full shadow-xl p-6" onClick={e => e.stopPropagation()}>
                 <h3 className="text-lg font-bold text-text-primary mb-4">Report Context</h3>
                 <div className="space-y-4">
                     <div>
                        <label className="text-xs font-bold text-text-muted uppercase">Report Title</label>
                        <p className="text-sm">{reportData?.title}</p>
                     </div>
                     <div>
                        <label className="text-xs font-bold text-text-muted uppercase">Files</label>
                        <ul className="list-disc list-inside text-sm">
                            {reportData?.rawFiles.map(f => <li key={f.id}>{f.file_name}</li>)}
                        </ul>
                     </div>
                     <button onClick={() => setModals(prev => ({ ...prev, viewContext: false, projectContext: true }))} className="w-full border border-border rounded py-2 text-sm hover:bg-bg-medium">
                        View Project Context
                     </button>
                 </div>
             </div>
        </div>
      )}
    </div>
  );
}