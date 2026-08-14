import { useEffect, useState } from "react";
import { api } from "../api";
import type { GmailAccount } from "../types";

const STATUS_LABEL: Record<string, string> = {
  AVAILABLE: "Còn trống",
  ASSIGNED: "Đã gán",
  FAILED: "Lỗi",
};

export function GmailAccounts() {
  const [accounts, setAccounts] = useState<GmailAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [bulkText, setBulkText] = useState("");
  const [adding, setAdding] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showPasswords, setShowPasswords] = useState(false);

  async function refresh() {
    setAccounts(await api.listGmailAccounts());
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function onBulkAdd() {
    if (!bulkText.trim()) return;
    setAdding(true);
    try {
      const { added, skipped } = await api.bulkAddGmailAccounts(bulkText);
      setBulkText("");
      await refresh();
      if (skipped > 0) {
        alert(`Đã thêm ${added} tài khoản. Bỏ qua ${skipped} dòng (sai định dạng hoặc email đã tồn tại).`);
      }
    } finally {
      setAdding(false);
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onBulkDelete() {
    const requested = selectedIds.size;
    if (requested === 0) return;
    if (!confirm(`Xoá vĩnh viễn ${requested} tài khoản Gmail đã chọn?`)) return;
    await api.bulkDeleteGmailAccounts(Array.from(selectedIds));
    setSelectedIds(new Set());
    await refresh();
  }

  const available = accounts.filter((a) => a.status === "AVAILABLE").length;
  const assigned = accounts.filter((a) => a.status === "ASSIGNED").length;

  if (loading) return <p>Đang tải...</p>;

  return (
    <div className="users-page">
      <div className="users-header">
        <div>
          <h1>Tài khoản Gmail</h1>
          <p className="users-count">{accounts.length} tài khoản</p>
        </div>
      </div>

      <div className="users-status-card">
        <div>
          <div className="users-status-label">Trạng thái pool</div>
          <div className="users-status-counts">
            <span className="status-dot online" /> <strong>{available}</strong> còn trống
            <span className="sep">|</span>
            <span className="status-dot offline" /> {assigned} đã gán
          </div>
        </div>
      </div>

      <div className="create-form">
        <h2>Thêm tài khoản hàng loạt</h2>
        <p className="hint">Mỗi dòng 1 tài khoản, định dạng: <code>email|password</code></p>
        <textarea
          rows={6}
          className="bulk-textarea"
          placeholder={"vd1@gmail.com|matkhau1\nvd2@gmail.com|matkhau2"}
          value={bulkText}
          onChange={(e) => setBulkText(e.target.value)}
        />
        <button onClick={onBulkAdd} disabled={adding || !bulkText.trim()}>
          {adding ? "Đang thêm..." : "Thêm danh sách"}
        </button>
      </div>

      {selectedIds.size > 0 && (
        <div className="bulk-actions">
          <span>{selectedIds.size} mục đã chọn</span>
          <button className="danger" onClick={onBulkDelete}>
            Xoá đã chọn
          </button>
        </div>
      )}

      <div className="table-toolbar">
        <label className="checkbox-label">
          <input type="checkbox" checked={showPasswords} onChange={(e) => setShowPasswords(e.target.checked)} />
          Hiện mật khẩu
        </label>
      </div>

      <table className="sessions-table">
        <thead>
          <tr>
            <th></th>
            <th>Email</th>
            <th>Mật khẩu</th>
            <th>Trạng thái</th>
            <th>Gán cho máy</th>
            <th>Thời gian gán</th>
            <th>Tạo lúc</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((a) => (
            <tr key={a.id}>
              <td>
                <input type="checkbox" checked={selectedIds.has(a.id)} onChange={() => toggleSelected(a.id)} />
              </td>
              <td>{a.email}</td>
              <td>{showPasswords ? a.password : "••••••••"}</td>
              <td>{STATUS_LABEL[a.status] ?? a.status}</td>
              <td>{a.assignedToSession ? a.assignedToSession.note || a.assignedToSession.deviceModel || a.assignedToSession.id : "—"}</td>
              <td>{a.assignedAt ? new Date(a.assignedAt).toLocaleString() : "—"}</td>
              <td>{new Date(a.createdAt).toLocaleDateString()}</td>
            </tr>
          ))}
          {accounts.length === 0 && (
            <tr>
              <td colSpan={7}>Chưa có tài khoản nào.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
