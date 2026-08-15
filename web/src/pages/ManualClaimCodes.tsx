import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api";
import { useAuth } from "../AuthContext";
import type { ManualClaimCode } from "../types";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Chờ dùng",
  CLAIMED: "Đã dùng",
  EXPIRED: "Hết hạn",
  REVOKED: "Đã thu hồi",
};

function timeLeft(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "hết hạn";
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function ManualClaimCodes() {
  const { role } = useAuth();
  const [codes, setCodes] = useState<ManualClaimCode[]>([]);
  const [note, setNote] = useState("");
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [, forceTick] = useState(0);

  async function refresh() {
    setCodes(await api.listClaimCodes());
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      await api.createClaimCode(note || undefined);
      setNote("");
      await refresh();
    } finally {
      setCreating(false);
    }
  }

  async function onRevoke(id: string) {
    await api.revokeClaimCode(id);
    await refresh();
  }

  if (loading) return <p>Đang tải...</p>;

  return (
    <div className="sessions-page">
      <form className="create-form" onSubmit={onCreate}>
        <h2>Tạo mã kích hoạt thủ công</h2>
        <p className="hint">
          Dùng cho máy đã tự kích hoạt bằng tay (không qua QR) — gõ mã này vào app helper để nhận Gmail.
        </p>
        <div className="fields">
          <label>
            Ghi chú (tuỳ chọn)
            <input value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>
        <button type="submit" disabled={creating}>
          {creating ? "Đang tạo..." : "Tạo mã"}
        </button>
      </form>

      <table className="sessions-table">
        <thead>
          <tr>
            <th>Mã</th>
            <th>Trạng thái</th>
            <th>Ghi chú</th>
            <th>Gmail đã gán</th>
            {role === "admin" && <th>Người tạo</th>}
            <th>Tạo lúc</th>
            <th>Hết hạn / còn lại</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {codes.map((c) => (
            <tr key={c.id} className={`status-${c.status.toLowerCase()}`}>
              <td><strong>{c.code}</strong></td>
              <td>{STATUS_LABEL[c.status] ?? c.status}</td>
              <td>{c.note || "—"}</td>
              <td>{c.gmailAccounts.length > 0 ? c.gmailAccounts.map((g) => g.email).join(", ") : "—"}</td>
              {role === "admin" && <td>{c.createdBy?.email || "—"}</td>}
              <td>{new Date(c.createdAt).toLocaleString()}</td>
              <td>{c.status === "PENDING" ? timeLeft(c.expiresAt) : "—"}</td>
              <td>
                {c.status === "PENDING" && (
                  <button className="danger" onClick={() => onRevoke(c.id)}>
                    Thu hồi
                  </button>
                )}
              </td>
            </tr>
          ))}
          {codes.length === 0 && (
            <tr>
              <td colSpan={role === "admin" ? 8 : 7}>Chưa có mã nào.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
