// frontend/src/AppRoutes.tsx
import { createBrowserRouter, RouterProvider, Navigate, Outlet } from 'react-router-dom';
import { useUserStore } from './state/userStore';

// Layouts & Pages
import MainLayout from './layouts/MainLayout';
import LoginPage from './pages/LoginPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import ProjectsDashboard from './pages/ProjectsDashboard';
import ReportsDashboard from './pages/ReportsDashboard';
import NewProjectPage from './pages/NewProjectPage';
import NewReportPage from './pages/NewReportPage';
import AdminPanelPage from './pages/AdminPanelPage';
import ReportPage from './pages/ReportPage';

// Wrapper for Protected Routes
function ProtectedRoute() {
  const isAuthenticated = useUserStore((state) => state.isAuthenticated);
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  // Renders the child route's element
  return <Outlet />;
}

// Wrapper for MainLayout to use as a Layout Route
function MainLayoutWrapper() {
  return (
    <MainLayout>
      <Outlet />
    </MainLayout>
  );
}

export default function AppRoutes() {
  const isAuthenticated = useUserStore((state) => state.isAuthenticated);

  const router = createBrowserRouter([
    {
      path: "/login",
      element: isAuthenticated ? <Navigate to="/projects" replace /> : <LoginPage />,
    },
    {
      path: "/reset-password",
      element: <ResetPasswordPage />,
    },
    {
      // Protected Routes Group
      element: <ProtectedRoute />,
      children: [
        {
          // Layout Group
          element: <MainLayoutWrapper />,
          children: [
            { path: "/projects", element: <ProjectsDashboard /> },
            { path: "/projects/new", element: <NewProjectPage /> },
            { path: "/projects/:projectId", element: <ReportsDashboard /> },
            { path: "/projects/:projectId/reports/new", element: <NewReportPage /> },
            { path: "/reports/:id", element: <ReportPage /> },
            { path: "/admin", element: <AdminPanelPage /> },
          ]
        }
      ]
    },
    {
      path: "*",
      element: <Navigate to={isAuthenticated ? "/projects" : "/login"} replace />,
    }
  ]);

  return <RouterProvider router={router} />;
}