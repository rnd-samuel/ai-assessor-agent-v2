// frontend/src/pages/ReportPage.tsx
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useBlocker } from 'react-router-dom';
import apiService from '../services/apiService';
import { useUserStore } from '../state/userStore';
import { useToastStore } from '../state/toastStore';
import ProjectContextModal from '../components/ProjectContextModal';
import { getSocket } from '../services/socket';

// Component Imports
import RawTextPanel from '../components/report/RawTextPanel';
import EvidenceList from '../components/report/EvidenceList';
import { type EvidenceCardData } from '../components/report/EvidenceCard';
import CompetencyAnalysisList from '../components/report/CompetencyAnalysisList'; // Child 1
import ExecutiveSummary from '../components/report/ExecutiveSummary'; // Child 2
import { type CompetencyAnalysis } from '../types/assessment';
import UnsavedChangesModal from '../components/UnsavedChangesModal';
import ThinkingPanel from '../components/report/ThinkingPanel';

// --- Data Types ---
interface ReportData {
  title: string;
  status: 'CREATED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  projectId: string;
  creatorId: string;
  isArchived: boolean;
  currentPhase: number;
  targetPhase: number;
  specificContext?: string;
  evidence: EvidenceCardData[];
  rawFiles: {
    id: string;
    file_name: string;
    simulation_method_tag: string;
    file_content: string;
  }[];
  dictionary: any;
  targetLevels: Record<string, string>;
  // These come from the API now, but we store them in separate state
  competencyAnalysis?: CompetencyAnalysis[]; 
  executiveSummary?: any;
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

  // 1. Load Competencies (Robust check for 'content' wrapper)
  useEffect(() => {
    if (!isOpen || !dictionary) return;

    const content = dictionary.content || dictionary;
    
    if (content?.kompetensi) {
      const competencies = content.kompetensi.map((c: any) => ({
        // FIX: Use namaKompetensi as ID if c.id is missing
        id: c.id || c.namaKompetensi, 
        name: c.name || c.namaKompetensi,
      }));
      setCompetencyList(competencies);
      
      if (!evidenceToEdit && competencies.length > 0 && !competency) {
        setCompetency(competencies[0].id);
      }
    }
  }, [dictionary, evidenceToEdit, isOpen]);

  // 2. Load Levels when Competency Changes
  useEffect(() => {
    if (!evidenceToEdit) {
        setLevel('');
        setKb('');
    }

    if (competency && dictionary) {
      const content = dictionary.content || dictionary;
      // FIX: Match against id OR namaKompetensi
      const comp = content?.kompetensi?.find((c: any) => (c.id || c.namaKompetensi) === competency);
      
      const levels = comp?.level?.map((l: { nomor: string }) => String(l.nomor)) || [];
      setLevelList(levels);

      if (!evidenceToEdit && levels.length > 0) {
          setLevel(levels[0]);
      } else if (evidenceToEdit && evidenceToEdit.competency === competency) {
          setLevel(evidenceToEdit.level);
      }
    }
  }, [competency, dictionary, evidenceToEdit]);

  // 3. Load Key Behaviors when Level Changes
  useEffect(() => {
    if (!evidenceToEdit) setKb('');

    if (competency && level && dictionary) {
      const content = dictionary.content || dictionary;
      // FIX: Match against id OR namaKompetensi
      const comp = content?.kompetensi?.find((c: any) => (c.id || c.namaKompetensi) === competency);
      const lvl = comp?.level?.find((l: any) => String(l.nomor) === level);
      
      const kbs = lvl?.keyBehavior || [];
      setKbList(kbs);

      if (!evidenceToEdit && kbs.length > 0) {
          setKb(kbs[0]);
      } else if (evidenceToEdit && evidenceToEdit.level === level) {
          setKb(evidenceToEdit.kb);
      }
    }
  }, [competency, level, dictionary, evidenceToEdit]);

