import { useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, NavLink, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./AuthContext";
import { Login } from "./pages/Login";
import { SessionsList } from "./pages/SessionsList";
import { ModelReliability } from "./pages/ModelReliability";
import { UsersManagement } from "./pages/UsersManagement";
import { GmailAccounts } from "./pages/GmailAccounts";
import { ManualClaimCodes } from "./pages/ManualClaimCodes";
import { TargetApps } from "./pages/TargetApps";
import { SystemLogs } from "./pages/SystemLogs";
import {
  IconQr,
  IconKey,
  IconMail,
  IconChart,
  IconUsers,
  IconApps,
  IconLogs,
  IconMenu,
  IconClose,
  IconLogout,
} from "./icons";

type NavItem = {
  to: string;
  end?: boolean;
  label: string;
  icon: (props: { size?: number }) => React.ReactElement;
  adminOnly?: boolean;
};

// Single source of truth for both the sidebar/drawer and the mobile icon
// strip — one list to keep in sync instead of two.
const NAV_ITEMS: NavItem[] = [
  { to: "/", end: true, label: "Phiên kích hoạt", icon: IconQr },
  { to: "/claim-codes", label: "Mã kích hoạt", icon: IconKey },
  { to: "/gmail-accounts", label: "Tài khoản Gmail", icon: IconMail },
  { to: "/reports", label: "Báo cáo model", icon: IconChart },
  { to: "/users", label: "Người dùng", icon: IconUsers, adminOnly: true },
  { to: "/target-apps", label: "App cần cài", icon: IconApps, adminOnly: true },
  { to: "/logs", label: "System Logs", icon: IconLogs, adminOnly: true },
];

function Shell({ children }: { children: React.ReactNode }) {
  const { email, role, logout } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  const commonItems = NAV_ITEMS.filter((i) => !i.adminOnly);
  const adminItems = NAV_ITEMS.filter((i) => i.adminOnly);
  const isAdmin = role === "admin";
  // Mobile icon strip: common items always, admin items too if admin — kept
  // to one row (horizontally scrollable if it overflows on a narrow phone).
  const stripItems = isAdmin ? NAV_ITEMS : commonItems;

  return (
    <div className="shell shell-sidebar">
      <button className="mobile-topbar-menu-btn mobile-only" onClick={() => setDrawerOpen(true)} aria-label="Mở menu">
        <IconMenu />
      </button>
      <div className="mobile-topbar-title mobile-only">Autosetup</div>

      {drawerOpen && <div className="drawer-backdrop mobile-only" onClick={() => setDrawerOpen(false)} />}

      <aside className={`sidebar ${drawerOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-top-row">
          <div className="sidebar-title">Autosetup</div>
          <button className="drawer-close-btn mobile-only" onClick={() => setDrawerOpen(false)} aria-label="Đóng menu">
            <IconClose size={20} />
          </button>
        </div>
        <nav>
          {commonItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} onClick={() => setDrawerOpen(false)}>
              <item.icon />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        {isAdmin && (
          <>
            <div className="sidebar-admin-label">ADMIN</div>
            <nav className="sidebar-admin-section">
              {adminItems.map((item) => (
                <NavLink key={item.to} to={item.to} onClick={() => setDrawerOpen(false)}>
                  <item.icon />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </nav>
          </>
        )}
        <button className="logout-link" onClick={() => logout()}>
          <IconLogout />
          <span>Đăng xuất ({email})</span>
        </button>
      </aside>

      {/* "Menu ngang" — quick icon strip along the top on mobile, same idea
          as the sidebar but always visible without opening the drawer. */}
      <nav className="mobile-strip-nav mobile-only">
        {stripItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `mobile-strip-item${isActive ? " active" : ""}`}
          >
            <item.icon size={22} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <main key={location.pathname}>{children}</main>
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
