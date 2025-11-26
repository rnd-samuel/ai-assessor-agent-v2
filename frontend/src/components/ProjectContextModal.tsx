// frontend/src/components/ProjectContextModal.tsx
import { useState, useEffect } from 'react';
import apiService from '../services/apiService';
import DictionaryContentDisplay, { type DictionaryContent } from './DictionaryContentDisplay';
import LoadingButton from './LoadingButton';
import { useToastStore } from '../state/toastStore';
import UnsavedChangesModal from './UnsavedChangesModal';

// --- 1. Define data structures ---
interface ReportTemplate {
  name: string;
  url: string;
}
interface KnowledgeBaseFile {
  name: string;
  url: string;
}
interface InvitedUser {
  id: string;
  email: string;
  name: string;
}
interface ProjectContextData {
  projectName: string;
  projectManager: string;
  invitedUsers: InvitedUser[];
  reportTemplate: ReportTemplate | null;
  knowledgeBaseFiles: KnowledgeBaseFile[];
  dictionaryTitle: string;
  dictionaryId: string | null;
  simulationMethods: string[];
  generalContext: string;
  enableAnalysis: boolean;
  enableSummary: boolean;
}

interface ProjectContextModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
}

export default function ProjectContextModal({ isOpen, onClose, projectId }: ProjectContextModalProps) {
  // --- 2. State for data, loading, and nested modal ---
  const [data, setData] = useState<ProjectContextData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDictionaryModalOpen, setIsDictionaryModalOpen] = useState(false);

  const [dictionaryContent, setDictionaryContent] = useState<DictionaryContent | null>(null);
  const [isDictLoading, setIsDictLoading] = useState(false);

  const addToast = useToastStore((state) => state.addToast);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [isDirty, setIsDirty] = useState(false);
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);

  const [editTitle, setEditTitle] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());

  const [allUsers, setAllUsers] = useState<InvitedUser[]>([]);
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  
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

  // Populate Form Data when entering Edit Mode
  useEffect(() => {
    if (isEditing && data) {
      setEditTitle(data.projectName);
      setSelectedUserIds(new Set(data.invitedUsers.map(u => u.id)));
      
      // Fetch all users for the dropdown
      apiService.get('/projects/available-users')
        .then(res => setAllUsers(res.data))
        .catch(err => console.error("Failed to load users", err));
    }
  }, [isEditing, data]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await apiService.put(`/projects/${projectId}`, {
        name: editTitle,
        userIds: Array.from(selectedUserIds)
      });
      
      addToast("Project updated successfully.", 'success');
      setIsDirty(false);
      setIsEditing(false);
      
      // Refresh Context Data
      const response = await apiService.get(`/projects/${projectId}/context`);
      setData(response.data);
      
    } catch (error: any) {
      console.error(error);
      addToast(error.response?.data?.message || "Failed to update project.", 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // --- 4. Reset state on close ---
  // This ensures we refetch data if the user opens a different project's context
  const handleClose = () => {
    setData(null); // Clear data
    setDictionaryContent(null); // Clear dictionary content
    setIsDictionaryModalOpen(false); // Close nested modal
    onClose(); // Call parent's close function
  };

  // Helper to close safely
  const handleSafeClose = () => {
    if (isDirty) {
      setShowUnsavedModal(true);
    } else {
      handleClose();
    }
  };

  // --- 5. Render logic ---
  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-40" onClick={handleSafeClose}>
        <div className="w-full max-w-2xl bg-bg-light rounded-lg shadow-lg" onClick={(e) => e.stopPropagation()}>
          <div className="flex justify-between items-center p-6 border-b border-border">
            {isEditing ? (
              <div className="w-full mr-4">
                <label className="text-xs font-bold text-text-muted uppercase mb-1 block">Project Title</label>
                <input
                  type="text"
                  className="w-full text-lg font-bold text-text-primary border border-primary rounded px-2 py-1 focus:outline-none"
                  value={editTitle}
                  onChange={(e) => {
                    setEditTitle(e.target.value)
                    setIsDirty(true)
                  }}
                />
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold text-text-primary">
                  {isLoading ? 'Loading Context...' : `Project Context: ${data?.projectName}`}
                </h3>
                {!isLoading && data && (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="text-xs text-primary hover:underline font-medium"
                  >
                    Edit
                  </button>
                )}
              </div>
            )}
            <button className="text-text-muted hover:text-text-primary" onClick={handleSafeClose}>&times;</button>
          </div>
          <div className={`p-6 modal-body space-y-6 overflow-y-auto max-h-[70vh] ${isUserDropdownOpen ? 'pb-48' : ''}`}>
            {isLoading ? (
              <p className="text-sm text-text-muted text-center">Loading project data...</p>
            ) : data ? (
              <>
                <div>
                  <label className="text-xs font-semibold text-text-muted uppercase">Project Manager</label>
                  <p className="text-sm text-text-primary font-medium">
                    {data.projectManager}
                  </p>
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
                  <label className="text-xs font-semibold text-text-muted uppercase">Configuration</label>
                  <div className="mt-1 flex gap-4">
                    <div className={`flex items-center gap-2 text-sm ${data.enableAnalysis ? 'text-text-primary' : 'text-text-muted/70'}`}>
                      <span>{data.enableAnalysis ? '✅' : '❌'}</span>
                      <span>Competency Analysis</span>
                    </div>
                    <div className={`flex items-center gap-2 text-sm ${data.enableSummary ? 'text-text-primary' : 'text-text-muted/70'}`}>
                      <span>{data.enableSummary ? '✅' : '❌'}</span>
                      <span>Executive Summary</span>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-text-muted uppercase">General Context</label>
                  <p className="text-sm text-text-secondary mt-1 p-3 bg-bg-medium rounded-md whitespace-pre-wrap">
                    {data.generalContext}
                  </p>
                </div>
                <div className="mb-6">
                  <label className="text-xs font-semibold text-text-muted uppercase">Invited Users</label>
                  {isEditing ? (
                    <div className="mt-2 space-y-3">
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setIsUserDropdownOpen(!isUserDropdownOpen)}
                          className="w-full rounded-md border border-border px-3 py-2 bg-bg-light shadow-sm text-sm text-left flex justify-between items-center"
                        >
                          <span>{selectedUserIds.size} user(s) selected</span>
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                        </button>
                        {isUserDropdownOpen && (
                          <div className="absolute top-full mt-1 w-full bg-bg-light border border-border rounded-md shadow-lg z-50">
                            <div className="p-2 border-b border-border">
                              <input
                                type="text"
                                placeholder="Search users..."
                                className="w-full rounded-md border border-border px-2 py-1 text-sm"
                                value={userSearch}
                                onChange={(e) => setUserSearch(e.target.value)}
                              />
                            </div>
                            <ul className="max-h-48 overflow-y-auto p-1">
                              {allUsers
                                .filter(u => u.email.includes(userSearch) || u.name?.includes(userSearch))
                                .map(user => (
                                  <li 
                                    key={user.id} 
                                    className="flex items-center gap-2 p-2 hover:bg-bg-medium cursor-pointer rounded"
                                    onClick={() => {
                                      const newSet = new Set(selectedUserIds);
                                      if (newSet.has(user.id)) newSet.delete(user.id);
                                      else newSet.add(user.id);
                                      setSelectedUserIds(newSet);
                                      setIsDirty(true);
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={selectedUserIds.has(user.id)}
                                      className="w-4 h-4 accent-primary pointer-events-none"
                                    />
                                    <div className="flex flex-col">
                                      <span className="text-sm font-medium text-text-primary">{user.name}</span>
                                      <span className="text-xs text-text-muted">{user.email}</span>
                                    </div>
                                  </li>
                                ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    // Read-only view
                    <div className="mt-1 flex flex-wrap gap-2">
                      {data?.invitedUsers.map(u => (
                        <span key={u.id} className="px-2 py-1 bg-bg-medium text-text-secondary text-xs rounded-md border border-border" title={u.email}>
                          {u.name || u.email}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-error text-center">Failed to load project data.</p>
            )}
          </div>
          {isEditing && (
            <div className="p-4 border-t border-border bg-bg-light flex justify-end gap-3 rounded-b-lg">
              <button
                onClick={() => setIsEditing(false)}
                className="bg-white text-text-secondary border border-border rounded-md text-sm font-semibold px-4 py-2 hover:bg-bg-medium"
              >
                Cancel
              </button>
              <LoadingButton
                onClick={handleSave}
                isLoading={isSaving}
                loadingText="Saving..."
              >
                Save Changes
              </LoadingButton>
            </div>
          )}
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

      {/* Unsaved Changes Modal */}
      {showUnsavedModal && (
        <UnsavedChangesModal
          isOpen={true}
          onStay={() => setShowUnsavedModal(false)}
          onLeave={() => {
            setShowUnsavedModal(false);
            setIsDirty(false);
            if (isEditing) setIsEditing(false); // Exit edit mode
            else handleClose(); // Or close the whole modal
          }}
        />
      )}
    </>
  );
}