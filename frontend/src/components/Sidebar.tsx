// frontend/src/components/Sidebar.tsx
import { useState, useEffect } from 'react';
import { useUserStore } from '../state/userStore';
import { Link, useNavigate } from 'react-router-dom';
import apiService from '../services/apiService';

interface Project {
  id: string;
  name: string;
}

export default function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  
  // Get the user's role to show/hide links
  const role = useUserStore((state) => state.role);
  const clearUser = useUserStore((state) => state.clearUser);
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const response = await apiService.get('/projects');
        setProjects(response.data);
      } catch (error) {
        console.error("Failed to fetch projects for sidebar:", error);
      }
    };

    fetchProjects();
  }, []);

  return (
    <aside 
      id="sidebar" 
      className={`bg-bg-light border-r border-border flex flex-col flex-shrink-0 transition-all duration-300 ease-in-out overflow-y-hidden ${isCollapsed ? 'w-20' : 'w-64'}`}
    >
      {/* Sidebar Header (U4) */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-border flex-shrink-0">
        <a href="#" className="flex items-center gap-2" id="sidebar-logo-wrapper" style={{ display: isCollapsed ? 'none' : 'flex' }}>
          <span className="text-lg font-bold text-text-primary whitespace-nowrap">AI Assessor Agent</span>
        </a>
        <button 
          id="hamburger-btn" 
          className={`p-2 rounded-md text-text-muted hover:bg-bg-medium hover:text-text-primary ${isCollapsed ? 'mx-auto' : ''}`}
          aria-label="Toggle sidebar"
          onClick={() => setIsCollapsed(!isCollapsed)} // (U7)
        >
          {/* Hamburger Icon */}
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
        </button>
      </div>

      {/* Sidebar Navigation */}
      <div className="flex flex-col flex-grow overflow-y-auto sidebar-scroll">
        <nav className="flex-grow px-4 py-4 space-y-1">
          
          {/* (U5) Projects Dashboard Link - Correct Icon */}
          <Link to="/projects" className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-semibold bg-bg-medium text-text-primary">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 flex-shrink-0"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>
            <span className="nav-text" style={{ display: isCollapsed ? 'none' : 'inline' }}>Projects Dashboard</span>
          </Link>

          {/* (P1) New Project Link - ADDED */}
          {(role === 'Project Manager' || role === 'Admin') && (
            <Link to="/projects/new" className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-text-secondary hover:bg-bg-medium hover:text-text-primary">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 flex-shrink-0"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              <span className="nav-text" style={{ display: isCollapsed ? 'none' : 'inline' }}>New Project</span>
            </Link>
          )}

          {/* (U6, P2) Project Sub-Navigation */}
          <div className="pt-2" style={{ display: isCollapsed ? 'none' : 'block' }}>
            <hr className="border-border" />
            <h3 className="px-3 pt-3 pb-1 text-xs font-semibold text-text-muted uppercase tracking-wider nav-text">Projects</h3>
          </div>
          
          {/* (U6, P2) Project List - Logic Update */}
          {/* These links will now be HIDDEN when collapsed, as you requested. */}
          <div style={{ display: isCollapsed ? 'none' : 'block' }}>
            {projects.length > 0 ? (
              projects.map((project) => (
                <Link
                  key={project.id}
                  to={`/projects/${project.id}`}
                  className="flex items-center py-2.5 pr-3 pl-11 rounded-md text-sm font-medium text-text-secondary hover:bg-bg-medium hover:text-text-primary"
                >
                  <span className="nav-text whitespace-nowrap overflow-hidden text-ellipsis">
                    {project.name}
                  </span>
                </Link>
              ))
            ) : (
              <div className="px-3 pt-3 pb-1 text-xs text-text-muted nav-text">
                No projects yet.
              </div>
            )}
          </div>

          {/* (A1) Admin Panel Link - ADDED */}
          {role === 'Admin' && (
            <>
              <div className="pt-2"><hr className="border-border" /></div>
              <Link to="/admin" className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-text-secondary hover:bg-bg-medium hover:text-text-primary nav-text">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 flex-shrink-0"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                <span className="nav-text" style={{ display: isCollapsed ? 'none' : 'inline' }}>Admin Panel</span>
              </Link>
            </>
          )}
        </nav>

        {/* Sidebar Footer (Log Out) */}
        <div className="mt-auto border-t border-border p-4">
          <button
            onClick={() => {
              clearUser();
              localStorage.removeItem('authToken');
              navigate('/login');
            }}
            className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-text-secondary hover:bg-bg-medium hover:text-text-primary w-full"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 flex-shrink-0"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            <span className="nav-text" style={{ display: isCollapsed ? 'none' : 'inline' }}>Log Out</span>
          </button>
        </div>
      </div>
    </aside>
  );
}