import { useEffect, useState } from "react";
import { api } from "../api";
import type { ModelReliabilityRow } from "../types";

export function ModelReliability() {
  const [rows, setRows] = useState<ModelReliabilityRow[]>([]);

  useEffect(() => {
    api.modelReliability().then(setRows);
  }, []);

  return (
    <div className="report-page">
      <h2>Độ tin cậy theo dòng máy</h2>
      <div className="table-scroll">
      <table className="sessions-table">
        <thead>
          <tr>
            <th>Model / Android</th>
            <th>Tổng</th>
            <th>Thành công</th>
            <th>Lỗi</th>
            <th>Tỉ lệ thành công</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.model}>
              <td>{r.model}</td>
              <td>{r.total}</td>
              <td>{r.enrolled}</td>
              <td>{r.failed}</td>
              <td>{r.total ? `${Math.round((r.enrolled / r.total) * 100)}%` : "—"}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5}>Chưa có dữ liệu.</td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}
