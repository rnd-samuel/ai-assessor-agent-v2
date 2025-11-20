// frontend/src/AppRoutes.tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useUserStore } from './state/userStore';

// Layouts & Pages
import MainLayout from './layouts/MainLayout';
import LoginPage from './pages/LoginPage';
import ProjectsDashboard from './pages/ProjectsDashboard';
import ReportsDashboard from './pages/ReportsDashboard';
import NewProjectPage from './pages/NewProjectPage';
import NewReportPage from './pages/NewReportPage';
import AdminPanelPage from './pages/AdminPanelPage';
import ReportPage from './pages/ReportPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useUserStore((state) => state.isAuthenticated);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

export default function AppRoutes() {
  const isAuthenticated = useUserStore((state) => state.isAuthenticated);

  return (
    <BrowserRouter>
      <Routes>
        <Route 
          path="/login" 
          element={isAuthenticated ? <Navigate to="/projects" replace /> : <LoginPage />} 
        />

        {/* Specific Routes */}
        <Route 
          path="/projects/new" 
          element={
            <ProtectedRoute>
              <MainLayout>
                <NewProjectPage />
              </MainLayout>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/projects/:projectId" 
          element={
            <ProtectedRoute>
              <MainLayout>
                <ReportsDashboard />
              </MainLayout>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/projects" 
          element={
            <ProtectedRoute>
              <MainLayout>
                <ProjectsDashboard />
              </MainLayout>
            </ProtectedRoute>
          } 
        />

        <Route 
          path="/projects/:projectId/reports/new" 
          element={
            <ProtectedRoute>
              <MainLayout>
                <NewReportPage />
              </MainLayout>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/reports/:id" 
          element={
            <ProtectedRoute>
              <MainLayout>
                <ReportPage />
              </MainLayout>
            </ProtectedRoute>
          } 
        />

        <Route 
          path="/admin" 
          element={
            <ProtectedRoute>
                <AdminPanelPage />
            </ProtectedRoute>
          } 
        />

        {/* Default Routes */}
        <Route 
          path="/" 
          element={<Navigate to={isAuthenticated ? "/projects" : "/login"} replace />}
        />
        <Route 
          path="*" 
          element={<Navigate to={isAuthenticated ? "/projects" : "/login"} replace />} 
        />
      </Routes>
    </BrowserRouter>
  );
}