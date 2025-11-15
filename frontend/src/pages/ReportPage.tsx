// frontend/src/pages/ReportPage.tsx
import { useState, useEffect, useRef, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import apiService from '../services/apiService';
import { useToastStore } from '../state/toastStore';

// Define data structures
interface EvidenceCard {
  id: string;
  competency: string;
  level: string;
  kb: string;
  quote: string;
  source: string;
  reasoning: string;
}

interface ReportData {
  title: string;
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  evidence: EvidenceCard[];
  rawFiles: { // <-- ADD THIS
    id: string;
    file_name: string;
    simulation_method_tag: string;
    file_content: string;
  }[];
  dictionary: any;
}

interface CreateChangeModalProps {
  reportId: string;
  evidenceToEdit: EvidenceCard | null;
  selectedEvidenceText: string;
  source: string;
  dictionary: any;
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  addToast: (message: string, type: 'success' | 'error') => void;
}

type AnalysisTab = 'evidence' | 'competency' | 'summary';
type RawTextTab = string;
type ModalKey = 
  | 'viewContext' 
  | 'projectContext' 
  | 'deleteEvidence' 
  | 'saveChanges' 
  | 'createEvidence' 
  | 'changeEvidence' 
  | 'askAI';

// (U49, U56) AI Button Helper
const AiButton = ({ onClick, isViewOnly }: { onClick: () => void, isViewOnly: boolean }) => {
  if (isViewOnly) return null;
  return (
    <button 
      onClick={onClick}
      className="ai-button p-1 bg-primary/10 text-primary rounded-md opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
      aria-label="Ask AI to refine"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
    </button>
  );
};

// (U41, U46) Filter Button Helper
const FilterButton = () => {
  const [filterOpen, setFilterOpen] = useState(false);
  return (
    <div className="relative">
      <button 
        onClick={() => setFilterOpen(!filterOpen)} 
        className="bg-white text-text-secondary border border-border rounded-md text-sm font-semibold px-4 py-2 hover:bg-bg-medium transition-colors flex items-center gap-2"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
        Filter
      </button>
      {filterOpen && (
        <div 
          onMouseLeave={() => setFilterOpen(false)} // Simple close
          className="absolute right-0 top-full mt-2 w-72 bg-bg-light rounded-lg shadow-lg border border-border p-4 z-20 space-y-4"
        >
          <div>
            <label htmlFor="filter-comp" className="text-sm font-medium text-text-primary mb-1 block">Competency</label>
            <select id="filter-comp" className="w-full rounded-md border border-border px-3 py-2 bg-light shadow-sm text-sm">
              <option value="">All Competencies</option>
              <option value="comm">Communication</option>
              <option value="ps">Problem Solving</option>
            </select>
          </div>
          <div>
            <label htmlFor="filter-level" className="text-sm font-medium text-text-primary mb-1 block">Level</label>
            <select id="filter-level" className="w-full rounded-md border border-border px-3 py-2 bg-light shadow-sm text-sm">
              <option value="">All Levels</option>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
};
// --- (End Helper Components) ---

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

      if (!evidenceToEdit) {
        setCompetency(competencies[0]?.id || '');
      }
    }
  }, [dictionary, evidenceToEdit, isOpen]);

  useEffect(() => {
    if (competency && dictionary?.kompetensi) {
      const comp = dictionary.kompetensi.find((c: any) => c.id === competency);
      const levels = comp?.level?.map((l: any) => l.nomor) || [];
      setLevelList(levels);

      if (!evidenceToEdit || evidenceToEdit.competency !== competency) {
        setLevel(levels[0] || '');
      }
    }
  }, [competency, dictionary, evidenceToEdit]);

  useEffect(() => {
    if (competency && level && dictionary?.kompetensi) {
      const comp = dictionary.kompetensi.find((c: any) => c.id === competency);
      const lvl = comp?.level?.find((l: any) => l.nomor === level);
      const kbs = lvl?.keyBehavior || [];
      setKbList(kbs);

      if (!evidenceToEdit || evidenceToEdit.level !== level) {
        setKb(kbs[0] || '');
      }
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

  const quoteText = evidenceToEdit ? selectedEvidenceText : selectedEvidenceText;

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
        addToast("Evidence changed successfully.", 'success');
      } else {
        await apiService.post('/reports/evidence', payload);
        addToast("Evidence created successfully.", 'success');
      }

      onSave(); // Tell ReportPage to refresh
      onClose(); // Close the modal
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
          <p className="text-sm text-text-secondary p-3 bg-bg-medium rounded-md border border-primary/50">
            {evidenceToEdit ? "Highlight new text to replace the quote below, or edit the details." : "Please highlight the evidence from the text panel on the left."}
          </p>
          <div>
            <label className="text-sm font-medium text-text-primary mb-1 block">Selected Evidence</label>
            <blockquote className="border-l-4 border-primary pl-4 text-sm italic bg-bg-medium p-3 rounded-md">
              {quoteText ? `"${quoteText}"` : 'Please highlight text from the left panel...'}
            </blockquote>
          </div>

          <div>
            <label htmlFor="ev-comp" className="text-sm font-medium text-text-primary mb-1 block">Competency</label>
            <select id="ev-comp" className="w-full rounded-md border border-border px-3 py-2 bg-light shadow-sm text-sm"
              value={competency} onChange={(e) => setCompetency(e.target.value)}
            >
              {competencyList.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="ev-level" className="text-sm font-medium text-text-primary mb-1 block">Level</label>
            <select id="ev-level" className="w-full rounded-md border border-border px-3 py-2 bg-light shadow-sm text-sm"
              value={level} onChange={(e) => setLevel(e.target.value)}
            >
              {levelList.map(l => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="ev-kb" className="text-sm font-medium text-text-primary mb-1 block">Key Behavior</label>
            <select id="ev-kb" className="w-full rounded-md border border-border px-3 py-2 bg-light shadow-sm text-sm"
              value={kb} onChange={(e) => setKb(e.target.value)}
            >
              {kbList.length > 0 ? kbList.map(k => (
                <option key={k} value={k}>{k}</option>
              )) : (
                <option value="">No KBs found for this level</option>
              )}
            </select>
          </div>
          <div>
            <label htmlFor="ev-reason" className="text-sm font-medium text-text-primary mb-1 block">Reasoning</label>
            <textarea id="ev-reason" rows={4} className="w-full rounded-md border border-border p-3 bg-light shadow-sm text-sm"
              placeholder="Explain why this quote matches the KB..."
              value={reasoning} onChange={(e) => setReasoning(e.target.value)}
            />
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

export default function ReportPage({ 
  refreshTrigger,
  setRefreshTrigger 
}: { 
  refreshTrigger: number,
  setRefreshTrigger: (cb: (c: number) => number) => void
 }) {
  // --- STATE HOOKS ---
  const { id: reportId } = useParams(); // Get reportId from URL

  
  const isInitialLoad = useRef(true);

  // State for data, loading, and errors
  const [isLoading, setIsLoading] = useState(true);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [analysisTab, setAnalysisTab] = useState<AnalysisTab>('evidence');
  const [highestPhaseVisible, setHighestPhaseVisible] = useState<AnalysisTab>('evidence');
  const [rawTextTab, setRawTextTab] = useState<RawTextTab | null>(null);
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [modals, setModals] = useState({
    viewContext: false,
    projectContext: false,
    deleteEvidence: false,
    saveChanges: false,
    createEvidence: false,
    changeEvidence: false,
    askAI: false
  });
  const [evidenceCardReason, setEvidenceCardReason] = useState<string | null>(null);
  const [highlightingEvidence, setHighlightingEvidence] = useState(false);
  const [selectedEvidenceText, setSelectedEvidenceText] = useState('');
  const [_hasUnsavedChanges, setHasUnsavedChanges] = useState(true);
  const [isViewOnly, _setIsViewOnly] = useState(false);
  const [activeEvidenceId, setActiveEvidenceId] = useState<string | null>(null);
  const [activeQuote, setActiveQuote] = useState<string | null>(null);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  

  // State for deletion and toasts
  const [evidenceToDelete, setEvidenceToDelete] = useState<string | null>(null);
  const addToast = useToastStore((state) => state.addToast);
  const [evidenceToEdit, setEvidenceToEdit] = useState<EvidenceCard | null>(null);

  // --- REFS ---
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  // --- MODAL HELPERS ---
  const openModal = (modal: ModalKey) => setModals(prev => ({ ...prev, [modal]: true }));
  const closeModal = (modal: ModalKey) => {
    setModals(prev => ({ ...prev, [modal]: false }));
    // --- NEW: Clear deletion state on close ---
    if (modal === 'deleteEvidence') {
      setEvidenceToDelete(null);
    }
  };

  const activeFile = reportData?.rawFiles.find(f => f.id === rawTextTab);
  const activeSourceTag = activeFile?.simulation_method_tag || '';

  useEffect(() => {
    if (reportData?.rawFiles && reportData.rawFiles.length > 0) {
      setRawTextTab(reportData.rawFiles[0].id);
    }
  }, [reportData]);

  // Data Fetching Function
  useEffect(() => {
    const fetchReportData = async () => {
      if (!reportId) {
        setError("No report ID found in the URL.");
        setIsLoading(false);
        return;
      }
      try {
        setIsLoading(true);
        setError(null);
        const response = await apiService.get<ReportData>(`/reports/${reportId}/data`);
        setReportData(response.data);

        // If this is a REFRESH (not the initial load)
        if (!isInitialLoad.current) {
          // Check the status of the data *we just fetched*
          if (response.data.status === 'COMPLETED') {
            addToast("Evidence list has finished generating.", 'success');
          } else if (response.data.status === 'FAILED') {
            addToast("Evidence generation failed.", 'error');
          }
        }

      } catch (err: any) {
        console.error("Failed to fetch report data:", err);
        setError(err.response?.data?.message || "An unknown error occurred.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchReportData();
  }, [reportId, refreshTrigger, addToast]);

  // --- PAGE LOGIC ---
  const saveReport = () => {
    console.log('Saving report...');
    setHasUnsavedChanges(false);
    alert('Report saved successfully!');
    setTimeout(() => setHasUnsavedChanges(true), 5000); 
  };

  const handleTextSelection = () => {
    if (!highlightingEvidence) return;
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (text && text.length > 0) {
      setSelectedEvidenceText(text);
    }
  };

  const highlightEvidence = (evidence: EvidenceCard) => {
  // Find the file ID this evidence came from
  // We'll mock "Case Study" -> file 0, "Roleplay" -> file 1
  // TODO: This mapping needs to be more robust later
  const file = reportData?.rawFiles.find(
    f => f.simulation_method_tag === evidence.source
  );

  if (file) {
    setActiveEvidenceId(evidence.id);
    setActiveQuote(evidence.quote); // Set the quote text
    setActiveFileId(file.id);     // Set the file to switch to
    setRawTextTab(file.id);       // Switch the tab
  } else {
    // Fallback if source doesn't match
    setActiveEvidenceId(evidence.id);
    setActiveQuote(null);
    setActiveFileId(null);
  }
};

  // --- NEW: Function to delete an evidence card ---
  const handleDeleteEvidence = async () => {
    if (!evidenceToDelete) return; // Safety check

    try {
      // (RP-7.9) Call the new backend endpoint
      await apiService.delete(`/reports/evidence/${evidenceToDelete}`);

      // On success, update the frontend state manually
      // This is better than a full page reload
      setReportData(prevData => {
        if (!prevData) return null;
        
        // Filter out the deleted evidence card
        const updatedEvidence = prevData.evidence.filter(
          (ev) => ev.id !== evidenceToDelete
        );

        return {
          ...prevData,
          evidence: updatedEvidence
        };
      });

      addToast("Evidence deleted successfully.", 'success');

    } catch (error) {
      console.error("Failed to delete evidence:", error);
      addToast("Error: Could not delete evidence.", 'error');
    } finally {
      // Always close the modal and clear the state
      closeModal('deleteEvidence');
    }
  };
  
  // Effect for highlighting
  useEffect(() => {
    // We now depend on the quote and file ID
    if (!activeQuote || !activeFileId) return;

    // Small delay to allow React to render the new tab's content
    const timer = setTimeout(() => {
      const textElement = document.getElementById(`highlight-0`);
      if (textElement) {
        // We don't need to manage currentHighlightRef anymore
        textElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 50);
    
    return () => clearTimeout(timer);
  }, [activeQuote, activeFileId, rawTextTab]);

  // Resizable Panel & Show/Hide Logic (U32)
  useEffect(() => {
    const handle = handleRef.current;
    const leftPanel = leftPanelRef.current;
    const container = containerRef.current;

    if (!container) return;

    // --- Panel Visibility Logic ---
    if (showLeftPanel && !showRightPanel) {
      if (leftPanel) leftPanel.style.width = '100%';
      if (handle) handle.style.display = 'none';
    } else if (!showLeftPanel && showRightPanel) {
      if (leftPanel) leftPanel.style.width = '0px';
      if (handle) handle.style.display = 'none';
    } else if (showLeftPanel && showRightPanel) {
      if (handle && leftPanel) {
        handle.style.display = 'block';

        if (leftPanel.style.width === '100%' || leftPanel.style.width === '0px') {
          leftPanel.style.width = '50%';
        }

        handle.style.left = leftPanel.style.width;
      }
    }
    
    // --- Resizing Logic ---
    if (!handle || !leftPanel) return; 

    const onMouseDown = (e: MouseEvent) => {
      if (!showLeftPanel || !showRightPanel) return;
      isDraggingRef.current = true;
      document.body.classList.add('dragging');
      e.preventDefault();
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || !showLeftPanel || !showRightPanel) return;
      const containerRect = container.getBoundingClientRect();
      const mainContentWidth = container.offsetWidth;
      let newLeftWidth = e.clientX - containerRect.left;
      const minWidthPx = 200;
      const maxWidthPx = mainContentWidth - minWidthPx;
      newLeftWidth = Math.max(minWidthPx, Math.min(newLeftWidth, maxWidthPx));
      leftPanel.style.width = `${newLeftWidth}px`;
      handle.style.left = `${newLeftWidth}px`;
    };

    const onMouseUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        document.body.classList.remove('dragging');
      }
    };

    handle.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    return () => {
        handle.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [showLeftPanel, showRightPanel]);

  // Helper for rendering evidence cards
  const renderEvidenceCard = (evidence: EvidenceCard, dictionary: any) => {
    const cardId = evidence.id;
    const isActive = activeEvidenceId === cardId;
    const reasonVisible = evidenceCardReason === cardId;

    let competencyName = evidence.competency;
    if (dictionary?.kompetensi) {
      const comp = dictionary.kompetensi.find((c: any) =>
        c.id === evidence.competency || c.name === evidence.competency || c.namaKompetensi === evidence.competency
      );
      if (comp) {
        competencyName = comp.name || comp.namaKompetensi;
      }
    }

    return (
      <div
        key={cardId}
        className={`w-full rounded-lg shadow-md bg-bg-light border ${isActive ? 'border-primary' : 'border-border'} ${!isViewOnly ? 'cursor-pointer' : ''}`}
        onClick={() => !isViewOnly && highlightEvidence(evidence)}
      >
        {reasonVisible ? (
          <div className="p-4">
            <h4 className="text-sm font-semibold mb-2">AI Reasoning</h4>
            <p className="text-sm text-text-secondary bg-bg-medium p-3 rounded-md">{evidence.reasoning}</p>
          </div>
        ) : (
          <div>
            <div className="p-4 border-b border-border">
              <div className="flex items-center gap-2 mb-1">
                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-primary/10 text-primary text-xs font-semibold">Level {evidence.level}</span>
                <p className="text-sm font-medium text-text-primary leading-snug">{evidence.kb}</p>
              </div>
              <p className="text-xs text-text-muted">Competency: {competencyName}</p>
            </div>
            <div className="p-4">
              <blockquote className="border-l-4 border-primary pl-4 text-sm italic">"{evidence.quote}"</blockquote>
              <p className="text-xs text-text-muted mt-2">Source: {evidence.source}</p>
            </div>
          </div>
        )}
        <div className="p-2 border-t border-border flex items-center gap-1">
          <button className="text-text-secondary rounded-md text-xs font-semibold px-3 py-1.5 hover:bg-bg-medium" onClick={(e) => { e.stopPropagation(); setEvidenceCardReason(prev => prev === cardId ? null : cardId); }}>
            {reasonVisible ? 'Hide Reasoning' : 'See Reasoning'}
          </button>
          <button 
            disabled={isViewOnly} 
            onClick={(e) => { 
              e.stopPropagation(); 
              setEvidenceToEdit(evidence);
              setSelectedEvidenceText(evidence.quote);
              setHighlightingEvidence(true);
              openModal('changeEvidence');  
            }} 
            className="text-text-secondary rounded-md text-xs font-semibold px-3 py-1.5 hover:bg-bg-medium">
              Change
          </button>
          <button 
            disabled={isViewOnly} 
            onClick={(e) => {
              e.stopPropagation();
              setEvidenceToDelete(cardId);
              openModal('deleteEvidence'); 
            }} 
            className="text-error/80 rounded-md text-xs font-semibold px-3 py-1.5 hover:bg-bg-medium"
          >
            Delete
          </button>
        </div>
      </div>
    );
  };

  // Helper for rendering main content based on status
  const renderAnalysisContent = () => {
    if (isLoading) {
      return (
        <div className="p-6 text-center text-text-muted">
          Loading report data...
        </div>
      );
    }

    if (error) {
      return (
        <div className="p-6 text-center text-error">
          <strong>Error:</strong> {error}
        </div>
      );
    }

    if (!reportData) {
      return (
        <div className="p-6 text-center text-text-muted">
          No report data found.
        </div>
      );
    }

    // (RP-7.4) Handle 'PROCESSING' status
    if (reportData.status === 'PROCESSING') {
      return (
        <div className="p-12 text-center text-text-primary space-y-3">
          <svg className="animate-spin h-8 w-8 text-primary mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <h3 className="text-lg font-semibold">AI is generating evidence...</h3>
          <p className="text-sm text-text-secondary">This may take a moment. The page will automatically update when complete.</p>
        </div>
      );
    }

    // (RP-7.4) Handle 'FAILED' status
    if (reportData.status === 'FAILED') {
      return (
        <div className="p-12 text-center text-error space-y-3">
          <h3 className="text-lg font-semibold">Evidence Generation Failed</h3>
          <p className="text-sm">Something went wrong during the AI generation. Please try re-generating the report.</p>
          {/* TODO: Add a "Retry" button here */}
        </div>
      );
    }

    // (RP-7.4) Handle 'COMPLETED' status
    if (reportData.status === 'COMPLETED') {
      return (
        <div className="flex-grow overflow-y-auto p-6 space-y-6">
          {/* Evidence List Tab (U34-U44) */}
          {analysisTab === 'evidence' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-text-primary">Collected Evidence ({reportData.evidence.length})</h3>
                <div className="flex items-center gap-3">
                  <FilterButton />
                  <button 
                    onClick={() => { 
                      setEvidenceToEdit(null);
                      setSelectedEvidenceText('');
                      setHighlightingEvidence(true);
                      openModal('createEvidence');
                    }}
                    className="bg-primary text-white rounded-md text-sm font-semibold px-4 py-2 hover:bg-primary-hover flex items-center gap-2"
                    disabled={isViewOnly}
                  >
                    + Create Evidence
                  </button>
                </div>
              </div>
              
              {/* --- NEW: Render REAL evidence cards --- */}
              {reportData.evidence.length > 0 ? (
                reportData.evidence.map(evidence =>
                  renderEvidenceCard(evidence, reportData.dictionary)
                )
              ) : (
                <div className="p-12 text-center text-text-muted border-2 border-dashed border-border rounded-md">
                  <h3 className="text-lg font-semibold">No Evidence Found</h3>
                  <p className="text-sm mt-1">The AI could not find any evidence in the provided files. You can try creating evidence manually.</p>
                </div>
              )}
              
              {/* (U43) Generate Next Button */}
              <div className="pt-4 flex justify-end gap-3" hidden={isViewOnly}>
                <button className="bg-white text-text-secondary border border-border rounded-md text-sm font-semibold px-5 py-2.5 hover:bg-bg-medium flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Export List
                </button>
                <button 
                  onClick={() => {
                    setAnalysisTab('competency'),
                    setHighestPhaseVisible('competency');
                  }} 
                  className="bg-primary text-white rounded-md text-sm font-semibold px-5 py-2.5"
                >
                  Generate Next Section &rarr;
                </button>
              </div>
            </div>
          )}
          
          {/* Competency Analysis Tab (U45-U50) */}
          {analysisTab === 'competency' && (
            <div className="space-y-6">
              {/* --- This is still placeholder content --- */}
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-text-primary">Competency Analysis</h3>
                <FilterButton />
              </div>
              <div className="p-12 text-center text-text-muted border-2 border-dashed border-border rounded-md">
                <h3 className="text-lg font-semibold">Coming Soon</h3>
                <p className="text-sm mt-1">Phase 2: Competency Analysis will be implemented here.</p>
              </div>
            </div>
          )}

          {/* Executive Summary Tab (U51-U56) */}
          {analysisTab === 'summary' && (
            <div className="space-y-6">
              {/* --- This is still placeholder content --- */}
              <h3 className="text-lg font-semibold text-text-primary">Executive Summary</h3>
              <div className="p-12 text-center text-text-muted border-2 border-dashed border-border rounded-md">
                <h3 className="text-lg font-semibold">Coming Soon</h3>
                <p className="text-sm mt-1">Phase 3: Executive Summary will be implemented here.</p>
              </div>
            </div>
          )}
        </div>
      );
    }
    
    // Default fallback
    return <div className="p-6">Loading...</div>;
  };

  return (
    <>
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Header (U28, U29, U30) */}
        <header className="flex-shrink-0 flex items-center justify-between h-16 px-6 border-b border-border bg-bg-light z-10">
          <div>
            <h2 className="text-xl font-bold text-text-primary">
              {reportData ? reportData.title : 'Loading Report...'}
            </h2>
            <button 
              className="text-sm font-medium text-primary hover:text-primary-hover"
              onClick={() => openModal('viewContext')}
            >
              View Context
            </button>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowLeftPanel(!showLeftPanel)}
              className={`p-2 rounded-md ${!showLeftPanel ? 'bg-primary/10 text-primary' : 'text-text-muted hover:bg-bg-medium'}`}
              aria-label="Toggle evidence panel"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/></svg>
            </button>
            <button
              onClick={() => setShowRightPanel(!showRightPanel)}
              className={`p-2 rounded-md ${!showRightPanel ? 'bg-primary/10 text-primary' : 'text-text-muted hover:bg-bg-medium'}`}
              aria-label="Toggle analysis panel"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18"/></svg>
            </button>
            <span className="w-px h-6 bg-border mx-2"></span>
            <button className="bg-primary text-white rounded-md text-sm font-semibold px-4 py-2 hover:bg-primary-hover transition-colors flex items-center gap-2" disabled={isViewOnly}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Export
            </button>
            <button 
              className="bg-white text-text-secondary border border-border rounded-md text-sm font-semibold px-4 py-2 hover:bg-bg-medium transition-colors"
              onClick={saveReport}
              disabled={isViewOnly}
            >
              Save Report
            </button>
          </div>
        </header>

        {/* Resizable Main Content (U32) */}
        <main id="main-content" ref={containerRef} className="flex-1 flex overflow-hidden relative">

          {/* Left Panel: Raw Text (U33) */}
          {showLeftPanel && (
            <div 
              id="left-panel" 
              ref={leftPanelRef}
              className={`h-full flex flex-col border-r border-border overflow-hidden flex-shrink-0 ${highlightingEvidence ? 'highlight-active' : ''}`}
              style={{ width: '50%' }}
              onMouseUp={handleTextSelection}
            >
              <div className="flex-shrink-0 border-b border-border">
                <nav className="flex -mb-px overflow-x-auto">
                  {reportData?.rawFiles && reportData.rawFiles.map(file => (
                    <button 
                      key={file.id}
                      onClick={() => setRawTextTab(file.id)} 
                      className={`flex-shrink-0 whitespace-nowrap py-3 px-4 text-sm font-medium border-b-2 ${
                        rawTextTab === file.id 
                        ? 'border-primary text-primary' 
                        : 'border-transparent text-text-muted hover:border-border'
                      }`}
                    >
                      {file.simulation_method_tag}
                    </button>
                  ))}
                </nav>
              </div>
              <div className="flex-grow overflow-y-auto">
                {reportData?.rawFiles && reportData.rawFiles.map(file => (
                  <div 
                    key={file.id}
                    className="p-6 font-mono text-sm text-text-secondary"
                    // Show only the active tab's content
                    style={{ display: rawTextTab === file.id ? 'block' : 'none' }} 
                  >
                    {/* We can split by newline to simulate line numbers */}
                    {reportData?.rawFiles && reportData.rawFiles.map(file => {
                      let content: ReactNode;

                      // Check if this file is the active one AND we have a quote to highlight
                      if (activeFileId === file.id && activeQuote) {
                        // Split the content by the quote
                        const parts = file.file_content.split(activeQuote);

                        // Rebuild the content, interleaving <mark> tags
                        content = (
                          <div className="whitespace-pre-wrap">
                            {parts.map((part, index) => (
                              <span key={index}>
                                {part}
                                {index < parts.length - 1 && (
                                  <mark id={`highlight-${index}`} className="evidence-highlight">
                                    {activeQuote}
                                  </mark>
                                )}
                              </span>
                            ))}
                          </div>
                        );
                      } else {
                        // Otherwise, just render the plain text
                        content = (
                          <div className="whitespace-pre-wrap">
                            {file.file_content}
                          </div>
                        );
                      }

                      return (
                        <div
                          key={file.id}
                          className="p-6 font-mono text-sm text-text-secondary"
                          style={{ display: rawTextTab === file.id ? 'block' : 'none' }}
                        >
                          {content}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Resize Handle (U32) */}
          {showLeftPanel && showRightPanel && (
            <div id="resize-handle" ref={handleRef} className="absolute top-0 bottom-0 z-10" style={{ left: '50%', transform: 'translateX(-8px)', width: '16px', cursor: 'col-resize' }}></div>
          )}

          {/* Right Panel: Analysis (U32) */}
          {showRightPanel && (
            <div id="right-panel" className="h-full flex flex-col bg-bg-medium overflow-hidden flex-grow">
              {/* Analysis Tabs */}
              <div className="flex-shrink-0 border-b border-border bg-bg-light">
                <nav className="flex -mb-px px-6">
                  <button 
                    onClick={() => setAnalysisTab('evidence')} 
                    className={`whitespace-nowrap py-3 px-4 text-sm font-medium border-b-2 ${analysisTab === 'evidence' ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:border-border'}`}
                    >
                      Evidence List
                    </button>
                    {(highestPhaseVisible === 'competency' || highestPhaseVisible === 'summary') && (
                      <>
                        <button 
                          onClick={() => setAnalysisTab('competency')} 
                          className={`whitespace-nowrap py-3 px-4 text-sm font-medium border-b-2 ${analysisTab === 'competency' ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:border-border'}`}
                        >
                          Competency Analysis
                        </button>
                        <button 
                          onClick={() => setAnalysisTab('summary')} 
                          className={`whitespace-nowrap py-3 px-4 text-sm font-medium border-b-2 ${analysisTab === 'summary' ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:border-border'}`}
                        >
                          Executive Summary
                        </button>
                      </>
                    )}
                </nav>
              </div>

              {/* Dynamic Analysis Content */}
              {renderAnalysisContent()}
              
            </div>
          )}
        </main>
      </div>
      
      {/* --- MODALS --- */}
      {/* Change Evidence Modal */}
      <CreateChangeModal
        isOpen={modals.createEvidence || modals.changeEvidence}
        onClose={() => {
          closeModal('createEvidence');
          closeModal('changeEvidence');
          setHighlightingEvidence(false);
        }}
        onSave={() => {
          setRefreshTrigger(c => c + 1);
        }}
        reportId={reportId!}
        evidenceToEdit={evidenceToEdit}
        selectedEvidenceText={selectedEvidenceText}
        source={activeSourceTag}
        dictionary={reportData?.dictionary}
        addToast={addToast}
      />

      {/* View Context Modal (U29) */}
      {modals.viewContext && (
        <div className="fixed inset-0 z-30 pointer-events-none">
          <div className="fixed inset-0 bg-black/20 pointer-events-auto" onClick={() => closeModal('viewContext')}></div>
          <div className="fixed top-0 right-0 h-full w-full max-w-lg bg-bg-light shadow-lg flex flex-col pointer-events-auto">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h3 className="text-xl font-semibold text-text-primary">Report Context</h3>
              <button className="text-text-muted hover:text-text-primary" onClick={() => closeModal('viewContext')}>&times;</button>
            </div>
            <div className="flex-grow p-6 space-y-6 overflow-y-auto">
              <div>
                <label className="text-sm font-medium text-text-muted">Report Title</label>
                <p className="text-text-primary font-medium">Analysis of Candidate A</p>
              </div>
              <div>
                <label className="text-sm font-medium text-text-muted">Files Uploaded</label>
                <ul className="list-disc list-outside pl-5 mt-2 space-y-1 text-sm">
                  <li><span className="text-text-primary">candidate_A_case_study.pdf</span> (Case Study)</li>
                  <li><span className="text-text-primary">candidate_A_roleplay.mp3</span> (Roleplay)</li>
                </ul>
              </div>
              <div>
                <label className="text-sm font-medium text-text-muted">Additional Specific Context</label>
                <p className="text-sm text-text-secondary mt-1 p-3 bg-bg-medium rounded-md">Candidate is an internal applicant for a team lead position. Focus on leadership and communication is paramount.</p>
              </div>
              <button 
                onClick={() => { closeModal('viewContext'); openModal('projectContext'); }}
                className="w-full bg-white text-text-secondary border border-border rounded-md text-sm font-semibold px-4 py-2 hover:bg-bg-medium transition-colors"
              >
                View Project Context
              </button>
            </div>
          </div>
        </div>
      )}

      {/* (FIXED) Ask AI Modal (U49) */}
      {modals.askAI && (
        <div className="fixed inset-0 z-30 pointer-events-none">
          <div className="fixed inset-0 bg-black/20 pointer-events-auto" onClick={() => closeModal('askAI')}></div>
          <div className="fixed top-0 right-0 h-full w-full max-w-lg bg-bg-light shadow-lg flex flex-col pointer-events-auto">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h3 className="text-xl font-semibold text-text-primary">Ask AI</h3>
              <button className="text-text-muted hover:text-text-primary" onClick={() => closeModal('askAI')}>&times;</button>
            </div>
            <div className="flex-grow p-6 space-y-4 overflow-y-auto">
              <div className="p-4 bg-bg-medium rounded-md">
                <h4 className="text-sm font-semibold text-text-primary mb-2">Reasoning</h4>
                <p className="text-sm text-text-secondary">I have refined the text to be more concise...</p>
                <button className="text-sm font-medium text-primary hover:text-primary-hover mt-2">Undo</button>
              </div>
              <div>
                <label htmlFor="ai-prompt" className="text-sm font-medium text-text-primary mb-1 block">Your Request</label>
                <textarea id="ai-prompt" rows={4} className="w-full rounded-md border border-border p-3 bg-light shadow-sm text-sm" placeholder="e.g., 'Make this more concise'"></textarea>
              </div>
            </div>
            <div className="p-6 bg-bg-medium border-t border-border flex justify-end gap-3">
              <button className="bg-white text-text-secondary border border-border rounded-md text-sm font-semibold px-4 py-2" onClick={() => closeModal('askAI')}>Cancel</button>
              <button className="bg-primary text-white rounded-md text-sm font-semibold px-4 py-2">Refine</button>
            </div>
          </div>
        </div>
      )}

      {/* ... Other Modals (Delete, Save, ProjectContext) ... */}

      {/* --- NEW: Delete Evidence Modal (RP-7.9) --- */}
      {modals.deleteEvidence && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md bg-bg-light rounded-lg shadow-lg p-6">
            <h3 className="text-lg font-semibold text-text-primary">Delete Evidence?</h3>
            <p className="text-sm text-text-secondary mt-2">Are you sure you want to delete this piece of evidence? This action cannot be undone.</p>
            <div className="flex justify-end gap-3 mt-6">
              <button 
                className="bg-white text-text-secondary border border-border rounded-md text-sm font-semibold px-4 py-2 hover:bg-bg-medium" 
                onClick={() => closeModal('deleteEvidence')}
              >
                Cancel
              </button>
              <button 
                className="bg-error text-white rounded-md text-sm font-semibold px-4 py-2 hover:bg-red-700" 
                onClick={handleDeleteEvidence}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      
    </>
  );
};