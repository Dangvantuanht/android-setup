import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type { StaffUser } from "../types";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  REJECTED: "Đã từ chối",
};

// Matches the heartbeat-style "online" convention used elsewhere in the dashboard.
const ONLINE_THRESHOLD_MS = 5 * 60_000;

function isOnline(lastSeenAt: string | null): boolean {
  return !!lastSeenAt && Date.now() - new Date(lastSeenAt).getTime() < ONLINE_THRESHOLD_MS;
}

export function UsersManagement() {
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [autoApprove, setAutoApproveState] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [, forceTick] = useState(0);

  async function refresh() {
    const [list, setting] = await Promise.all([api.listUsers(), api.getAutoApprove()]);
    setUsers(list);
    setAutoApproveState(setting.enabled);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15_000);
    return () => clearInterval(t);
  }, []);

  // re-render every 30s so online/offline dots stay live between refreshes
  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  async function onToggleAutoApprove() {
    const next = !autoApprove;
    setAutoApproveState(next);
    await api.setAutoApprove(next);
  }

  async function onSetStatus(id: string, status: string) {
    await api.updateUser(id, { status });
    await refresh();
  }

  async function onSetRole(id: string, role: string) {
    await api.updateUser(id, { role });
    await refresh();
  }

  async function onDelete(id: string, email: string) {
    if (!confirm(`Xoá tài khoản ${email}?`)) return;
    await api.deleteUser(id);
    await refresh();
  }

  async function onEditQuota(id: string, current: number | null) {
    const input = prompt("Hạn mức QR (số máy được kích hoạt) — để trống = vô hạn:", current === null ? "" : String(current));
    if (input === null) return;
    const trimmed = input.trim();
    const qrQuota = trimmed === "" ? null : Number(trimmed);
    if (qrQuota !== null && (!Number.isInteger(qrQuota) || qrQuota < 0)) {
      alert("Hạn mức phải là số nguyên không âm, hoặc để trống.");
      return;
    }
    await api.updateUser(id, { qrQuota });
    await refresh();
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => u.email.toLowerCase().includes(q));
  }, [users, search]);

  const onlineCount = useMemo(() => users.filter((u) => isOnline(u.lastSeenAt)).length, [users]);

  if (loading) return <p>Đang tải...</p>;

  return (
    <div className="users-page">
      <div className="users-header">
        <div>
          <h1>Quản lý người dùng</h1>
          <p className="users-count">{users.length} tài khoản</p>
        </div>
        <div className="users-header-controls">
          <input
            className="users-search"
            placeholder="Tìm theo email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <label className="toggle-switch">
            <input type="checkbox" checked={autoApprove} onChange={onToggleAutoApprove} />
            <span className="toggle-track">
              <span className="toggle-thumb" />
            </span>
            Tự động duyệt đăng ký
          </label>
        </div>
      </div>

      <div className="users-status-card">
        <span className="status-dot online" />
        <div>
          <div className="users-status-label">Trạng thái user (5 phút gần nhất)</div>
          <div className="users-status-counts">
            <span className="status-dot online" /> <strong>{onlineCount}</strong> đang online
            <span className="sep">|</span>
            <span className="status-dot offline" /> {users.length - onlineCount} offline
          </div>
        </div>
      </div>

      <div className="table-scroll">
      <table className="sessions-table">
        <thead>
          <tr>
            <th></th>
            <th>Email</th>
            <th>Vai trò</th>
            <th>Trạng thái</th>
            <th>QR đã dùng / Tổng</th>
            <th>Hoạt động gần nhất</th>
            <th>Tạo lúc</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((u) => (
            <tr key={u.id}>
              <td>
                <span className={`status-dot ${isOnline(u.lastSeenAt) ? "online" : "offline"}`} />
              </td>
              <td>{u.email}</td>
              <td>{u.role === "admin" ? "Admin" : "Nhân viên"}</td>
              <td>{STATUS_LABEL[u.status] ?? u.status}</td>
              <td>
                {u.qrUsed} / {u.qrQuota === null ? "∞" : u.qrQuota}
              </td>
              <td>{u.lastSeenAt ? new Date(u.lastSeenAt).toLocaleString() : "—"}</td>
              <td>{new Date(u.createdAt).toLocaleDateString()}</td>
              <td className="users-actions">
                <button onClick={() => onEditQuota(u.id, u.qrQuota)}>Sửa</button>
                {u.status === "PENDING" && (
                  <>
                    <button onClick={() => onSetStatus(u.id, "APPROVED")}>Duyệt</button>
                    <button className="danger" onClick={() => onSetStatus(u.id, "REJECTED")}>
                      Từ chối
                    </button>
                  </>
                )}
                {u.status === "REJECTED" && (
                  <button onClick={() => onSetStatus(u.id, "APPROVED")}>Duyệt lại</button>
                )}
                {u.status === "APPROVED" && u.role === "staff" && (
                  <button onClick={() => onSetRole(u.id, "admin")}>Thăng Admin</button>
                )}
                {u.status === "APPROVED" && u.role === "admin" && (
                  <button onClick={() => onSetRole(u.id, "staff")}>Hạ quyền</button>
                )}
                <button className="danger" onClick={() => onDelete(u.id, u.email)}>
                  Xoá
                </button>
              </td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={8}>Không có tài khoản nào khớp.</td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}
