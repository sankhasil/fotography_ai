import { useEffect, useState } from "react";
import { apiFetch, PHASE_LABELS } from "../api";

const ACTIVE = ["queued", "scanning", "processing", "ai_culling"];

export default function QueuePanel({ onOpenJob, T }) {
  const [jobs, setJobs] = useState([]);
  const [cancelError, setCancelError] = useState(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const d = await apiFetch("GET", "/jobs/list");
        if (alive) setJobs(d.jobs || []);
      } catch { /* ponytail: transient fetch failure is fine; next tick retries. */ }
    };
    load();
    const t = setInterval(load, 3000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const cancel = async (e, jid) => {
    e.stopPropagation();
    setCancelError(null);
    try {
      await apiFetch("POST", `/jobs/${jid}/cancel`);
    } catch (err) { setCancelError(err.message); }
  };

  const time = (s) => s ? new Date(s).toLocaleTimeString() : "";
  const folderName = (f) => String(f || "").split("/").filter(Boolean).pop() || f;

  return (
    <div>
      {jobs.length === 0 ? (
        <div style={{ textAlign: "center", padding: "4rem 1rem", color: T.txtDim, fontFamily: T.mono, fontSize: 13 }}>
          No jobs yet · submit a scan and queue activity appears here live.
        </div>
      ) : (
        <>{(cancelError && (
          <div style={{ marginBottom: 10, fontSize: 11, fontFamily: T.mono, color: T.danger, background: T.bgDanger, border: `1px solid ${T.danger}`, padding: "8px 12px" }}>✗ {cancelError}</div>
        ))}
        {jobs.map(j => {
          const active = ACTIVE.includes(j.status);
          return (
            <div key={j.jobId} onClick={() => onOpenJob(j.jobId)} className="queue-row" style={{
              display: "flex", alignItems: "center", gap: 12, padding: "11px 14px",
              background: T.bgCard, border: `1px solid ${T.border}`,
              marginBottom: 8, cursor: "pointer", transition: "border-color 0.15s",
            }}>
              <div style={{
                width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                background: active ? T.accent : j.status === "archived" ? T.success : j.status === "error" || j.status === "cancelled" ? T.danger : T.border,
                boxShadow: active ? `0 0 6px ${T.accent}88` : "none",
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontFamily: T.mono, color: T.txt, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {folderName(j.folder)}
                </div>
                <div style={{ fontSize: 10, color: T.txtMuted, fontFamily: T.mono }}>
                  {PHASE_LABELS[j.status] || j.status} · {time(j.created_at)}
                </div>
              </div>
              {j.status === "queued" && (
                <button onClick={e => cancel(e, j.jobId)} style={{
                  fontSize: 10, padding: "4px 12px", cursor: "pointer",
                  fontFamily: T.mono, border: `1px solid ${T.danger}`, background: "transparent", color: T.danger,
                }}>✕ cancel</button>
              )}
            </div>
          );
        })}
        </>
      )}
    </div>
  );
}