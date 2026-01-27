// frontend/src/pages/AdminPanelPage.tsx
import { useState, useEffect, useRef } from 'react';
import {
  Chart,
  LineController,
  BarController,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Legend,
} from 'chart.js';
import flatpickr from 'flatpickr';
import 'flatpickr/dist/flatpickr.min.css';
import { useBlocker } from 'react-router-dom';
import apiService from '../services/apiService';
import DictionaryEditor from '../components/DictionaryEditor';
import DictionaryContentDisplay, { type DictionaryContent } from '../components/DictionaryContentDisplay';
import DragDropUploader from '../components/DragDropUploader';
import UnsavedChangesModal from '../components/UnsavedChangesModal';
import LoadingButton from '../components/LoadingButton';
import { useToastStore } from '../state/toastStore';
import SearchableSelect from '../components/SearchableSelect';

// Register Chart.js components
Chart.register(
  LineController,
  BarController,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Legend
);

// Set default chart.js styles
Chart.defaults.font.family = 'Inter, sans-serif';
Chart.defaults.color = '#4b5563'; // text-secondary

type AdminTab = 'usage' | 'queue' | 'logging' | 'knowledge' | 'ai_settings' | 'user_management';

interface LogEntry {
  id: string;
  action: string;
  model: string;
  cost_usd: string | number;
  duration_ms: number;
  status: 'SUCCESS' | 'FAILED';
  created_at: string;
  input_tokens: number;
  output_tokens: number;
  user_email?: string;
  project_title?: string;
  report_title?: string;
  prompt_snapshot?: string;
  ai_response_snapshot?: string;
  current_content_snapshot?: any;
}

// Helper to check if model supports temperature
const supportsTemperature = (model: string) => {
  // Example logic: OpenAI 'o1' models don't support temperature. 
  // For now, we assume all do, but this function is ready for logic.
  if (model.includes('gpt') || model.includes('o1')) return false;
  return true;
};

