import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api";
import type { EnrollmentSession } from "../types";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Đang chờ",
  ENROLLED: "Đã kích hoạt",
  EXPIRED: "Hết hạn",
  REVOKED: "Đã thu hồi",
  FAILED: "Lỗi",
};

function timeLeft(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "hết hạn";
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function SessionsList() {
  const [sessions, setSessions] = useState<EnrollmentSession[]>([]);
  const [activeQrId, setActiveQrId] = useState<string | null>(null);
  const [wifiSsid, setWifiSsid] = useState("");
  const [wifiPassword, setWifiPassword] = useState("");
  const [note, setNote] = useState("");
  const [creating, setCreating] = useState(false);
  const [, forceTick] = useState(0);

  async function refresh() {
    setSessions(await api.listSessions());
  }

  useEffect(() => {
    refresh();
    const es = new EventSource("/api/sessions/stream");
    es.onmessage = () => refresh();
    return () => es.close();
  }, []);

  // re-render every second so the countdown timers stay live
  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const created = await api.createSession({
        wifiSsid: wifiSsid || undefined,
        wifiPassword: wifiPassword || undefined,
        note: note || undefined,
      });
      setWifiSsid("");
      setWifiPassword("");
      setNote("");
      await refresh();
      setActiveQrId(created.id);
    } finally {
      setCreating(false);
    }
  }

  async function onRevoke(id: string) {
    await api.revokeSession(id);
    if (activeQrId === id) setActiveQrId(null);
    await refresh();
  }

  const activeSession = sessions.find((s) => s.id === activeQrId);

  return (
    <div className="sessions-page">
      <form className="create-form" onSubmit={onCreate}>
        <h2>Tạo phiên kích hoạt mới</h2>
        <div className="fields">
          <label>
            Wi-Fi SSID (tùy chọn)
            <input value={wifiSsid} onChange={(e) => setWifiSsid(e.target.value)} />
          </label>
          <label>
            Wi-Fi Password
            <input value={wifiPassword} onChange={(e) => setWifiPassword(e.target.value)} />
          </label>
          <label>
            Ghi chú (IMEI, model...)
            <input value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>
        <button type="submit" disabled={creating}>
          {creating ? "Đang tạo..." : "Tạo QR"}
        </button>
      </form>

      {activeSession && (
        <div className="qr-panel">
          <img src={`/api/sessions/${activeSession.id}/qr.png`} alt="Provisioning QR" width={280} />
          <p>Wi-Fi: {activeSession.wifiSsid || "—"}</p>
          <p>Còn hiệu lực: {timeLeft(activeSession.expiresAt)}</p>
          <button className="danger" onClick={() => onRevoke(activeSession.id)}>
            Xóa QR
          </button>
          <button onClick={() => setActiveQrId(null)}>Đóng</button>
        </div>
      )}

      <table className="sessions-table">
        <thead>
          <tr>
            <th>Trạng thái</th>
            <th>Wi-Fi</th>
            <th>Ghi chú</th>
            <th>Máy</th>
            <th>Tạo lúc</th>
            <th>Hết hạn / còn lại</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => (
            <tr key={s.id} className={`status-${s.status.toLowerCase()}`}>
              <td>{STATUS_LABEL[s.status] ?? s.status}</td>
              <td>{s.wifiSsid || "—"}</td>
              <td>{s.note || "—"}</td>
              <td>{s.deviceModel ? `${s.deviceModel} (Android ${s.androidRelease})` : "—"}</td>
              <td>{new Date(s.createdAt).toLocaleTimeString()}</td>
              <td>{s.status === "PENDING" ? timeLeft(s.expiresAt) : "—"}</td>
              <td>
                {s.status === "PENDING" && (
                  <>
                    <button onClick={() => setActiveQrId(s.id)}>Xem QR</button>
                    <button className="danger" onClick={() => onRevoke(s.id)}>
                      Thu hồi
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
          {sessions.length === 0 && (
            <tr>
              <td colSpan={7}>Chưa có phiên nào.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
