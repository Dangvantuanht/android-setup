import { Fragment, useEffect, useMemo, useState, type FormEvent } from "react";
import { api } from "../api";
import { useAuth } from "../AuthContext";
import type { DeviceLog, EnrollmentSession, QrUsage, WifiProfile } from "../types";

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
  // Kept as a raw string (not a clamped number) so the field can go through
  // an empty/intermediate state while typing — a controlled input that
  // snaps back to 1 the instant the field is cleared can never be retyped.
  const [countText, setCountText] = useState("1");
  const count = Math.min(50, Math.max(1, Number(countText) || 1));
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchIds, setBatchIds] = useState<string[]>([]);
  const [qrUsage, setQrUsage] = useState<QrUsage | null>(null);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [logs, setLogs] = useState<DeviceLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Admin sees dozens of staff mixed together in one flat list — grouping by
  // user + paginating keeps that scannable instead of an endless wall of rows.
  // Staff only ever see their own devices (silo'd server-side), so grouping
  // by 1 user would be pointless — they keep the flat paginated list.
  const PAGE_SIZE = 15;
  const [page, setPage] = useState(1);
  const [openUserKey, setOpenUserKey] = useState<string | null>(null);
  const [userModalPage, setUserModalPage] = useState(1);

  const userGroups = useMemo(() => {
    if (!isAdmin) return [];
    const map = new Map<string, EnrollmentSession[]>();
    for (const s of sessions) {
      const key = s.createdByStaffId || `email:${s.createdBy?.email || "unknown"}`;
      const list = map.get(key);
      if (list) list.push(s);
      else map.set(key, [s]);
    }
    return Array.from(map.entries())
      .map(([key, devices]) => ({
        key,
        email: devices[0].createdBy?.email || "Không rõ",
        devices,
        onlineCount: devices.filter((s) => s.status === "ENROLLED" && isOnline(s.lastSeenAt)).length,
        lastActivity: devices.reduce((max, s) => (s.createdAt > max ? s.createdAt : max), devices[0].createdAt),
      }))
      .sort((a, b) => (a.lastActivity < b.lastActivity ? 1 : -1));
  }, [sessions, isAdmin]);

  const totalOuterPages = Math.max(1, Math.ceil((isAdmin ? userGroups.length : sessions.length) / PAGE_SIZE));
  const pagedUserGroups = userGroups.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pagedSessions = sessions.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Keep the current page in range as the underlying list shrinks/grows
  // (revoked/deleted rows, new enrollments coming in via the SSE stream).
  useEffect(() => {
    if (page > totalOuterPages) setPage(totalOuterPages);
  }, [page, totalOuterPages]);

  const openUserGroup = userGroups.find((g) => g.key === openUserKey);
  const userModalTotalPages = openUserGroup ? Math.max(1, Math.ceil(openUserGroup.devices.length / PAGE_SIZE)) : 1;
  const userModalPagedDevices = openUserGroup
    ? openUserGroup.devices.slice((userModalPage - 1) * PAGE_SIZE, userModalPage * PAGE_SIZE)
    : [];

  function onOpenUser(key: string) {
    setOpenUserKey(key);
    setUserModalPage(1);
  }

  async function onToggleLogs(id: string) {
    if (expandedLogId === id) {
      setExpandedLogId(null);
      return;
    }
    setExpandedLogId(id);
    setLogsLoading(true);
    try {
      setLogs(await api.getSessionLogs(id));
    } finally {
      setLogsLoading(false);
    }
  }

  async function refresh() {
    setSessions(await api.listSessions());
    setQrUsage(await api.getMyQrUsage());
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
      setCountText("1");
      await refresh();
      if (created.length === 1) {
        setActiveQrId(created[0].id);
      } else {
        setBatchIds(created.map((s) => s.id));
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Không tạo được QR");
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
        {qrUsage && (
          <p className="hint">
            Hạn mức QR: {qrUsage.used} / {qrUsage.quota === null ? "∞" : qrUsage.quota} máy đã kích hoạt
            {qrUsage.quota !== null && qrUsage.used >= qrUsage.quota && " — đã hết hạn mức, liên hệ admin"}
          </p>
        )}
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
              value={countText}
              onChange={(e) => setCountText(e.target.value)}
              onBlur={() => setCountText(String(count))}
            />
          </label>
        </div>
        {!selectedWifiProfileId && (
          <label className="checkbox-label">
            <input type="checkbox" checked={saveWifi} onChange={(e) => setSaveWifi(e.target.checked)} />
            Lưu WiFi này để dùng lại sau
          </label>
        )}
        <button
          type="submit"
          disabled={creating || (qrUsage?.quota !== null && qrUsage !== null && qrUsage.used >= qrUsage.quota)}
        >
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

      {isAdmin ? (
        <div className="table-scroll">
          <table className="sessions-table">
            <thead>
              <tr>
                <th>Người dùng</th>
                <th>Số máy</th>
                <th>Đang online</th>
                <th>Hoạt động gần nhất</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pagedUserGroups.map((g) => (
                <tr key={g.key} className="user-group-row" onClick={() => onOpenUser(g.key)}>
                  <td>{g.email}</td>
                  <td>{g.devices.length}</td>
                  <td>{g.onlineCount > 0 ? `🟢 ${g.onlineCount}` : "—"}</td>
                  <td>{new Date(g.lastActivity).toLocaleString()}</td>
                  <td>
                    <button onClick={() => onOpenUser(g.key)}>Xem chi tiết</button>
                  </td>
                </tr>
              ))}
              {pagedUserGroups.length === 0 && (
                <tr>
                  <td colSpan={5}>Chưa có phiên nào.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        renderDeviceTable(pagedSessions, sessions.length === 0)
      )}

      {totalOuterPages > 1 && (
        <div className="pagination">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            ← Trước
          </button>
          <span>
            Trang {page}/{totalOuterPages}
          </span>
          <button disabled={page >= totalOuterPages} onClick={() => setPage((p) => p + 1)}>
            Sau →
          </button>
        </div>
      )}

      {openUserGroup && (
        <div className="modal-overlay" onClick={() => setOpenUserKey(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Máy của {openUserGroup.email}</h3>
              <button onClick={() => setOpenUserKey(null)}>Đóng</button>
            </div>
            {renderDeviceTable(userModalPagedDevices, openUserGroup.devices.length === 0)}
            {userModalTotalPages > 1 && (
              <div className="pagination">
                <button disabled={userModalPage <= 1} onClick={() => setUserModalPage((p) => p - 1)}>
                  ← Trước
                </button>
                <span>
                  Trang {userModalPage}/{userModalTotalPages}
                </span>
                <button
                  disabled={userModalPage >= userModalTotalPages}
                  onClick={() => setUserModalPage((p) => p + 1)}
                >
                  Sau →
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  function renderDeviceTable(devices: EnrollmentSession[], isEmpty: boolean) {
    return (
      <div className="table-scroll">
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
              <th>Tạo lúc</th>
              <th>Hết hạn / còn lại</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {devices.map((s) => {
              const deletable =
                ["EXPIRED", "REVOKED", "FAILED"].includes(s.status) || (isAdmin && s.status === "ENROLLED");
              return (
                <Fragment key={s.id}>
                  <tr className={`status-${s.status.toLowerCase()}`}>
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
                    <td>{new Date(s.createdAt).toLocaleString()}</td>
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
                      <button onClick={() => onToggleLogs(s.id)}>
                        {expandedLogId === s.id ? "Ẩn log" : "Xem log"}
                      </button>
                    </td>
                  </tr>
                  {expandedLogId === s.id && (
                    <tr className="log-row">
                      <td colSpan={12}>
                        {logsLoading ? (
                          <p>Đang tải log...</p>
                        ) : logs.length === 0 ? (
                          <p>Chưa có log nào từ máy này.</p>
                        ) : (
                          <div className="device-log-panel">
                            {logs.map((l) => (
                              <div key={l.id} className={`device-log-line log-${l.level}`}>
                                <span className="log-time">{new Date(l.createdAt).toLocaleTimeString()}</span>
                                <span className="log-source">[{l.source}]</span>
                                <span className="log-message">{l.message}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {isEmpty && (
              <tr>
                <td colSpan={12}>Chưa có phiên nào.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  }
}
