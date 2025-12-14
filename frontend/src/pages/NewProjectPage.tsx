// frontend/src/pages/NewProjectPage.tsx
import { useEffect, useState, useRef } from 'react';
import apiService from '../services/apiService';
import { useNavigate, useBlocker } from 'react-router-dom';
import { useProjectStore } from '../state/projectStore';
import DictionaryContentDisplay, { type DictionaryContent } from '../components/DictionaryContentDisplay';
import DragDropUploader from '../components/DragDropUploader';
import UnsavedChangesModal from '../components/UnsavedChangesModal';
import { useToastStore } from '../state/toastStore';

// Define the type for our tabs to make it safer
type SectionId = 
  | 'template' 
  | 'knowledge' 
  | 'dictionary' 
  | 'simulation' 
  | 'prompts' 
  | 'users';

// Define the dictionary type
interface CompetencyDictionary {
  id: string,
  name: string,
}

// Define the User type
interface User {
  id: string;
  email: string;
  name: string;
}

export default function NewProjectPage() {
  const navigate = useNavigate();
  // (P6) State to manage the active section/tab
  const [activeSection, setActiveSection] = useState<SectionId>('template');

  const addToast = useToastStore((state) => state.addToast);

  const [dictionaryContent, setDictionaryContent] = useState<DictionaryContent | null>(null);
  const [isDictLoading, setIsDictLoading] = useState(false);

  const [isDirty, setIsDirty] = useState(false);
  const isSubmitted = useRef(false);

  // State for all modals on this page
  const [modals, setModals] = useState({
    cancel: false,
    dictionary: false,
    addSimMethod: false,
  });

  const fetchProjects = useProjectStore((state) => state.fetchProjects);

  // --- State for interactive dropdowns ---
  const [isDictionaryOpen, setIsDictionaryOpen] = useState(false);

  // --- State for Simulation Methods (NP-4.5) ---
  const [availableSimFiles, setAvailableSimFiles] = useState<{id: string, file_name: string, method_name: string}[]>([]);
  const [selectedSimFileIds, setSelectedSimFileIds] = useState<Set<string>>(new Set());

  // --- State for form data ---
  const [projectName, setProjectName] = useState('');
  
  // --- State for file uploads ---
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [kbFiles, setKbFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const [dictionaries, setDictionaries] = useState<CompetencyDictionary[]>([]);
  const [selectedDictionary, setSelectedDictionary] = useState<CompetencyDictionary | null>(null);

  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());

  const [prompts, setPrompts] = useState({
    general_context: '',
    persona_prompt: '[Default persona prompt...]',

    // Phase 1 Prompt
    evidence_prompt: '[Default evidence prompt...]',
    
    // Phase 2 Prompts
    kb_fulfillment_prompt: '',
    competency_level_prompt: '',
    development_prompt: '',
    
    // Phase 3 Prompts
    summary_prompt: '[Default summary prompt...]',
    summary_critique_prompt: '',
  });

  const [dictionarySearch, setDictionarySearch] = useState('');
  const [isSimOpen, setIsSimOpen] = useState(false);
  const [simSearch, setSimSearch] = useState('');
  const [isUserOpen, setIsUserOpen] = useState(false);
  const [userSearch, setUserSearch] = useState('');

  // (P12) State for the prompt toggles
  const [competencyAnalysis, setCompetencyAnalysis] = useState(true);
  const [executiveSummary, setExecutiveSummary] = useState(true);

  const [templatePlaceholders, setTemplatePlaceholders] = useState<string[]>([]);
  const [templateWarnings, setTemplateWarnings] = useState<string[]>([]);
  const [templateErrors, setTemplateErrors] = useState<string[]>([]);

  // Fetch dictionary content when modal opens
  useEffect(() => {
    if (modals.dictionary && selectedDictionary) {
      const fetchDict = async () => {
        setIsDictLoading(true);
        try {
          // We reuse the endpoint we created earlier
          const response = await apiService.get(`/projects/dictionary/${selectedDictionary.id}/content`);
          setDictionaryContent(response.data);
        } catch (error) {
          console.error("Failed to load dictionary:", error);
          addToast('Failed to load dictionary content.', 'error');
        } finally {
          setIsDictLoading(false);
        }
      };
      fetchDict();
    }
  }, [modals.dictionary, selectedDictionary]);

  // --- Fetch dictionaries AND methods on page load ---
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        // Fetch Dictionaries
        const dictResponse = await apiService.get('/projects/available-dictionaries');
        setDictionaries(dictResponse.data);
        if (dictResponse.data.length > 0) {
          setSelectedDictionary(dictResponse.data[0]);
        }

        // Fetch Simulation Methods
        const simResponse = await apiService.get('/projects/available-simulation-files');
        setAvailableSimFiles(simResponse.data);

        // Fetch users
        const userResponse = await apiService.get('/projects/available-users');
        setUsers(userResponse.data);

      } catch (error) {
        console.error("Failed to fetch initial data:", error);
        addToast('Error: Could not load project data.', 'error');
      }
    };
    fetchInitialData();
  }, []); // The empty array [] means this runs once on load

  // Fetch Default Prompts
  useEffect(() => {
    const fetchDefaults = async () => {
      try {
        const response = await apiService.get('/projects/defaults/prompts');
        const defaults = response.data;
        
        if (defaults && Object.keys(defaults).length > 0) {
            setPrompts(prev => ({
                ...prev,
                persona_prompt: defaults.persona || prev.persona_prompt,
                evidence_prompt: defaults.evidence || prev.evidence_prompt,
                
                // Map the JSON keys (kb_fulfillment) to State keys (kb_fulfillment_prompt)
                kb_fulfillment_prompt: defaults.kb_fulfillment || prev.kb_fulfillment_prompt,
                competency_level_prompt: defaults.competency_level || prev.competency_level_prompt,
                development_prompt: defaults.development || prev.development_prompt,
                
                summary_prompt: defaults.summary || prev.summary_prompt,
                summary_critique_prompt: defaults.summary_critique || prev.summary_critique_prompt,
            }));
        }
      } catch (error) { 
        console.error("Failed to load default prompts"); 
      }
    };
    fetchDefaults();
  }, []);

  // Helper to manage modals
  const openModal = (modal: keyof typeof modals) => setModals(prev => ({ ...prev, [modal]: true }));
  const closeModal = (modal: keyof typeof modals) => setModals(prev => ({ ...prev, [modal]: false }));

  useEffect(() => {
    // If any key field has data, mark as dirty
    if (projectName || templateFile || kbFiles.length > 0 || selectedDictionary) {
      setIsDirty(true);
    } else {
      setIsDirty(false);
    }
  }, [projectName, templateFile, kbFiles, selectedDictionary]);

  // Helper to change section
  const handleSectionChange = (section: SectionId) => {
    setActiveSection(section);
  };

  // (P12) Handle dependency between toggles
  const handleCompetencyToggle = () => {
    const newValue = !competencyAnalysis;
    setCompetencyAnalysis(newValue);
    if (newValue === false) {
      setExecutiveSummary(false);
    }
  };

  const handleSummaryToggle = () => {
    if (competencyAnalysis) {
      setExecutiveSummary(!executiveSummary);
    }
  };

  const handleCreateProject = async () => {
    if (!projectName) {
      addToast('Please enter a project title.', 'info');
      return;
    }

    // (NP-4.8) Check for required files
    if (!templateFile) {
      addToast('Please upload a Report Template.', 'info');
      setActiveSection('template');
      return;
    }

    // Check for dictionary
    if (!selectedDictionary) {
      addToast('Please select a Competency Dictionary.', 'info');
      setActiveSection('dictionary');
      return;
    }

    setIsUploading(true);

    try {
        const payload = {
            name: projectName,
            dictionaryId: selectedDictionary?.id,
            userIds: Array.from(selectedUserIds),
            prompts: prompts,
            simulationFileIds: Array.from(selectedSimFileIds),
            enableAnalysis: competencyAnalysis,
            enableSummary: executiveSummary
        };

        // (FR-PROJ-001) Call the endpoint to create the project record
        const response = await apiService.post('/projects', payload);
        const { projectId } = response.data;

        console.log('Project created with ID:', projectId);

        // (NP-4.2) Upload Report Template
        console.log('Uploading template...');
        const templateFormData = new FormData();
        templateFormData.append('file', templateFile);
        templateFormData.append('fileType', 'template');
        await apiService.post(`/projects/${projectId}/upload`, templateFormData, {
          headers: { 'Content-Type': 'multipart/form-data'},
        });

        // (NP-4.3) Upload Knowledge Base Files
        if (kbFiles.length > 0) {
          console.log(`Uploading ${kbFiles.length} KB files...`);
          for (const file of kbFiles) {
            const kbFormData = new FormData();
            kbFormData.append('file', file);
            kbFormData.append('fileType', 'knowledgeBase');
            await apiService.post(`/projects/${projectId}/upload`, kbFormData, {
              headers: { 'Content-Type': 'multipart/form-data' },
            });
          }

          // Trigger context initialization
          // Only needed if KB files were uploaded
          addToast("Initializing AI Context...", 'info');
          await apiService.post(`/projects/${projectId}/initialize-context`);
        }

        setIsUploading(false);
        addToast('Project created successfully!', 'success');

        await fetchProjects();

        isSubmitted.current = true;

        setIsDirty(false);

        // (P14) Redirect to the new project's report dashboard
        navigate(`/projects/${projectId}`);

    } catch (error: any) {
        console.error("Failed to create project:", error);
        const errorMessage = error.response?.data?.message || 'Error: Could not create project.';
        addToast(errorMessage, 'error');
    }
  };
  
  // Helper component for the navigation buttons
  const NavButton = ({ id, title }: { id: SectionId, title: string }) => (
    <button
      onClick={() => handleSectionChange(id)}
      className={`section-nav-btn text-sm py-3 px-4 border-b-2 ${
        activeSection === id
          ? 'border-primary text-primary font-semibold'
          : 'border-transparent text-text-muted font-medium hover:text-text-primary'
      }`}
    >
      {title}
    </button>
  );

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      !isSubmitted.current && isDirty && currentLocation.pathname !== nextLocation.pathname
  );

  const analyzeTemplate = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await apiService.post('/projects/analyze-template', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
      });

      const foundPlaceholders: string[] = response.data.placeholders;
      const invalidPh: string[] = response.data.invalidPlaceholders || [];

      setTemplatePlaceholders(foundPlaceholders);
      setTemplateErrors(invalidPh);

      // Check for duplicates
      const counts: Record<string, number> = {};
      const duplicates: string[] = [];

      foundPlaceholders.forEach(p => {
          counts[p] = (counts[p] || 0) + 1;
          if (counts[p] === 2) duplicates.push(p);
      });
      setTemplateWarnings(duplicates);
      
      if (invalidPh.length > 0) {
        addToast(`Found ${invalidPh.length} invalid placeholder(s). Please fix the template.`, 'error');
      } else if (duplicates.length > 0) {
        addToast(`Warning: Duplicate placeholders found.`, 'error');
      } else {
        addToast(`Template analyzed. ${foundPlaceholders.length} placeholders found.`, 'success');
      }

    } catch (error) {
      console.error(error);
      addToast("Failed to analyze template.", 'error');
    }
  };

