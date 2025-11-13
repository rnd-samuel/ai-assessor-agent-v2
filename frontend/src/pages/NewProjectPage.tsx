// frontend/src/pages/NewProjectPage.tsx
import { useEffect, useState } from 'react';
import apiService from '../services/apiService';
import { useNavigate } from 'react-router-dom';

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

export default function NewProjectPage() {
  const navigate = useNavigate();
  // (P6) State to manage the active section/tab
  const [activeSection, setActiveSection] = useState<SectionId>('template');

  // State for all modals on this page
  const [modals, setModals] = useState({
    cancel: false,
    dictionary: false,
    addSimMethod: false,
  });

  // --- State for interactive dropdowns ---
  const [isDictionaryOpen, setIsDictionaryOpen] = useState(false);

  // --- State for form data ---
  const [projectName, setProjectName] = useState('');
  
  // --- State for file uploads ---
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [kbFiles, setKbFiles] = useState<File[]>([]);
  const [simFiles, setSimFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const [dictionaries, setDictionaries] = useState<CompetencyDictionary[]>([]);
  const [selectedDictionary, setSelectedDictionary] = useState<CompetencyDictionary | null>(null);

  const users = [
    { id: 'u1', email: 'alice.johnson@example.com' },
    { id: 'u2', email: 'bob.smith@example.com' }
  ];
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());

  const [prompts, setPrompts] = useState({
    general_context: '',
    persona_prompt: '[Default persona prompt...]',
    evidence_prompt: '[Default evidence prompt...]',
    analysis_prompt: '[Default analysis prompt...]',
    summary_prompt: '[Default summary prompt...]'
  });

  const [dictionarySearch, setDictionarySearch] = useState('');
  const [isSimOpen, setIsSimOpen] = useState(false);
  const [simSearch, setSimSearch] = useState('');
  const [isUserOpen, setIsUserOpen] = useState(false);
  const [userSearch, setUserSearch] = useState('');

  // (P12) State for the prompt toggles
  const [competencyAnalysis, setCompetencyAnalysis] = useState(true);
  const [executiveSummary, setExecutiveSummary] = useState(true);

  useEffect (() => {
    const fetchDictionaries = async () => {
      try {
        const response = await apiService.get('/projects/available-dictionaries');
        setDictionaries(response.data);
        // Set the first dictionary as the default
        if (response.data.length > 0) {
          setSelectedDictionary(response.data[0]);
        }
      } catch (error) {
        console.error("Failed to fetch dictionaries:", error);
        alert("Error: Could not load dictionaries.");
      }
    };
    fetchDictionaries();
  }, []);

  // Helper to manage modals
  const openModal = (modal: keyof typeof modals) => setModals(prev => ({ ...prev, [modal]: true }));
  const closeModal = (modal: keyof typeof modals) => setModals(prev => ({ ...prev, [modal]: false }));

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
      alert("Please enter a project title.");
      return;
    }

    // (NP-4.8) Check for required files
    if (!templateFile) {
      alert("Please upload a Report Template.");
      setActiveSection('template');
      return;
    }

    // Check for dictionary
    if (!selectedDictionary) {
      alert("Please select a Competency Dictionary.");
      setActiveSection('dictionary');
      return;
    }

    setIsUploading(true);

    try {
        const payload = {
            name: projectName,
            dictionaryId: selectedDictionary?.id,
            userIds: Array.from(selectedUserIds),
            prompts: prompts
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
        }

        // (NP-4.5) Upload Simulation Method Files
        if (simFiles.length > 0) {
          console.log(`Uploading ${simFiles.length} Sim files...`);
          for (const file of simFiles) {
            const simFormData = new FormData();
            simFormData.append('file', file);
            simFormData.append('fileType', 'simulationMethod');
            await apiService.post(`/projects/${projectId}/upload`, simFormData, {
              headers: { 'Content-Type': 'multipart/form-data' },  
            });
          }
        }

        setIsUploading(false);
        alert('Project created successfully!');

        // (P14) Redirect to the new project's report dashboard
        navigate(`/projects/${projectId}`);

    } catch (error) {
        console.error("Failed to create project:", error);
        alert("Error: Could not create project.");
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
              <div
                className="w-full border-2 border-dashed border-border rounded-lg bg-bg-light p-8 text-center cursor-pointer hover:border-primary"
                onClick={() => document.getElementById('template-file-input')?.click()}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto text-text-muted mb-2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>

                {/* Show selected file name */}
                {templateFile ? (
                  <p className="text-sm font-semibold text-text-primary">{templateFile.name}</p>
                ) : (
                  <p className="text-sm font-semibold text-text-secondary">Click to upload or drag and drop</p>
                )}

                <p className="text-xs text-text-muted mt-1">.docx format only</p>
              </div>
              {/* This is a placeholder, will be wired up later */}
              <div className="bg-bg-light rounded-lg border border-border p-4 hidden">
                <h3 className="text-base font-semibold text-text-primary mb-3">Placeholder Fields</h3>
              </div>
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
              <div 
                className="w-full border-2 border-dashed border-border rounded-lg bg-bg-light p-8 text-center cursor-pointer hover:border-primary"
                onClick={() => document.getElementById('kb-file-input')?.click()}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto text-text-muted mb-2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                <p className="text-sm font-semibold text-text-secondary">Click to upload or drag and drop</p>
                <p className="text-xs text-text-muted mt-1">.pdf, .docx, .txt</p>
              </div>

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
                  <span>Select methods...</span>
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
                      <li><label className="flex items-center gap-2 p-2 rounded-md hover:bg-bg-medium cursor-pointer"><input type="checkbox" className="w-4 h-4 rounded-sm border-border accent-primary" /> Case Study</label></li>
                      <li><label className="flex items-center gap-2 p-2 rounded-md hover:bg-bg-medium cursor-pointer"><input type="checkbox" className="w-4 h-4 rounded-sm border-border accent-primary" /> Roleplay</label></li>
                    </ul>
                  </div>
                )}
              </div>

              {/* Upload New Method Data (P11) */}
              <div>
                <label className="text-sm font-medium mb-1 block">Upload new simulation method data</label>
                {/* --- NEW: Hidden file input for Sim --- */}
                <input 
                  type="file" 
                  id="sim-file-input"
                  className="hidden"
                  accept=".pdf,.docx,.txt"
                  multiple
                  onChange={(e) => {
                    if (e.target.files) {
                      setSimFiles(Array.from(e.target.files));
                    }
                  }}
                />
                 <div 
                   className="w-full border-2 border-dashed border-border rounded-lg bg-bg-light p-8 text-center cursor-pointer hover:border-primary"
                   onClick={() => document.getElementById('sim-file-input')?.click()}
                 >
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto text-text-muted mb-2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                    <p className="text-sm font-semibold text-text-secondary">Click to upload or drag and drop</p>
                    <p className="text-xs text-text-muted mt-1">.pdf, .docx, .txt</p>
                </div>

                {/* --- Show list of selected files --- */}
                {simFiles.length > 0 && (
                  <div className="space-y-2 mt-3">
                    <h3 className="text-sm font-semibold text-text-primary">Uploaded Files ({simFiles.length})</h3>
                    <ul className="list-disc list-inside space-y-1">
                      {simFiles.map((file, index) => (
                        <li key={index} className="text-sm text-text-secondary">{file.name}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Add New Method Button (P11) */}
              <button 
                onClick={() => openModal('addSimMethod')}
                className="bg-white text-text-secondary border border-border rounded-md text-sm font-semibold px-4 py-2 hover:bg-bg-medium transition-colors w-full"
              >
                + Add New Simulation Method
              </button>
            </section>
          )}

          {/* Section 5: Prompt Settings (P12) */}
          {activeSection === 'prompts' && (
            <section id="section-prompts" className="max-w-3xl mx-auto space-y-6">
              <h2 className="text-xl font-semibold text-text-primary">5. Prompt Settings</h2>
              <p className="text-sm">Adjust the default prompts for the AI. These will be used for all reports generated in this project.</p>
              
              <div className="space-y-6">
                {/* General Context (P12) */}
                <div>
                  <label className="text-sm font-medium mb-1 block">General Context</label>
                  <textarea 
                    rows={3} 
                    placeholder="Enter general context for this project..." 
                    className="w-full rounded-md border border-border p-3 bg-bg-light shadow-sm text-sm resize-y focus:border-primary focus:ring-2 focus:ring-primary/50 outline-none"
                    value={prompts.general_context}
                    onChange={(e) => setPrompts(p => ({...p, general_context: e.target.value}))}
                  />
                </div>
                {/* Persona (P12) */}
                <div>
                  <label className="text-sm font-medium mb-1 block">Persona (System Prompt)</label>
                  <textarea 
                    rows={5} 
                    className="w-full rounded-md border border-border p-3 bg-bg-light shadow-sm text-sm resize-y focus:border-primary focus:ring-2 focus:ring-primary/50 outline-none"
                    value={prompts.persona_prompt}
                    onChange={(e) => setPrompts(p => ({...p, persona_prompt: e.target.value}))}
                  />
                </div>
                {/* Evidence Collection (P12) */}
                <div>
                  <label className="text-sm font-medium mb-1 block">Evidence Collection (KB_evidence_prompt)</label>
                  <textarea 
                    rows={5} 
                    className="w-full rounded-md border border-border p-3 bg-bg-light shadow-sm text-sm resize-y focus:border-primary focus:ring-2 focus:ring-primary/50 outline-none"
                    value={prompts.evidence_prompt}
                    onChange={(e) => setPrompts(p => ({...p, evidence_prompt: e.target.value}))}
                  />
                </div>

                {/* Competency Analysis with Toggle (P12) */}
                <div className="pt-2">
                  <div className="border-t border-border pt-6">
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-sm font-medium">Competency Analysis (competency_analysis_prompt)</label>
                      <button 
                        type="button"
                        onClick={handleCompetencyToggle}
                        className={`relative inline-flex items-center h-6 rounded-full w-11 cursor-pointer transition-colors ${competencyAnalysis ? 'bg-primary' : 'bg-gray-200'}`}
                      >
                        <span className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform ${competencyAnalysis ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </div>
                    <p className="text-xs text-text-muted mb-2">Enable this to generate the 'Competency Analysis' section in reports.</p>
                    <textarea 
                      rows={5} 
                      className="w-full rounded-md border border-border p-3 bg-bg-light shadow-sm text-sm resize-y focus:border-primary focus:ring-2 focus:ring-primary/50 outline-none"
                      value={prompts.analysis_prompt}
                      onChange={(e) => setPrompts(p => ({...p, analysis_prompt: e.target.value}))}
                    />
                  </div>
                </div>

                {/* Executive Summary with Toggle (P12) */}
                <div className="pt-2">
                  <div className="border-t border-border pt-6">
                    <div className="flex justify-between items-center mb-1">
                      <label className={`text-sm font-medium ${!competencyAnalysis ? 'text-text-muted' : ''}`}>Executive Summary (executive_summary_prompt)</label>
                      <button 
                        type="button"
                        onClick={handleSummaryToggle}
                        className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors ${competencyAnalysis && executiveSummary ? 'bg-primary' : 'bg-gray-200'} ${!competencyAnalysis ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                        disabled={!competencyAnalysis}
                      >
                        <span className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform ${competencyAnalysis && executiveSummary ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </div>
                    <p className={`text-xs text-text-muted mb-2 ${!competencyAnalysis ? 'text-warning/80' : ''}`}>
                      Requires 'Competency Analysis' to be enabled.
                    </p>
                    <textarea 
                      rows={5} 
                      className={`w-full rounded-md border border-border p-3 bg-bg-light shadow-sm text-sm ${!competencyAnalysis ? 'opacity-50 bg-bg-medium cursor-not-allowed' : ''}`}
                      disabled={!competencyAnalysis}
                      value={prompts.summary_prompt}
                      onChange={(e) => setPrompts(p => ({...p, summary_prompt: e.target.value}))}
                    />
                  </div>
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
                        .filter(u => u.email.toLowerCase().includes(userSearch.toLowerCase()))
                        .map(user => (
                        <li key={user.id}>
                          <label className="flex items-center gap-2 p-2 rounded-md hover:bg-bg-medium cursor-pointer">
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
                            {user.email}
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
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-4xl bg-bg-light rounded-lg shadow-lg flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-6 border-b border-border">
              <h3 className="text-lg font-semibold text-text-primary">{selectedDictionary?.name || 'Competency Dictionary'}</h3>
              <button className="text-text-muted hover:text-text-primary" onClick={() => closeModal('dictionary')}>&times;</button>
            </div>
            <div className="p-6 modal-body overflow-y-auto">
              <p>...Full dictionary table from mockup would go here...</p>
            </div>
            <div className="p-4 bg-bg-medium border-t border-border flex justify-end">
                <button className="bg-white text-text-secondary border border-border rounded-md text-sm font-semibold px-4 py-2 hover:bg-bg-medium transition-colors" onClick={() => closeModal('dictionary')}>
                    Close
                </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}