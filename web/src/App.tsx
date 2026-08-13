import { BrowserRouter, Routes, Route, Navigate, NavLink } from "react-router-dom";
import { AuthProvider, useAuth } from "./AuthContext";
import { Login } from "./pages/Login";
import { SessionsList } from "./pages/SessionsList";
import { ModelReliability } from "./pages/ModelReliability";

function Shell({ children }: { children: React.ReactNode }) {
  const { email, logout } = useAuth();
  return (
    <div className="shell shell-sidebar">
      <aside className="sidebar">
        <div className="sidebar-title">Autosetup</div>
        <nav>
          <NavLink to="/" end>
            Phiên kích hoạt
          </NavLink>
          <NavLink to="/reports">Báo cáo model</NavLink>
        </nav>
        <button className="logout-link" onClick={() => logout()}>
          Đăng xuất ({email})
        </button>
      </aside>
      <main>{children}</main>
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactElement }) {
  const { email, loading } = useAuth();
  if (loading) return <p>Đang tải...</p>;
  if (!email) return <Navigate to="/login" replace />;
  return <Shell>{children}</Shell>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <SessionsList />
          </RequireAuth>
        }
      />
      <Route
        path="/reports"
        element={
          <RequireAuth>
            <ModelReliability />
          </RequireAuth>
        }
      />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
