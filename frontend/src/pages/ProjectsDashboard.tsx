// frontend/src/pages/ProjectsDashboard.tsx
import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserStore } from '../state/userStore';
import apiService from '../services/apiService';
import { useToastStore } from '../state/toastStore';

// Define the shape of a Project (matches our new API response)
interface Project {
  id: string;
  date: string;
  name: string;
  reports: number;
  canArchive: boolean;
}

// Define sort state types
type SortKey = 'date' | 'name' | 'reports';
type SortOrder = 'asc' | 'desc';

export default function ProjectsDashboard() {
  const navigate = useNavigate();
  const role = useUserStore((state) => state.role);
  const userName = useUserStore((state) => state.name);
  
  // --- STATE ---
  const [projects, setProjects] = useState<Project[]>([]);
  const [archivedProjects, setArchivedProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showingArchived, setShowingArchived] = useState(false); //P4
  const [modals, setModals] = useState({ archive: false, unarchive: false });
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set()); //P3

  // State for sorting
  // Default sort: by date, descending (newest first)
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // State for single-project archive and toasts
  const [projectToArchive, setProjectToArchive] = useState<string | null>(null);
  const [projectToUnarchive, setProjectToUnarchive] = useState<string | null>(null);
  const addToast = useToastStore((state) => state.addToast);

  // State for Search
  const [searchQuery, setSearchQuery] = useState('');
  const debounceTimeout = useRef<number | null>(null);

  // --- DATA FETCHING (NEW) ---
  useEffect(() => {
    // This function runs once when the component loads
    fetchProjects(searchQuery);
  }, []); // The empty array [] means it only runs once

  const fetchProjects = async (currentSearch: string = searchQuery) => {
    setIsLoading(true);
    try {
        // (U9) Use our apiService to call the protected endpoint
        const response = await apiService.get('/projects', {
          params: { search: currentSearch }
        });
        setProjects(response.data);
    } catch (error) {
        console.error("Failed to fetch projects:", error);
    } finally {
        setIsLoading(false);
    }
  };

  const fetchArchivedProjects = async (currentSearch: string = searchQuery) => {
    setIsLoading(true);
    try {
        // (PD-3.7) Call the new endpoint
        const response = await apiService.get('/projects/archived', {
          params: { search: currentSearch }
        });
        setArchivedProjects(response.data);
    } catch (error) {
        console.error("Failed to fetch archived projects:", error);
    } finally {
        setIsLoading(false);
    }
  };

  // Function to handle archive API call
  const handleArchive = async () => {
    const idsToArchive: string[] = [];
    if (projectToArchive) {
      idsToArchive.push(projectToArchive);
    } else if (selectedProjects.size > 0) {
      idsToArchive.push(...Array.from(selectedProjects));
    } else {
      closeModal('archive');
      return;
    }

    try {
      for (const id of idsToArchive) {
        await apiService.put(`/projects/${id}/archive`);
      }

      // Update UI
      addToast(`Successfully archived ${idsToArchive.length} project(s).`, 'success');

      // (PD-3.5) Refetch the projects list to show the change
      fetchProjects(searchQuery);

      // Clean up state
      closeModal('archive');
      setSelectedProjects(new Set());

    } catch (error: any) {
      console.error("Failed to archive project(s):", error);
      const message = error.response?.data?.message || "Could not archive project(s).";
      addToast(`Error: ${message}`, 'error');
    }
  };

  // --- NEW: Function to handle the actual UNarchive API call ---
  const handleUnarchive = async () => {
    const idsToUnarchive: string[] = [];
    if (projectToUnarchive) {
      // Case 1: Unarchiving a single project
      idsToUnarchive.push(projectToUnarchive);
    } else if (selectedProjects.size > 0) {
      // Case 2: Unarchiving a batch
      idsToUnarchive.push(...Array.from(selectedProjects));
    } else {
      closeModal('unarchive');
      return;
    }

    try {
      for (const id of idsToUnarchive) {
        await apiService.put(`/projects/${id}/unarchive`);
      }

      addToast(`Successfully unarchived ${idsToUnarchive.length} project(s).`, 'success');
      
      // (PD-3.7) Refetch the ARCHIVED list to show the change
      fetchArchivedProjects(searchQuery);
      
      closeModal('unarchive');
      setSelectedProjects(new Set());
      // projectToUnarchive is cleared by closeModal
      
    } catch (error: any) {
      console.error("Failed to unarchive project(s):", error);
      const message = error.response?.data?.message || "Could not unarchive project(s).";
      addToast(`Error: ${message}`, 'error');
    }
  };  
  
  // Real modal handlers (FIXED)
  const openModal = (modal: keyof typeof modals) => setModals(prev => ({ ...prev, [modal]: true }));
  const closeModal = (modal: keyof typeof modals) => {
    setModals(prev => ({ ...prev, [modal]: false }));
    if (modal === 'archive') {
      setProjectToArchive(null);
    }
    if (modal === 'unarchive') { // <-- ADD THIS BLOCK
      setProjectToUnarchive(null);
    }
  };

  // (U10) Mock handler for row click
  const navigateToReport = (projectId: string) => {
    navigate(`/projects/${projectId}`);
  };

  // Handler for table row checkboxes
  const handleSelect = (projectId: string) => {
    const newSelection = new Set(selectedProjects);
    if (newSelection.has(projectId)) {
      newSelection.delete(projectId);
    } else {
      newSelection.add(projectId);
    }
    setSelectedProjects(newSelection);
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      // Toggle sort order
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      // Set new key and default to ascending
      setSortKey(key);
      setSortOrder('asc');
    }
  };
  
  const currentProjects = showingArchived ? archivedProjects : projects;

  const sortedProjects = useMemo(() => {
    // Create a new array to avoid mutating state
    const projectsToSort = [...currentProjects]; 

    projectsToSort.sort((a, b) => {
      let valA: string | number | Date;
      let valB: string | number | Date;

      // Assign values based on the sort key
      switch (sortKey) {
        case 'date':
          // Convert string date back to Date object for correct comparison
          valA = new Date(a.date);
          valB = new Date(b.date);
          break;
        case 'name':
          valA = a.name.toLowerCase();
          valB = b.name.toLowerCase();
          break;
        case 'reports':
          valA = a.reports;
          valB = b.reports;
          break;
        default:
          return 0;
      }
      
      // Perform comparison
      if (valA < valB) {
        return sortOrder === 'asc' ? -1 : 1;
      }
      if (valA > valB) {
        return sortOrder === 'asc' ? 1 : -1;
      }
      return 0;
    });

    return projectsToSort;
  }, [currentProjects, sortKey, sortOrder]);

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      // Use sortedProjects here
      const allIds = sortedProjects.map(p => p.id);
      setSelectedProjects(new Set(allIds));
    } else {
      setSelectedProjects(new Set());
    }
  };

  const canSelectAll = sortedProjects.length > 0;
  const allSelected = canSelectAll && selectedProjects.size === sortedProjects.length;
  
  // Helper component for sort arrow
  const SortArrow = ({ columnKey }: { columnKey: SortKey }) => {
    const isActive = sortKey === columnKey;
    
    return (
      <svg 
        xmlns="http://www.w3.org/2000/svg" 
        width="16" // Smaller size
        height="16" 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="2" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
        className="inline-block flex-shrink-0" // Use flex-shrink-0 to prevent icon from shrinking
      >
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
        
        {/* Down Arrow */}
        <path 
          d="M9 18l3 3l3 -3" 
          className={isActive && sortOrder === 'desc' ? 'text-text-primary' : 'text-text-muted/50'}
          strokeWidth={isActive && sortOrder === 'desc' ? '3' : '2'}
        />
        <path 
          d="M12 15v6" 
          className={isActive && sortOrder === 'desc' ? 'text-text-primary' : 'text-text-muted/50'}
          strokeWidth={isActive && sortOrder === 'desc' ? '3' : '2'}
        />
        
        {/* Up Arrow */}
        <path 
          d="M15 6l-3 -3l-3 3" 
          className={isActive && sortOrder === 'asc' ? 'text-text-primary' : 'text-text-muted/50'}
          strokeWidth={isActive && sortOrder === 'asc' ? '3' : '2'}
        />
        <path 
          d="M12 3v6" 
          className={isActive && sortOrder === 'asc' ? 'text-text-primary' : 'text-text-muted/50'}
          strokeWidth={isActive && sortOrder === 'asc' ? '3' : '2'}
        />
      </svg>
    );
  };

  return (
    <div className="p-8">
      {/* Page Header (U8) */}
      <h1 className="text-3xl font-bold text-text-primary">
        Welcome, {userName || '...'}!
      </h1>

      {/* Toolbar (U12, P4) */}
      <div className="flex justify-between items-center mt-6 mb-4">
        <div className="flex items-center gap-3">
          {/* Search Bar (U12) */}
          <div className="relative w-72">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            </div>
            <input
              type="text"
              placeholder={showingArchived ? 'Search archived projects...' : 'Search projects...'}
              className="w-full rounded-md border border-border pl-9 pr-3 py-2 bg-bg-light shadow-sm text-sm focus:border-primary focus:ring-2 focus:ring-primary/50 outline-none"
              value={searchQuery}
              onChange={(e) => {
                const newQuery = e.target.value;
                setSearchQuery(newQuery);

                if (debounceTimeout.current) {
                  clearTimeout(debounceTimeout.current);
                }

                debounceTimeout.current = window.setTimeout(() => {
                  if (showingArchived) {
                    fetchArchivedProjects(newQuery);
                  } else {
                    fetchProjects(newQuery);
                  }
                }, 500)
              }}
            />
          </div>

          {/* Toggle Archived (P4) */}
          {(role === 'Project Manager' || role === 'Admin') && (
            <button
              onClick={() => {
                const newShowArchived = !showingArchived;
                setShowingArchived(newShowArchived);
                setSelectedProjects(new Set()); // Clear selection on view change

                if (newShowArchived) {
                  fetchArchivedProjects(searchQuery);
                } else {
                  fetchProjects(searchQuery);
                }
              }}
              className="bg-white text-text-secondary border border-border rounded-md text-sm font-semibold px-4 py-2 hover:bg-bg-medium transition-colors"
            >
              {showingArchived ? 'Show Active' : 'Show Archived'}
            </button>
          )}
        </div>

        {/* Bulk Action Buttons (P3, P4) */}
        {(role === 'Project Manager' || role === 'Admin') && !showingArchived && selectedProjects.size > 0 && (
          <button
            onClick={() => openModal('archive')}
            className="bg-error text-white rounded-md text-sm font-semibold px-4 py-2 hover:bg-red-700 transition-colors"
          >
            Archive Selected ({selectedProjects.size})
          </button>
        )}
        {(role === 'Project Manager' || role === 'Admin') && showingArchived && selectedProjects.size > 0 && (
          <button
            onClick={() => openModal('unarchive')}
            className="bg-info text-white rounded-md text-sm font-semibold px-4 py-2 hover:bg-blue-700 transition-colors"
          >
            Unarchive Selected ({selectedProjects.size})
          </button>
        )}
      </div>

      {/* Projects Table (P3, U9) */}
      <div className="bg-bg-light rounded-lg shadow-md border border-border overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="bg-bg-medium border-b border-border">
              {/* Checkbox Column (P3) */}
              {(role === 'Project Manager' || role === 'Admin') && (
                <th className="p-3 w-12 text-center">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded-sm border-border accent-primary align-middle"
                    checked={allSelected}
                    onChange={handleSelectAll}
                  />
                </th>
              )}
              {/* (U9) Columns */}
              <th className="p-3 font-semibold text-text-secondary cursor-pointer hover:bg-border/50" onClick={() => handleSort('date')}>
                <div className="flex items-center justify-between">
                  <span>Date</span>
                  <SortArrow columnKey="date" />
                </div>
              </th>
              <th className="p-3 font-semibold text-text-secondary cursor-pointer hover:bg-border/50" onClick={() => handleSort('name')}>
                <div className="flex items-center justify-between">
                  <span>Name</span>
                  <SortArrow columnKey="name" />
                </div>
              </th>
              <th className="p-3 font-semibold text-text-secondary cursor-pointer hover:bg-border/50" onClick={() => handleSort('reports')}>
                <div className="flex items-center justify-between">
                  <span>No. of Reports</span>
                  <SortArrow columnKey="reports" />
                </div>
              </th>
              
              {/* Actions Column (P3) */}
              {(role === 'Project Manager' || role === 'Admin') && (
                <th className="p-3 pr-6 font-semibold text-text-secondary text-right">Actions</th>
              )}
            </tr>
          </thead>
          <tbody>
            {/* --- LOADING STATE --- */}
            {isLoading && (
                <tr>
                    <td colSpan={5} className="p-12 text-center text-text-muted">
                        Loading projects...
                    </td>
                </tr>
            )}

            {/* --- EMPTY STATE --- */}
            {!isLoading && sortedProjects.length === 0 && (
                <tr>
                    <td colSpan={5} className="p-12 text-center text-text-muted">
                        {searchQuery.length > 0 ? (
                          `No projects found matching "${searchQuery}".`
                        ) : showingArchived ? (
                          "No archived projects found."
                        ) : (role === 'User'
                            ? "You have not been invited to any projects."
                            : "No active projects found. Try creating one!")
                        }
                    </td>
                </tr>
            )}

            {/* --- REAL DATA MAP --- */}
            {!isLoading && sortedProjects.map((project) => (
                <tr key={project.id} className="border-b border-border hover:bg-bg-medium">
                    {(role === 'Project Manager' || role === 'Admin') && (
                        <td className="p-3 w-12 text-center">
                            <input
                              type="checkbox"
                              className="row-checkbox w-4 h-4 rounded-sm border-border accent-primary align-middle"
                              checked={selectedProjects.has(project.id)}
                              onChange={() => handleSelect(project.id)}
                            />
                        </td>
                    )}
                    <td className="p-3 clickable-row" onClick={() => navigateToReport(project.id)}>{project.date}</td>
                    <td className="p-3 font-medium text-text-primary clickable-row" onClick={() => navigateToReport(project.id)}>{project.name}</td>
                    <td className="p-3 clickable-row" onClick={() => navigateToReport(project.id)}>
                        {project.reports > 0 ? project.reports : '-'}
                    </td>
                    {(role === 'Project Manager' || role === 'Admin') && (
                        <td className="p-3 pr-6 text-right">
                            {showingArchived ? (
                                <button
                                  className={`text-xs ${project.canArchive ? 'text-text-secondary hover:text-info' : 'text-text-muted/70 cursor-not-allowed'}`}
                                  onClick={project.canArchive ? () => {
                                    setProjectToUnarchive(project.id);
                                    openModal('unarchive');
                                  } : undefined}
                                >
                                    Unarchive
                                </button>
                            ) : (
                                <button
                                  className={`text-xs ${project.canArchive ? 'text-text-secondary hover:text-error' : 'text-text-muted/70 cursor-not-allowed'}`}
                                  onClick={project.canArchive ? () => {
                                    setProjectToArchive(project.id);
                                    openModal('archive')
                                   } : undefined}
                                  disabled={!project.canArchive}
                                >
                                    Archive
                                </button>
                            )}
                        </td>
                    )}
                </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {/* --- MODALS --- */}

      {/* Archive Confirmation Modal (P3) */}
      {modals.archive && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md bg-bg-light rounded-lg shadow-lg p-6">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold text-text-primary">Archive Project(s)?</h3>
              <button className="text-text-muted hover:text-text-primary" onClick={() => closeModal('archive')}>&times;</button>
            </div>
            <p className="text-sm text-text-secondary mt-2">
              Are you sure you want to archive the selected project(s)? You can restore them later.
            </p>
            <div className="flex justify-end gap-3 mt-6">
              <button className="bg-white text-text-secondary border border-border rounded-md text-sm font-semibold px-4 py-2 hover:bg-bg-medium" onClick={() => closeModal('archive')}>
                Cancel
              </button>
              <button className="bg-error text-white rounded-md text-sm font-semibold px-4 py-2 hover:bg-red-700" onClick={handleArchive}>
                Archive
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unarchive Confirmation Modal (P4) */}
      {modals.unarchive && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md bg-bg-light rounded-lg shadow-lg p-6">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold text-text-primary">Unarchive Project(s)?</h3>
              <button className="text-text-muted hover:text-text-primary" onClick={() => closeModal('unarchive')}>&times;</button>
            </div>
            <p className="text-sm text-text-secondary mt-2">
              This action will restore the selected project(s) to the active list.
            </p>
            <div className="flex justify-end gap-3 mt-6">
              <button className="bg-white text-text-secondary border border-border rounded-md text-sm font-semibold px-4 py-2 hover:bg-bg-medium" onClick={() => closeModal('unarchive')}>
                Cancel
              </button>
              <button className="bg-info text-white rounded-md text-sm font-semibold px-4 py-2 hover:bg-blue-700" onClick={handleUnarchive}>
                Unarchive
              </button>
            </div>
          </div>
        </div>
      )}
      
    </div>
  );
}