return (
    <>
      <main className="flex-1 h-screen overflow-y-auto bg-bg-medium">
        {/* Page Header (P7, P14, P15) */}
        <div className="sticky top-0 bg-bg-medium/80 backdrop-blur-sm z-10">
          <div className="flex justify-between items-center p-8 pb-4">
            {/* Project Title (P7) */}
            <input 
              type="text" 
              placeholder="Enter Project Title" 
              className="text-3xl font-bold text-text-primary bg-transparent border-none p-0 focus:ring-0 w-1/2" 
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
            />

            {/* Action Buttons (P14, P15) */}
            <div className="flex items-center gap-3">
              <button 
                onClick={() => openModal('cancel')}
                className="bg-white text-text-secondary border border-border rounded-md text-sm font-semibold px-4 py-2 hover:bg-bg-medium transition-colors"
              >
                Cancel
              </button>
              {/* (FIXED) This button is now wired up to the handleCreateProject function and enabled when projectName is not empty */}
              <button 
                id="create-project-btn" 
                className={`bg-primary text-white rounded-md text-sm font-semibold px-4 py-2 transition-colors ${
                  (!projectName || !selectedDictionary || isUploading) ? 'opacity-50 cursor-not-allowed' : 'hover:bg-primary-hover'
                }`}
                disabled={!projectName}
                onClick={handleCreateProject}
              >
                {isUploading ? 'Creating...' : 'Create Project'}
              </button>
            </div>
          </div>

          {/* Section Navigation (P6) */}
          <nav className="flex items-center border-b border-border px-8" id="section-nav">
            <NavButton id="template" title="Report Template" />
            <NavButton id="knowledge" title="Knowledge Base" />
            <NavButton id="dictionary" title="Competency Dictionary" />
            <NavButton id="simulation" title="Simulation Methods" />
            <NavButton id="prompts" title="Prompt Settings" />
            <NavButton id="users" title="Users List" />
          </nav>
        </div>

        {/* Page Content */}
        <div className="p-8">

          {/* Section 1: Report Template (P8) */}
          {activeSection === 'template' && (
            <section id="section-template" className="max-w-3xl mx-auto space-y-6">
              <h2 className="text-xl font-semibold text-text-primary">1. Report Template</h2>

              {/* Hidden file input for template */}
              <input
                type="file"
                id="template-file-input"
                className="hidden"
                accept=".docx"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    setTemplateFile(e.target.files[0]);
                  }
                }}
              />

              {/* Uploader UI */}
                <DragDropUploader
                  onUpload={(files) => {
                    const file = files[0];
                    setTemplateFile(files[0]);
                    analyzeTemplate(file);
                  }}
                  acceptedTypes=".docx"
                  subLabel=".docx format only"
                  label={templateFile ? `Selected: ${templateFile.name}` : "Click to upload or drag and drop"}
                />
              {/* Results Area */}
              {templatePlaceholders.length > 0 && (
                <div className="bg-bg-light rounded-lg border border-border p-4 space-y-3 animate-fade-in">
                  <h3 className="text-base font-semibold text-text-primary">Found Placeholders ({templatePlaceholders.length})</h3>

                  {templateErrors.length > 0 && (
                    <div className="p-3 bg-error/10 text-error border border-error/20 rounded text-sm mb-2">
                      <strong>Invalid Format (Must fix):</strong>
                      <p className="mt-1 text-xs">
                        Allowed: {'{overall_strength}'}, {'{[Competency]_level}'}, {'{[Competency]_1_1_fulfillment}'}, {'{[Competency]_[target_level]_1_fulfillment}'}, etc.
                      </p>
                      <ul className="list-disc list-inside mt-2">
                        {templateErrors.map((err, i) => <li key={i}>{`{${err}}`}</li>)}
                      </ul>
                    </div>
                  )}

                  {templateWarnings.length > 0 && (
                    <div className="p-3 bg-warning/10 text-warning border border-warning/20 rounded text-sm mb-2">
                      <strong>Duplicate Fields:</strong> {templateWarnings.join(', ')}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {templatePlaceholders.map((ph, idx) => {
                      let style = 'bg-bg-medium text-text-secondary border-border';

                      if (templateErrors.includes(ph)) {
                        style = 'bg-error/10 text-error border-error/30';
                      } else if (templateWarnings.includes(ph)) {
                        style = 'bg-warning/10 text-warning-dark border-warning/30';
                      }

                      return (
                        <span key={idx} className={`px-2 py-1 text-xs font-mono rounded border ${style}`}>
                          {`{${ph}}`}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Section 2: Knowledge Base (P9) */}
          {activeSection === 'knowledge' && (
            <section id="section-knowledge" className="max-w-3xl mx-auto space-y-6">
              <h2 className="text-xl font-semibold text-text-primary">2. Knowledge Base</h2>

              {/* Hidden file input for KB */}
              <input
                type="file"
                id="kb-file-input"
                className="hidden"
                accept=".pdf,.docx,.txt"
                multiple
                onChange={(e) => {
                  if (e.target.files) {
                    setKbFiles(Array.from(e.target.files));
                  }
                }}
              />
              {/* Uploader UI */}
              <DragDropUploader 
                onUpload={(files) => setKbFiles(Array.from(files))}
                acceptedTypes=".pdf,.docx,.txt"
                multiple={true}
                subLabel=".pdf, .docx, .txt"
              />

              {/* --- NEW: Show list of selected files --- */}
              {kbFiles.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-base font-semibold text-text-primary">Uploaded Files ({kbFiles.length})</h3>
                  <ul className="list-disc list-inside space-y-1">
                    {kbFiles.map((file, index) => (
                      <li key={index} className="text-sm text-text-secondary">{file.name}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}
          
          {/* Section 3: Competency Dictionary (P10) */}
          {activeSection === 'dictionary' && (
            <section id="section-dictionary" className="max-w-3xl mx-auto space-y-6">
              <h2 className="text-xl font-semibold text-text-primary">3. Competency Dictionary</h2>
              <p className="text-sm">Select the competency dictionary to be used for this project. This is managed by the Admin.</p>

              {/* Custom Select w/ Search (P10) */}
              <div 
                className="relative"
                onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setIsDictionaryOpen(false); }}
                tabIndex={0} // Makes the div focusable for onBlur
              >
                <button 
                  onClick={() => setIsDictionaryOpen(!isDictionaryOpen)}
                  className="w-full rounded-md border border-border px-3 py-2 bg-bg-light shadow-sm text-sm text-left flex justify-between items-center"
                >
                  <span>{selectedDictionary?.name || 'Select a dictionary...'}</span>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`text-text-muted transition-transform ${isDictionaryOpen ? 'rotate-180' : ''}`}><path d="m6 9 6 6 6-6"/></svg>
                </button>

                {/* Dropdown */}
                {isDictionaryOpen && (
                  <div className="absolute top-full mt-1 w-full bg-bg-light border border-border rounded-md shadow-lg z-20">
                    {/* Search Bar (P10) */}
                    <div className="p-2 border-b border-border">
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                        </div>
                        <input 
                          type="text" 
                          placeholder="Search dictionaries..." 
                          className="w-full rounded-md border border-border pl-9 pr-3 py-2 bg-bg-light shadow-sm text-sm focus:border-primary focus:ring-2 focus:ring-primary/50 outline-none"
                          value={dictionarySearch}
                          onChange={(e) => setDictionarySearch(e.target.value)}
                        />
                      </div>
                    </div>
                    {/* Options (Wired to state) */}
                    <ul className="max-h-60 overflow-y-auto p-2 text-sm">
                      {dictionaries
                        .filter(d => d.name.toLowerCase().includes(dictionarySearch.toLowerCase()))
                        .map(dict => (
                          <li 
                            key={dict.id} 
                            onClick={() => { setSelectedDictionary(dict); setIsDictionaryOpen(false); }} 
                            className="p-2 rounded-md hover:bg-bg-medium cursor-pointer"
                          >
                            {dict.name}
                          </li>
                        ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Selected Dictionary View */}
              {selectedDictionary?.id && (
                <div className="bg-bg-light rounded-lg border border-border p-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm font-medium text-text-primary">{selectedDictionary.name}</p>
                    </div>
                    <button 
                      onClick={() => openModal('dictionary')}
                      className="bg-white text-text-secondary border border-border rounded-md text-sm font-semibold px-4 py-2 hover:bg-bg-medium transition-colors"
                    >
                      View Content
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Section 4: Simulation Methods (P11) */}
          {activeSection === 'simulation' && (
            <section id="section-simulation" className="max-w-3xl mx-auto space-y-6">
              <h2 className="text-xl font-semibold text-text-primary">4. Simulation Methods</h2>

              {/* Multi-select (P11) */}
              <div 
                className="relative"
                onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setIsSimOpen(false); }}
                tabIndex={0}
              >
                <label className="text-sm font-medium mb-1 block">Select methods used in this project</label>
                <button 
                  onClick={() => setIsSimOpen(!isSimOpen)}
                  className="w-full rounded-md border border-border px-3 py-2 bg-bg-light shadow-sm text-sm text-left flex justify-between items-center"
                >
                  <span>
                    {selectedSimFileIds.size === 0
                      ? 'Select files...'
                      : `${selectedSimFileIds.size} file(s) selected`}
                  </span>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`text-text-muted transition-transform ${isSimOpen ? 'rotate-180' : ''}`}><path d="m6 9 6 6 6-6"/></svg>
                </button>

                {/* Dropdown (Mocked) */}
                {isSimOpen && (
                  <div className="absolute top-full mt-1 w-full bg-bg-light border border-border rounded-md shadow-lg z-20">
                    {/* Search Bar (P11) */}
                    <div className="p-2 border-b border-border">
                      <input 
                        type="text" 
                        placeholder="Search methods..." 
                        className="w-full rounded-md border border-border px-3 py-2 bg-bg-light shadow-sm text-sm focus:border-primary focus:ring-2 focus:ring-primary/50 outline-none"
                        value={simSearch}
                        onChange={(e) => setSimSearch(e.target.value)}
                      />
                    </div>
                    {/* Options (Mocked) */}
                    <ul className="max-h-60 overflow-y-auto p-2 text-sm space-y-1">
                      {availableSimFiles
                        .filter(f => f.file_name.toLowerCase().includes(simSearch.toLowerCase()) || f.method_name.toLowerCase().includes(simSearch.toLowerCase()))
                        .map(file => (
                          <li key={file.id}>
                            <label className="flex items-center gap-2 p-2 rounded-md hover:bg-bg-medium cursor-pointer">
                              <input
                                type="checkbox"
                                className="w-4 h-4 rounded-sm border-border accent-primary"
                                checked={selectedSimFileIds.has(file.id)}
                                onChange={() => {
                                  const newSet = new Set(selectedSimFileIds);
                                  if (newSet.has(file.id)) {
                                    newSet.delete(file.id);
                                  } else {
                                    newSet.add(file.id);
                                  }
                                  setSelectedSimFileIds(newSet);
                                }}
                              />
                              <div>
                                <span className="block font-medium text-text-primary">{file.file_name}</span>
                                <span className="block text-xs text-text-muted">Method: {file.method_name}</span>
                              </div>
                            </label>
                          </li>
                        ))
                      }
                      {availableSimFiles.length === 0 && (
                        <li className="p-2 text-text-muted italic">No simulation files available. Please contact Admin.</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Section 5: Prompt Settings (P12) */}
          {activeSection === 'prompts' && (
            <section className="max-w-3xl mx-auto space-y-6">
              <h2 className="text-xl font-semibold text-text-primary">5. Prompt Settings</h2>
              
              <div className="space-y-6">
                <div>
                  <label className="text-sm font-medium mb-1 block">General Context</label>
                  <textarea 
                    rows={3} 
                    placeholder="Enter general context for this project..." 
                    className="w-full rounded-md border border-border p-3 bg-bg-light shadow-sm text-sm focus:border-primary outline-none font-mono" 
                    value={prompts.general_context} 
                    onChange={(e) => setPrompts(p => ({...p, general_context: e.target.value}))} 
                    />
                </div>
                <div>
                  <label className="text-sm font-semibold text-text-secondary mb-1 block">Persona (System Prompt)</label>
                  <textarea
                   rows={5} 
                   className="w-full rounded-md border border-border p-3 bg-bg-light shadow-sm text-sm focus:border-primary outline-none font-mono" 
                   value={prompts.persona_prompt} 
                   onChange={(e) => setPrompts(p => ({...p, persona_prompt: e.target.value}))} 
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-text-secondary mb-1 block">Phase 1: Evidence Collection</label>
                  <textarea
                   rows={5} 
                   className="w-full rounded-md border border-border p-3 bg-bg-light shadow-sm text-sm focus:border-primary outline-none font-mono" 
                   value={prompts.evidence_prompt} 
                   onChange={(e) => setPrompts(p => ({...p, evidence_prompt: e.target.value}))} 
                  />
                </div>

                {/* PHASE 2 PROMPTS */}
                <div className="p-4 bg-bg-medium/30 rounded-lg border border-border space-y-4">
                    <div className="flex justify-between items-center">
                        <label className="text-sm font-bold text-text-primary uppercase tracking-wide">Phase 2: Competency Analysis</label>
                        <button
                         type="button" 
                         onClick={handleCompetencyToggle}
                         className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors ${competencyAnalysis ? 'bg-primary' : 'bg-gray-200'}`}
                        >
                          <span className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform ${competencyAnalysis ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                    </div>
                    {competencyAnalysis && (
                        <>
                            <div>
                                <label className="text-sm font-semibold text-text-secondary mb-1 block">Task 1: KB Fulfillment Check</label>
                                <textarea
                                  rows={6} 
                                  className="w-full rounded-md border border-border p-3 bg-bg-light shadow-sm text-sm focus:border-primary outline-none font-mono" 
                                  value={prompts.kb_fulfillment_prompt} 
                                  onChange={(e) => setPrompts(p => ({...p, kb_fulfillment_prompt: e.target.value}))} 
                                />
                            </div>
                            <div>
                                <label className="text-sm font-semibold text-text-secondary mb-1 block">Task 2: Level Assignment & Narrative</label>
                                <textarea
                                  rows={6} 
                                  className="w-full rounded-md border border-border p-3 bg-bg-light shadow-sm text-sm focus:border-primary outline-none font-mono" 
                                  value={prompts.competency_level_prompt} onChange={(e) => setPrompts(p => ({...p, competency_level_prompt: e.target.value}))} 
                                />
                            </div>
                            <div>
                                <label className="text-sm font-semibold text-text-secondary mb-1 block">Task 3: Development Recommendations</label>
                                <textarea
                                  rows={6} 
                                  className="w-full rounded-md border border-border p-3 bg-bg-light shadow-sm text-sm focus:border-primary outline-none font-mono" 
                                  value={prompts.development_prompt} 
                                  onChange={(e) => setPrompts(p => ({...p, development_prompt: e.target.value}))} 
                                />
                            </div>
                        </>
                    )}
                </div>

                {/* PHASE 3 PROMPTS */}
                <div className="p-4 bg-bg-medium/30 rounded-lg border border-border space-y-4">
                    <div className="flex justify-between items-center">
                      <label className={`text-sm font-bold text-text-primary uppercase tracking-wide ${!competencyAnalysis ? 'text-text-muted' : ''}`}>Phase 3: Executive Summary</label>
                      <button
                        type="button" 
                        onClick={handleSummaryToggle}
                        className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors ${competencyAnalysis && executiveSummary ? 'bg-primary' : 'bg-gray-200'} ${!competencyAnalysis ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`} 
                        disabled={!competencyAnalysis}
                      >
                        <span className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform ${competencyAnalysis && executiveSummary ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </div>
                    {executiveSummary && (
                      <>
                        <div>
                          <label className="text-sm font-semibold text-text-secondary mb-1 block">Task 1: Summary Generation</label>
                          <textarea 
                            rows={5} 
                            className={`w-full rounded-md border border-border p-3 bg-bg-light shadow-sm text-sm focus:border-primary outline-none font-mono ${!competencyAnalysis ? 'opacity-50 bg-bg-medium' : ''}`}
                            disabled={!competencyAnalysis} 
                            value={prompts.summary_prompt} 
                            onChange={(e) => setPrompts(p => ({...p, summary_prompt: e.target.value}))}
                          />
                        </div>
                        <div>
                          <label className="text-sm font-semibold text-text-secondary block">Task 2: Critique & Refine Prompt</label>
                          <p className="text-xs text-text-muted mb-1">Agent will check for conflicts and narrative flow.</p>
                          <textarea 
                            rows={4}
                            className={`w-full rounded-md border border-border p-3 bg-bg-light shadow-sm text-sm focus:border-primary outline-none font-mono ${!competencyAnalysis ? 'opacity-50 bg-bg-medium' : ''}`}
                            disabled={!competencyAnalysis}
                            value={prompts.summary_critique_prompt}
                            onChange={(e) => setPrompts(p => ({...p, summary_critique_prompt: e.target.value}))}
                          />
                        </div>
                      </>
                    )}
                </div>

              </div>
            </section>
          )}

          {/* Section 6: Users List (P13) */}
          {activeSection === 'users' && (
            <section id="section-users" className="max-w-3xl mx-auto space-y-6">
              <h2 className="text-xl font-semibold text-text-primary">6. Users List</h2>
              <p className="text-sm">Invite users who can create reports for this project.</p>

              {/* Custom Multi-Select w/ Search (P13) */}
              <div 
                className="relative"
                onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setIsUserOpen(false); }}
                tabIndex={0}
              >
                <button 
                  onClick={() => setIsUserOpen(!isUserOpen)}
                  className="w-full rounded-md border border-border px-3 py-2 bg-bg-light shadow-sm text-sm text-left flex justify-between items-center"
                >
                  <span>Select users to invite...</span>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`text-text-muted transition-transform ${isUserOpen ? 'rotate-180' : ''}`}><path d="m6 9 6 6 6-6"/></svg>
                </button>
                {/* Dropdown (Mocked) */}
                {isUserOpen && (
                  <div className="absolute top-full mt-1 w-full bg-bg-light border border-border rounded-md shadow-lg z-20">
                    {/* Search Bar (P13) */}
                    <div className="p-2 border-b border-border">
                      <input 
                        type="text" 
                        placeholder="Search by name or email..." 
                        className="w-full rounded-md border border-border px-3 py-2 bg-bg-light shadow-sm text-sm focus:border-primary focus:ring-2 focus:ring-primary/50 outline-none"
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                      />
                    </div>
                    {/* Options (Wired to state) */}
                    <ul className="max-h-60 overflow-y-auto p-2 text-sm space-y-1">
                      {users
                        .filter(u => u.email.toLowerCase().includes(userSearch.toLowerCase()) || u.name?.toLowerCase().includes(userSearch.toLowerCase()))
                        .map(user => (
                        <li key={user.id}>
                          <label className="flex items-center gap-3 p-2 rounded-md hover:bg-bg-medium cursor-pointer transition-colors">
                            <input 
                              type="checkbox" 
                              className="w-4 h-4 rounded-sm border-border accent-primary"
                              checked={selectedUserIds.has(user.id)}
                              onChange={() => {
                                const newSet = new Set(selectedUserIds);
                                if (newSet.has(user.id)) newSet.delete(user.id);
                                else newSet.add(user.id);
                                setSelectedUserIds(newSet);
                              }}
                            /> 
                            <div className="flex flex-col">
                              <span className="font-medium text-text-primary">{user.name || 'Unknown'}</span>
                              <span className="text-xs text-text-muted">{user.email}</span>
                            </div>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Invited Users List (P13) */}
              <div className="space-y-3">
                <h3 className="text-base font-semibold text-text-primary">Invited Users ({selectedUserIds.size})</h3>
                {Array.from(selectedUserIds).map(id => {
                  const user = users.find(u => u.id === id);
                  return (
                    <div key={id} className="flex justify-between items-center p-3 border border-border rounded-md bg-bg-light shadow-sm">
                      <span className="text-sm font-medium text-text-primary">{user?.email}</span>
                      <button className="text-xs text-error/80 hover:text-error" onClick={() => {
                        const newSet = new Set(selectedUserIds);
                        newSet.delete(id);
                        setSelectedUserIds(newSet);
                      }}>Remove</button>
                    </div>
                  );
                })}
                {selectedUserIds.size === 0 && (
                  <p className="text-sm text-text-muted">No users selected yet.</p>
                )}
              </div>
            </section>
          )}
        </div>
      </main>

      {/* --- MODALS --- */}

      {/* Cancel Confirmation Modal (P15) */}
      {modals.cancel && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md bg-bg-light rounded-lg shadow-lg p-6">
            <h3 className="text-lg font-semibold text-text-primary">Are you sure?</h3>
            <p className="text-sm text-text-secondary mt-2">Any unsaved changes will be lost.</p>
            <div className="flex justify-end gap-3 mt-6">
              <button className="bg-white text-text-secondary border border-border rounded-md text-sm font-semibold px-4 py-2 hover:bg-bg-medium" onClick={() => closeModal('cancel')}>No</button>
              <button className="bg-primary text-white rounded-md text-sm font-semibold px-4 py-2 hover:bg-primary-hover" onClick={() => { closeModal('cancel'); navigate('/projects'); }}>Yes</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Simulation Method Modal (P11) */}
      {modals.addSimMethod && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md bg-bg-light rounded-lg shadow-lg p-6">
            <h3 className="text-lg font-semibold text-text-primary">Add New Simulation Method</h3>
            <div className="mt-4">
              <label className="text-sm font-medium mb-1 block">Method Name</label>
              <input type="text" placeholder="e.g., Fishbowl Discussion" className="w-full rounded-md border border-border px-3 py-2 bg-light shadow-sm text-sm" />
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button className="bg-white text-text-secondary border border-border rounded-md text-sm font-semibold px-4 py-2 hover:bg-bg-medium" onClick={() => closeModal('addSimMethod')}>Cancel</button>
              <button className="bg-primary text-white rounded-md text-sm font-semibold px-4 py-2 hover:bg-primary-hover" onClick={() => closeModal('addSimMethod')}>Add Method</button>
            </div>
          </div>
        </div>
      )}

      {/* View Dictionary Modal (P10) */}
      {modals.dictionary && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={() => closeModal('dictionary')}>
          <div className="w-full max-w-5xl bg-bg-light rounded-lg shadow-xl flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>

            {/* Header */}
            <div className="flex justify-between items-center p-6 border-b border-border bg-bg-light rounded-t-lg">
              <div>
                <h3 className="text-xl font-bold text-text-primary">{selectedDictionary?.name || 'Competency Dictionary'}</h3>
                <p className="text-sm text-text-muted mt-1">Previewing dictionary content</p>
              </div>
              <button className="text-text-muted hover:text-text-primary p-2" onClick={() => closeModal('dictionary')}>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 bg-bg-medium/30">
              {isDictLoading ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
                </div>
              ) : (
                <DictionaryContentDisplay content={dictionaryContent} />
              )}
            </div>

            {/* Footer */}
            <div className="p-4 bg-bg-light border-t border-border flex justify-end rounded-b-lg">
              <button 
                className="bg-white text-text-secondary border border-border rounded-md text-sm font-semibold px-4 py-2 hover:bg-bg-medium transition-colors" 
                onClick={() => closeModal('dictionary')}
              >
                Close Preview
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
    </>
  );
}