  // 4. Initialize for Edit Mode
  useEffect(() => {
    if (evidenceToEdit && isOpen) {
      setCompetency(evidenceToEdit.competency);
      // Level and KB setting is handled by the dependent effects above 
      // to ensure lists are populated first.
      setReasoning(evidenceToEdit.reasoning);
    } else if (!evidenceToEdit && isOpen) {
        // Clear reasoning on new create
        setReasoning('');
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
export default function ReportPage() {
  const { id: reportId } = useParams();
  const currentUserId = useUserStore((state) => state.userId);
  const addToast = useToastStore((state) => state.addToast);

  // --- State ---
  const [isLoading, setIsLoading] = useState(true);
  const [reportData, setReportData] = useState<ReportData | null>(null);

  const [isDirty, setIsDirty] = useState(false);

  // State for content
  const [reportTitle, setReportTitle] = useState('');
  const [competencyData, setCompetencyData] = useState<any[]>([]);
  const [summaryData, setSummaryData] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [askAiContext, setAskAiContext] = useState<{ 
      context: string; 
      currentText: string; 
      onApply: (newText: string) => void; // <--- The magic callback
  } | null>(null);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isRefining, setIsRefining] = useState(false);

  const [streamLog, setStreamLog] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  
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
  const isCreator = reportData?.creatorId === currentUserId;
  const isViewOnly = !isCreator || reportData?.isArchived;
  const isEvidenceLocked = highestPhaseVisible !== 'evidence';
  const isAnalysisLocked = highestPhaseVisible === 'summary';

  const activeFile = reportData?.rawFiles.find(f => f.id === activeFileId);

  const isUserClicking = useRef(false);

  const nameToTargetLevelMap = useMemo(() => {
    if (!reportData?.dictionary || !reportData?.targetLevels) return {};
    const map: Record<string, string> = {};
    const dict = reportData.dictionary.content || reportData.dictionary;

    if (Array.isArray(dict?.kompetensi)) {
        dict.kompetensi.forEach((c: any) => {
           const name = c.name || c.namaKompetensi;
           const id = c.id || name;
           // If we have a target level for this ID/Name, map the NAME to it.
           if (reportData.targetLevels[id]) {
               map[name] = reportData.targetLevels[id];
           }
        });
    }
    return map;
  }, [reportData]);
  
  // --- Data Fetching ---
  const fetchReportData = useCallback(async (isBackground = false) => {
    if (!reportId) return;
    try {
      if (!isBackground) setIsLoading(true);

      const response = await apiService.get<ReportData>(`/reports/${reportId}/data`);
      
      // 1. Handle Report Data
      setReportData(response.data);
      setReportTitle(response.data.title);
      
      if (!activeFileId && response.data.rawFiles.length > 0) {
        setActiveFileId(response.data.rawFiles[0].id);
      }

      // 2. MAP Competency Data (Fixes the Crash!)
      // We must transform snake_case DB columns to camelCase Interface props
      const rawAnalysis = response.data.competencyAnalysis || [];
      const mappedAnalysis = rawAnalysis.map((row: any) => ({
        id: row.id,
        // If 'competency' exists (from DB), map it. Otherwise keep existing if already mapped.
        competencyName: row.competency || row.competencyName, 
        levelAchieved: row.level_achieved || row.levelAchieved,
        explanation: row.explanation,
        developmentRecommendations: row.development_recommendations || row.developmentRecommendations,
        // IMPORTANT: Map key_behaviors_status to keyBehaviors
        keyBehaviors: row.key_behaviors_status || row.keyBehaviors || [] 
      }));

      setCompetencyData(mappedAnalysis);

      // 3. Handle Summary Data
      // Summary keys mostly match, but let's be safe with defaults
      const rawSummary = response.data.executiveSummary || {};
      setSummaryData({
        id: rawSummary.id || '',
        overview: rawSummary.overview || '',
        strengths: rawSummary.strengths || '',
        areas_for_improvement: rawSummary.areas_for_improvement || '',
        recommendations: rawSummary.recommendations || ''
      });

      // 4. Restore Progress
      const phase = response.data.currentPhase;
      const target = response.data.targetPhase;

      // Restore Thinking State
      if (response.data.status === 'PROCESSING') {
        setIsThinking(true);
        setStreamLog((prev) => prev ? prev : "🔄 Resuming connection to AI stream...\n");
      } else {
        setIsThinking(false);
      }
      
      // We use a functional update to ensure we check against the *current* state, not the closure's stale version
      setHighestPhaseVisible((prev) => {
        const phaseMap: Record<string, number> = { 'evidence': 1, 'competency': 2, 'summary': 3 };
        const currentLevel = phaseMap[prev] || 1;
        
        let newLevel = currentLevel;
        if (phase >= 2) newLevel = Math.max(newLevel, 2);
        if (phase >= 3) newLevel = Math.max(newLevel, 3);
        
        // Map back to string
        if (newLevel === 3) return 'summary';
        if (newLevel === 2) return 'competency';
        return 'evidence';
      });

      if (isInitialLoad.current) {
         if (phase === 2 && target >= 2) setAnalysisTab('competency');
         if (phase === 3 && target >= 3) setAnalysisTab('summary');
         isInitialLoad.current = false;
      }

    } catch (err) {
      console.error("Failed to load report:", err);
      if (!isBackground) addToast("Failed to load report data.", 'error');
    } finally {
      if (!isBackground) setIsLoading(false);
    }
  }, [reportId, addToast]);

  useEffect(() => {
    fetchReportData();
  }, [fetchReportData]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket || !reportId) {
      console.warn("Socket or ReportID missing", { socket, reportId });
      return;
    }
    
    console.log(`[Frontend] Listening for events on report ${reportId}`);

    // 1. Auto-Refresh File Text (Point #1)
    const onFileProcessed = (data: { fileId: string }) => {
        console.log('Received file-processed event:', data);
        // Check if this file belongs to our current report
        if (reportData?.rawFiles.some(f => f.id === data.fileId)) {
            addToast("Assessment text processed. Refreshing...", 'success');
            fetchReportData(); // Reload to get the extracted_text
        }
    };

    // 2. AI Streaming (Point #5)
    const onAiStream = (data: { reportId: string, chunk: string }) => {
        if (data.reportId === reportId) {
            setIsThinking(true);
            setStreamLog(prev => prev + data.chunk);
            
            // Auto-scroll the thinking panel (optional, handled by CSS usually)
            const panel = document.getElementById('thinking-panel');
            if (panel) panel.scrollTop = panel.scrollHeight;
        }
    };

    const onLocalComplete = async (data: { reportId: string, message: string }) => {
        if (data.reportId === reportId) {
            setIsThinking(false); // Stop showing panel
            setStreamLog(''); // Clear log or keep it? Let's clear it for next run.
            await fetchReportData();
            addToast(data.message, 'success');
        }
    };

    const onLocalFailed = async (data: { reportId: string, message: string }) => {
        if (data.reportId === reportId) {
             setIsThinking(false);
             await fetchReportData(); 
             addToast(data.message, 'error');
        }
    };

    // Incremental Evidence Loading
    const onBatchSaved = (data: { reportId: string, competency: string, count: number }) => {
        if (data.reportId === reportId) {
            console.log(`Batch saved: ${data.count} items for ${data.competency}`);
            // Trigger a "Silent" fetch (no spinner)
            fetchReportData(true); 
        }
    };

    const onGenerationCancelled = (data: { reportId: string, message: string }) => {
        if (data.reportId === reportId) {
            console.log("Worker confirmed stop.");
            setIsResetting(false); // <--- Unlock the UI
            setIsThinking(false);
            setStreamLog('');
            addToast("AI Generation stopped.", 'info');
            fetchReportData(); // Refresh to ensure we see the clean state
        }
    };

    socket.on('file-processed', onFileProcessed);
    socket.on('evidence-batch-saved', onBatchSaved);
    socket.on('ai-stream', onAiStream);
    socket.on('generation-complete', onLocalComplete);
    socket.on('generation-failed', onLocalFailed);
    socket.on('generation-cancelled', onGenerationCancelled);

    return () => {
        socket.off('file-processed', onFileProcessed);
        socket.off('evidence-batch-saved', onBatchSaved);
        socket.off('ai-stream', onAiStream);
        socket.off('generation-complete', onLocalComplete);
        socket.off('generation-failed', onLocalFailed);
        socket.off('generation-cancelled', onGenerationCancelled);
    };
  }, [reportId, reportData, fetchReportData, addToast]);

  const handleSaveReport = async () => {
    if (!reportId) return;
    setIsSaving(true);
    try {
      await apiService.put(`/reports/${reportId}/content`, {
        title: reportTitle,
        competencyAnalysis: competencyData,
        executiveSummary: summaryData
      });
      addToast("Report saved successfully.", 'success');
      setIsDirty(false);
    } catch (e) {
      console.error(e);
      addToast("Failed to save report.", 'error');
    } finally {
      setIsSaving(false);
    }
  };

    useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for 's' key combined with Ctrl (Windows/Linux) or Meta (Mac Command)
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault(); // STOP the browser's "Save Page" dialog
        
        // Only trigger if not currently saving and user has permission
        if (!isSaving && !isViewOnly) {
          console.log("Shortcut: Saving report...");
          handleSaveReport();
        }
      }
    };

    // Attach listener to the window
    window.addEventListener('keydown', handleKeyDown);
    
    // Cleanup: Remove listener when component unmounts or dependencies change
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSaveReport, isSaving, isViewOnly]);

  const handleExportReport = async () => {
    if (!reportId) return;
    
    await handleSaveReport(); 

    try {
      addToast("Generating report document...", 'info');
      const response = await apiService.get(`/reports/${reportId}/export`, {
        responseType: 'blob' 
      });

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      
      // Try to get filename from header
      const contentDisposition = response.headers['content-disposition'] || response.headers['Content-Disposition'];
      let fileName = 'Report.docx';
      if (contentDisposition) {
        const fileNameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (fileNameMatch && fileNameMatch[1]) {
          // Remove quotes if present
          fileName = fileNameMatch[1].replace(/['"]/g, '');
        }
      }
      
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();

      addToast("Report downloaded successfully.", 'success');
    } catch (error) {
      console.error(error);
      addToast("Failed to export report.", 'error');
    }
  };

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
    isUserClicking.current = true;
    const targetFile = reportData?.rawFiles.find(f => f.simulation_method_tag === evidence.source);
    if (targetFile) {
        setActiveFileId(targetFile.id);
        setActiveEvidenceId(evidence.id);
        setActiveQuote(evidence.quote);
        setTimeout(() => { isUserClicking.current = false; }, 1000);
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
        
        await fetchReportData(); 
        
    } catch (error) {
        console.error(error);
        addToast("Failed to delete evidence.", 'error');
    }
  };

  const handleGeneratePhase1 = async () => {
    if (!reportId) return;
    try {
      // 1. Optimistic Update (FIX: Prevents button flash)
      setReportData(prev => prev ? { ...prev, status: 'PROCESSING' } : null);

      await apiService.post(`/reports/${reportId}/generate/phase1`);
      addToast("AI evidence generation started...", 'info');
    } catch (error) {
      console.error(error);
      addToast("Failed to start AI generation.", 'error');
      // Revert on failure
      fetchReportData();
    }
  };

  // (RP-7.11) Trigger Phase 2
  const handleGeneratePhase2 = async () => {
    if (isDirty) {
      addToast("Please save your changes before generating the analysis.", 'error');
      return;
    }
    
    if (!reportId) return;
    try {
      // Optimistic Update: Immediately set status to PROCESSING
      // This prevents the "Resume" button from staying clickable while waiting for sockets
      setReportData(prev => prev ? { ...prev, status: 'PROCESSING' } : null);
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
      // Revert status if the API call itself fails (e.g., 400 Bad Request)
      setReportData(prev => prev ? { ...prev, status: 'FAILED' } : null);

      if (error.response && error.response.status === 400) {
        addToast(error.response.data.message, 'error');
      } else {
        addToast("Failed to start Phase 2 generation.", 'error');
      }
    }
  };

  const handleGeneratePhase3 = async () => {
    if (isDirty) {
      addToast("Please save your changes before generating the summary.", 'error');
      return;
    }
    if (!reportId) return;
    try {
      //Optimistic Update
      setReportData(prev => prev ? { ...prev, status: 'PROCESSING' } : null);

      setHighestPhaseVisible('summary');
      setAnalysisTab('summary');

      await apiService.post(`/reports/${reportId}/generate/phase3`);
      addToast("Phase 3 (Executive Summary) generation started...", 'info');

    } catch (error: any) {
      console.error(error);
      // Revert status on error
      setReportData(prev => prev ? { ...prev, status: 'COMPLETED' } : null);
      if (error.response && error.response.status === 400) {
        addToast(error.response.data.message, 'error');
      } else {
        addToast("Failed to start Phase 3 generation.", 'error');
      }
    }
  };

// Inside ReportPage component
const handleAskAI = (context: string, currentText: string, onApply: (t: string) => void) => {
  setAskAiContext({ context, currentText, onApply });
  setAiPrompt(''); 
  setModals(prev => ({ ...prev, askAI: true }));
};

const submitRefinement = async () => {
  if (!reportId || !askAiContext) return;

  setIsRefining(true);
  try {
    const response = await apiService.post(`/reports/${reportId}/refine`, {
      prompt: aiPrompt,
      currentText: askAiContext.currentText,
      context: askAiContext.context
    });

    const { refinedText } = response.data;

    askAiContext.onApply(refinedText); 
    addToast("Text refined by AI.", 'success');

    // Close modal
    setModals(prev => ({ ...prev, askAI: false }));

  } catch (error) {
    console.error(error);
    addToast("Failed to refine text.", 'error');
  } finally {
    setIsRefining(false);
  }
};

const handleReset = async () => {
  if (!reportId) return;
  if (!confirm("This will stop the current process (if any) and allow you to restart. Continue?")) return;

  setIsResetting(true);

  try {
    await apiService.post(`/reports/${reportId}/reset-status`);
    addToast("Stopping AI...", 'info');
    setTimeout(() => setIsResetting(false), 5000);
    fetchReportData(); // Reload UI
  } catch (error) {
    setIsResetting(false);
    addToast("Failed to reset status.", 'error');
  }
};

const closeModal = (key: keyof ModalsState) => setModals(prev => ({ ...prev, [key]: false }));

const blocker = useBlocker(
  ({ currentLocation, nextLocation }) =>
    isDirty && currentLocation.pathname !== nextLocation.pathname
);
  
  if (isLoading && !reportData) {
      return <div className="flex h-screen items-center justify-center text-text-muted">Loading Report...</div>;
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-bg-medium">
      
      {/* Header */}
      <header className="flex-shrink-0 h-16 bg-bg-light border-b border-border flex items-center justify-between px-6 z-20">
        <div className="flex items-center gap-4 flex-1">
            <input
              type="text"
              className="text-lg font-bold text-text-primary bg-transparent border border-transparent hover:border-border focus:border-primary rounded px-2 py-1 outline-none transition-colors w-full max-w-md"
              value={reportTitle}
              onChange={(e) => {
                setReportTitle(e.target.value);
                setIsDirty(true);
              }}
              title="Click to edit title"
            />
            <button onClick={() => setModals(prev => ({ ...prev, viewContext: true }))} className="text-xs font-medium text-primary bg-primary/10 px-2 py-1 rounded hover:bg-primary/20">
                View Context
            </button>
            {/* STATUS BADGES */}
            {reportData?.isArchived ? (
              <span className="px-2 py-1 rounded-md bg-error/10 text-error text-xs font-bold border border-error/20 flex items-center gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M9.5 12h5"/></svg>
                ARCHIVED
              </span>
            ) : isViewOnly ? (
              <span className="px-2 py-1 rounded-md bg-gray-100 text-gray-600 text-xs font-bold border border-gray-300 flex items-center gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                VIEW ONLY
              </span>
            ) : null}
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
                
                {reportData && reportData.targetPhase >= 2 && (highestPhaseVisible === 'competency' || highestPhaseVisible === 'summary') && (
                    <button 
                        onClick={() => setAnalysisTab('competency')}
                        className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${analysisTab === 'competency' ? 'bg-white text-primary shadow-sm' : 'text-text-muted hover:text-text-secondary'}`}
                    >
                        2. Analysis
                    </button>
                )}
                
                {reportData && reportData.targetPhase >= 3 && highestPhaseVisible === 'summary' && (
                    <button 
                        onClick={() => setAnalysisTab('summary')}
                        className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${analysisTab === 'summary' ? 'bg-white text-primary shadow-sm' : 'text-text-muted hover:text-text-secondary'}`}
                    >
                        3. Summary
                    </button>
                )}
             </div>
             {reportData && reportData.targetPhase > 1 && (
               <button
                 className={`bg-primary text-white rounded-md text-sm font-semibold px-4 py-2 hover:bg-primary-hover transition-colors flex items-center gap-2 ${reportData?.currentPhase !== 3 && reportData.currentPhase < reportData.targetPhase ? 'opacity-50 cursor-not-allowed' : ''}`}
                 disabled={!reportData || reportData.currentPhase < reportData.targetPhase}
                 onClick={handleExportReport}
               >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Export
               </button>
             )}
             <button 
               onClick={handleSaveReport}
               disabled={isSaving || isViewOnly}
               className="bg-primary text-white text-sm font-semibold px-4 py-2 rounded-md hover:bg-primary-hover"
              >
                {isSaving ? 'Saving...' : 'Save Report'}
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
                    onQuoteNotFound={() => {
                      if (isUserClicking.current) {
                        addToast("Could not locate this evidence text. It might be paraphrased.", 'error');
                        isUserClicking.current = false;
                      }
                    }}
                />
                <div className="bg-bg-medium p-2 border-t border-border text-xs text-text-muted flex justify-between items-center flex-shrink-0">
                    <span>
                      {isEvidenceLocked
                        ? 'Evidence collection is locked because competency analysis has been done.'
                        : selectedText
                          ? 'Text selected. Click "+ Evidence" on the right.'
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
                        onReset={handleReset}
                        targetPhase={reportData?.targetPhase || 1}
                        isThinking={isThinking}
                        streamLog={streamLog}
                        isResetting={isResetting}
                        onRefresh={() => fetchReportData()}
                    />
                )}
                
                {analysisTab === 'competency' && (
                    <CompetencyAnalysisList
                        reportId={reportId || ''}
                        isViewOnly={isViewOnly || isAnalysisLocked}
                        onGenerateNext={() => {
                          // NP-4.6: Check if Summary is enabled (Target Phase >= 3)
                          if (reportData?.targetPhase && reportData.targetPhase < 3) {
                            addToast("Analysis is the final phase for this project.", 'info');
                            return Promise.resolve();
                          } else {
                            return handleGeneratePhase3();
                          }
                        }}
                        onReset={handleReset}
                        onResume={handleGeneratePhase2}
                        targetLevelsMap={nameToTargetLevelMap}
                        onHighlightEvidence={handleQuoteSelection}
                        onAskAI={handleAskAI}
                        data={competencyData}
                        isLastPhase={reportData?.targetPhase === 2}
                        reportStatus={reportData?.status || 'CREATED'}
                        onChange={(newData) => {
                          setCompetencyData(newData);
                          setIsDirty(true);
                        }}
                    />
                )}

                {analysisTab === 'summary' && (
                    <ExecutiveSummary
                        reportId={reportId || ''}
                        isViewOnly={isViewOnly}
                        onAskAI={handleAskAI}
                        data={summaryData}
                        onChange={(newData) => {
                          setSummaryData(newData);
                          setIsDirty(true);
                        }}
                        reportStatus={reportData?.status || 'CREATED'}
                        onGenerate={handleGeneratePhase3}
                        onReset={handleReset}
                        isGenerating={reportData?.status === 'PROCESSING'}
                    />
                )}
            </div>
        )}
      </div>

      {/* --- Modals --- */}
      
      <CreateChangeModal 
        isOpen={modals.createEvidence || modals.changeEvidence}
        onClose={() => setModals(prev => ({ ...prev, createEvidence: false, changeEvidence: false }))}
        onSave={() => fetchReportData()}
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
                <div>
                  <label className="text-xs font-bold text-text-muted uppercase">Specific Context</label>
                  <div className="mt-1 p-3 bg-bg-medium rounded-md max-h-40 overflow-y-auto">
                    <p className="text-sm text-text-secondary whitespace-pre-wrap">
                      {reportData?.specificContext || "No specific context provided."}
                    </p>
                  </div>
                </div>
                <button onClick={() => setModals(prev => ({ ...prev, viewContext: false, projectContext: true }))} className="w-full border border-border rounded py-2 text-sm hover:bg-bg-medium">
                  View Project Context
                </button>
              </div>
          </div>
        </div>
      )}

      {modals.askAI && (
        <div className="fixed inset-0 z-30 pointer-events-none">
          <div className="fixed inset-0 bg-black/20 pointer-events-auto" onClick={() => closeModal('askAI')}></div>
          <div className="fixed top-0 right-0 h-full w-full max-w-lg bg-bg-light shadow-lg flex flex-col pointer-events-auto">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h3 className="text-xl font-semibold text-text-primary">Ask AI</h3>
              <button className="text-text-muted hover:text-text-primary" onClick={() => closeModal('askAI')}>&times;</button>
            </div>
            <div className="flex-grow p-6 space-y-4 overflow-y-auto">
              <div className="p-4 bg-bg-medium rounded-md border border-border">
                <h4 className="text-sm font-semibold text-text-primary mb-1">Context</h4>
                <p className="text-sm text-text-secondary">{askAiContext?.context}</p>
              </div>

              {/* Input */}
              <div>
                <label htmlFor="ai-prompt" className="text-sm font-medium text-text-primary mb-1 block">Your Request</label>
                <textarea
                  id="ai-prompt"
                  rows={4}
                  className="w-full rounded-md border border-border p-3 bg-light shadow-sm text-sm resize-y focus:border-primary focus:ring-2 focus:ring-primary/50 outline-none"
                  placeholder="e.g., 'Make this more concise'"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                ></textarea>
              </div>
            </div>
            <div className="p-6 bg-bg-medium border-t border-border flex justify-end gap-3">
              <button
                className="bg-white text-text-secondary border border-border rounded-md text-sm font-semibold px-4 py-2 hover:bg-bg-medium"
                onClick={() => closeModal('askAI')}
              >
                Cancel
              </button>
              <button
                className="bg-primary text-white rounded-md text-sm font-semibold px-4 py-2 hover:bg-primary-hover disabled:opacity-50"
                onClick={submitRefinement}
                disabled={isRefining || !aiPrompt}
              >
                {isRefining ? 'Thinking...' : 'Refine'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unsaved Changes Modal */}
      {blocker.state === "blocked" && (
        <UnsavedChangesModal
          isOpen={true}
          onStay={() => blocker.reset()}
          onLeave={() => blocker.proceed()}
        />
      )}

      {/* --- FLOATING THINKING PANEL --- */}
      {isThinking && <ThinkingPanel log={streamLog} />}
    </div>
  );
}