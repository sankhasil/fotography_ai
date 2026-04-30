import { useState, useRef, useEffect, useCallback } from "react";

// ─── Theme tokens ─────────────────────────────────────────────────────────────
const THEMES = {
  dark: {
    bg: "#0d0d0f", bgPanel: "#131316", bgCard: "#1a1a1f", bgInput: "#1f1f26",
    border: "#2a2a35", borderHov: "#3d3d50",
    accent: "#7c6af7", accentDim: "#3d3568",
    success: "#3ecf8e", warn: "#f5a623", danger: "#e05252",
    txt: "#e8e8f0", txtMuted: "#7a7a95", txtDim: "#4a4a60",
    mono: "'JetBrains Mono', monospace", sans: "'DM Sans', system-ui, sans-serif",
    selectedBg: "#1e1a38", tableBg: "#14141a", tableAlt: "#17171e",
  },
  light: {
    bg: "#f7f7fb", bgPanel: "#ffffff", bgCard: "#ffffff", bgInput: "#f1f1f6",
    border: "#dcdce6", borderHov: "#c5c5d6",
    accent: "#6b5cff", accentDim: "#dcd8ff",
    success: "#2fbf71", warn: "#e09a1a", danger: "#d64545",
    txt: "#1a1a1f", txtMuted: "#5a5a70", txtDim: "#8a8aa0",
    mono: "'JetBrains Mono', monospace", sans: "'DM Sans', system-ui, sans-serif",
    selectedBg: "#e8e6ff", tableBg: "#f4f4f8", tableAlt: "#ffffff",
  },
};

// ─── API base ─────────────────────────────────────────────────────────────────
const API = "http://localhost:5000";

async function apiFetch(method, path, body = null) {
  const res = await fetch(API + path, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// CHANGE 1: Pipeline statuses — server.py uses these exact strings
// Old server: "pending" | "processing" | "done" | "error"
// New server: "queued" → "scanning" → "processing" → "ai_culling"
//             → "processed" (REVIEW GATE) → "archiving" → "archived"
// The job PAUSES at "processed" waiting for POST /jobs/:id/approve
// ─────────────────────────────────────────────────────────────────────────────
const PIPELINE_STEPS = ["queued","scanning","processing","ai_culling","processed","archiving","archived"];

const PHASE_LABELS = {
  queued:     "Queued…",
  scanning:   "Scanning files…",
  processing: "Detecting duplicates…",
  ai_culling: "AI culling images…",
  processed:  "Ready for review ↓",
  archiving:  "Archiving files…",
  archived:   "Done — files archived",
  reverted:   "Reverted",
  error:      "Error",
};

// ─── AI + Suggestions ─────────────────────────────────────────────────────────
const SUGGESTIONS = [
  "How should I organise 10,000+ photos on my hard drive?",
  "Best folder structure for travel photography?",
  "Help me cull duplicate photos — what to keep?",
  "Explain RAW vs JPEG for photo archiving",
  "Tips for naming photos so they sort well by date",
  "Best backup strategy for a large photo library?",
];

const SYSTEM_PROMPT = `You are Iris, a professional photography assistant.
You specialise in photo library organisation, duplicate detection, backup workflows,
file formats, and privacy-first offline tools. Be concise and practical.`;

async function askIris(messages) {
  const res = await fetch("http://localhost:11434/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llava", stream: false,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
    }),
  });
  if (!res.ok) throw new Error(`Ollama error ${res.status}`);
  const data = await res.json();
  return data.message?.content || "No response.";
}

// ─── Shared primitives ────────────────────────────────────────────────────────
function Stat({ label, value, color, T }) {
  return (
    <div style={{ background: T.bgCard, borderRadius: 8, padding: "12px 16px", border: `1px solid ${T.border}` }}>
      <div style={{ fontSize: 20, fontWeight: 600, color: color || T.txt, fontFamily: T.mono, letterSpacing: "-0.02em" }}>{value ?? "—"}</div>
      <div style={{ fontSize: 10, color: T.txtMuted, marginTop: 3, letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</div>
    </div>
  );
}

function TabBar({ tabs, active, onChange, T }) {
  return (
    <div style={{ display: "flex", borderBottom: `1px solid ${T.border}`, marginBottom: 20 }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)} style={{
          background: "none", border: "none", cursor: "pointer",
          padding: "10px 18px", fontFamily: T.mono, fontSize: 12, letterSpacing: "0.06em",
          color: active === t.id ? T.accent : T.txtMuted,
          borderBottom: active === t.id ? `2px solid ${T.accent}` : "2px solid transparent",
          marginBottom: -1, transition: "color 0.15s",
        }}>{t.label}</button>
      ))}
    </div>
  );
}

function ErrorBox({ msg, T }) {
  if (!msg) return null;
  return (
    <div style={{
      marginTop: 10, padding: "10px 14px", borderRadius: 8,
      border: `1px solid ${T.danger}`, background: "#2a1515",
      color: T.danger, fontSize: 11, fontFamily: T.mono, lineHeight: 1.5,
    }}>⚠ {msg}</div>
  );
}

