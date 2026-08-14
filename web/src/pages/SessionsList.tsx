import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api";
import { useAuth } from "../AuthContext";
import type { EnrollmentSession, WifiProfile } from "../types";

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

// Heartbeat fires every 3 min (see dpc-app HeartbeatAlarmReceiver) — allow some slack.
const ONLINE_THRESHOLD_MS = 7 * 60_000;

function elapsedSince(dateStr: string | null): string {
  if (!dateStr) return "—";
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins < 1) return "vừa xong";
  if (mins < 60) return `${mins} phút`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} giờ`;
  return `${Math.floor(hours / 24)} ngày`;
}

function isOnline(lastSeenAt: string | null): boolean {
  return !!lastSeenAt && Date.now() - new Date(lastSeenAt).getTime() < ONLINE_THRESHOLD_MS;
}

const LOCALES = [
  { value: "vi_VN", label: "Tiếng Việt" },
  { value: "ja_JP", label: "日本語" },
  { value: "en_US", label: "English" },
];

export function SessionsList() {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const [sessions, setSessions] = useState<EnrollmentSession[]>([]);
  const [activeQrId, setActiveQrId] = useState<string | null>(null);
  const [wifiSsid, setWifiSsid] = useState("");
  const [wifiPassword, setWifiPassword] = useState("");
  const [note, setNote] = useState("");
  const [locale, setLocale] = useState("ja_JP");
  const [creating, setCreating] = useState(false);
  const [, forceTick] = useState(0);

  const [wifiProfiles, setWifiProfiles] = useState<WifiProfile[]>([]);
  const [selectedWifiProfileId, setSelectedWifiProfileId] = useState("");
  const [saveWifi, setSaveWifi] = useState(false);
  const [count, setCount] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchIds, setBatchIds] = useState<string[]>([]);

  async function refresh() {
    setSessions(await api.listSessions());
  }

  async function refreshWifiProfiles() {
    setWifiProfiles(await api.listWifiProfiles());
  }

  useEffect(() => {
    refresh();
    refreshWifiProfiles();
    const es = new EventSource("/api/sessions/stream");
    es.onmessage = () => refresh();
    return () => es.close();
  }, []);

  function onSelectWifiProfile(id: string) {
    setSelectedWifiProfileId(id);
    const profile = wifiProfiles.find((p) => p.id === id);
    if (profile) {
      setWifiSsid(profile.ssid);
      setWifiPassword(profile.password || "");
    }
  }

  async function onDeleteWifiProfile(id: string) {
    if (!confirm("Xoá WiFi đã lưu này?")) return;
    await api.deleteWifiProfile(id);
    if (selectedWifiProfileId === id) setSelectedWifiProfileId("");
    await refreshWifiProfiles();
  }

  // re-render every second so the countdown timers stay live
  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      if (saveWifi && wifiSsid.trim()) {
        await api.createWifiProfile({ label: wifiSsid.trim(), ssid: wifiSsid.trim(), password: wifiPassword || undefined });
        await refreshWifiProfiles();
      }
      const { sessions: created } = await api.createSession({
        wifiSsid: wifiSsid || undefined,
        wifiPassword: wifiPassword || undefined,
        note: note || undefined,
        locale,
        count,
      });
      setWifiSsid("");
      setWifiPassword("");
      setNote("");
      setSelectedWifiProfileId("");
      setSaveWifi(false);
      setCount(1);
      await refresh();
      if (created.length === 1) {
        setActiveQrId(created[0].id);
      } else {
        setBatchIds(created.map((s) => s.id));
      }
    } finally {
      setCreating(false);
    }
  }

  async function onRevoke(id: string) {
    try {
      await api.revokeSession(id);
      if (activeQrId === id) setActiveQrId(null);
      setBatchIds((prev) => prev.filter((x) => x !== id));
      await refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Không thu hồi được");
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
    if (!confirm(`Xoá vĩnh viễn ${requested} mục đã chọn khỏi lịch sử?`)) return;
    const { deleted } = await api.bulkDeleteSessions(Array.from(selectedIds));
    setSelectedIds(new Set());
    await refresh();
    if (deleted < requested) {
      alert(
        isAdmin
          ? "Một số mục đang chờ không thể xoá (phiên còn hoạt động)."
          : "Một số mục đang chờ hoặc đã kích hoạt không thể xoá — chỉ admin mới xoá được mục đã kích hoạt.",
      );
    }
  }

  const activeSession = sessions.find((s) => s.id === activeQrId);

  // Auto-close the QR panel once the device finishes enrolling — no need to
  // make staff click "Đóng" manually every time.
  useEffect(() => {
    if (activeSession?.status === "ENROLLED") setActiveQrId(null);
  }, [activeSession?.status]);

  const batchSessions = batchIds
    .map((id) => sessions.find((s) => s.id === id))
    .filter((s): s is EnrollmentSession => !!s);

  // Drop each QR out of the strip as soon as its device enrolls, same as the
  // single-QR panel — no need to babysit which ones are already done.
  useEffect(() => {
    const stillPending = batchSessions.filter((s) => s.status === "PENDING").map((s) => s.id);
    if (stillPending.length !== batchIds.length) setBatchIds(stillPending);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions]);

  return (
    <div className="sessions-page">
      <form className="create-form" onSubmit={onCreate}>
        <h2>Tạo phiên kích hoạt mới</h2>
        <div className="fields">
          <label>
            WiFi đã lưu
            <div className="wifi-profile-row">
              <select
                value={selectedWifiProfileId}
                onChange={(e) => onSelectWifiProfile(e.target.value)}
              >
                <option value="">-- Nhập tay --</option>
                {wifiProfiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
              {selectedWifiProfileId && (
                <button
                  type="button"
                  className="danger"
                  onClick={() => onDeleteWifiProfile(selectedWifiProfileId)}
                >
                  Xoá
                </button>
              )}
            </div>
          </label>
          <label>
            Wi-Fi SSID (tùy chọn)
            <input
              value={wifiSsid}
              onChange={(e) => {
                setWifiSsid(e.target.value);
                setSelectedWifiProfileId("");
              }}
            />
          </label>
          <label>
            Wi-Fi Password
            <input
              value={wifiPassword}
              onChange={(e) => {
                setWifiPassword(e.target.value);
                setSelectedWifiProfileId("");
              }}
            />
          </label>
          <label>
            Ghi chú (IMEI, model...)
            <input value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <label>
            Ngôn ngữ máy
            <select value={locale} onChange={(e) => setLocale(e.target.value)}>
              {LOCALES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Số lượng QR
            <input
              type="number"
              min={1}
              max={50}
              value={count}
              onChange={(e) => setCount(Math.min(50, Math.max(1, Number(e.target.value) || 1)))}
            />
          </label>
        </div>
        {!selectedWifiProfileId && (
          <label className="checkbox-label">
            <input type="checkbox" checked={saveWifi} onChange={(e) => setSaveWifi(e.target.checked)} />
            Lưu WiFi này để dùng lại sau
          </label>
        )}
        <button type="submit" disabled={creating}>
          {creating ? "Đang tạo..." : count > 1 ? `Tạo ${count} QR` : "Tạo QR"}
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

      {batchSessions.length > 0 && (
        <div className="qr-strip-wrap">
          <div className="qr-strip-header">
            <h3>{batchSessions.length} QR đang chờ quét</h3>
            <button onClick={() => setBatchIds([])}>Đóng tất cả</button>
          </div>
          <div className="qr-strip">
            {batchSessions.map((s) => (
              <div key={s.id} className="qr-panel qr-panel-small">
                <img src={`/api/sessions/${s.id}/qr.png`} alt="Provisioning QR" width={180} />
                <p>Wi-Fi: {s.wifiSsid || "—"}</p>
                <p>Còn hiệu lực: {timeLeft(s.expiresAt)}</p>
                <button
                  className="danger"
                  disabled={!!s.downloadedAt}
                  title={s.downloadedAt ? "Máy đã tải APK — không thể thu hồi được nữa" : undefined}
                  onClick={() => onRevoke(s.id)}
                >
                  Thu hồi
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

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
            <th>Trạng thái</th>
            <th>Tên máy</th>
            <th>Mẫu máy</th>
            <th>Pin</th>
            <th>Từ lúc active</th>
            <th>Online</th>
            <th>Wi-Fi</th>
            <th>Ghi chú</th>
            {isAdmin && <th>Người tạo</th>}
            <th>Tạo lúc</th>
            <th>Hết hạn / còn lại</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => {
            const deletable =
              ["EXPIRED", "REVOKED", "FAILED"].includes(s.status) || (isAdmin && s.status === "ENROLLED");
            return (
              <tr key={s.id} className={`status-${s.status.toLowerCase()}`}>
                <td>
                  {deletable && (
                    <input
                      type="checkbox"
                      checked={selectedIds.has(s.id)}
                      onChange={() => toggleSelected(s.id)}
                    />
                  )}
                </td>
                <td>{STATUS_LABEL[s.status] ?? s.status}</td>
                <td>{s.note || s.deviceModel || "—"}</td>
                <td>{s.deviceModel || "—"}</td>
                <td>{s.batteryLevel != null ? `${s.batteryLevel}%` : "—"}</td>
                <td>{s.status === "ENROLLED" ? elapsedSince(s.enrolledAt) : "—"}</td>
                <td>
                  {s.status === "ENROLLED"
                    ? isOnline(s.lastSeenAt) ? "🟢 Online" : "⚪ Offline"
                    : "—"}
                </td>
                <td>{s.wifiSsid || "—"}</td>
                <td>{s.note || "—"}</td>
                {isAdmin && <td>{s.createdBy?.email || "—"}</td>}
                <td>{new Date(s.createdAt).toLocaleTimeString()}</td>
                <td>{s.status === "PENDING" ? timeLeft(s.expiresAt) : "—"}</td>
                <td>
                  {s.status === "PENDING" && (
                    <>
                      <button onClick={() => setActiveQrId(s.id)}>Xem QR</button>
                      <button
                        className="danger"
                        disabled={!!s.downloadedAt}
                        title={s.downloadedAt ? "Máy đã tải APK — không thể thu hồi được nữa" : undefined}
                        onClick={() => onRevoke(s.id)}
                      >
                        Thu hồi
                      </button>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
          {sessions.length === 0 && (
            <tr>
              <td colSpan={isAdmin ? 13 : 12}>Chưa có phiên nào.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
