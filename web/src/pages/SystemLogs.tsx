import { useEffect, useState } from "react";
import { api } from "../api";
import type { AuditLog } from "../types";

const ACTION_LABEL: Record<string, string> = {
  LOGIN: "Đăng nhập",
  USER_REGISTERED: "Đăng ký tài khoản",
  USER_UPDATED: "Cập nhật người dùng",
  USER_DELETED: "Xoá người dùng",
  TARGET_APP_ADDED: "Thêm app cần cài",
  TARGET_APP_TOGGLED: "Bật/tắt app cần cài",
  TARGET_APP_DELETED: "Xoá app cần cài",
  GMAIL_ACCOUNT_ADDED: "Thêm tài khoản Gmail",
  CLAIM_CODE_CREATED: "Tạo mã kích hoạt",
};

export function SystemLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLogs(await api.listAuditLogs());
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 10_000);
    return () => clearInterval(t);
  }, []);

  if (loading) return <p>Đang tải...</p>;

  return (
    <div className="users-page">
      <div className="users-header">
        <div>
          <h1>System Logs</h1>
          <p className="users-count">{logs.length} sự kiện gần nhất</p>
        </div>
      </div>

      <table className="sessions-table">
        <thead>
          <tr>
            <th>Thời gian</th>
            <th>Tài khoản</th>
            <th>Hành động</th>
            <th>Chi tiết</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id}>
              <td>{new Date(l.createdAt).toLocaleString()}</td>
              <td>{l.staff?.email || "—"}</td>
              <td>{ACTION_LABEL[l.action] ?? l.action}</td>
              <td>{l.detail || "—"}</td>
            </tr>
          ))}
          {logs.length === 0 && (
            <tr>
              <td colSpan={4}>Chưa có sự kiện nào.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