function ToastBanner({ toast }) {
  if (!toast) return null;
  return (
    <div style={{
      position: "fixed", top: 20, right: 20, zIndex: 9999,
      padding: "10px 16px", borderRadius: 8,
      background: toast.ok ? "#1a3a25" : "#2a1515",
      border: `1px solid ${toast.ok ? "#3ecf8e" : "#e05252"}`,
      color: toast.ok ? "#3ecf8e" : "#e05252",
      fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
      boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
    }}>{toast.ok ? "✓" : "✗"} {toast.msg}</div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CHANGE 2: Pipeline progress bar — shows all 7 stages with dot connectors
// Replaces old simple 0-100% progress bar
// ─────────────────────────────────────────────────────────────────────────────
function PipelineBar({ status, T }) {
  const currentIdx = PIPELINE_STEPS.indexOf(status);
  return (
    <div style={{ marginTop: 14, marginBottom: 6 }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        {PIPELINE_STEPS.map((step, i) => {
          const done   = i < currentIdx;
          const active = i === currentIdx;
          return (
            <div key={step} style={{ display: "flex", alignItems: "center", flex: i < PIPELINE_STEPS.length - 1 ? 1 : 0 }}>
              <div style={{
                width: 10, height: 10, borderRadius: "50%", flexShrink: 0,
                background: done ? T.success : active ? T.accent : T.border,
                boxShadow: active ? `0 0 8px ${T.accent}88` : "none",
                transition: "all 0.3s",
              }} />
              {i < PIPELINE_STEPS.length - 1 && (
                <div style={{ flex: 1, height: 2, background: done ? T.success : T.border, transition: "background 0.3s" }} />
              )}
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
        {PIPELINE_STEPS.map((s, i) => (
          <span key={s} style={{
            fontSize: 8, fontFamily: T.mono, letterSpacing: "0.03em",
            color: s === status ? T.accent : T.txtDim,
            fontWeight: s === status ? 600 : 400,
            transform: i === 0 ? "none" : i === PIPELINE_STEPS.length - 1 ? "translateX(-100%)" : "translateX(-50%)",
          }}>{s.replace("_", "\u200b_")}</span>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SCANNER PANEL
// ─────────────────────────────────────────────────────────────────────────────
const LIMITS = [10, 20, 50, 100];

function ScannerPanel({ onJobReady, onJobArchived, T }) {
  const [folder, setFolder]       = useState("/Users/A200173944/Pictures");
  const [mode, setMode]           = useState("both");
  const [threshold, setThreshold] = useState(10);
  const [recursive, setRecursive] = useState(true);
  const [runAi, setRunAi]         = useState(false);
  // CHANGE 3: auto_archive — server.py skips the review gate if true
  const [autoArchive, setAutoArchive] = useState(false);
  const [limit, setLimit]         = useState(100);
  const [offset, setOffset]       = useState(0);

  const [countData, setCountData] = useState(null);
  const [counting, setCounting]   = useState(false);
  const [jobId, setJobId]         = useState(null);
  const [jobStatus, setJobStatus] = useState(null);
  const [scanning, setScanning]   = useState(false);
  const [error, setError]         = useState(null);

  const pollRef  = useRef(null);
  const totalPages = countData ? Math.ceil(countData.total / limit) : null;

  // ── Photo count (auto-debounced on folder change) ──────────────────────────
  const countPhotos = useCallback(async () => {
    if (!folder.trim()) return;
    setCounting(true); setError(null);
    try {
      const data = await apiFetch("GET",
        `/photos/count?folder=${encodeURIComponent(folder)}&recursive=${recursive}`);
      setCountData(data);
      setOffset(0);
    } catch (e) { setError(e.message); }
    finally { setCounting(false); }
  }, [folder, recursive]);

  useEffect(() => {
    const t = setTimeout(() => { if (folder.trim()) countPhotos(); }, 600);
    return () => clearTimeout(t);
  }, [folder, recursive]);

  // ─────────────────────────────────────────────────────────────────────────
  // CHANGE 4: runScan sends ai_cull + auto_archive to server.py
  // server.py /scan/start accepts: folder, mode, threshold, recursive,
  //   offset, limit, ai_cull, auto_archive
  // ─────────────────────────────────────────────────────────────────────────
  const runScan = async () => {
    if (!folder.trim()) return;
    setScanning(true); setError(null); setJobId(null); setJobStatus(null);
    try {
      const data = await apiFetch("POST", "/scan/start", {
        folder, mode, threshold, recursive,
        offset, limit,
        ai_cull: runAi,
        auto_archive: autoArchive,
      });
      setJobId(data.job_id);
      startPolling(data.job_id);
    } catch (e) {
      setError(e.message); setScanning(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // CHANGE 5: Polling handles the full pipeline
  //
  // OLD: poll → status==="done" → fetch /report → show table
  //
  // NEW: poll → status==="processed" → PAUSE → show report + Approve button
  //      after Approve → poll resumes → status==="archived" → done
  //
  // The parent component (App) resumes polling via onApprove callback
  // ─────────────────────────────────────────────────────────────────────────
  const startPolling = (jid) => {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const job = await apiFetch("GET", `/jobs/${jid}`);
        setJobStatus(job);

        if (job.status === "processed") {
          // Hit the review gate — stop scanning spinner, hand off to ResultsPanel
          clearInterval(pollRef.current);
          setScanning(false);
          onJobReady(job, jid);
        }

        if (job.status === "archived") {
          clearInterval(pollRef.current);
          setScanning(false);
          onJobArchived(job, jid);
        }

        if (job.status === "error") {
          clearInterval(pollRef.current);
          setScanning(false);
          setError(job.error || "Scan failed");
        }
      } catch (e) {
        clearInterval(pollRef.current);
        setScanning(false);
        setError(e.message);
      }
    }, 800);
  };

  useEffect(() => () => clearInterval(pollRef.current), []);

  const currentStatus = jobStatus?.status || "";

  const MODES = [
    { id: "exact",      label: "Exact",      desc: "SHA-256 · byte-identical" },
    { id: "perceptual", label: "Perceptual", desc: "pHash · visually similar" },
    { id: "both",       label: "Both",       desc: "Most thorough" },
  ];

  return (
    <div>
      {/* Folder */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 11, color: T.txtMuted, letterSpacing: "0.07em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Folder Path</label>
        <input value={folder} onChange={e => setFolder(e.target.value)} style={{
          width: "100%", fontFamily: T.mono, fontSize: 13, padding: "10px 14px",
          background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 8,
          color: T.txt, outline: "none",
        }} placeholder="/home/user/Pictures" />
      </div>

      {/* Count strip */}
      {countData && (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 16,
          padding: "12px 14px", background: T.bgCard, borderRadius: 8, border: `1px solid ${T.border}`,
        }}>
          {[["Total", countData.total, T.txt],
            ["Processed", countData.processed, T.success],
            ["Remaining", countData.unprocessed, T.accent]].map(([l, v, c]) => (
            <div key={l} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: c, fontFamily: T.mono }}>{(v||0).toLocaleString()}</div>
              <div style={{ fontSize: 10, color: T.txtMuted, letterSpacing: "0.06em", textTransform: "uppercase" }}>{l}</div>
            </div>
          ))}
        </div>
      )}
      {counting && <div style={{ fontSize: 11, color: T.txtMuted, fontFamily: T.mono, marginBottom: 12 }}>Counting…</div>}

      {/* Mode */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 11, color: T.txtMuted, letterSpacing: "0.07em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Detection Mode</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {MODES.map(m => (
            <div key={m.id} onClick={() => setMode(m.id)} style={{
              padding: "10px 12px", borderRadius: 8, cursor: "pointer",
              border: `1px solid ${mode === m.id ? T.accent : T.border}`,
              background: mode === m.id ? T.selectedBg : T.bgCard, transition: "all 0.15s",
            }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.txt, marginBottom: 2 }}>{m.label}</div>
              <div style={{ fontSize: 10, color: T.txtMuted }}>{m.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Threshold */}
      {mode !== "exact" && (
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, color: T.txtMuted, letterSpacing: "0.07em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
            Similarity Threshold — <span style={{ color: T.accent }}>{threshold}</span>
          </label>
          <input type="range" min={0} max={64} step={1} value={threshold}
            onChange={e => setThreshold(+e.target.value)} style={{ width: "100%", accentColor: T.accent }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: T.txtDim, marginTop: 4 }}>
            <span>0 identical</span><span>10 near-dup</span><span>30+ loose</span>
          </div>
        </div>
      )}

      {/* Batch + pagination */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 11, color: T.txtMuted, letterSpacing: "0.07em", textTransform: "uppercase", display: "block", marginBottom: 8 }}>Batch Size &amp; Page</label>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 4 }}>
            {LIMITS.map(l => (
              <button key={l} onClick={() => { setLimit(l); setOffset(0); }} style={{
                padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontFamily: T.mono, fontSize: 11,
                border: `1px solid ${limit === l ? T.accent : T.border}`,
                background: limit === l ? T.selectedBg : T.bgCard,
                color: limit === l ? T.accent : T.txtMuted,
              }}>{l}</button>
            ))}
          </div>
          {countData && totalPages > 1 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
              <button onClick={() => setOffset(o => Math.max(0, o-1))} disabled={offset === 0}
                style={{ padding: "4px 10px", borderRadius: 5, border: `1px solid ${T.border}`, background: T.bgCard, color: T.txtMuted, cursor: "pointer", fontSize: 12, opacity: offset === 0 ? 0.4 : 1 }}>‹</button>
              <span style={{ fontSize: 11, color: T.txtMuted, fontFamily: T.mono, minWidth: 80, textAlign: "center" }}>Page {offset+1} / {totalPages}</span>
              <button onClick={() => setOffset(o => Math.min(totalPages-1, o+1))} disabled={offset >= totalPages-1}
                style={{ padding: "4px 10px", borderRadius: 5, border: `1px solid ${T.border}`, background: T.bgCard, color: T.txtMuted, cursor: "pointer", fontSize: 12, opacity: offset >= totalPages-1 ? 0.4 : 1 }}>›</button>
            </div>
          )}
        </div>
        {countData && (
          <div style={{ fontSize: 10, color: T.txtDim, fontFamily: T.mono, marginTop: 6 }}>
            Photos {(offset*limit+1).toLocaleString()}–{Math.min((offset+1)*limit, countData.total).toLocaleString()} of {countData.total.toLocaleString()}
          </div>
        )}
      </div>

      {/* Options */}
      <div style={{ display: "flex", gap: 20, marginBottom: 20, flexWrap: "wrap" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: T.txtMuted, cursor: "pointer" }}>
          <input type="checkbox" checked={recursive} onChange={e => setRecursive(e.target.checked)} style={{ accentColor: T.accent }} />
          Scan subfolders
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: T.txtMuted, cursor: "pointer" }}>
          <input type="checkbox" checked={runAi} onChange={e => setRunAi(e.target.checked)} style={{ accentColor: T.accent }} />
          AI culling (LLaVA)
        </label>
        {/* CHANGE 6: auto_archive checkbox — maps to server.py auto_archive flag */}
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: T.warn, cursor: "pointer" }}>
          <input type="checkbox" checked={autoArchive} onChange={e => setAutoArchive(e.target.checked)} style={{ accentColor: T.warn }} />
          Auto-archive (skip review)
        </label>
      </div>

      {/* Run button */}
      <button onClick={runScan} disabled={scanning} style={{
        width: "100%", padding: "12px", fontFamily: T.mono, fontSize: 12, letterSpacing: "0.1em",
        borderRadius: 9, border: "none", cursor: scanning ? "not-allowed" : "pointer",
        background: scanning ? T.accentDim : T.accent, color: "#fff", fontWeight: 600,
      }}>
        {scanning ? (PHASE_LABELS[currentStatus] || "Starting…") : "▶  RUN SCAN"}
      </button>

      {/* CHANGE 7: PipelineBar replaces simple 0-100 progress bar */}
      {jobStatus && <PipelineBar status={currentStatus} T={T} />}

      {jobId && (
        <div style={{ marginTop: 4, fontSize: 9, color: T.txtDim, fontFamily: T.mono }}>
          job: {jobId}
        </div>
      )}

      <ErrorBox msg={error} T={T} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RESULTS PANEL
// ─────────────────────────────────────────────────────────────────────────────
// CHANGE 8: Now receives full `job` object instead of `report`
// Because server.py's /report only returns { jobId, aiKeep, aiDelete,
//   exactGroups (int), similarGroups (int) } — NOT the file detail arrays.
// Full data including archive_log lives in job.reportData on the server.
// We read: job.reportData, job.status, job.actions, job.archive_log
// ─────────────────────────────────────────────────────────────────────────────
function ResultsPanel({ job, jobId, onApprove, onUndo, T }) {
  const [filter, setFilter]           = useState("all");
  const [markedDelete, setMarkedDelete] = useState({});
  const [deletingId, setDeletingId]   = useState(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [approving, setApproving]     = useState(false);
  const [undoing, setUndoing]         = useState(false);
  const [toast, setToast]             = useState(null);

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  if (!job) return (
    <div style={{ textAlign: "center", padding: "4rem 1rem", color: T.txtDim, fontFamily: T.mono, fontSize: 13 }}>
      <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.3 }}>◈</div>
      Run a scan first to see results.
    </div>
  );

  const report     = job.reportData || {};
  const jobStatus  = job.status;
  const actions    = job.actions || {};
  const isArchived = jobStatus === "archived";
  const isReverted = jobStatus === "reverted";

  // CHANGE 9: New server report shape
  // exactGroups / similarGroups = plain NUMBERS (not arrays!)
  // aiKeep / aiDelete = arrays of objects with path, sharpness, exposure etc.
  const exactCount   = typeof report.exactGroups   === "number" ? report.exactGroups   : 0;
  const similarCount = typeof report.similarGroups === "number" ? report.similarGroups : 0;
  const aiKeep       = Array.isArray(report.aiKeep)   ? report.aiKeep   : [];
  const aiDelete     = Array.isArray(report.aiDelete) ? report.aiDelete : [];
  const allFiles     = [...aiKeep, ...aiDelete];

  const markedCount = Object.values(markedDelete).filter(v => v === true).length;

  const toggleMark   = path => setMarkedDelete(p => ({ ...p, [path]: !p[path] }));
  const clearMarks   = () => setMarkedDelete({});
  const markAllAiDelete = () => {
    const upd = {};
    aiDelete.forEach(f => { upd[f.path] = true; });
    setMarkedDelete(upd);
  };

  // Single file archive
  const archiveFile = async (filePath) => {
    const fileId = filePath.split("/").pop();
    setDeletingId(filePath);
    try {
      await apiFetch("POST", `/jobs/${jobId}/mark-delete`, { file_ids: [fileId] });
      await apiFetch("POST", `/jobs/${jobId}/delete`,      { file_ids: [fileId] });
      setMarkedDelete(p => ({ ...p, [filePath]: "done" }));
      showToast("Moved to _ARCHIVED/");
    } catch (e) { showToast(e.message, false); }
    finally { setDeletingId(null); }
  };

  // Bulk archive
  const archiveMarked = async () => {
    const paths = Object.entries(markedDelete).filter(([,v]) => v === true).map(([k]) => k);
    const ids   = paths.map(p => p.split("/").pop());
    if (!ids.length) return;
    setBulkLoading(true);
    try {
      await apiFetch("POST", `/jobs/${jobId}/mark-delete`, { file_ids: ids });
      await apiFetch("POST", `/jobs/${jobId}/delete`,      { file_ids: ids });
      const upd = { ...markedDelete };
      paths.forEach(p => { upd[p] = "done"; });
      setMarkedDelete(upd);
      showToast(`Archived ${ids.length} file(s)`);
    } catch (e) { showToast(e.message, false); }
    finally { setBulkLoading(false); }
  };

  // CHANGE 10: Approve — POSTs to /jobs/:id/approve
  // Server then unblocks the worker which moves to archiving→archived
  // After calling this, App resumes polling via onApprove callback
  const handleApprove = async () => {
    setApproving(true);
    try {
      await apiFetch("POST", `/jobs/${jobId}/approve`);
      showToast("Approved — archiving started…");
      onApprove(jobId);
    } catch (e) { showToast(e.message, false); }
    finally { setApproving(false); }
  };

  // CHANGE 11: Undo — POSTs to /jobs/:id/undo
  // Server reads archive_log and moves files back to original paths
  const handleUndo = async () => {
    if (!confirm("Restore all archived files to their original locations?")) return;
    setUndoing(true);
    try {
      const res = await apiFetch("POST", `/jobs/${jobId}/undo`);
      showToast(`Restored ${res.restored?.length || 0} file(s)`);
      onUndo(jobId);
    } catch (e) { showToast(e.message, false); }
    finally { setUndoing(false); }
  };

  const filtered = filter === "keep"   ? aiKeep
                 : filter === "delete" ? aiDelete
                 : allFiles;

  return (
    <div>
      <ToastBanner toast={toast} />

      {/* CHANGE 12: Status banner with Approve / Undo buttons */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 16px", borderRadius: 8, marginBottom: 16,
        border: `1px solid ${isArchived ? T.success : jobStatus === "processed" ? T.warn : T.border}`,
        background: isArchived ? "#1a3a25" : jobStatus === "processed" ? "#2a2010" : T.bgCard,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 8, height: 8, borderRadius: "50%",
            background: isArchived ? T.success : jobStatus === "processed" ? T.warn : T.accent,
            boxShadow: `0 0 6px ${isArchived ? T.success : jobStatus === "processed" ? T.warn : T.accent}88`,
          }} />
          <span style={{ fontSize: 12, color: T.txt, fontFamily: T.mono }}>
            {PHASE_LABELS[jobStatus] || jobStatus}
          </span>
          {isReverted && <span style={{ fontSize: 10, color: T.warn, fontFamily: T.mono }}>· files restored</span>}
          {/* Live pipeline bar inside the banner when archiving */}
          {jobStatus === "archiving" && (
            <span style={{ fontSize: 10, color: T.accent, fontFamily: T.mono, animation: "pulse 1s infinite" }}>⟳ archiving…</span>
          )}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          {/* Approve button — only visible when paused at review gate */}
          {jobStatus === "processed" && !actions.approved && (
            <button onClick={handleApprove} disabled={approving} style={{
              padding: "6px 16px", borderRadius: 6, border: `1px solid ${T.success}`,
              background: "#1a3a25", color: T.success, fontFamily: T.mono, fontSize: 11,
              cursor: approving ? "not-allowed" : "pointer", fontWeight: 600,
            }}>
              {approving ? "Approving…" : "✓ Approve & Archive"}
            </button>
          )}

          {/* Undo button — only visible after archiving completes */}
          {isArchived && !isReverted && (
            <button onClick={handleUndo} disabled={undoing} style={{
              padding: "6px 14px", borderRadius: 6, border: `1px solid ${T.warn}`,
              background: "#2a2010", color: T.warn, fontFamily: T.mono, fontSize: 11,
              cursor: undoing ? "not-allowed" : "pointer",
            }}>
              {undoing ? "Restoring…" : "↩ Undo Archive"}
            </button>
          )}
        </div>
      </div>

      {/* CHANGE 13: Summary stats — exactGroups/similarGroups are numbers now */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 18 }}>
        <Stat label="Exact dupes"    value={exactCount}      color={T.success} T={T} />
        <Stat label="Similar groups" value={similarCount}    color={T.warn}    T={T} />
        <Stat label="AI keep"        value={aiKeep.length}   color={T.accent}  T={T} />
        <Stat label="AI delete"      value={aiDelete.length} color={T.danger}  T={T} />
      </div>

      {/* AI culling table */}
      {allFiles.length > 0 ? (
        <>
          {/* Filter + bulk actions */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
            <div style={{ display: "flex", gap: 6 }}>
              {[["all", allFiles.length], ["keep", aiKeep.length], ["delete", aiDelete.length]].map(([f, n]) => (
                <button key={f} onClick={() => setFilter(f)} style={{
                  fontSize: 10, padding: "4px 12px", borderRadius: 20, cursor: "pointer",
                  fontFamily: T.mono, letterSpacing: "0.05em",
                  border: `1px solid ${filter === f ? T.accent : T.border}`,
                  background: filter === f ? T.selectedBg : "transparent",
                  color: filter === f ? T.accent : T.txtMuted,
                }}>{f} ({n})</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {markedCount > 0 && <span style={{ fontSize: 11, color: T.txtMuted, fontFamily: T.mono }}>{markedCount} marked</span>}
              <button onClick={markAllAiDelete} style={{ padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontFamily: T.mono, fontSize: 10, border: `1px solid ${T.border}`, background: T.bgCard, color: T.txtMuted }}>
                Mark AI-delete
              </button>
              {markedCount > 0 && <>
                <button onClick={clearMarks} style={{ padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontFamily: T.mono, fontSize: 10, border: `1px solid ${T.border}`, background: T.bgCard, color: T.txtMuted }}>Clear</button>
                <button onClick={archiveMarked} disabled={bulkLoading} style={{ padding: "5px 14px", borderRadius: 6, cursor: "pointer", fontFamily: T.mono, fontSize: 10, border: `1px solid ${T.danger}`, background: "#2a1515", color: T.danger, fontWeight: 600 }}>
                  {bulkLoading ? "Archiving…" : `Archive ${markedCount}`}
                </button>
              </>}
            </div>
          </div>

          {/* Table */}
          <div style={{ border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden" }}>
            <div style={{
              display: "grid", gridTemplateColumns: "60px 1fr 70px 70px 70px 60px 110px",
              padding: "9px 14px", background: T.bgCard, borderBottom: `1px solid ${T.border}`,
              fontSize: 10, color: T.txtDim, letterSpacing: "0.07em", textTransform: "uppercase", fontFamily: T.mono,
            }}>
              <span>AI</span><span>File</span>
              <span style={{ textAlign: "right" }}>Sharp</span>
              <span style={{ textAlign: "right" }}>Exp</span>
              <span style={{ textAlign: "right" }}>Subj</span>
              <span style={{ textAlign: "right" }}>Score</span>
              <span style={{ textAlign: "right" }}>Action</span>
            </div>

            {filtered.map((file, i) => {
              const isAiDelete = aiDelete.includes(file);
              const isDone     = markedDelete[file.path] === "done";
              const isMarked   = markedDelete[file.path] === true;
              const isArchiving= deletingId === file.path;
              const score      = (file.sharpness||0)+(file.exposure||0)+(file.subject_presence||0)+(file.composition||0)+(file.emotion||0);
              const fname      = (file.path||"").split("/").pop();

              return (
                <div key={file.path||i} style={{
                  display: "grid", gridTemplateColumns: "60px 1fr 70px 70px 70px 60px 110px",
                  padding: "8px 14px", alignItems: "center",
                  background: isDone ? "#1a2a1a" : isMarked ? "#2a1e1e" : i%2===0 ? T.tableBg : T.tableAlt,
                  borderBottom: i < filtered.length-1 ? `1px solid ${T.border}` : "none",
                  opacity: isDone ? 0.5 : 1, transition: "background 0.2s",
                }}>
                  <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 3, fontWeight: 600, fontFamily: T.mono,
                    background: isAiDelete ? "#2e1818" : "#1a3a25",
                    color: isAiDelete ? T.danger : T.success }}>
                    {isAiDelete ? "DELETE" : "KEEP"}
                  </span>

                  <div>
                    <div style={{ fontSize: 11, color: T.txt, fontFamily: T.mono, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: isDone ? "line-through" : "none" }}>{fname}</div>
                    {file.reason && <div style={{ fontSize: 9, color: T.txtDim, marginTop: 1 }}>{file.reason}</div>}
                  </div>

                  {/* CHANGE 14: Score columns — from AI cull result object */}
                  {[file.sharpness, file.exposure, file.subject_presence].map((v, ci) => (
                    <span key={ci} style={{
                      fontSize: 11, textAlign: "right", fontFamily: T.mono,
                      color: v >= 8 ? T.success : v >= 5 ? T.warn : T.danger,
                    }}>{v ?? "—"}</span>
                  ))}
                  <span style={{ fontSize: 11, textAlign: "right", fontFamily: T.mono, fontWeight: 600, color: score >= 35 ? T.success : score >= 20 ? T.warn : T.danger }}>{score}</span>

                  <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                    {isDone ? (
                      <span style={{ fontSize: 10, color: T.success, fontFamily: T.mono }}>✓ archived</span>
                    ) : (
                      <>
                        <input type="checkbox" checked={isMarked} onChange={() => toggleMark(file.path)}
                          style={{ accentColor: T.danger, cursor: "pointer" }} />
                        <button onClick={() => archiveFile(file.path)} disabled={isArchiving} style={{
                          fontSize: 10, padding: "3px 8px", borderRadius: 4, cursor: "pointer",
                          fontFamily: T.mono, border: `1px solid ${T.danger}`,
                          background: "transparent", color: T.danger, opacity: isArchiving ? 0.5 : 1,
                        }}>{isArchiving ? "…" : "archive"}</button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        // No AI culling — show plain summary + archive log
        <div style={{ padding: "24px", background: T.bgCard, borderRadius: 10, border: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 13, color: T.txtMuted, marginBottom: 8, textAlign: "center" }}>
            Scan complete — AI culling was not enabled.
          </div>
          <div style={{ fontSize: 11, color: T.txtDim, textAlign: "center", marginBottom: 16 }}>
            Found {exactCount} exact duplicate group(s) and {similarCount} similar group(s).
          </div>
          {/* CHANGE 15: Archive log — comes from job.archive_log on server */}
          {job.archive_log?.length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: T.txtMuted, fontFamily: T.mono, marginBottom: 8 }}>
                Archive log ({job.archive_log.length} files moved to _ARCHIVED/):
              </div>
              {job.archive_log.map((e, i) => (
                <div key={i} style={{ fontSize: 10, color: T.txtDim, fontFamily: T.mono, padding: "4px 8px", borderRadius: 4, background: T.bgInput, marginBottom: 3 }}>
                  {e.error
                    ? <span style={{ color: T.danger }}>✗ {e.error}</span>
                    : <span style={{ color: T.success }}>✓ {e.from?.split("/").pop()} → _ARCHIVED/</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AI CHAT PANEL (unchanged from before)
// ─────────────────────────────────────────────────────────────────────────────
function ChatPanel({ T }) {
  const [messages, setMessages] = useState([{
    role: "assistant",
    content: "Hi! I'm **Iris**, your photography & photo library assistant.\n\nAsk me anything — folder organisation, duplicate culling, RAW vs JPEG, backup workflows, or camera technique.",
  }]);
  const [input, setInput]     = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const bottomRef             = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  const send = async (text) => {
    const q = (text || input).trim();
    if (!q || loading) return;
    setInput(""); setError(null);
    const next = [...messages, { role: "user", content: q }];
    setMessages(next);
    setLoading(true);
    try {
      const reply = await askIris(next.map(m => ({ role: m.role, content: m.content })));
      setMessages(p => [...p, { role: "assistant", content: reply }]);
    } catch (e) { setError("Could not reach Ollama. Is it running?"); }
    finally { setLoading(false); }
  };

  const renderMd = t => t
    .replace(/\*\*(.*?)\*\*/g, `<strong style="color:${T.txt};font-weight:600">$1</strong>`)
    .replace(/^- (.+)/gm, `<div style="display:flex;gap:8px;margin:2px 0"><span style="color:${T.accent}">▸</span><span>$1</span></div>`)
    .replace(/\n/g, "<br/>");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: 520 }}>
      <div style={{ flex: 1, overflowY: "auto", paddingBottom: 12, display: "flex", flexDirection: "column", gap: 12 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: "flex", gap: 10, flexDirection: m.role === "user" ? "row-reverse" : "row" }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0, background: m.role === "assistant" ? T.accentDim : T.bgCard, border: `1px solid ${m.role === "assistant" ? T.accent : T.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontFamily: T.mono, color: m.role === "assistant" ? T.accent : T.txtMuted }}>
              {m.role === "assistant" ? "◈" : "U"}
            </div>
            <div style={{ maxWidth: "82%", padding: "10px 14px", borderRadius: m.role === "user" ? "12px 4px 12px 12px" : "4px 12px 12px 12px", background: m.role === "user" ? T.selectedBg : T.bgCard, border: `1px solid ${m.role === "user" ? T.accentDim : T.border}`, fontSize: 13, color: T.txtMuted, lineHeight: 1.65, fontFamily: T.sans }}
              dangerouslySetInnerHTML={{ __html: renderMd(m.content) }} />
          </div>
        ))}
        {loading && (
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: T.accentDim, border: `1px solid ${T.accent}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: T.accent }}>◈</div>
            <div style={{ padding: "12px 16px", background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "4px 12px 12px 12px", display: "flex", gap: 5, alignItems: "center" }}>
              {[0,1,2].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: T.accent, animation: `bounce 1.2s ease-in-out ${i*0.2}s infinite` }} />)}
            </div>
          </div>
        )}
        {error && <div style={{ fontSize: 11, color: T.danger, textAlign: "center", fontFamily: T.mono }}>{error}</div>}
        <div ref={bottomRef} />
      </div>
      {messages.length === 1 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
          {SUGGESTIONS.map((s, i) => (
            <button key={i} onClick={() => send(s)} style={{ fontSize: 11, padding: "5px 10px", borderRadius: 6, cursor: "pointer", border: `1px solid ${T.border}`, background: T.bgCard, color: T.txtMuted, fontFamily: T.sans, lineHeight: 1.3, textAlign: "left" }}>{s}</button>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
          placeholder="Ask Iris about photography or photo organisation…" disabled={loading}
          style={{ flex: 1, fontFamily: T.sans, fontSize: 13, padding: "11px 14px", background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 9, color: T.txt, outline: "none" }} />
        <button onClick={() => send()} disabled={loading || !input.trim()} style={{ padding: "11px 18px", borderRadius: 9, border: "none", cursor: "pointer", background: (loading || !input.trim()) ? T.accentDim : T.accent, color: "#fff", fontFamily: T.mono, fontSize: 12, fontWeight: 600 }}>Send</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [theme, setTheme]       = useState("dark");
  const T                       = THEMES[theme];
  const [tab, setTab]           = useState("scanner");

  // CHANGE 16: Store full job object (not just report) — includes status, actions, archive_log
  const [currentJob, setCurrentJob]     = useState(null);
  const [currentJobId, setCurrentJobId] = useState(null);

  const pollRef = useRef(null);

  // Called when scanner hits "processed" (review gate)
  const handleJobReady = (job, jid) => {
    setCurrentJob(job);
    setCurrentJobId(jid);
    setTab("results");
  };

  // Called when job reaches "archived"
  const handleJobArchived = (job) => {
    setCurrentJob(job);
  };

  // CHANGE 17: Resume polling after Approve until "archived" | "error"
  const handleApprove = (jid) => {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const job = await apiFetch("GET", `/jobs/${jid}`);
        setCurrentJob(job);
        if (["archived", "reverted", "error"].includes(job.status)) {
          clearInterval(pollRef.current);
        }
      } catch (_) { clearInterval(pollRef.current); }
    }, 800);
  };

  // CHANGE 18: Refresh job after Undo
  const handleUndo = async (jid) => {
    try {
      const job = await apiFetch("GET", `/jobs/${jid}`);
      setCurrentJob(job);
    } catch (_) {}
  };

  useEffect(() => () => clearInterval(pollRef.current), []);

  const groupCount = currentJob?.reportData
    ? (currentJob.reportData.exactGroups || 0) + (currentJob.reportData.similarGroups || 0)
    : 0;

  const TABS = [
    { id: "scanner", label: "◈ SCANNER" },
    { id: "results", label: `▣ RESULTS${currentJob ? ` (${groupCount})` : ""}` },
    { id: "iris",    label: "✦ IRIS — AI" },
    { id: "script",  label: "{ } SETUP" },
  ];

  return (
    <div style={{ background: T.bg, color: T.txt, fontFamily: T.sans, minHeight: "100vh", padding: "22px 28px" }}>
      <style>{`
        @keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-5px)} }
        @keyframes pulse  { 0%,100%{opacity:1} 50%{opacity:0.4} }
        input[type=range]{ accent-color:${T.accent} }
        ::-webkit-scrollbar{ width:5px }
        ::-webkit-scrollbar-thumb{ background:${T.border};border-radius:3px }
        *{ box-sizing:border-box }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 26 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 9, background: `linear-gradient(135deg, ${T.accentDim}, #1a1a38)`, border: `1px solid ${T.accent}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: T.accent }}>◈</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.025em", color: T.txt }}>DupeScope</div>
            <div style={{ fontSize: 10, color: T.txtDim, letterSpacing: "0.08em", textTransform: "uppercase" }}>Privacy-First · Fully Offline</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {[["NO NETWORK", T.success], ["LOCAL ONLY", T.accent]].map(([lbl, col]) => (
            <span key={lbl} style={{ fontSize: 9, padding: "3px 9px", borderRadius: 4, fontFamily: T.mono, border: `1px solid ${col}44`, color: col, letterSpacing: "0.08em" }}>{lbl}</span>
          ))}
          <button onClick={() => setTheme(t => t === "dark" ? "light" : "dark")} style={{ padding: "5px 12px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.bgCard, color: T.txt, fontFamily: T.mono, fontSize: 11, cursor: "pointer" }}>
            {theme === "dark" ? "☀ Light" : "🌙 Dark"}
          </button>
        </div>
      </div>

      <TabBar tabs={TABS} active={tab} onChange={setTab} T={T} />

      {tab === "scanner" && (
        <ScannerPanel T={T} onJobReady={handleJobReady} onJobArchived={handleJobArchived} />
      )}
      {tab === "results" && (
        <ResultsPanel T={T} job={currentJob} jobId={currentJobId}
          onApprove={handleApprove} onUndo={handleUndo} />
      )}
      {tab === "iris"   && <ChatPanel T={T} />}
      {tab === "script" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {[
            ["Install", "pip install flask flask-cors flask-socketio Pillow imagehash rawpy"],
            ["Run", "python server.py"],
          ].map(([l, c]) => (
            <div key={l} style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8, padding: "12px 14px" }}>
              <div style={{ fontSize: 10, color: T.txtDim, letterSpacing: "0.07em", marginBottom: 4 }}>{l}</div>
              <div style={{ fontSize: 11, color: T.accent, fontFamily: T.mono }}>{c}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}