export default function AdminPanelPage() {
  // (A2) State for active tab
  const [activeTab, setActiveTab] = useState<AdminTab>('usage');
  const addToast = useToastStore((state) => state.addToast);

  // --- NEW: LOGGING STATE ---
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logsPage, setLogsPage] = useState(1);
  const [totalLogs, setTotalLogs] = useState(0);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [logFilters, setLogFilters] = useState({
    startDate: '',
    endDate: '',
    projectId: '',
    reportId: '',
    model: '',
    action: ''
  });
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [projectOptions, setProjectOptions] = useState<{ id: string, name: string }[]>([]);
  const [reportOptions, setReportOptions] = useState<{ id: string, title: string }[]>([]);
  const [actionOptions] = useState<string[]>([
    'PHASE_1_EXTRACTION',
    'PHASE_2_JUDGMENT',
    'PHASE_2_NARRATIVE',
    'PHASE_2_RECOMMENDATIONS',
    'PHASE_3_DRAFT',
    'PHASE_3_CRITIQUE',
    'ASK_AI_REFINE'
  ]);
  const [totalCost, setTotalCost] = useState(0);

  // State for all modals
  const [modals, setModals] = useState({
    logDetails: false,
    exportLogs: false,
    editDictionary: false,
    deleteDictionaryConfirm: false,
    addSimMethod: false,
    addUser: false,
    editUser: false,
    deleteUserConfirm: false,
    // TODO: promptHistory: false
    selectSimMethod: false,
  });

  // (A5) State for Model Filter
  const [modelFilterOpen, setModelFilterOpen] = useState(false);

  // State for queue dashboard
  const [queueStats, setQueueStats] = useState({ active: 0, completed: 0, failed: 0, waiting: 0 });

  // State for Dictionaries
  const [dictionaries, setDictionaries] = useState<{
    id: string;
    name: string;
    created_at: string;
    is_in_use: boolean;
  }[]>([]);
  const [isUploadingDict, setIsUploadingDict] = useState(false);
  const [editingDictionary, setEditingDictionary] = useState<{
    id: string;
    name: string;
    content: DictionaryContent;
    is_in_use: boolean;
  } | null>(null);
  const [isSavingDict, setIsSavingDict] = useState(false);

  // KB & Sim Files State
  const [globalKbFiles, setGlobalKbFiles] = useState<{ id: string, file_name: string, created_at: string }[]>([]);
  const [isUploadingKb, setIsUploadingKb] = useState(false);
  const [viewGuideModal, setViewGuideModal] = useState(false);
  const [globalGuideContent, setGlobalGuideContent] = useState("");
  const [isLoadingGuide, setIsLoadingGuide] = useState(false);

  const [simMethods, setSimMethods] = useState<{ id: string, name: string, description: string }[]>([]);
  const [methodForm, setMethodForm] = useState({ id: '', name: '', description: '' });
  const [isEditingMethod, setIsEditingMethod] = useState(false);
  const [isSavingMethod, setIsSavingMethod] = useState(false);

  // State for Simulation Files
  const [simFiles, setSimFiles] = useState<{ id: string, file_name: string, method_name: string }[]>([]);
  const [isUploadingSimFile, setIsUploadingSimFile] = useState(false);

  // We need a temporary state to hold the file while the user selects the method
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [targetMethodId, setTargetMethodId] = useState('');

  // State for Users
  const [users, setUsers] = useState<{ id: string, name: string, email: string, role: string }[]>([]);
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'User' });
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [isSavingUser, setIsSavingUser] = useState(false);

  const [isDirty, setIsDirty] = useState(false);
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  // State for AI Models Management
  interface AiModel {
    id: string;
    context_window: number;
    input_cost_per_m: number;
    output_cost_per_m: number;
  }
  const [aiModelsList, setAiModelsList] = useState<AiModel[]>([]);

  // Form for new model
  const [newModelForm, setNewModelForm] = useState({
    id: '',
    context_window: 128000,
    input_cost: 0,
    output_cost: 0
  });

  // Sort state for Models Table
  const [modelSortKey, setModelSortKey] = useState<keyof AiModel>('id');
  const [modelSortOrder, setModelSortOrder] = useState<'asc' | 'desc'>('asc');

  // AI Config State
  const [aiConfig, setAiConfig] = useState({
    judgmentLLM: 'google/gemini-2.5-flash-lite-preview-09-2025',
    narrativeLLM: 'google/gemini-3-pro-preview',
    backupLLM: 'openrouter/openai/gpt-5.1',
    judgmentTemp: 0.5,
    backupTemp: 0.5,
    askAiEnabled: true,
    askAiLLM: 'openrouter/google/gemini-2.5-flash',
  });

  // Default Prompts State
  const [defaultPrompts, setDefaultPrompts] = useState({
    persona: '',
    evidence: '',
    // Replaced 'analysis' with specific steps
    kb_fulfillment: '',
    competency_level: '',
    development: '',
    summary: '',
    summary_critique: '',
    askAiSystem: ''
  });

  // Refs for charts and datepicker
  const apiRequestsChartRef = useRef<HTMLCanvasElement>(null);
  const tokenUsageChartRef = useRef<HTMLCanvasElement>(null);
  const waitTimeChartRef = useRef<HTMLCanvasElement>(null);
  const dateRangeRef = useRef<HTMLInputElement>(null);
  const datePickerInstance = useRef<flatpickr.Instance | null>(null);

  // Helper to manage modals
  const openModal = (modal: keyof typeof modals) => setModals(prev => ({ ...prev, [modal]: true }));
  const closeModal = (modal: keyof typeof modals) => setModals(prev => ({ ...prev, [modal]: false }));

  // (A3) Effect to initialize dummy charts
  useEffect(() => {
    const chartInstances: Chart[] = [];

    if (activeTab === 'usage') {
      // Init API Requests Chart
      if (apiRequestsChartRef.current) {
        const apiChart = new Chart(apiRequestsChartRef.current, {
          type: 'line',
          data: {
            labels: ['Oct 18', 'Oct 19', 'Oct 20', 'Oct 21', 'Oct 22', 'Oct 23', 'Oct 24'],
            datasets: [
              { label: 'GPT-4', data: [120, 150, 180, 220, 190, 240, 260], borderColor: '#068c81', backgroundColor: 'rgba(6, 140, 129, 0.1)', tension: 0.2, fill: true },
              { label: 'Claude 3 Opus', data: [80, 90, 100, 110, 95, 115, 130], borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)', tension: 0.2, fill: true }
            ]
          },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } } }, scales: { y: { beginAtZero: true, grid: { color: '#f3f4f6' } }, x: { grid: { display: false } } } }
        });
        chartInstances.push(apiChart);
      }
      // Init Token Usage Chart
      if (tokenUsageChartRef.current) {
        const tokenChart = new Chart(tokenUsageChartRef.current, {
          type: 'bar',
          data: {
            labels: ['Oct 18', 'Oct 19', 'Oct 20', 'Oct 21', 'Oct 22', 'Oct 23', 'Oct 24'],
            datasets: [
              { label: 'Input Tokens', data: [50000, 60000, 55000, 70000, 65000, 75000, 80000], backgroundColor: '#3b82f6', borderRadius: 4 },
              { label: 'Output Tokens', data: [20000, 25000, 22000, 30000, 28000, 32000, 35000], backgroundColor: '#068c81', borderRadius: 4 }
            ]
          },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } } }, scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true, grid: { color: '#f3f4f6' } } } }
        });
        chartInstances.push(tokenChart);
      }
      // Init Wait Time Chart
      if (waitTimeChartRef.current) {
        const waitChart = new Chart(waitTimeChartRef.current, {
          type: 'bar',
          data: {
            labels: ['GPT-4o', 'Claude 3 Opus', 'Gemini Pro'],
            datasets: [{ label: 'Avg. Wait Time (s)', data: [15.2, 12.5, 18.1], backgroundColor: ['#068c81', '#3b82f6', '#f59e0b'], borderRadius: 4 }]
          },
          options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, title: { display: true, text: 'Seconds' }, grid: { color: '#f3f4f6' } }, y: { grid: { display: false } } } }
        });
        chartInstances.push(waitChart);
      }
    }
    // Cleanup function
    return () => {
      chartInstances.forEach(chart => chart.destroy());
    };
  }, [activeTab]);

  // (A4) Effect to initialize date picker
  useEffect(() => {
    if (activeTab === 'usage' && dateRangeRef.current && !datePickerInstance.current) {
      datePickerInstance.current = flatpickr(dateRangeRef.current, {
        mode: 'range',
        dateFormat: 'Y-m-d',
        defaultDate: [new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'today'],
        altInput: true,
        altFormat: 'M j, Y',
      });
    }
    // No cleanup function needed here as we want to preserve the instance
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'queue') {
      apiService.get('/admin/stats/queue')
        .then(res => setQueueStats(res.data))
        .catch(console.error);
    }
  }, [activeTab])

  // --- FETCH LOGS ---
  const fetchLogs = async (page = 1) => {
    setIsLoadingLogs(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
        ...logFilters
      });

      const response = await apiService.get(`/admin/logs?${params.toString()}`);
      setLogs(response.data.data);
      setTotalLogs(response.data.total);
      setTotalCost(response.data.totalCost || 0);
      setLogsPage(response.data.page);
    } catch (error) {
      console.error("Failed to fetch logs:", error);
      addToast("Failed to load logs.", 'error');
    } finally {
      setIsLoadingLogs(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'logging') {
      // Fetch Projects
      apiService.get('/projects').then(res => setProjectOptions(res.data)).catch(console.error);
      // Fetch unique models from logs (or use aiModelsList if static)
      // For now, let's just hardcode common ones or fetch from stats
      setModelOptions([
        'google/gemini-2.5-flash-lite-preview-09-2025',
        'google/gemini-2.5-pro',
        'google/gemini-3-pro-preview',
        'openrouter/openai/gpt-5.1'
      ]);
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'logging') {
      fetchLogs(logsPage);
    }
  }, [activeTab, logsPage]);

  // Fetch reports when project is selected
  useEffect(() => {
    if (logFilters.projectId) {
      apiService.get(`/projects/${logFilters.projectId}/reports`)
        .then(res => setReportOptions(res.data))
        .catch(console.error);
    } else {
      setReportOptions([]);
      // Clear reportId when project is cleared
      if (logFilters.reportId) {
        setLogFilters(prev => ({ ...prev, reportId: '' }));
      }
    }
  }, [logFilters.projectId]);

  const handleExportDataset = async () => {
    setIsExporting(true);
    try {
      const response = await apiService.get('/admin/dataset/export', {
        params: logFilters,
        responseType: 'blob' // Important for file download
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'fine_tuning_data.jsonl');
      document.body.appendChild(link);
      link.click();
      link.remove();

      addToast("Dataset exported successfully.", 'success');
    } catch (error) {
      console.error("Export failed:", error);
      addToast("Failed to export dataset.", 'error');
    } finally {
      setIsExporting(false);
    }
  };

  // Knowledge Files Tab Fetching

  const fetchDictionaries = async () => {
    try {
      const response = await apiService.get('/admin/dictionaries');
      setDictionaries(response.data);
    } catch (error) {
      console.error("Failed to fetch dictionaries", error);
    }
  };

  const fetchSimMethods = async () => {
    try {
      const response = await apiService.get('/admin/simulation-methods');
      setSimMethods(response.data);
    } catch (error) {
      console.error("Failed to fetch methods", error);
    }
  };

  const fetchSimFiles = async () => {
    try {
      const response = await apiService.get('/admin/simulation-files');
      setSimFiles(response.data);
    } catch (error) {
      console.error("Failed to fetch sim files", error);
    }
  };

  const fetchGlobalKb = async () => {
    try {
      const response = await apiService.get('/admin/knowledge-base');
      setGlobalKbFiles(response.data);
    } catch (error) { console.error("Failed to fetch global KB", error); }
  };

  // Fetch when 'knowledge' tab is active
  useEffect(() => {
    if (activeTab === 'knowledge') {
      fetchDictionaries();
      fetchSimMethods();
      fetchSimFiles();
      fetchGlobalKb();
    }
  }, [activeTab]);

  // Knowledge Tab Handlers
  const handleKnowledgeUpload = async (files: FileList) => {
    if (files.length === 0) return;

    setIsUploadingKb(true);
    try {
      // Loop through files since backend expects single file upload
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append('file', file);

        await apiService.post('/admin/knowledge-base', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      }
      addToast(`${files.length} file(s) uploaded. Global Context is updating...`, 'success');
      fetchGlobalKb();
    } catch (error: any) {
      console.error(error);
      addToast(error.response?.data?.message || "Failed to upload file.", 'error');
    } finally {
      setIsUploadingKb(false);
    }
  };

  const handleDeleteKb = async (id: string) => {
    if (!confirm("Delete this file?")) return;
    try {
      await apiService.delete(`/admin/knowledge-base/${id}`);
      addToast("File deleted.", 'success');
      fetchGlobalKb();
    } catch (error) {
      addToast("Failed to delete file.", 'error');
    }
  };

  const handleViewGlobalGuide = async () => {
    setIsLoadingGuide(true);
    setViewGuideModal(true);
    try {
      const response = await apiService.get('/admin/settings/global_context_guide');
      // The value is stored as JSONB { text: "..." }
      setGlobalGuideContent(response.data?.text || "No guide generated yet.");
    } catch (error) {
      console.error(error);
      addToast("Failed to fetch global guide.", 'error');
      setGlobalGuideContent("Error loading content.");
    } finally {
      setIsLoadingGuide(false);
    }
  };

  const handleDictionaryUpload = async (files: FileList) => {
    const file = files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        setIsUploadingDict(true);
        const jsonContent = JSON.parse(event.target?.result as string);

        // Use filename (minus .json) as default name, or prompt user
        const name = jsonContent.namaKamus || jsonContent.name || file.name.replace('.json', '');

        await apiService.post('/admin/dictionaries', {
          name: name,
          content: jsonContent
        });

        addToast('Dictionary uploaded successfully!', 'success')
        fetchDictionaries();
      } catch (error) {
        console.error("Upload failed:", error);
        addToast('Invalid JSON file or upload failed.', 'error')
      } finally {
        setIsUploadingDict(false);
      }
    };
    reader.readAsText(file);
  }

  const handleEditDictionary = async (dict: { id: string, name: string, is_in_use: boolean }) => {
    try {
      // Fetch full content
      const response = await apiService.get(`/projects/dictionary/${dict.id}/content`);

      setEditingDictionary({
        id: dict.id,
        name: dict.name,
        content: response.data,
        is_in_use: dict.is_in_use,
      });
      openModal('editDictionary');
    } catch (error) {
      console.error(error);
      addToast('Failed to load dictionary details.', 'error');
    }
  };

  const handleSaveDictionary = async () => {
    if (!editingDictionary) return;

    try {
      setIsSavingDict(true);
      // Validate JSON
      const parsedContent = editingDictionary.content;

      await apiService.put(`/admin/dictionaries/${editingDictionary.id}`, {
        name: editingDictionary.name,
        content: parsedContent
      });

      addToast('Dictionary updated.', 'success');
      setIsDirty(false);
      closeModal('editDictionary');
      fetchDictionaries();
    } catch (error) {
      addToast('Invalid JSON format or Server Error.', 'error');
      console.error(error);
    } finally {
      setIsSavingDict(false);
    }
  };

  const handleDeleteDictionary = async (id: string) => {
    if (!window.confirm("Are you sure? This cannot be undone.")) return;

    try {
      await apiService.delete(`/admin/dictionaries/${id}`);
      fetchDictionaries();
    } catch (error: any) {
      addToast(error.response?.data?.message || 'Failed to delete dictionary.', 'error');
    }
  };

  const handleCreateMethod = async () => {
    if (!methodForm.name.trim()) {
      addToast("Method name is required", 'error');
      return;
    }
    setIsSavingMethod(true);
    try {
      if (isEditingMethod) {
        await apiService.put(`/admin/simulation-methods/${methodForm.id}`, {
          name: methodForm.name,
          description: methodForm.description
        });
        addToast("Method updated!", 'success');
      } else {
        await apiService.post('/admin/simulation-methods', {
          name: methodForm.name,
          description: methodForm.description
        });
        addToast("Method created!", 'success');
      }

      setIsDirty(false);
      closeModal('addSimMethod');
      setMethodForm({ id: '', name: '', description: '' });
      setIsEditingMethod(false);
      fetchSimMethods();
    } catch (error: any) {
      addToast(error.response?.data?.message || "Failed to create simulation method.", 'error');
    } finally {
      setIsSavingMethod(false);
    }
  };

  const handleDeleteMethod = async (id: string) => {
    if (!window.confirm("Delete this simulation method?")) return;
    try {
      await apiService.delete(`/admin/simulation-methods/${id}`);
      fetchSimMethods();
    } catch (error: any) {
      addToast(error.response?.data?.message || 'Failed to delete method.', 'error');
    }
  };

  const handleDragDropUpload = (files: FileList) => {
    if (files && files.length > 0) {
      setPendingFile(files[0]);
      openModal('selectSimMethod');
    }
  };

  const confirmSimFileUpload = async () => {
    if (!pendingFile || !targetMethodId) return;

    setIsUploadingSimFile(true);

    const formData = new FormData();
    formData.append('file', pendingFile);
    formData.append('methodId', targetMethodId);

    try {
      await apiService.post('/admin/simulation-files', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      addToast('File uploaded successfully!', 'success');
      closeModal('selectSimMethod');
      setPendingFile(null);
      setTargetMethodId('');
      fetchSimFiles();
    } catch (error) {
      console.error("Upload failed", error);
      addToast('Failed to upload file.', 'error');
    } finally {
      setIsUploadingSimFile(false);
    }
  };

  const handleDeleteSimFile = async (id: string) => {
    if (!confirm("Delete this file?")) return;
    await apiService.delete(`/admin/simulation-files/${id}`);
    fetchSimFiles();
  };

  useEffect(() => {
    if (activeTab === 'ai_settings') {
      fetchAiModels();
      const fetchSettings = async () => {
        try {
          const [configRes, promptsRes] = await Promise.all([
            apiService.get('/admin/settings/ai_config'),
            apiService.get('/admin/settings/default_prompts')
          ]);
          if (configRes.data && Object.keys(configRes.data).length > 0) {
            setAiConfig(prev => ({ ...prev, ...configRes.data }));
          }
          if (promptsRes.data && Object.keys(promptsRes.data).length > 0) {
            setDefaultPrompts(prev => ({ ...prev, ...promptsRes.data }));
          }
        } catch (error) {
          console.error("Failed to load settings", error);
          addToast("Failed to load AI settings.", 'error');
        }
      };
      fetchSettings();
    }
  }, [activeTab]);

  const handleSaveAllSettings = async () => {
    setIsSavingMethod(true);
    try {
      // Save both concurrently
      await Promise.all([
        apiService.put('/admin/settings/ai_config', aiConfig),
        apiService.put('/admin/settings/default_prompts', defaultPrompts)
      ]);

      addToast("Settings and prompts saved successfully.", 'success');
      setIsDirty(false);
    } catch (error) {
      console.error("Save failed:", error);
      addToast("Failed to save settings. Please try again.", 'error');
    } finally {
      setIsSavingMethod(false);
    }
  };

  const fetchAiModels = async () => {
    try {
      const response = await apiService.get('/admin/ai-models');
      setAiModelsList(response.data);
    } catch (error) {
      console.error("Failed to fetch AI models", error);
    }
  };

  const handleAddModel = async () => {
    if (!newModelForm.id) {
      addToast("Model ID is required", 'error');
      return;
    }
    setIsSavingMethod(true);
    try {
      await apiService.post('/admin/ai-models', newModelForm);
      addToast("Model added successfully.", 'success');
      closeModal('addModel' as any); // Cast if types strict, or add 'addModel' to modals state definition
      setNewModelForm({ id: '', context_window: 128000, input_cost: 0, output_cost: 0 });
      fetchAiModels();
    } catch (error: any) {
      addToast(error.response?.data?.message || "Failed to add model.", 'error');
    } finally {
      setIsSavingMethod(false);
    }
  };

  const handleDeleteModel = async (id: string) => {
    if (!confirm(`Delete model ${id}? This might break projects using it.`)) return;
    try {
      // encodeURIComponent is needed for IDs like "openai/gpt-4"
      await apiService.delete(`/admin/ai-models/${encodeURIComponent(id)}`);
      addToast("Model deleted.", 'success');
      fetchAiModels();
    } catch (error) {
      addToast("Failed to delete model.", 'error');
    }
  };

  // Sorting Logic
  const sortedModels = [...aiModelsList].sort((a, b) => {
    let valA = a[modelSortKey];
    let valB = b[modelSortKey];
    // Handle strings vs numbers
    if (typeof valA === 'string') valA = valA.toLowerCase();
    if (typeof valB === 'string') valB = valB.toLowerCase();

    if (valA < valB) return modelSortOrder === 'asc' ? -1 : 1;
    if (valA > valB) return modelSortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  const handleModelSort = (key: keyof AiModel) => {
    if (modelSortKey === key) {
      setModelSortOrder(modelSortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setModelSortKey(key);
      setModelSortOrder('asc');
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await apiService.get('/admin/users');
      setUsers(response.data);
    } catch (error) {
      console.error("Failed to fetch users", error);
    }
  };

  useEffect(() => {
    if (activeTab === 'user_management') {
      fetchUsers();
    }
  }, [activeTab]);

  const handleAddUser = async () => {
    if (!newUser.email || !newUser.password || !newUser.name) {
      addToast('Please fill all fields.', 'info');
      return;
    }
    setIsSavingUser(true);
    try {
      // Using the public register route is fine for now, or you could make a protected admin one.
      await apiService.post('/admin/users', newUser);
      addToast('User added successfully!', 'success');
      setIsDirty(false);
      closeModal('addUser');
      setNewUser({ name: '', email: '', password: '', role: 'User' }); // Reset form
      fetchUsers();
    } catch (error: any) {
      addToast(error.response?.data?.message || 'Failed to create user.', 'error');
    } finally {
      setIsSavingUser(false);
    }
  };

  const handleEditUser = async () => {
    if (!editingUserId) return;

    setIsSavingUser(true);

    try {
      await apiService.put(`/admin/users/${editingUserId}`, newUser);
      addToast('User updated successfully!', 'success');
      setIsDirty(false);
      closeModal('editUser');
      setEditingUserId(null);
      setNewUser({ name: '', email: '', password: '', role: 'User' }); // Reset form
      fetchUsers(); // Refresh list
    } catch (error: any) {
      addToast(error.response?.data?.message || 'Failed to update user.', 'error');
    } finally {
      setIsSavingUser(false);
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (!confirm("Are you sure you want to delete this users?")) return;
    try {
      await apiService.delete(`/admin/users/${id}`);
      fetchUsers();
    } catch (error: any) {
      addToast(error.response?.data?.message || 'Failed to delete user.', 'error');
    }
  };

  // Helper: Check for unsaved changes before performing an action
  const checkUnsaved = (action: () => void) => {
    if (isDirty) {
      setPendingAction(() => action); // Store the action to run later
      setShowUnsavedModal(true);      // Show our manual modal
    } else {
      action(); // Run immediately if clean
    }
  };

  // Helper: Handle "Stay" (Cancel navigation)
  const handleStay = () => {
    setShowUnsavedModal(false);
    setPendingAction(null);
  };

  // Helper: Handle "Leave" (Confirm data loss)
  const handleLeave = () => {
    setIsDirty(false); // Clear dirty flag
    setShowUnsavedModal(false);
    if (pendingAction) {
      pendingAction(); // Run the stored action (e.g., close modal)
      setPendingAction(null);
    }
  };

  // Wrapper for Tab Switching
  const handleTabChange = (tab: AdminTab) => {
    checkUnsaved(() => setActiveTab(tab));
  };

  // Wrapper for Modal Closing
  const handleCloseModal = (modal: keyof typeof modals) => {
    checkUnsaved(() => closeModal(modal));
  };

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirty && currentLocation.pathname !== nextLocation.pathname
  );

  return (
    // This is the root layout
    <div className="flex h-screen bg-bg-light">

      {/* This is the main content area for the admin panel */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">

        {/* Global Header */}
        <header className="flex-shrink-0 flex items-center justify-between h-16 px-6 border-b border-border bg-bg-light z-10">
          <h2 className="text-xl font-bold text-text-primary">Admin Panel</h2>
        </header>

        {/* Tab Navigation (A2) */}
        <div className="flex-shrink-0 border-b border-border bg-bg-light">
          <nav className="flex -mb-px px-6">
            <button onClick={() => handleTabChange('usage')} className={`whitespace-nowrap py-3 px-4 text-sm font-medium border-b-2 ${activeTab === 'usage' ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:border-border'}`}>Usage Dashboard</button>
            <button onClick={() => handleTabChange('queue')} className={`whitespace-nowrap py-3 px-4 text-sm font-medium border-b-2 ${activeTab === 'queue' ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:border-border'}`}>Queue Dashboard</button>
            <button onClick={() => handleTabChange('logging')} className={`whitespace-nowrap py-3 px-4 text-sm font-medium border-b-2 ${activeTab === 'logging' ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:border-border'}`}>Comprehensive Logging</button>
            <button onClick={() => handleTabChange('knowledge')} className={`whitespace-nowrap py-3 px-4 text-sm font-medium border-b-2 ${activeTab === 'knowledge' ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:border-border'}`}>Knowledge Base</button>
            <button onClick={() => handleTabChange('ai_settings')} className={`whitespace-nowrap py-3 px-4 text-sm font-medium border-b-2 ${activeTab === 'ai_settings' ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:border-border'}`}>AI Settings</button>
            <button onClick={() => handleTabChange('user_management')} className={`whitespace-nowrap py-3 px-4 text-sm font-medium border-b-2 ${activeTab === 'user_management' ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:border-border'}`}>User Management</button>
          </nav>
        </div>

        {/* Tab Content Area (Scrollable) */}
        <main className="flex-1 overflow-y-auto main-content-scroll p-6 lg:p-8 space-y-8">

          {/* Usage Dashboard Tab (A3, A4, A5) */}
          {activeTab === 'usage' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-text-primary">Usage Dashboard</h3>
              {/* Filters */}
              <div className="flex flex-wrap gap-4 items-center">
                <div className="flex-1 flex-wrap flex items-center gap-2">
                  <label className="text-sm font-medium text-text-muted mr-2">Date Range:</label>
                  <div className="relative inline-block">
                    <input ref={dateRangeRef} type="text" placeholder="Select date range..." className="w-64 rounded-md border border-border px-3 py-2 bg-light shadow-sm text-sm cursor-pointer" />
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                      <svg className="w-5 h-5 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                    </div>
                  </div>
                  <div className="inline-flex rounded-md shadow-sm border border-gray-200 divide-x divide-gray-200" role="group">
                    <button type="button" onClick={() => datePickerInstance.current?.setDate('today', true)} className="px-3 py-1 text-xs font-medium text-text-secondary bg-white hover:bg-gray-100 rounded-l-md">Today</button>
                    <button type="button" onClick={() => datePickerInstance.current?.setDate([new Date(new Date().setDate(new Date().getDate() - 1)), new Date(new Date().setDate(new Date().getDate() - 1))], true)} className="px-3 py-1 text-xs font-medium text-text-secondary bg-white hover:bg-gray-100">Yesterday</button>
                    <button type="button" onClick={() => datePickerInstance.current?.setDate([new Date(new Date().setDate(new Date().getDate() - 6)), 'today'], true)} className="px-3 py-1 text-xs font-medium text-text-secondary bg-white hover:bg-gray-100">Last 7d</button>
                    <button type="button" onClick={() => datePickerInstance.current?.setDate([new Date(new Date().setDate(new Date().getDate() - 29)), 'today'], true)} className="px-3 py-1 text-xs font-medium text-text-secondary bg-white hover:bg-gray-100">Last 30d</button>
                    <button type="button" onClick={() => datePickerInstance.current?.setDate([new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'today'], true)} className="px-3 py-1 text-xs font-medium text-text-secondary bg-white hover:bg-gray-100 rounded-r-md">This Month</button>
                  </div>
                </div>

                <div
                  className="relative inline-block text-left"
                  onMouseLeave={() => setModelFilterOpen(false)}
                >
                  <div>
                    <button type="button" onClick={() => setModelFilterOpen(!modelFilterOpen)} className="inline-flex justify-center w-full rounded-md border border-border shadow-sm px-4 py-2 bg-white text-sm font-medium text-text-secondary hover:bg-bg-medium">
                      Models
                      <svg className="-mr-1 ml-2 h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                    </button>
                  </div>
                  {modelFilterOpen && (
                    <div className="origin-top-right absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-10 p-2">
                      <input type="text" placeholder="Search models..." className="w-full mb-2 rounded-md border border-border px-2 py-1 text-sm" />
                      <div className="py-1 space-y-1 max-h-48 overflow-y-auto">
                        <label className="flex items-center px-2 py-1 text-sm text-text-secondary rounded-md hover:bg-bg-medium cursor-pointer">
                          <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary mr-2" /> GPT-4
                        </label>
                        <label className="flex items-center px-2 py-1 text-sm text-text-secondary rounded-md hover:bg-bg-medium cursor-pointer">
                          <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary mr-2" /> Claude 3 Opus
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Dashboard Stats (A3) */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-bg-light p-6 rounded-lg shadow-sm border border-border">
                  <h4 className="text-md font-semibold text-text-primary mb-4">AI API Requests</h4>
                  <div className="h-64"><canvas ref={apiRequestsChartRef}></canvas></div>
                </div>
                <div className="bg-bg-light p-6 rounded-lg shadow-sm border border-border">
                  <h4 className="text-md font-semibold text-text-primary mb-4">Token Usage</h4>
                  <div className="h-64"><canvas ref={tokenUsageChartRef}></canvas></div>
                </div>
                <div className="bg-bg-light p-6 rounded-lg shadow-sm border border-border">
                  <h4 className="text-md font-semibold text-text-primary mb-4">Avg. Wait Time (per Model)</h4>
                  <div className="h-64"><canvas ref={waitTimeChartRef}></canvas></div>
                </div>
                <div className="bg-bg-light p-6 rounded-lg shadow-sm border border-border flex flex-col items-center justify-center">
                  <h4 className="text-md font-semibold text-text-primary mb-2">Error Rate</h4>
                  <p className="text-4xl font-bold text-error">1.2%</p>
                  <p className="text-xs text-text-muted mt-1">Based on selected period</p>
                </div>
                <div className="bg-bg-light p-6 rounded-lg shadow-sm border border-border flex flex-col items-center justify-center">
                  <h4 className="text-md font-semibold text-text-primary mb-2">Total Estimated Cost</h4>
                  <p className="text-4xl font-bold text-text-primary">$123.45</p>
                  <p className="text-xs text-text-muted mt-1">Based on selected period</p>
                </div>
              </div>
            </div>
          )}

          {/* Queue Dashboard Tab (A6) */}
          {activeTab === 'queue' && (
            <div className="grid grid-cols-4 gap-6">
              <div className="bg-white p-6 rounded-lg shadow border border-border">
                <h4 className="text-sm text-text-muted">Active Jobs</h4>
                <p className="text-3xl font-bold text-primary">{queueStats.active}</p>
              </div>
              <div className="bg-white p-6 rounded-lg shadow border border-border">
                <h4 className="text-sm text-text-muted">Waiting</h4>
                <p className="text-3xl font-bold text-warning">{queueStats.waiting}</p>
              </div>
              <div className="bg-white p-6 rounded-lg shadow border border-border">
                <h4 className="text-sm text-text-muted">Completed</h4>
                <p className="text-3xl font-bold text-success">{queueStats.completed}</p>
              </div>
              <div className="bg-white p-6 rounded-lg shadow border border-border">
                <h4 className="text-sm text-text-muted">Failed</h4>
                <p className="text-3xl font-bold text-error">{queueStats.failed}</p>
              </div>
            </div>
          )}

          {/* Comprehensive Logging Tab (A7-A10) */}
          {activeTab === 'logging' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-text-primary">System Logs</h3>
                {/* Export Button now just triggers a download with current filters */}
                <LoadingButton
                  onClick={handleExportDataset}
                  isLoading={isExporting}
                  loadingText="Exporting..."
                  className="bg-primary text-white rounded-md text-sm font-semibold px-4 py-2 hover:bg-primary-hover flex items-center gap-2"
                  icon={<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>}
                >
                  Export Current View
                </LoadingButton>
              </div>

              {/* Filter Bar */}
              <div className="bg-white p-4 rounded-lg border border-border flex flex-wrap gap-4 items-end">
                <div>
                  <label className="text-xs font-semibold text-text-secondary mb-1 block">Date Range</label>
                  <input
                    type="date"
                    className="rounded-md border border-border px-3 py-2 text-sm"
                    value={logFilters.startDate}
                    onChange={e => setLogFilters({ ...logFilters, startDate: e.target.value })}
                  />
                  <span className="mx-2 text-text-muted">-</span>
                  <input
                    type="date"
                    className="rounded-md border border-border px-3 py-2 text-sm"
                    value={logFilters.endDate}
                    onChange={e => setLogFilters({ ...logFilters, endDate: e.target.value })}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-text-secondary mb-1 block">Project</label>
                  <select
                    className="rounded-md border border-border px-3 py-2 text-sm w-48"
                    value={logFilters.projectId}
                    onChange={e => setLogFilters({ ...logFilters, projectId: e.target.value, reportId: '' })}
                  >
                    <option value="">All Projects</option>
                    {projectOptions.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-text-secondary mb-1 block">Report</label>
                  <select
                    className="rounded-md border border-border px-3 py-2 text-sm w-48"
                    value={logFilters.reportId}
                    onChange={e => setLogFilters({ ...logFilters, reportId: e.target.value })}
                    disabled={!logFilters.projectId}
                  >
                    <option value="">All Reports</option>
                    {reportOptions.map(r => (
                      <option key={r.id} value={r.id}>{r.title}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-text-secondary mb-1 block">Model</label>
                  <select
                    className="rounded-md border border-border px-3 py-2 text-sm w-48"
                    value={logFilters.model}
                    onChange={e => setLogFilters({ ...logFilters, model: e.target.value })}
                  >
                    <option value="">All Models</option>
                    {modelOptions.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-text-secondary mb-1 block">Action</label>
                  <select
                    className="rounded-md border border-border px-3 py-2 text-sm w-52"
                    value={logFilters.action}
                    onChange={e => setLogFilters({ ...logFilters, action: e.target.value })}
                  >
                    <option value="">All Actions</option>
                    {actionOptions.map(a => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={() => fetchLogs(1)}
                  className="bg-bg-medium text-text-primary hover:bg-border border border-transparent rounded-md px-4 py-2 text-sm font-medium transition-colors"
                >
                  Apply Filters
                </button>

                <button
                  onClick={() => {
                    setLogFilters({ startDate: '', endDate: '', projectId: '', reportId: '', model: '', action: '' });
                  }}
                  className="text-sm text-text-muted hover:text-primary underline ml-auto"
                >
                  Clear
                </button>
              </div>

              {/* Total Cost Summary */}
              <div className="bg-gradient-to-r from-primary/5 to-primary/10 p-4 rounded-lg border border-primary/20 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
                      <line x1="12" y1="1" x2="12" y2="23"></line>
                      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-text-muted">Total Estimated Cost (Filtered)</p>
                    <p className="text-2xl font-bold text-text-primary">${totalCost.toFixed(5)}</p>
                  </div>
                </div>
                <p className="text-xs text-text-muted">Based on {totalLogs} matching log entries</p>
              </div>

              {/* Log Table */}
              <div className="overflow-x-auto border border-border rounded-lg bg-bg-light shadow-sm">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-bg-medium border-b border-border text-xs uppercase text-text-muted">
                      <th className="p-3 font-semibold">Timestamp</th>
                      <th className="p-3 font-semibold">Action</th>
                      <th className="p-3 font-semibold">Project / Report</th>
                      <th className="p-3 font-semibold">Model</th>
                      <th className="p-3 font-semibold text-right">Tokens (In/Out)</th>
                      <th className="p-3 font-semibold text-right">Cost ($)</th>
                      <th className="p-3 font-semibold text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {isLoadingLogs ? (
                      <tr><td colSpan={7} className="p-8 text-center text-text-muted">Loading logs...</td></tr>
                    ) : logs.length === 0 ? (
                      <tr><td colSpan={7} className="p-8 text-center text-text-muted">No logs found.</td></tr>
                    ) : (
                      logs.map((log) => (
                        <tr key={log.id} className="hover:bg-bg-medium/50 transition-colors">
                          <td className="p-3 whitespace-nowrap text-text-secondary text-xs">
                            {new Date(log.created_at).toLocaleString()}
                          </td>
                          <td className="p-3">
                            <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded border border-gray-200">
                              {log.action}
                            </span>
                          </td>
                          <td className="p-3 text-xs">
                            <div className="font-medium text-text-primary">{log.project_title || '-'}</div>
                            <div className="text-text-muted truncate max-w-[200px]" title={log.report_title}>{log.report_title || '-'}</div>
                          </td>
                          <td className="p-3 text-xs text-text-secondary">{log.model}</td>
                          <td className="p-3 text-right text-xs text-text-muted">
                            {log.input_tokens} / {log.output_tokens}
                          </td>
                          <td className="p-3 text-right font-mono text-xs">
                            ${Number(log.cost_usd).toFixed(5)}
                          </td>
                          <td className="p-3 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${log.status === 'SUCCESS' ? 'bg-success/10 text-success' : 'bg-error/10 text-error'}`}>
                              {log.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              <div className="flex justify-between items-center text-sm text-text-secondary">
                <span>Page {logsPage} (Total: {totalLogs})</span>
                <div className="flex gap-2">
                  <button
                    disabled={logsPage === 1}
                    onClick={() => fetchLogs(Math.max(1, logsPage - 1))}
                    className="px-3 py-1 border border-border rounded hover:bg-bg-medium disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    disabled={logs.length < 20}
                    onClick={() => fetchLogs(logsPage + 1)}
                    className="px-3 py-1 border border-border rounded hover:bg-bg-medium disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Knowledge Base Tab (A11-A14) */}
          {activeTab === 'knowledge' && (
            <div className="space-y-8">
              <h3 className="text-lg font-semibold text-text-primary">Knowledge Base Management</h3>
              {/* General Knowledge Files (A12) */}
              <div className="bg-bg-light p-6 rounded-lg shadow-sm border border-border space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="text-md font-semibold text-text-primary">Global Knowledge Files</h4>
                    <p className="text-sm text-text-muted">These documents are distilled into the Global Master Guide for all projects.</p>
                  </div>
                  <button
                    onClick={handleViewGlobalGuide}
                    className="text-sm bg-bg-medium hover:bg-border border border-border text-text-primary px-3 py-1.5 rounded-md transition-colors flex items-center gap-2"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></svg>
                    View Current Guide
                  </button>
                </div>
                <DragDropUploader
                  onUpload={handleKnowledgeUpload}
                  acceptedTypes=".pdf,.docx,.txt"
                  multiple={true}
                  subLabel="PDF, DOCX, or TXT"
                  label={isUploadingKb ? "Uploading & Processing..." : "Click to upload or drag and drop"}
                />
                <div>
                  <h5 className="text-sm font-medium text-text-primary mb-2">Uploaded Files ({globalKbFiles.length}):</h5>
                  <ul className="space-y-2">
                    {globalKbFiles.length === 0 ? (
                      <li className="text-sm text-text-muted italic">No global files uploaded yet.</li>
                    ) : (
                      globalKbFiles.map(file => (
                        <li key={file.id} className="flex justify-between items-center text-sm p-2 bg-bg-medium rounded-md">
                          <span>{file.file_name} <span className="text-text-muted text-xs">({new Date(file.created_at).toLocaleDateString()})</span></span>
                          <button onClick={() => handleDeleteKb(file.id)} className="text-xs text-error hover:underline">Delete</button>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </div>

              {/* Competency Dictionaries (A13) */}
              <div>
                <h4 className="text-md font-semibold text-text-primary mb-2">Competency Dictionaries</h4>
                <DragDropUploader
                  onUpload={handleDictionaryUpload}
                  acceptedTypes=".json"
                  multiple={false}
                  subLabel="JSON File"
                  label={isUploadingDict ? "Uploading..." : "Click to upload or drag and drop"}
                />
              </div>

              <div>
                <h5 className="text-sm font-medium text-text-primary mb-2">Existing Dictionaries:</h5>
                <ul className="space-y-2">
                  {dictionaries.length === 0 ? (
                    <li className="text-sm text-text-muted italic">No dictionaries found.</li>
                  ) : (
                    dictionaries.map(dict => (
                      <li key={dict.id} className="flex justify-between items-center text-sm p-3 border border-border rounded-md hover:bg-bg-medium">
                        <div>
                          <span className="font-medium text-text-primary">{dict.name}</span>
                          <span className="text-xs text-text-muted ml-2">
                            (Added: {new Date(dict.created_at).toLocaleDateString()})
                          </span>
                          {dict.is_in_use && (
                            <span className="ml-2 px-1.5 py-0.5 text-[10px] font-semibold bg-info/10 text-info rounded border border-info/20">
                              Active
                            </span>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleEditDictionary(dict)}
                            title={dict.is_in_use ? "View Dictionary (Read-Only)" : "Edit Dictionary"}
                            className={`text-xs font-medium px-2 py-1 rounded transition-colors ${dict.is_in_use
                              ? 'text-text-secondary hover:bg-bg-medium bg-bg-medium/50'
                              : 'text-primary hover:text-primary-hover bg-primary/5 hover:bg-primary/10'
                              }`}
                          >
                            {dict.is_in_use ? 'View' : 'Edit'}
                          </button>
                          <button
                            onClick={() => handleDeleteDictionary(dict.id)}
                            disabled={dict.is_in_use}
                            title={dict.is_in_use ? "Cannot delete: Used by active projects" : "Delete Dictionary"}
                            className={`text-xs font-medium px-2 py-1 rounded transition-colors ${dict.is_in_use
                              ? 'text-text-muted opacity-50 cursor-not-allowed'
                              : 'text-error/80 hover:text-error'
                              }`}
                          >
                            Delete
                          </button>
                        </div>
                      </li>
                    ))
                  )}
                </ul>
              </div>
              {/* Simulation Methods Data (A14) */}
              <div className="bg-bg-light p-6 rounded-lg shadow-sm border border-border space-y-4">
                <h4 className="text-md font-semibold text-text-primary">Simulation Methods Data</h4>
                <p className="text-sm text-text-muted">Upload data files (.pdf, .docx, .txt) and link them to a method.</p>

                {/* File Uploader */}
                <DragDropUploader
                  onUpload={handleDragDropUpload}
                  acceptedTypes=".pdf,.docx,.txt"
                  multiple={false}
                  subLabel="PDF, DOCX, or TXT"
                />

                <div>
                  <h5 className="text-sm font-medium text-text-primary mb-2">Uploaded Method Data:</h5>
                  <ul className="space-y-2">
                    {simFiles.map(file => (
                      <li key={file.id} className="flex justify-between items-center text-sm p-2 bg-bg-medium rounded-md">
                        <span>{file.file_name} <span className="text-text-muted text-xs">({file.method_name})</span></span>
                        <button onClick={() => handleDeleteSimFile(file.id)} className="text-xs text-error hover:underline">Delete</button>
                      </li>
                    ))}
                  </ul>
                </div>
                <button
                  onClick={() => {
                    setMethodForm({ id: '', name: '', description: '' });
                    setIsEditingMethod(false);
                    openModal('addSimMethod')
                  }}
                  className="text-sm text-primary hover:underline font-medium"
                >
                  + Add New Simulation Method
                </button>

                <div>
                  <h5 className="text-sm font-medium text-text-primary mb-2">Available Methods:</h5>
                  <ul className="space-y-2">
                    {simMethods.map(method => (
                      <li key={method.id} className="flex justify-between items-start text-sm p-3 border border-border rounded-md bg-bg-medium/30">
                        <div>
                          <p className="font-medium text-text-primary">{method.name}</p>
                          {method.description && <p className="text-xs text-text-muted mt-1">{method.description}</p>}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setMethodForm({ id: method.id, name: method.name, description: method.description || '' });
                              setIsEditingMethod(true);
                              openModal('addSimMethod');
                            }}
                            className="text-xs text-primary hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteMethod(method.id)}
                            className="text-xs text-error/80 hover:text-error"
                          >
                            Delete
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* AI Settings Tab (A15-A21) */}
          {activeTab === 'ai_settings' && (
            <div className="space-y-8">

              {/* 1. CONFIGURATION SECTION */}
              <div className="bg-bg-light p-6 rounded-lg shadow-sm border border-border space-y-6">
                <div className="flex justify-between items-center border-b border-border pb-4">
                  <h3 className="text-lg font-semibold text-text-primary">Model Configuration</h3>
                  <LoadingButton
                    onClick={handleSaveAllSettings}
                    isLoading={isSavingMethod}
                    loadingText="Saving..."
                  >
                    Save All Settings
                  </LoadingButton>
                </div>

                {/* Main LLM */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">Judgment LLM</label>
                    <SearchableSelect
                      options={aiModelsList.map(m => ({ value: m.id, label: m.id }))}
                      value={aiConfig.judgmentLLM}
                      onChange={(val) => {
                        setAiConfig({ ...aiConfig, judgmentLLM: val });
                        setIsDirty(true);
                      }}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">Narrative LLM</label>
                    <SearchableSelect
                      options={aiModelsList.map(m => ({ value: m.id, label: m.id }))}
                      value={aiConfig.narrativeLLM}
                      onChange={(val) => {
                        setAiConfig({ ...aiConfig, narrativeLLM: val });
                        setIsDirty(true);
                      }}
                    />
                  </div>
                  <div>
                    <label htmlFor="main-temp" className={`block text-sm font-medium mb-1 ${supportsTemperature(aiConfig.judgmentLLM) ? 'text-text-secondary' : 'text-text-muted'}`}>
                      Temperature {supportsTemperature(aiConfig.judgmentLLM) ? '' : '(Not Supported)'}
                    </label>
                    <div className="flex items-center gap-4">
                      <input
                        type="range"
                        id="main-temp"
                        min="0" max="1" step="0.1"
                        className="w-full disabled:opacity-50"
                        disabled={!supportsTemperature(aiConfig.judgmentLLM)}
                        value={aiConfig.judgmentTemp}
                        onChange={(e) => {
                          setAiConfig({ ...aiConfig, judgmentTemp: parseFloat(e.target.value) });
                          setIsDirty(true);
                        }}
                      />
                      <span className="text-sm font-medium text-text-primary w-8 text-right">{aiConfig.judgmentTemp}</span>
                    </div>
                  </div>
                </div>

                {/* Backup LLM */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-border">
                  <div>
                    <label htmlFor="backup-llm" className="block text-sm font-medium text-text-secondary mb-1">Backup LLM</label>
                    <SearchableSelect
                      options={aiModelsList.map(m => ({ value: m.id, label: m.id }))}
                      value={aiConfig.backupLLM}
                      onChange={(val) => {
                        setAiConfig({ ...aiConfig, backupLLM: val });
                        setIsDirty(true);
                      }}
                    />
                  </div>
                  <div>
                    <label htmlFor="backup-temp" className={`block text-sm font-medium mb-1 ${supportsTemperature(aiConfig.backupLLM) ? 'text-text-secondary' : 'text-text-muted'}`}>
                      Temperature
                    </label>
                    <div className="flex items-center gap-4">
                      <input
                        type="range"
                        id="backup-temp"
                        min="0" max="1" step="0.1"
                        className="w-full disabled:opacity-50"
                        disabled={!supportsTemperature(aiConfig.backupLLM)}
                        value={aiConfig.backupTemp}
                        onChange={(e) => {
                          setAiConfig({ ...aiConfig, backupTemp: parseFloat(e.target.value) });
                          setIsDirty(true);
                        }}
                      />
                      <span className="text-sm font-medium text-text-primary w-8 text-right">{aiConfig.backupTemp}</span>
                    </div>
                  </div>
                </div>

                {/* 'Ask AI' Config (A21) */}
                <div className="pt-4 border-t border-border">
                  <div className="flex justify-between items-center mb-4">
                    <div>
                      <h4 className="text-sm font-bold text-text-primary">'Ask AI' Feature</h4>
                      <p className="text-xs text-text-muted">Allow users to refine report text using AI.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setAiConfig({ ...aiConfig, askAiEnabled: !aiConfig.askAiEnabled });
                        setIsDirty(true);
                      }}
                      className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors ${aiConfig.askAiEnabled ? 'bg-primary' : 'bg-gray-200'}`}
                    >
                      <span className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform ${aiConfig.askAiEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  {aiConfig.askAiEnabled && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label htmlFor="ask-ai-llm" className="block text-sm font-medium text-text-secondary mb-1">'Ask AI' Model</label>
                        <SearchableSelect
                          options={aiModelsList.map(m => ({ value: m.id, label: m.id }))}
                          value={aiConfig.askAiLLM}
                          onChange={(val) => {
                            setAiConfig({ ...aiConfig, askAiLLM: val });
                            setIsDirty(true);
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. MODEL MANAGEMENT SECTION (NEW) */}
                <div className="bg-bg-light p-6 rounded-lg shadow-sm border border-border space-y-6">
                  <div className="flex justify-between items-center border-b border-border pb-4">
                    <h3 className="text-lg font-semibold text-text-primary">Model Management</h3>
                    <button
                      onClick={() => openModal('addModel' as any)}
                      className="bg-white text-text-secondary border border-border rounded-md text-sm font-semibold px-3 py-1.5 hover:bg-bg-medium"
                    >
                      + Add Model
                    </button>
                  </div>

                  <div className="overflow-x-auto border border-border rounded-lg">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-bg-medium text-xs uppercase text-text-muted">
                        <tr>
                          <th className="p-3 cursor-pointer hover:bg-border/50" onClick={() => handleModelSort('id')}>Model ID</th>
                          <th className="p-3 cursor-pointer hover:bg-border/50" onClick={() => handleModelSort('context_window')}>Context</th>
                          <th className="p-3 cursor-pointer hover:bg-border/50" onClick={() => handleModelSort('input_cost_per_m')}>In ($/1M)</th>
                          <th className="p-3 cursor-pointer hover:bg-border/50" onClick={() => handleModelSort('output_cost_per_m')}>Out ($/1M)</th>
                          <th className="p-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {sortedModels.map(model => (
                          <tr key={model.id} className="hover:bg-bg-medium/30">
                            <td className="p-3 font-mono text-xs">{model.id}</td>
                            <td className="p-3">{model.context_window.toLocaleString()}</td>
                            <td className="p-3">${Number(model.input_cost_per_m).toFixed(2)}</td>
                            <td className="p-3">${Number(model.output_cost_per_m).toFixed(2)}</td>
                            <td className="p-3 text-right">
                              <button onClick={() => handleDeleteModel(model.id)} className="text-xs text-error hover:underline">Delete</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* 2. PROMPTS SECTION */}
              <div className="bg-bg-light p-6 rounded-lg shadow-sm border border-border space-y-6">
                <div className="flex justify-between items-center border-b border-border pb-4">
                  <h3 className="text-lg font-semibold text-text-primary">Default Prompts</h3>
                </div>

                {/* Standard Prompts */}
                <div className="space-y-6">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-sm font-semibold mb-1 block">Persona (System Prompt)</label>
                      {/** <button onClick={() => openModal('promptHistory')} className="text-xs font-medium text-primary hover:underline">View History</button> */}
                    </div>
                    <textarea
                      rows={3}
                      className="w-full rounded-md border border-border p-3 bg-bg-light shadow-sm text-sm focus:border-primary outline-none font-mono"
                      value={defaultPrompts.persona}
                      onChange={(e) => {
                        setDefaultPrompts({ ...defaultPrompts, persona: e.target.value });
                        setIsDirty(true);
                      }}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-semibold mb-1 block">Phase 1: Evidence Collection</label>
                    <textarea
                      rows={4}
                      className="w-full rounded-md border border-border p-3 bg-bg-light shadow-sm text-sm focus:border-primary outline-none font-mono"
                      value={defaultPrompts.evidence}
                      onChange={(e) => {
                        setDefaultPrompts({ ...defaultPrompts, evidence: e.target.value });
                        setIsDirty(true);
                      }}
                    />
                  </div>
                  <div className="p-4 bg-bg-medium/30 rounded-lg border border-border space-y-4">
                    <h4 className="text-sm font-bold text-text-primary uppercase tracking-wide">Phase 2: Competency Analysis</h4>
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-1">Task 1: KB Fulfillment Check</label>
                      <p className="text-xs text-text-muted mb-2">Instructs AI to check evidence against key behaviors and determine status.</p>
                      <textarea
                        rows={6}
                        className="w-full rounded-md border border-border p-3 bg-light shadow-sm text-sm focus:border-primary focus:ring-2 focus:ring-primary/50 outline-none font-mono"
                        value={defaultPrompts.kb_fulfillment}
                        onChange={(e) => {
                          setDefaultPrompts({ ...defaultPrompts, kb_fulfillment: e.target.value });
                          setIsDirty(true);
                        }}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-1">Task 2: Level Assignment & Narrative</label>
                      <p className="text-xs text-text-muted mb-2">Instructs AI to assign the final level and write the descriptive explanation.</p>
                      <textarea
                        rows={6}
                        className="w-full rounded-md border border-border p-3 bg-light shadow-sm text-sm focus:border-primary focus:ring-2 focus:ring-primary/50 outline-none font-mono"
                        value={defaultPrompts.competency_level}
                        onChange={(e) => {
                          setDefaultPrompts({ ...defaultPrompts, competency_level: e.target.value });
                          setIsDirty(true);
                        }}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-1">Task 3: Development Recommendations</label>
                      <p className="text-xs text-text-muted mb-2">Instructs AI to generate specific development advice.</p>
                      <textarea
                        rows={6}
                        className="w-full rounded-md border border-border p-3 bg-light shadow-sm text-sm focus:border-primary focus:ring-2 focus:ring-primary/50 outline-none font-mono"
                        value={defaultPrompts.development}
                        onChange={(e) => {
                          setDefaultPrompts({ ...defaultPrompts, development: e.target.value });
                          setIsDirty(true);
                        }}
                      />
                    </div>
                  </div>
                  <div className="p-4 bg-bg-medium/30 rounded-lg border border-border space-y-4">
                    <h4 className="text-sm font-bold text-text-primary uppercase tracking-wide">Phase 3: Executive Summary</h4>
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-1">Task 1: Summary Generation</label>
                      <p className="text-xs text-text-muted mb-2">Instructs AI to generate summary from phase 2 content.</p>
                      <textarea
                        rows={4}
                        className="w-full rounded-md border border-border p-3 bg-light shadow-sm text-sm focus:border-primary focus:ring-2 focus:ring-primary/50 outline-none font-mono"
                        value={defaultPrompts.summary}
                        onChange={(e) => {
                          setDefaultPrompts({ ...defaultPrompts, summary: e.target.value });
                          setIsDirty(true);
                        }}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-1">Task 2: Critique & Refine Prompt</label>
                      <p className="text-xs text-text-muted mb-2">Agent will check for conflicts and narrative flow.</p>
                      <textarea
                        rows={4}
                        className="w-full rounded-md border border-border p-3 bg-light shadow-sm text-sm focus:border-primary focus:ring-2 focus:ring-primary/50 outline-none font-mono"
                        value={defaultPrompts.summary_critique}
                        onChange={(e) => {
                          setDefaultPrompts({ ...defaultPrompts, summary_critique: e.target.value });
                          setIsDirty(true);
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* 'Ask AI' Prompt (Included in Prompts section for unified saving) */}
                {aiConfig.askAiEnabled && (
                  <div className="pt-6 border-t border-border">
                    <label className="block text-sm font-medium text-text-secondary mb-1">'Ask AI' System Prompt</label>
                    <p className="text-xs text-text-muted mb-2">Used when the user asks the AI to refine text.</p>
                    <textarea
                      rows={3}
                      className="w-full rounded-md border border-border p-3 bg-light shadow-sm text-sm focus:border-primary focus:ring-2 focus:ring-primary/50 outline-none"
                      value={defaultPrompts.askAiSystem}
                      onChange={(e) => {
                        setDefaultPrompts({ ...defaultPrompts, askAiSystem: e.target.value });
                        setIsDirty(true);
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* User Management Tab (A22-A24) */}
          {activeTab === 'user_management' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-text-primary">User Management</h3>
                <button
                  onClick={() => {
                    setEditingUserId(null);
                    setNewUser({ name: '', email: '', password: '', role: 'User' });
                    openModal('addUser')
                  }}
                  className="bg-primary text-white rounded-md text-sm font-semibold px-4 py-2 hover:bg-primary-hover flex items-center gap-2"
                >
                  + Add User
                </button>
              </div>
              {/* User Table (A22) */}
              <div className="overflow-x-auto border border-border rounded-lg bg-bg-light shadow-sm">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-bg-medium border-b border-border">
                      <th className="p-3 font-semibold text-text-secondary">User Name</th>
                      <th className="p-3 font-semibold text-text-secondary">User E-mail</th>
                      <th className="p-3 font-semibold text-text-secondary">User Role</th>
                      <th className="p-3 font-semibold text-text-secondary text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(user => (
                      <tr key={user.id}
                        className="border-b border-border hover:bg-bg-medium cursor-pointer"
                        onClick={() => {
                          setEditingUserId(user.id);
                          setNewUser({
                            name: user.name,
                            email: user.email,
                            role: user.role,
                            password: ''
                          });

                          openModal('editUser');
                        }}
                      >
                        <td className="p-3 font-medium text-text-primary">{user.name}</td>
                        <td className="p-3 font-medium text-text-secondary">{user.email}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${user.role === 'Admin' ? 'bg-blue-100 text-blue-800' :
                            user.role === 'Project Manager' ? 'bg-purple-100 text-purple-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                            {user.role}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteUser(user.id);
                            }}
                            className="text-xs text-error/80 hover:text-error"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* --- MODALS --- */}

      {/* Log Details Modal (A9) */}
      {/* Removed for simplicity */}

      {/* Export Logs Modal */}
      {modals.exportLogs && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-40" onClick={() => closeModal('exportLogs')}>
          <div className="w-full max-w-md bg-bg-light rounded-lg shadow-lg flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h3 className="text-xl font-semibold text-text-primary">Export Options</h3>
              <button className="text-text-muted hover:text-text-primary" onClick={() => closeModal('exportLogs')}>&times;</button>
            </div>
            <div className="p-6">
              <p className="text-sm text-text-secondary mb-4">
                Download the raw log data for auditing or external analysis.
                For model training, use the <strong>"Export Training Data"</strong> button on the main dashboard instead.
              </p>
              <div className="flex gap-4">
                <button className="flex-1 bg-white border border-border hover:bg-bg-medium text-text-primary font-medium py-2 rounded">
                  Download CSV
                </button>
                <button className="flex-1 bg-white border border-border hover:bg-bg-medium text-text-primary font-medium py-2 rounded">
                  Download JSON
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Dictionary Modal */}
      {modals.editDictionary && editingDictionary && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={() => handleCloseModal('editDictionary')}>
          <div className="w-full max-w-4xl bg-bg-light rounded-lg shadow-lg flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center p-6 border-b border-border">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold text-text-primary">
                  {editingDictionary.is_in_use ? 'View Dictionary' : 'Edit Dictionary'}
                </h3>
                {editingDictionary.is_in_use && (
                  <span className="px-2 py-0.5 text-xs font-medium bg-info/10 text-info rounded border border-info/20">
                    Read-Only (Active)
                  </span>
                )}
              </div>
              <button className="text-text-muted hover:text-text-primary" onClick={() => handleCloseModal('editDictionary')}>&times;</button>
            </div>

            <div className="p-6 space-y-4 flex-1 overflow-hidden flex flex-col">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Dictionary Name</label>
                <input
                  type="text"
                  className="w-full rounded-md border border-border px-3 py-2 disabled:bg-bg-medium disabled:text-text-muted"
                  value={editingDictionary.name}
                  disabled={editingDictionary.is_in_use}
                  onChange={(e) => {
                    setEditingDictionary({ ...editingDictionary, name: e.target.value });
                    setIsDirty(true);
                  }}
                />
              </div>
              <div className="flex-1 flex flex-col overflow-hidden">
                <label className="block text-sm font-medium text-text-secondary mb-1">Dictionary Content</label>
                <div className="flex-1 overflow-y-auto border border-border rounded-md bg-bg-light p-4">
                  {editingDictionary.is_in_use ? (
                    <DictionaryContentDisplay content={editingDictionary.content} />
                  ) : (
                    <DictionaryEditor
                      content={editingDictionary.content}
                      onChange={(newContent) => {
                        setEditingDictionary({ ...editingDictionary, content: newContent })
                        setIsDirty(true);
                      }}
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-border flex justify-end gap-3">
              <button className="bg-white text-text-secondary border border-border rounded-md px-4 py-2" onClick={() => handleCloseModal('editDictionary')}>
                {editingDictionary.is_in_use ? 'Close' : 'Cancel'}
              </button>

              {!editingDictionary.is_in_use && (
                <button
                  className="bg-primary text-white rounded-md px-4 py-2 disabled:opacity-50"
                  onClick={handleSaveDictionary}
                  disabled={isSavingDict}
                >
                  {isSavingDict ? 'Saving...' : 'Save Changes'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit User Modal */}
      {(modals.addUser || modals.editUser) && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-40">
          {/* Close on backdrop click */}
          <div className="fixed inset-0" onClick={() => { handleCloseModal('addUser'); handleCloseModal('editUser'); }}></div>

          <div className="w-full max-w-lg bg-bg-light rounded-lg shadow-lg relative z-50">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h3 className="text-xl font-semibold text-text-primary">
                {modals.addUser ? 'Add New User' : 'Edit User Details'}
              </h3>
              <button
                className="text-text-muted hover:text-text-primary"
                onClick={() => { handleCloseModal('addUser'); handleCloseModal('editUser'); }}
              >
                &times;
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Name Input */}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">User Name:</label>
                <input
                  type="text"
                  className="w-full rounded-md border border-border px-3 py-2 bg-bg-light shadow-sm text-sm"
                  value={newUser.name}
                  onChange={(e) => {
                    setNewUser({ ...newUser, name: e.target.value });
                    setIsDirty(true);
                  }}
                  placeholder="e.g. John Doe"
                />
              </div>

              {/* Email Input */}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">User Email:</label>
                <input
                  type="email"
                  className="w-full rounded-md border border-border px-3 py-2 bg-bg-light shadow-sm text-sm"
                  value={newUser.email}
                  onChange={(e) => {
                    setNewUser({ ...newUser, email: e.target.value });
                    setIsDirty(true);
                  }}
                  placeholder="john@company.com"
                />
              </div>

              {/* Password Input */}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Password:</label>
                <input
                  type="password"
                  className="w-full rounded-md border border-border px-3 py-2 bg-bg-light shadow-sm text-sm"
                  value={newUser.password}
                  onChange={(e) => {
                    setNewUser({ ...newUser, password: e.target.value });
                    setIsDirty(true);
                  }}
                  placeholder={modals.editUser ? 'Leave blank to keep current' : 'Enter password'}
                />
              </div>

              {/* Role Select */}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">User Role:</label>
                <select
                  className="w-full rounded-md border border-border px-3 py-2 bg-bg-light shadow-sm text-sm"
                  value={newUser.role}
                  onChange={(e) => {
                    setNewUser({ ...newUser, role: e.target.value });
                    setIsDirty(true);
                  }}
                >
                  <option value="User">User</option>
                  <option value="Project Manager">Project Manager</option>
                  <option value="Admin">Admin</option>
                </select>
              </div>
            </div>

            <div className="p-4 bg-bg-medium border-t border-border flex justify-end gap-3">
              <button
                className="bg-white text-text-secondary border border-border rounded-md text-sm font-semibold px-4 py-2 hover:bg-bg-medium"
                onClick={() => {
                  handleCloseModal('addUser');
                  handleCloseModal('editUser');
                }}
              >
                Cancel
              </button>

              {/* This button now calls handleAddUser */}
              <LoadingButton
                onClick={modals.addUser ? handleAddUser : handleEditUser}
                isLoading={isSavingUser}
                loadingText={modals.addUser ? 'Adding...' : 'Saving...'}
              >
                {modals.addUser ? 'Add User' : 'Save Changes'}
              </LoadingButton>
            </div>
          </div>
        </div>
      )}
      {/* Simulation Method Modal */}
      {modals.addSimMethod && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md bg-bg-light rounded-lg shadow-lg p-6">
            <h3 className="text-lg font-semibold text-text-primary">
              {isEditingMethod ? 'Edit Simulation Method' : 'Add New Simulation Method'}
            </h3>

            <div className="mt-4 space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Method Name</label>
                <input
                  type="text"
                  className="w-full rounded-md border border-border px-3 py-2 bg-light shadow-sm text-sm"
                  placeholder="e.g. Group Discussion"
                  value={methodForm.name}
                  onChange={(e) => {
                    setMethodForm({ ...methodForm, name: e.target.value });
                    setIsDirty(true);
                  }}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Description</label>
                <textarea
                  rows={3}
                  className="w-full rounded-md border border-border px-3 py-2 bg-light shadow-sm text-sm resize-none"
                  placeholder="What does this method measure?"
                  value={methodForm.description}
                  onChange={(e) => {
                    setMethodForm({ ...methodForm, description: e.target.value });
                    setIsDirty(true);
                  }}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                className="bg-white text-text-secondary border border-border rounded-md text-sm font-semibold px-4 py-2 hover:bg-bg-medium"
                onClick={() => handleCloseModal('addSimMethod')}
              >
                Cancel
              </button>
              <LoadingButton
                onClick={handleCreateMethod}
                isLoading={isSavingMethod}
                loadingText={isEditingMethod ? 'Saving...' : 'Adding...'}
              >
                {isEditingMethod ? 'Save Changes' : 'Add Method'}
              </LoadingButton>
            </div>
          </div>
        </div>
      )}
      {/* Modal: Select Method for Uploaded File */}
      {modals.selectSimMethod && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md bg-bg-light rounded-lg shadow-lg p-6">
            <h3 className="text-lg font-semibold text-text-primary">Link File to Method</h3>
            <p className="text-sm text-text-secondary mt-2">Which simulation method is <strong>{pendingFile?.name}</strong> for?</p>

            <div className="mt-4">
              <select
                className="w-full rounded-md border border-border px-3 py-2 bg-light shadow-sm text-sm"
                value={targetMethodId}
                onChange={(e) => setTargetMethodId(e.target.value)}
              >
                <option value="">Select a method...</option>
                {simMethods.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button className="bg-white text-text-secondary border border-border rounded-md text-sm font-semibold px-4 py-2 hover:bg-bg-medium" onClick={() => closeModal('selectSimMethod')}>Cancel</button>
              <LoadingButton
                onClick={confirmSimFileUpload}
                isLoading={isUploadingSimFile}
                loadingText="Uploading..."
                disabled={!targetMethodId}
              >
                Upload
              </LoadingButton>
            </div>
          </div>
        </div>
      )}

      {blocker.state === "blocked" && (
        <UnsavedChangesModal
          isOpen={true}
          onStay={() => blocker.reset()}
          onLeave={() => blocker.proceed()}
        />
      )}

      {showUnsavedModal && (
        <UnsavedChangesModal
          isOpen={true}
          onStay={handleStay}
          onLeave={handleLeave}
        />
      )}

      {/* Add Model Modal */}
      {modals['addModel' as keyof typeof modals] && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md bg-bg-light rounded-lg shadow-lg p-6">
            <h3 className="text-lg font-semibold text-text-primary mb-4">Add AI Model</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-text-muted uppercase mb-1">OpenRouter Model ID</label>
                <input
                  type="text"
                  className="w-full rounded-md border border-border px-3 py-2"
                  placeholder="e.g. google/gemini-flash-1.5"
                  value={newModelForm.id}
                  onChange={(e) => setNewModelForm({ ...newModelForm, id: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-text-muted uppercase mb-1">Context Window</label>
                <input
                  type="number"
                  className="w-full rounded-md border border-border px-3 py-2"
                  value={newModelForm.context_window}
                  onChange={(e) => setNewModelForm({ ...newModelForm, context_window: parseInt(e.target.value) })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-text-muted uppercase mb-1">Input Cost ($/1M)</label>
                  <input
                    type="number" step="0.01"
                    className="w-full rounded-md border border-border px-3 py-2"
                    value={newModelForm.input_cost}
                    onChange={(e) => setNewModelForm({ ...newModelForm, input_cost: parseFloat(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-text-muted uppercase mb-1">Output Cost ($/1M)</label>
                  <input
                    type="number" step="0.01"
                    className="w-full rounded-md border border-border px-3 py-2"
                    value={newModelForm.output_cost}
                    onChange={(e) => setNewModelForm({ ...newModelForm, output_cost: parseFloat(e.target.value) })}
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button className="px-4 py-2 text-sm font-medium text-text-secondary bg-white border border-border rounded-md hover:bg-bg-medium" onClick={() => closeModal('addModel' as any)}>Cancel</button>
              <LoadingButton onClick={handleAddModel} isLoading={isSavingMethod}>Add Model</LoadingButton>
            </div>
          </div>
        </div>
      )}

      {/* View Global Guide Modal */}
      {viewGuideModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={() => setViewGuideModal(false)}>
          <div className="w-full max-w-4xl bg-bg-light rounded-lg shadow-lg flex flex-col max-h-[85vh]" onClick={(e) => e.stopPropagation()}>

            <div className="flex justify-between items-center p-6 border-b border-border">
              <div>
                <h3 className="text-xl font-bold text-text-primary">Global Master Assessment Guide</h3>
                <p className="text-sm text-text-muted">This is the distilled context used by the AI for all projects.</p>
              </div>
              <button className="text-text-muted hover:text-text-primary p-2" onClick={() => setViewGuideModal(false)}>&times;</button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 bg-white">
              {isLoadingGuide ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
                </div>
              ) : (
                <div className="prose prose-sm max-w-none text-text-secondary font-mono whitespace-pre-wrap">
                  {globalGuideContent}
                </div>
              )}
            </div>

            <div className="p-4 bg-bg-light border-t border-border flex justify-end">
              <button className="bg-white text-text-secondary border border-border rounded-md px-4 py-2 hover:bg-bg-medium" onClick={() => setViewGuideModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ... TODO: (Other modals: deleteUserConfirm, promptHistory) ... */}

    </div>
  );
}