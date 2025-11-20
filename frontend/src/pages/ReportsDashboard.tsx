// frontend/src/pages/ReportsDashboard.tsx
import { useState, useEffect, useRef, useMemo } from 'react';
import { useUserStore } from '../state/userStore';
import { useParams, useNavigate } from 'react-router-dom';
import apiService from '../services/apiService';
import { useToastStore } from '../state/toastStore';
import ProjectContextModal from '../components/ProjectContextModal';
import { useProjectStore } from '../state/projectStore';
import LoadingButton from '../components/LoadingButton';

// Define the Report type
interface Report {
  id: string;
  date: string;
  title: string;
  user: string;
  canArchive: boolean;
}

// Define sort types
type SortKey = 'date' | 'title' | 'user';
type SortOrder = 'asc' | 'desc';

export default function ReportsDashboard() {
  const role = useUserStore((state) => state.role);
  const { projectId } = useParams();
  const navigate = useNavigate();

  const allProjects = useProjectStore((state) => state.projects);

  const currentProjectName = useMemo(() => {
    const project = allProjects.find(p => p.id === projectId);
    return project ? project.name : 'Loading Project...';
  }, [allProjects, projectId]);

  // Real Data State
  const [reports, setReports] = useState<Report[]>([]);
  const [archivedReports, setArchivedReports] = useState<Report[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  // State for modals
  const [modals, setModals] = useState({
    projectContext: false,
    archive: false,
    unarchive: false,
  });

  // State to toggle between Active and Archived (U20)
  const [showingArchived, setShowingArchived] = useState(false);

  // State for bulk actions (U16, P16)
  const [selectedReports, setSelectedReports] = useState<Set<string>>(new Set());

  // State for sorting
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // State for single-report actions and toasts
  const [reportToArchive, setReportToArchive] = useState<string | null>(null);
  const [reportToUnarchive, setReportToUnarchive] = useState<string | null>(null);
  const addToast = useToastStore((state) => state.addToast);

  // State for Search
  const [searchQuery, setSearchQuery] = useState('');
  const debounceTimeout = useRef<number | null>(null);

  // Data fetching
  useEffect(() => {
    if (!projectId) return; // Don't fetch if there's no project ID
    fetchActiveReports(searchQuery);
  }, [projectId]); // Re-fetch if the project ID changes

  const fetchActiveReports = async (currentSearch: string = searchQuery) => {
    if (!projectId) return;
    setIsLoading(true);
    try {
      // (U16/P16) Call the new endpoint
      const response = await apiService.get(`/projects/${projectId}/reports`, {
        params: { search: currentSearch }
      });
      setReports(response.data);
    } catch (error) {
      console.error("Failed to fetch reports:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchArchivedReports = async (currentSearch: string = searchQuery) => {
    if (!projectId) return;
    setIsLoading(true);
    try {
        // (U20) Call the new endpoint
        const response = await apiService.get(`/projects/${projectId}/reports/archived`, {
          params: { search: currentSearch }
        });
        setArchivedReports(response.data);
    } catch (error) {
        console.error("Failed to fetch archived reports:", error);
    } finally {
        setIsLoading(false);
    }
  };

  // (U18) Mock handler for row click
  const navigateToReport = (reportId: string) => {
    // (U18) This will navigate to the actual report
    navigate(`/reports/${reportId}`);
  };

  const navigateToNewReport = () => {
    // (U15) This will navigate to the new report page
    navigate(`/projects/${projectId}/reports/new`);
  };

  // Handler for table row checkboxes
  const handleSelect = (reportId: string, canArchive: boolean) => {
    if (!canArchive) return; // (P16) Don't allow selecting reports you can't archive

    const newSelection = new Set(selectedReports);
    if (newSelection.has(reportId)) {
      newSelection.delete(reportId);
    } else {
      newSelection.add(reportId);
    }
    setSelectedReports(newSelection);
  };

  // Function to handle the archive API call
  const handleArchive = async () => {
    const idsToArchive: string[] = [];
    if (reportToArchive) {
      // Archiving a single report from a row click
      idsToArchive.push(reportToArchive);
    } else if (selectedReports.size > 0) {
      // Archiving a batch from selection
      idsToArchive.push(...Array.from(selectedReports));
    } else {
      closeModal('archive');
      return;
    }

    setIsProcessing(true);
    try {
      // Loop and call the API for each report
      for (const id of idsToArchive) {
        await apiService.put(`/reports/${id}/archive`);
      }

      addToast(`Successfully archived ${idsToArchive.length} report(s).`, 'success');

      // (RD-5.5) Refetch the reports list to show the change
      fetchActiveReports(searchQuery);

      closeModal('archive');
      setSelectedReports(new Set());
    } catch (error) {
      console.error("Failed to archive report(s):", error);
      addToast("Error: Could not archive report(s).", 'error');
    } finally {
      setIsProcessing(false);
    }
  }

  // --- Function to handle the Unarchive API call ---
  const handleUnarchive = async () => {
    const idsToUnarchive: string[] = [];
    if (reportToUnarchive) {
      // Case 1: Unarchiving a single report
      idsToUnarchive.push(reportToUnarchive);
    } else if (selectedReports.size > 0) {
      // Case 2: Unarchiving a batch
      idsToUnarchive.push(...Array.from(selectedReports));
    } else {
      closeModal('unarchive');
      return;
    }

    setIsProcessing(true);
    try {
      for (const id of idsToUnarchive) {
        // Call the endpoint you created in Step 8
        await apiService.put(`/reports/${id}/unarchive`);
      }

      addToast(`Successfully unarchived ${idsToUnarchive.length} report(s).`, 'success');
      
      // (U20) Refetch the ARCHIVED list to show the change
      fetchArchivedReports(searchQuery);
      
      closeModal('unarchive');
      setSelectedReports(new Set());
      // reportToUnarchive is cleared by closeModal
      
    } catch (error) {
      console.error("Failed to unarchive report(s):", error);
      addToast("Error: Could not unarchive report(s).", 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  // Helper to manage modals
  const openModal = (modal: keyof typeof modals) => setModals(prev => ({ ...prev, [modal]: true }));
  const closeModal = (modal: keyof typeof modals) => {
    setModals(prev => ({ ...prev, [modal]: false }));
    if (modal === 'archive') {
      setReportToArchive(null);
    }
    if (modal === 'unarchive') { // <-- ADD THIS BLOCK
      setReportToUnarchive(null);
    }
  };

  // Handler for sorting
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

  const currentReports = showingArchived ? archivedReports : reports;

  const sortedReports = useMemo(() => {
    const reportsToSort = [...currentReports];

    reportsToSort.sort((a, b) => {
      let valA: string | number | Date;
      let valB: string | number | Date;

      switch (sortKey) {
        case 'date':
          valA = new Date(a.date);
          valB = new Date(b.date);
          break;
        case 'title':
          valA = a.title.toLowerCase();
          valB = b.title.toLowerCase();
          break;
        case 'user':
          valA = a.user?.toLowerCase() || '';
          valB = b.user?.toLowerCase() || '';
          break;
        default:
          return 0;
      }
      
      if (valA < valB) {
        return sortOrder === 'asc' ? -1 : 1;
      }
      if (valA > valB) {
        return sortOrder === 'asc' ? 1 : -1;
      }
      return 0;
    });

    return reportsToSort;
  }, [currentReports, sortKey, sortOrder]);

  // Handler for "Select All" checkbox
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      const allIds = sortedReports.filter(r => r.canArchive).map(r => r.id);
      setSelectedReports(new Set(allIds));
    } else {
      setSelectedReports(new Set());
    }
  };

  const eligibleToSelect = sortedReports.filter(r => r.canArchive);
  const allSelected = eligibleToSelect.length > 0 && selectedReports.size === eligibleToSelect.length;

  // Helper component for sort arrows
  const SortArrow = ({ columnKey }: { columnKey: SortKey }) => {
    const isActive = sortKey === columnKey;
    
    return (
      <svg 
        xmlns="http://www.w3.org/2000/svg" 
        width="16" 
        height="16" 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="2" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
        className="inline-block flex-shrink-0"
      >
        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
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
    <>
      <main className="flex-1 h-screen overflow-y-auto bg-bg-medium">
        {/* Page Header (U14, U15, U21) */}
        <div className="sticky top-0 bg-bg-medium/80 backdrop-blur-sm z-10">
          <div className="flex justify-between items-center p-8 pb-4">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-text-primary">
                {currentProjectName}
              </h1>
              <button 
                onClick={() => openModal('projectContext')}
                className="bg-white text-text-secondary border border-border rounded-md text-sm font-semibold px-4 py-2 hover:bg-bg-medium transition-colors"
              >
                Project Context
              </button>
            </div>

            <button
              onClick={navigateToNewReport}
              className="bg-primary text-white rounded-md text-sm font-semibold px-4 py-2 hover:bg-primary-hover transition-colors flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              New Report
            </button>
          </div>

          {/* Toolbar (U19, U20, P16) */}
          <div className="flex justify-between items-center px-8 pb-4">
            <div className="flex items-center gap-3">
              {/* Search Bar (U19) */}
              <div className="relative w-72">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                </div>
                <input 
                  type="text" 
                  placeholder="Search reports..." 
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
                        fetchArchivedReports(newQuery);
                      } else {
                        fetchActiveReports(newQuery);
                      }
                    }, 500);
                  }}
                />
              </div>
              {/* Show Archived Button (U20) */}
              <button 
                onClick={() => {
                  const newShowArchived = !showingArchived;
                  setShowingArchived(newShowArchived);
                  setSelectedReports(new Set()); // Clear selection

                  if (newShowArchived && archivedReports.length === 0) {
                    fetchArchivedReports(searchQuery);
                  } else {
                    fetchActiveReports(searchQuery);
                  }
                }}
                className="bg-white text-text-secondary border border-border rounded-md text-sm font-semibold px-4 py-2 hover:bg-bg-medium transition-colors"
              >
                {showingArchived ? 'Show Active' : 'Show Archived'}
              </button>
            </div>
            {/* Archive/Unarchive Selected Button (U16, P16) */}
            {!showingArchived && selectedReports.size > 0 && (
              <button 
                onClick={() => openModal('archive')}
                className="bg-error text-white rounded-md text-sm font-semibold px-4 py-2 hover:bg-red-700 transition-colors"
              >
                Archive Selected ({selectedReports.size})
              </button>
            )}
            {showingArchived && selectedReports.size > 0 && (
              <button 
                onClick={() => openModal('unarchive')}
                className="bg-info text-white rounded-md text-sm font-semibold px-4 py-2 hover:bg-blue-700 transition-colors"
              >
                Unarchive Selected ({selectedReports.size})
              </button>
            )}
          </div>
        </div>

        {/* Page Content */}
        <div className="p-8 pt-0">
          {/* Reports Table (P16, U16) */}
          <div className="overflow-x-auto bg-bg-light border border-border rounded-lg shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="bg-bg-medium border-b border-border">
                <tr>
                  <th className="p-3 w-12 text-center">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 rounded-sm border-border accent-primary"
                      checked={allSelected}
                      onChange={handleSelectAll}
                    />
                  </th>
                  <th className="p-3 font-semibold text-text-secondary w-1/5 cursor-pointer hover:bg-border/50" onClick={() => handleSort('date')}>
                    <div className="flex items-center justify-between">
                      <span>Date</span>
                      <SortArrow columnKey="date" />
                    </div>
                  </th>
                  <th className="p-3 font-semibold text-text-secondary w-2/5 cursor-pointer hover:bg-border/50" onClick={() => handleSort('title')}>
                    <div className="flex items-center justify-between">
                      <span>Title</span>
                      <SortArrow columnKey="title" />
                    </div>
                  </th>
                  {/* (P16) User column only for PM/Admin */}
                  {(role === 'Project Manager' || role === 'Admin') && (
                    <th className="p-3 font-semibold text-text-secondary w-1/5 cursor-pointer hover:bg-border/50" onClick={() => handleSort('user')}>
                      <div className="flex items-center justify-between">
                        <span>User</span>
                        <SortArrow columnKey="user" />
                      </div>
                    </th>
                  )}
                  <th className="p-3 font-semibold text-text-secondary text-right pr-6 w-1/5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={5} className="p-12 text-center text-text-muted">
                      Loading reports...
                    </td>
                  </tr>
                )}

                {/* --- EMPTY STATE --- */}
                {!isLoading && sortedReports.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-12 text-center text-text-muted">
                      {searchQuery.length > 0 ? (
                        `No reports found matching "${searchQuery}".`
                      ) : showingArchived ? (
                        "No archived reports found."
                      ) : (
                        "No reports found for this project. Try creating one!"
                      )}
                    </td>
                  </tr>
                )}
                {/* --- REAL DATA MAP --- */}
                {!isLoading && sortedReports.map((report) => { // Use sortedReports
                  return (
                    <tr key={report.id} className="border-b border-border hover:bg-bg-medium">
                      <td className="p-3 w-12 text-center">
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded-sm border-border accent-primary report-checkbox"
                          checked={selectedReports.has(report.id)}
                          onChange={() => handleSelect(report.id, report.canArchive)}
                          disabled={!report.canArchive}
                        />
                      </td>
                      <td className="p-3 py-4 clickable-row" onClick={() => navigateToReport(report.id)}>{report.date}</td>
                      <td className="p-3 py-4 font-medium text-text-primary clickable-row" onClick={() => navigateToReport(report.id)}>{report.title}</td>
                      {(role === 'Project Manager' || role === 'Admin') && (
                        // This will now display the user's name
                        <td className="p-3 py-4 clickable-row" onClick={() => navigateToReport(report.id)}>{report.user}</td>
                      )}
                      <td className="p-3 py-4 text-right pr-6">
                        {showingArchived ? (
                          <button 
                            className="text-xs text-info/90 hover:text-info font-medium" 
                            onClick={() => {
                              setReportToUnarchive(report.id);
                              openModal('unarchive');
                            }}
                          >
                            Unarchive
                          </button>
                        ) : (
                          <button
                            className={`text-xs font-medium ${report.canArchive ? 'text-error/90 hover:text-error' : 'text-text-muted/70 cursor-not-allowed'}`}
                            onClick={report.canArchive ? () => {
                              setReportToArchive(report.id);
                              openModal('archive');
                            } : undefined}
                            disabled={!report.canArchive}
                          >
                            Archive
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Modals */}

      {/* Project Context Modal (U21) */}
      <ProjectContextModal
        isOpen={modals.projectContext}
        onClose={() => closeModal('projectContext')}
        projectId={projectId || ''}
      />

      {/* Archive Modal (U16) */}
      {modals.archive && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md bg-bg-light rounded-lg shadow-lg p-6">
            <h3 className="text-lg font-semibold text-text-primary">Are you sure?</h3>
            <p className="text-sm text-text-secondary mt-2">This action will archive the selected report(s).</p>
            <div className="flex justify-end gap-3 mt-6">
              <button 
                className="bg-white text-text-secondary border border-border rounded-md text-sm font-semibold px-4 py-2 hover:bg-bg-medium" 
                onClick={() => closeModal('archive')}
                disabled={isProcessing}
              >
                  Cancel
              </button>
              <LoadingButton 
                variant="danger"
                onClick={handleArchive}
                isLoading={isProcessing}
                loadingText="Archiving..."
              >
                Archive
              </LoadingButton>
            </div>
          </div>
        </div>
      )}

      {/* Unarchive Confirmation Modal (P4) */}
      {modals.unarchive && (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        <div className="w-full max-w-md bg-bg-light rounded-lg shadow-lg p-6">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-text-primary">Unarchive Report(s)?</h3>
            <button className="text-text-muted hover:text-text-primary" onClick={() => closeModal('unarchive')}>&times;</button>
          </div>
          <p className="text-sm text-text-secondary mt-2">
            This action will restore the selected report(s) to the active list.
          </p>
          <div className="flex justify-end gap-3 mt-6">
            <button 
              className="bg-white text-text-secondary border border-border rounded-md text-sm font-semibold px-4 py-2 hover:bg-bg-medium" 
              onClick={() => closeModal('unarchive')}
              disabled={isProcessing}
            >
              Cancel
            </button>
            <LoadingButton
              variant="info"
              onClick={handleUnarchive}
              isLoading={isProcessing}
              loadingText="Restoring..."
            >
              Unarchive
            </LoadingButton>
          </div>
        </div>
      </div>
      )}
    </>
  );
}