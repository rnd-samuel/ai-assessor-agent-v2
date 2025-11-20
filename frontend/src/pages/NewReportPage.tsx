// frontend/src/pages/NewReportPage.tsx
import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import apiService from '../services/apiService';
import LoadingButton from '../components/LoadingButton';
import DragDropUploader from '../components/DragDropUploader';

// Define data types
interface Competency {
  id: string;
  name: string;
}
interface SimulationMethod {
  id: string;
  name: string;
}
interface FormDataResponse {
  competencies :Competency[];
  simulationMethods: SimulationMethod[];
}

// Define the interface
type FileStatus = 'uploading' | 'processing' | 'complete';
interface UploadedFile {
  id: string;
  name: string;
  file: File;
  status: FileStatus;
  simulationMethod: string;
}

// 2. Moved FileListItem component OUTSIDE
const FileListItem = ({ 
  file, 
  onMethodChange,
  simulationMethods 
}: { 
  file: UploadedFile, 
  onMethodChange: (fileId: string, method: string) => void,
  simulationMethods: SimulationMethod[]
}) => {
  return (
    <div className="p-3 bg-bg-medium rounded-md border border-border">
      {file.status === 'complete' ? (
        // "Complete" view with dropdown
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between sm:gap-4">

          {/* (FIXED) File name now truncates */}
          <p className="text-sm font-medium text-text-primary truncate min-w-0 flex-1">
            {file.name}
          </p>

          {/* (FIXED) Dropdown group will not shrink */}
          <div className="flex items-center gap-2 mt-2 sm:mt-0 flex-shrink-0">
            <label htmlFor={`select-${file.id}`} className="text-sm text-text-secondary flex-shrink-0">Simulation Method:</label>
            <select 
              id={`select-${file.id}`} 
              className="w-full sm:w-48 rounded-md border border-border px-3 py-1.5 bg-light shadow-sm text-sm focus:border-primary focus:ring-2 focus:ring-primary/50 outline-none"
              value={file.simulationMethod} // <-- Read value from state
              onChange={(e) => onMethodChange(file.id, e.target.value)} // <-- Update state
            >
              <option value="">Select method...</option>
              {simulationMethods.map(method => (
                <option key={method.id} value={method.name}>
                  {method.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : (
        // "Uploading/Processing" view with progress bar
        <div>
          <div className="flex justify-between items-center">
            <p className="text-sm font-medium text-text-primary">{file.name}</p>
            <p className="text-sm text-text-muted capitalize">{file.status}...</p>
          </div>
          <div className="mt-2 h-2 bg-border rounded-full overflow-hidden">
            <div 
              className="h-2 bg-primary rounded-full transition-all duration-1000 ease-out"
              style={{ width: file.status === 'uploading' ? '30%' : '100%' }}
            ></div>
          </div>
        </div>
      )}
    </div>
  );
};


export default function NewReportPage() {
  const navigate = useNavigate();
  const { projectId } = useParams();

  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isGeneratingDisabled, setIsGeneratingDisabled] = useState(true);

  const [isGenerating, setIsGenerating] = useState(false);

  const [competencies, setCompetencies] = useState<Competency[]>([]);
  const [simulationMethods, setSimulationMethods] = useState<SimulationMethod[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [globalTarget, setGlobalTarget] = useState('4');
  const [specificTargets, setSpecificTargets] = useState<Record<string, string>>({});

  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);

  useEffect(() => {
    if (!projectId) return;

    const fetchFormData = async () => {
      try {
        setIsLoading(true);
        const response = await apiService.get<FormDataResponse>(`/projects/${projectId}/form-data`);
        const fetchedCompetencies = response.data.competencies || [];
        setCompetencies(fetchedCompetencies);
        setSimulationMethods(response.data.simulationMethods || []);

        // Initialize targets based on fetched competencies
        const newTargets: Record<string, string> = {};
        fetchedCompetencies.forEach((comp: Competency) => {
          newTargets[comp.id] = globalTarget;
        });
        setSpecificTargets(newTargets);

      } catch (error) {
        console.error("Failed to fetch project form data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchFormData();
  }, [projectId]);

  useEffect(() => {
    setSpecificTargets(prevTargets => {
      const newTargets = { ...prevTargets };
      competencies.forEach(comp => {
        newTargets[comp.id] = globalTarget;
      });
      return newTargets;
    });
  }, [globalTarget, competencies]);

  const handleSpecificTargetChange = (compId: string, value: string) => {
    setSpecificTargets(prev => ({
      ...prev,
      [compId]: value,
    }));
  };

  const handleFilesUpload = (fileList: FileList) => {
    if (fileList.length === 0) return;
    
    setIsGeneratingDisabled(true);

    const newFiles: UploadedFile[] = Array.from(fileList).map(file => ({
      id: `file-${Date.now()}-${file.name}`,
      name: file.name,
      file: file,
      status: 'uploading',
      simulationMethod: '',
  }));

    setFiles(prev => [...prev, ...newFiles]);

    // --- MOCK PROCESSING ---
    newFiles.forEach(file => {
      setTimeout(() => {
        setFiles(prev => prev.map(f => f.id === file.id ? { ...f, status: 'processing' } : f));
        setTimeout(() => {
          setFiles(prev => prev.map(f => f.id === file.id ? { ...f, status: 'complete' } : f));
        }, 1000); // Shorter delay
      }, 500); // Shorter delay
    });
  };
  
  // 4. Add handler to update the file's state
  const handleMethodChange = (fileId: string, method: string) => {
    setFiles(prevFiles => 
      prevFiles.map(file => 
        file.id === fileId ? { ...file, simulationMethod: method } : file
      )
    );
  };

  useEffect(() => {
    if (files.length === 0) {
      setIsGeneratingDisabled(true);
      return;
    }
    const allComplete = files.every(f => f.status === 'complete');
    const allTagged = files.every(f => f.simulationMethod !== '');

    setIsGeneratingDisabled(!allComplete || !allTagged);
  }, [files]);

  const handleGenerateReport = async () => {
    const title = (document.getElementById('report-title') as HTMLInputElement).value;
    const specificContext = (document.getElementById('report-context') as HTMLTextAreaElement).value;

    if (!title) {
      alert("Please enter a report title.");
      return;
    }
    
    // We can now get the file methods from state
    const fileMethods = files.map(f => ({ 
      name: f.name, 
      method: f.simulationMethod 
    }));
    // We'll add this to the payload later.
    console.log("File methods:", fileMethods);

    setIsGenerating(true);
    try {
      const payload = {
        title,
        projectId,
        targetLevels: specificTargets,
        specificContext,
        // We'll add file data here soon
      };
      
      console.log("Sending payload to /api/reports:", payload);

      const response = await apiService.post('/reports', payload);
      const { reportId } = response.data;

      // Upload Logic
      console.log(`Report created with ID: ${reportId}. Now uploading ${files.length} files...`);

      for (const uploadedFile of files) {
        const formData = new FormData();
        formData.append('file', uploadedFile.file); // <-- The actual File object
        formData.append('simulationMethod', uploadedFile.simulationMethod); // <-- The tag

        // 3. Post to the new endpoint
        await apiService.post(`/reports/${reportId}/upload`, formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });
      }

      // Navigate to the correct, plural-path route
      navigate(`/reports/${reportId}`);

    } catch (error) {
      console.error("Failed to create report:", error);
      alert("Error: Could not create report.");
      setIsGenerating(false);
    }
  };

  return (
    <>
      <main className="flex-1 h-screen overflow-y-auto bg-bg-medium">
        {/* Page Header */}
        <div className="sticky top-0 bg-bg-medium/80 backdrop-blur-sm z-10 p-8 pb-4">
          <h1 className="text-3xl font-bold text-text-primary">Create New Report</h1>
        </div>
        
        {/* Page Content */}
        <div className="p-8 pt-0 space-y-6 max-w-4xl mx-auto">
        
            {/* 1. Report Title (U22) */}
            <div className="bg-bg-light p-6 rounded-lg shadow-sm border border-border">
              <label htmlFor="report-title" className="text-lg font-semibold text-text-primary mb-3 block">Report Title</label>
              <input type="text" id="report-title" placeholder="e.g., Analysis of Candidate A" className="w-full rounded-md border border-border px-3 py-2 bg-light shadow-sm text-sm focus:border-primary focus:ring-2 focus:ring-primary/50 outline-none" />
            </div>

            {/* 2. Upload Assessment Results (U23, U24) */}
            <div className="bg-bg-light p-6 rounded-lg shadow-sm border border-border">
              <label className="text-lg font-semibold text-text-primary mb-3 block">Assessment Results</label>
              <DragDropUploader 
                onUpload={handleFilesUpload} // Directly pass the handler!
                acceptedTypes=".pdf,.docx,.txt"
                multiple={true}
                subLabel="PDF, DOCX, or TXT (Multi-file supported)"
              />
              <input 
                type="file" 
                id="file-input" 
                multiple 
                className="hidden" 
                onChange={(e) => handleFilesUpload(e.target.files!)} 
              />
              
              {/* FileListItem call */}
              <div id="file-list" className="mt-4 space-y-3">
                {files.map(file => (
                  <FileListItem 
                    key={file.id} 
                    file={file} 
                    onMethodChange={handleMethodChange}
                    simulationMethods={simulationMethods} 
                  />
                ))}
              </div>
            </div>
            
            {/* 3. Set Competency Targets (U25) */}
            <div className="bg-bg-light p-6 rounded-lg shadow-sm border border-border">
              <label className="text-lg font-semibold text-text-primary mb-3 block">Competency Targets</label>
              <p className="text-sm text-text-secondary mb-4">Set a global target level for all competencies, and override specific targets as needed.</p>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label htmlFor="comp-global-select" className="text-sm font-medium text-text-primary">Global Target Level</label>
                  <select 
                    id="comp-global-select" 
                    className="w-24 rounded-md border border-border px-3 py-2 bg-light shadow-sm text-sm focus:border-primary focus:ring-2 focus:ring-primary/50 outline-none"
                    value={globalTarget}
                    onChange={(e) => setGlobalTarget(e.target.value)}
                  >
                    <option>1</option>
                    <option>2</option>
                    <option>3</option>
                    <option>4</option>
                    <option>5</option>
                  </select>
                </div>
              </div>

              <div className="space-y-4 mt-6">
                <label className="text-sm font-semibold text-text-primary mb-0 block border-b border-border pb-2">Specific Target Overrides</label>

                {isLoading && <p className="text-sm text-text-muted">Loading competencies...</p>}

                {!isLoading && competencies.length === 0 && (
                  <p className="text-sm text-text-muted">No competencies found for this project. Please set one in the 'New Project' page.</p>
                )}
                
                {competencies.map(comp => (
                  <div key={comp.id} className="flex items-center justify-between pt-4">
                    <label htmlFor={`comp-${comp.id}`} className="text-sm font-medium text-text-primary">{comp.name}</label>
                    <select 
                      id={`comp-${comp.id}`}
                      className="w-24 rounded-md border border-border px-3 py-2 bg-light shadow-sm text-sm focus:border-primary focus:ring-2 focus:ring-primary/50 outline-none specific-comp-select"
                      value={specificTargets[comp.id] || globalTarget}
                      onChange={(e) => handleSpecificTargetChange(comp.id, e.target.value)}
                    >
                      <option>1</option>
                      <option>2</option>
                      <option>3</option>
                      <option>4</option>
                      <option>5</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {/* 4. Additional Specific Context (U26) */}
            <div className="bg-bg-light p-6 rounded-lg shadow-sm border border-border">
              <label htmlFor="report-context" className="text-lg font-semibold text-text-primary mb-3 block">Additional Specific Context</label>
              <p className="text-sm text-text-secondary mb-4">Add any specific context for this report...</p>
              <textarea id="report-context" rows={4} className="w-full rounded-md border border-border p-3 bg-light shadow-sm text-sm" placeholder="Type here..."></textarea>
            </div>

            {/* Action Buttons (U27) */}
            <div className="flex justify-end gap-3 pt-4">
              <button 
                onClick={() => setIsCancelModalOpen(true)}
                className="bg-white text-text-secondary border border-border rounded-md text-sm font-semibold px-4 py-2 hover:bg-bg-medium transition-colors"
              >
                Cancel
              </button>
              <LoadingButton
                id="generate-btn" 
                isLoading={isGenerating}
                loadingText="Generating..."
                disabled={isGeneratingDisabled}
                onClick={handleGenerateReport}
              >
                Generate Report
              </LoadingButton>
            </div>
        </div>
      </main>

      {/* Cancel Confirmation Modal (P15) */}
      {isCancelModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md bg-bg-light rounded-lg shadow-lg p-6">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold text-text-primary">Are you sure?</h3>
              <button className="text-text-muted hover:text-text-primary" onClick={() => setIsCancelModalOpen(false)}>&times;</button>
            </div>
            <p className="text-sm text-text-secondary mt-2">Any unsaved changes will be lost.</p>
            <div className="flex justify-end gap-3 mt-6">
              <button className="bg-white text-text-secondary border border-border rounded-md text-sm font-semibold px-4 py-2 hover:bg-bg-medium" onClick={() => setIsCancelModalOpen(false)}>
                No
              </button>
              <button className="bg-primary text-white rounded-md text-sm font-semibold px-4 py-2 hover:bg-primary-hover" onClick={() => { setIsCancelModalOpen(false); navigate(`/projects/${projectId}`); }}>
                Yes
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}