import { useEffect, useState } from "react";
import { api } from "../api";
import type { TargetApp } from "../types";

export function TargetApps() {
  const [apps, setApps] = useState<TargetApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [bulkText, setBulkText] = useState("");
  const [adding, setAdding] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  async function refresh() {
    setApps(await api.listTargetApps());
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function onBulkAdd() {
    if (!bulkText.trim()) return;
    setAdding(true);
    try {
      const { added, skipped } = await api.bulkAddTargetApps(bulkText);
      setBulkText("");
      await refresh();
      if (skipped > 0) {
        alert(`Đã thêm ${added} app. Bỏ qua ${skipped} dòng (sai định dạng hoặc đã tồn tại).`);
      }
    } finally {
      setAdding(false);
    }
  }

  async function onToggle(id: string, enabled: boolean) {
    await api.setTargetAppEnabled(id, enabled);
    await refresh();
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
    if (!confirm(`Xoá ${requested} app đã chọn khỏi danh sách?`)) return;
    await api.bulkDeleteTargetApps(Array.from(selectedIds));
    setSelectedIds(new Set());
    await refresh();
  }

  const enabledCount = apps.filter((a) => a.enabled).length;

  if (loading) return <p>Đang tải...</p>;

  return (
    <div className="users-page">
      <div className="users-header">
        <div>
          <h1>Danh sách app cần cài</h1>
          <p className="users-count">{apps.length} app ({enabledCount} đang bật)</p>
        </div>
      </div>

      <div className="create-form">
        <h2>Thêm app hàng loạt</h2>
        <p className="hint">
          Mỗi dòng 1 app, định dạng: <code>tên_gói_play_store|Tên hiển thị</code>
        </p>
        <textarea
          rows={6}
          className="bulk-textarea"
          placeholder={"com.whatsapp|WhatsApp\ncom.zhiliaoapp.musically|TikTok"}
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

      <table className="sessions-table">
        <thead>
          <tr>
            <th></th>
            <th>Tên hiển thị</th>
            <th>Package name</th>
            <th>Đang bật</th>
            <th>Thêm lúc</th>
          </tr>
        </thead>
        <tbody>
          {apps.map((a) => (
            <tr key={a.id}>
              <td>
                <input type="checkbox" checked={selectedIds.has(a.id)} onChange={() => toggleSelected(a.id)} />
              </td>
              <td>{a.label}</td>
              <td>{a.packageName}</td>
              <td>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={a.enabled}
                    onChange={(e) => onToggle(a.id, e.target.checked)}
                  />
                  <span className="toggle-track">
                    <span className="toggle-thumb" />
                  </span>
                </label>
              </td>
              <td>{new Date(a.createdAt).toLocaleDateString()}</td>
            </tr>
          ))}
          {apps.length === 0 && (
            <tr>
              <td colSpan={5}>Chưa có app nào.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
