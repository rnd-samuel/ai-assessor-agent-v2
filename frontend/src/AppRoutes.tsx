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

        {/* --- (FIXED) ORDER MATTERS: Put more specific routes first --- */}

        <Route 
          path="/projects/new" // <-- Specific route
          element={
            <ProtectedRoute>
              <MainLayout>
                <NewProjectPage />
              </MainLayout>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/projects/:projectId" // <-- Dynamic route
          element={
            <ProtectedRoute>
              <MainLayout>
                <ReportsDashboard />
              </MainLayout>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/projects" // <-- General route
          element={
            <ProtectedRoute>
              <MainLayout>
                <ProjectsDashboard />
              </MainLayout>
            </ProtectedRoute>
          } 
        />

        <Route 
          path="/projects/:projectId/reports/new" // <-- Specific route
          element={
            <ProtectedRoute>
              <MainLayout>
                <NewReportPage />
              </MainLayout>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/reports/:id" // <-- Dynamic route
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

        {/* --- Default route --- */}
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