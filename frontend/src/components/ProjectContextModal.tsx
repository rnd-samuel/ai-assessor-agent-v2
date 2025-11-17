// frontend/src/components/ProjectContextModal.tsx
import { useState, useEffect } from 'react';
import apiService from '../services/apiService';

// --- 1. Define data structures ---
interface KeyBehavior extends String {}

interface Level {
  nomor: string;
  penjelasan: string;
  keyBehavior: KeyBehavior[];
}

interface Kompetensi {
  id: string;
  name: string;
  definisiKompetensi: string;
  level: Level[];
}

interface DictionaryContent {
  namaKamus: string;
  kompetensi: Kompetensi[];
}

interface ReportTemplate {
  name: string;
  url: string;
}
interface KnowledgeBaseFile {
  name: string;
  url: string;
}
interface ProjectContextData {
  projectName: string;
  projectManager: string;
  reportTemplate: ReportTemplate | null;
  knowledgeBaseFiles: KnowledgeBaseFile[];
  dictionaryTitle: string;
  dictionaryId: string | null;
  simulationMethods: string[];
  generalContext: string;
}

interface ProjectContextModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
}


// --- Dictionary Renderer Component ---
// This component will parse and display the dictionary JSON
const DictionaryContentDisplay = ({ content }: { content: DictionaryContent | null }) => {
  if (!content || !content.kompetensi) {
    return <p className="text-sm text-text-muted">No dictionary content available.</p>;
  }

  return (
    <div className="space-y-6">
      {content.kompetensi.map((komp) => (
        <div key={komp.id} className="border border-border rounded-lg overflow-hidden">
          {/* Competency Header */}
          <div className="bg-bg-medium p-4 border-b border-border">
            <h4 className="text-md font-semibold text-text-primary">{komp.name}</h4>
            <p className="text-sm text-text-secondary mt-1">{komp.definisiKompetensi}</p>
          </div>
          
          {/* Levels Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-bg-light border-b border-border">
                <tr>
                  <th className="p-3 font-semibold text-text-secondary w-1/6">Level</th>
                  <th className="p-3 font-semibold text-text-secondary w-2/6">Level Description</th>
                  <th className="p-3 font-semibold text-text-secondary w-3/6">Key Behaviors</th>
                </tr>
              </thead>
              <tbody>
                {komp.level.map((lvl) => (
                  <tr key={lvl.nomor} className="border-b border-border last:border-b-0 hover:bg-bg-medium/50">
                    <td className="p-3 align-top font-medium text-text-primary">{lvl.nomor}</td>
                    <td className="p-3 align-top text-text-secondary">{lvl.penjelasan}</td>
                    <td className="p-3 align-top">
                      <ul className="list-disc list-outside pl-5 space-y-1 text-text-secondary">
                        {lvl.keyBehavior.map((kb, index) => (
                          <li key={index}>{kb}</li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
};

export default function ProjectContextModal({ isOpen, onClose, projectId }: ProjectContextModalProps) {
  // --- 2. State for data, loading, and nested modal ---
  const [data, setData] = useState<ProjectContextData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDictionaryModalOpen, setIsDictionaryModalOpen] = useState(false);

  const [dictionaryContent, setDictionaryContent] = useState<DictionaryContent | null>(null);
  const [isDictLoading, setIsDictLoading] = useState(false);

  // --- 3. Data fetching logic ---
  useEffect(() => {
    // Only fetch if the modal is open, we have a projectId, and we don't already have data
    if (isOpen && projectId && !data) {
      const fetchContextData = async () => {
        setIsLoading(true);
        try {
          const response = await apiService.get<ProjectContextData>(`/projects/${projectId}/context`);
          setData(response.data);
        } catch (error) {
          console.error("Failed to fetch project context:", error);
          // Handle error (e.g., show toast)
        } finally {
          setIsLoading(false);
        }
      };
      fetchContextData();
    }
  }, [isOpen, projectId, data]);

  // --- fetchDictionaryContent type ---
  useEffect(() => {
    if (isDictionaryModalOpen && data?.dictionaryId && !dictionaryContent) {
      const fetchDictionaryContent = async () => {
        setIsDictLoading(true);
        try {
          // The API returns the content object directly
          const response = await apiService.get<DictionaryContent>(`/projects/dictionary/${data.dictionaryId}/content`);
          setDictionaryContent(response.data);
        } catch (error) {
          console.error("Failed to fetch dictionary content:", error);
        } finally {
          setIsDictLoading(false);
        }
      };
      fetchDictionaryContent();
    }
  }, [isDictionaryModalOpen, data?.dictionaryId, dictionaryContent]);

  // --- 4. Reset state on close ---
  // This ensures we refetch data if the user opens a different project's context
  const handleClose = () => {
    setData(null); // Clear data
    setDictionaryContent(null); // Clear dictionary content
    setIsDictionaryModalOpen(false); // Close nested modal
    onClose(); // Call parent's close function
  };

  // --- 5. Render logic ---
  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-40" onClick={handleClose}>
        <div className="w-full max-w-2xl bg-bg-light rounded-lg shadow-lg" onClick={(e) => e.stopPropagation()}>
          <div className="flex justify-between items-center p-6 border-b border-border">
            <h3 className="text-lg font-semibold text-text-primary">
              {isLoading ? 'Loading Context...' : `Project Context: ${data?.projectName}`}
            </h3>
            <button className="text-text-muted hover:text-text-primary" onClick={handleClose}>&times;</button>
          </div>
          <div className="p-6 modal-body space-y-6 max-h-[70vh] overflow-y-auto">
            {isLoading ? (
              <p className="text-sm text-text-muted text-center">Loading project data...</p>
            ) : data ? (
              <>
                <div>
                  <label className="text-xs font-semibold text-text-muted uppercase">Project Manager</label>
                  <p className="text-sm text-text-primary">{data.projectManager}</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-text-muted uppercase">Report Template</label>
                  {data.reportTemplate ? (
                    <a href={data.reportTemplate.url} download className="flex items-center gap-2 text-sm text-primary hover:underline font-medium">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                      {data.reportTemplate.name}
                    </a>
                  ) : (
                    <p className="text-sm text-text-secondary italic">No report template uploaded for this project.</p>
                  )}
                </div>
                <div>
                  <label className="text-xs font-semibold text-text-muted uppercase">Knowledge Base Files ({data.knowledgeBaseFiles.length})</label>
                  {data.knowledgeBaseFiles.length > 0 ? (
                    <ul className="list-disc list-outside pl-5 mt-2 space-y-1 text-sm">
                      {data.knowledgeBaseFiles.map(file => (
                        <li key={file.name}>
                          <a href={file.url} download className="text-primary hover:underline">{file.name}</a>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-text-secondary italic mt-1">No knowledge base files uploaded for this project.</p>
                  )}
                </div>
                <div>
                  <label className="text-xs font-semibold text-text-muted uppercase">Competency Dictionary</label>
                  <div className="bg-bg-medium rounded-lg border border-border p-3 mt-1">
                    <div className="flex justify-between items-center">
                      <p className="text-sm font-medium text-text-primary">{data.dictionaryTitle}</p>
                      <button
                        onClick={() => setIsDictionaryModalOpen(true)}
                        className="bg-white text-text-secondary border border-border rounded-md text-sm font-semibold px-3 py-1.5 hover:bg-bg-light transition-colors"
                      >
                        View Content
                      </button>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-text-muted uppercase">Simulation Methods</label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {data.simulationMethods.map(method => (
                      <span key={method} className="px-2 py-0.5 text-xs font-medium rounded-full bg-bg-medium text-text-secondary border border-border">
                        {method}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-text-muted uppercase">General Context</label>
                  <p className="text-sm text-text-secondary mt-1 p-3 bg-bg-medium rounded-md whitespace-pre-wrap">
                    {data.generalContext}
                  </p>
                </div>
              </>
            ) : (
              <p className="text-sm text-error text-center">Failed to load project data.</p>
            )}
          </div>
        </div>
      </div>

      {/* --- 6. Nested Dictionary Modal --- */}
      {isDictionaryModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={() => setIsDictionaryModalOpen(false)}>
          <div className="w-full max-w-4xl bg-bg-light rounded-lg shadow-lg max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center p-6 border-b border-border flex-shrink-0">
              <h3 className="text-lg font-semibold text-text-primary">{data?.dictionaryTitle}</h3>
              <button className="text-text-muted hover:text-text-primary" onClick={() => setIsDictionaryModalOpen(false)}>&times;</button>
            </div>
            <div className="p-6 modal-body overflow-y-auto">
              {isDictLoading ? (
                <p className="text-sm text-text-muted text-center">Loading dictionary content...</p>
              ) : (
                // Render the new component instead of the <pre> tag
                <DictionaryContentDisplay content={dictionaryContent} />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}