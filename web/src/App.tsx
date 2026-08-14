import { BrowserRouter, Routes, Route, Navigate, NavLink } from "react-router-dom";
import { AuthProvider, useAuth } from "./AuthContext";
import { Login } from "./pages/Login";
import { SessionsList } from "./pages/SessionsList";
import { ModelReliability } from "./pages/ModelReliability";
import { UsersManagement } from "./pages/UsersManagement";
import { GmailAccounts } from "./pages/GmailAccounts";

function Shell({ children }: { children: React.ReactNode }) {
  const { email, role, logout } = useAuth();
  return (
    <div className="shell shell-sidebar">
      <aside className="sidebar">
        <div className="sidebar-title">Autosetup</div>
        <nav>
          <NavLink to="/" end>
            Phiên kích hoạt
          </NavLink>
          <NavLink to="/reports">Báo cáo model</NavLink>
          {role === "admin" && <NavLink to="/users">Người dùng</NavLink>}
          {role === "admin" && <NavLink to="/gmail-accounts">Tài khoản Gmail</NavLink>}
        </nav>
        <button className="logout-link" onClick={() => logout()}>
          Đăng xuất ({email})
        </button>
      </aside>
      <main>{children}</main>
    </div>
  );
}

function RequireAdmin({ children }: { children: React.ReactElement }) {
  const { role, loading } = useAuth();
  if (loading) return <p>Đang tải...</p>;
  if (role !== "admin") return <Navigate to="/" replace />;
  return children;
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
      <Route
        path="/users"
        element={
          <RequireAuth>
            <RequireAdmin>
              <UsersManagement />
            </RequireAdmin>
          </RequireAuth>
        }
      />
      <Route
        path="/gmail-accounts"
        element={
          <RequireAuth>
            <RequireAdmin>
              <GmailAccounts />
            </RequireAdmin>
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
