import { BrowserRouter, Routes, Route, useLocation } from "react-router";
import { ErrorBoundary } from "react-error-boundary";
import { AuthProvider } from "./context/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Layout } from "./components/Layout";
import { ErrorFallback } from "./components/ErrorFallback";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { Apps } from "./pages/Apps";
import { AppDetail } from "./pages/AppDetail";
import { Notifications } from "./pages/Notifications";
import { Queue } from "./pages/Queue";

function ErrorBoundaryRoutes() {
  const location = useLocation();
  return (
    <ErrorBoundary FallbackComponent={ErrorFallback} resetKeys={[location.pathname]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="apps" element={<Apps />} />
              <Route path="apps/:appId" element={<AppDetail />} />
              <Route path="notifications" element={<Notifications />} />
              <Route path="queue" element={<Queue />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export function App() {
  return (
    <BrowserRouter basename="/admin">
      <ErrorBoundaryRoutes />
    </BrowserRouter>
  );
}
