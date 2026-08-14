import { BrowserRouter, Routes, Route, Navigate, NavLink } from "react-router-dom";
import { AuthProvider, useAuth } from "./AuthContext";
import { Login } from "./pages/Login";
import { SessionsList } from "./pages/SessionsList";
import { ModelReliability } from "./pages/ModelReliability";
import { UsersManagement } from "./pages/UsersManagement";
import { GmailAccounts } from "./pages/GmailAccounts";
import { ManualClaimCodes } from "./pages/ManualClaimCodes";
import { TargetApps } from "./pages/TargetApps";
import { SystemLogs } from "./pages/SystemLogs";

function Shell({ children }: { children: React.ReactNode }) {
  const { email, role, logout } = useAuth();
  return (
    <div className="shell shell-sidebar">
      <aside className="sidebar">
        <div className="sidebar-title">Autosetup</div>
        <nav>
          {/* Chung cho mọi tài khoản — dữ liệu tự lọc theo đúng người dùng
              (mỗi staff chỉ thấy máy/mã/Gmail do chính mình tạo), admin thấy
              hết. Không cần tách nav riêng vì cùng 1 trang, khác dữ liệu. */}
          <NavLink to="/" end>
            Phiên kích hoạt
          </NavLink>
          <NavLink to="/claim-codes">Mã kích hoạt thủ công</NavLink>
          <NavLink to="/gmail-accounts">Tài khoản Gmail</NavLink>
          <NavLink to="/reports">Báo cáo model</NavLink>
        </nav>
        {role === "admin" && (
          <>
            <div className="sidebar-admin-label">ADMIN</div>
            <nav className="sidebar-admin-section">
              <NavLink to="/users">Người dùng</NavLink>
              <NavLink to="/target-apps">App cần cài</NavLink>
              <NavLink to="/logs">System Logs</NavLink>
            </nav>
          </>
        )}
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
            <GmailAccounts />
          </RequireAuth>
        }
      />
      <Route
        path="/claim-codes"
        element={
          <RequireAuth>
            <ManualClaimCodes />
          </RequireAuth>
        }
      />
      <Route
        path="/target-apps"
        element={
          <RequireAuth>
            <RequireAdmin>
              <TargetApps />
            </RequireAdmin>
          </RequireAuth>
        }
      />
      <Route
        path="/logs"
        element={
          <RequireAuth>
            <RequireAdmin>
              <SystemLogs />
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
