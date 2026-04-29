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

// ─── Suggestions ──────────────────────────────────────────────────────────────
const SUGGESTIONS = [
  "How should I organise 10,000+ photos on my hard drive?",
  "Best folder structure for travel photography?",
  "Help me cull duplicate photos — what to keep?",
  "Explain RAW vs JPEG for photo archiving",
  "Tips for naming photos so they sort well by date",
  "Best backup strategy for a large photo library?",
];

const SYSTEM_PROMPT = `You are a professional photography assistant and photo library expert named "Iris".
You specialise in photography technique, photo library organisation, duplicate detection strategy,
backup workflows, file formats, and privacy-first offline tools.
Keep answers concise, practical, and structured. Use bullet points where helpful.`;

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

// ─── Shared UI primitives ─────────────────────────────────────────────────────
function Stat({ label, value, color, T }) {
  return (
    <div style={{ background: T.bgCard, borderRadius: 8, padding: "12px 16px", border: `1px solid ${T.border}` }}>
      <div style={{ fontSize: 20, fontWeight: 600, color: color || T.txt, fontFamily: T.mono, letterSpacing: "-0.02em" }}>{value}</div>
      <div style={{ fontSize: 10, color: T.txtMuted, marginTop: 3, letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</div>
    </div>
  );
}

function Badge({ type, T }) {
  return type === "exact"
    ? <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 3, background: "#1a3a25", color: T.success, letterSpacing: "0.08em", fontWeight: 600, fontFamily: T.mono }}>EXACT</span>
    : <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 3, background: "#3a2a10", color: T.warn, letterSpacing: "0.08em", fontWeight: 600, fontFamily: T.mono }}>SIMILAR</span>;
}

function TabBar({ tabs, active, onChange, T }) {
  return (
    <div style={{ display: "flex", borderBottom: `1px solid ${T.border}`, marginBottom: 20 }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)} style={{
          background: "none", border: "none", cursor: "pointer",
          padding: "10px 18px", fontFamily: T.mono, fontSize: 12,
          letterSpacing: "0.06em",
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

// ─── SCANNER PANEL ────────────────────────────────────────────────────────────
const LIMITS = [10, 20, 50, 100];

function ScannerPanel({ onJobDone, T }) {
  const [folder, setFolder]       = useState("/Users/A200173944/Pictures");
  const [mode, setMode]           = useState("both");
  const [threshold, setThreshold] = useState(10);
  const [recursive, setRecursive] = useState(true);
  const [limit, setLimit]         = useState(100);
  const [offset, setOffset]       = useState(0);

  // Count state
  const [countData, setCountData] = useState(null);   // { total, processed, unprocessed }
  const [counting, setCounting]   = useState(false);

  // Job state
  const [jobId, setJobId]         = useState(null);
  const [jobStatus, setJobStatus] = useState(null);   // full job object from /jobs/:id
  const [scanning, setScanning]   = useState(false);
  const [error, setError]         = useState(null);

  const pollRef = useRef(null);

  const totalPages = countData ? Math.ceil(countData.total / limit) : null;

  // ── Count ──
  const countPhotos = useCallback(async () => {
    if (!folder.trim()) return;
    setCounting(true); setError(null);
    try {
      const data = await apiFetch("GET", `/photos/count?folder=${encodeURIComponent(folder)}&recursive=${recursive}`);
      setCountData(data);
      setOffset(0);
    } catch (e) { setError(e.message); }
    finally { setCounting(false); }
  }, [folder, recursive]);

  // Auto-count when folder changes (debounced)
  useEffect(() => {
    const t = setTimeout(() => { if (folder.trim()) countPhotos(); }, 600);
    return () => clearTimeout(t);
  }, [folder, recursive]);

  // ── Scan ──
  const runScan = async () => {
    if (!folder.trim()) return;
    setScanning(true); setError(null); setJobId(null); setJobStatus(null);
    try {
      const data = await apiFetch("POST", "/scan/start", {
        folder, mode, threshold, recursive, offset, limit,
      });
      const jid = data.job_id;
      setJobId(jid);
      startPolling(jid);
    } catch (e) {
      setError(e.message); setScanning(false);
    }
  };

  const startPolling = (jid) => {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const job = await apiFetch("GET", `/jobs/${jid}`);
        setJobStatus(job);
        if (job.status === "done" || job.status === "error") {
          clearInterval(pollRef.current);
          setScanning(false);
          if (job.status === "done") {
            const report = await apiFetch("GET", `/jobs/${jid}/report`);
            onJobDone(report, jid);
          } else {
            setError(job.error || "Scan failed");
          }
        }
      } catch (e) {
        clearInterval(pollRef.current);
        setScanning(false);
        setError(e.message);
      }
    }, 800);
  };

  useEffect(() => () => clearInterval(pollRef.current), []);

  const progress = jobStatus
    ? Math.round((jobStatus.processedPhotos / Math.max(1, jobStatus.batchPhotos)) * 100)
    : 0;

  const phaseLabel = jobStatus
    ? { pending: "Queued…", processing: `Processing ${jobStatus.processedPhotos}/${jobStatus.batchPhotos}`, done: "Done", error: "Error" }[jobStatus.status] || ""
    : "Starting…";

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

      {/* Photo count strip */}
      {countData && (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 16,
          padding: "12px 14px", background: T.bgCard, borderRadius: 8, border: `1px solid ${T.border}`,
        }}>
          {[
            ["Total", countData.total, T.txt],
            ["Processed", countData.processed, T.success],
            ["Remaining", countData.unprocessed, T.accent],
          ].map(([l, v, c]) => (
            <div key={l} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: c, fontFamily: T.mono }}>{v.toLocaleString()}</div>
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
            onChange={e => setThreshold(+e.target.value)}
            style={{ width: "100%", accentColor: T.accent }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: T.txtDim, marginTop: 4 }}>
            <span>0 identical</span><span>10 near-dup</span><span>30+ loose</span>
          </div>
        </div>
      )}

      {/* Batch size + pagination */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ fontSize: 11, color: T.txtMuted, letterSpacing: "0.07em", textTransform: "uppercase", display: "block", marginBottom: 8 }}>
          Batch Size &amp; Page
        </label>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {/* Limit chips */}
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

          {/* Page controls */}
          {countData && totalPages > 1 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
              <button onClick={() => setOffset(o => Math.max(0, o - 1))} disabled={offset === 0}
                style={{ padding: "4px 10px", borderRadius: 5, border: `1px solid ${T.border}`, background: T.bgCard, color: T.txtMuted, cursor: "pointer", fontSize: 12, fontFamily: T.mono, opacity: offset === 0 ? 0.4 : 1 }}>‹</button>
              <span style={{ fontSize: 11, color: T.txtMuted, fontFamily: T.mono, minWidth: 80, textAlign: "center" }}>
                Page {offset + 1} / {totalPages}
              </span>
              <button onClick={() => setOffset(o => Math.min(totalPages - 1, o + 1))} disabled={offset >= totalPages - 1}
                style={{ padding: "4px 10px", borderRadius: 5, border: `1px solid ${T.border}`, background: T.bgCard, color: T.txtMuted, cursor: "pointer", fontSize: 12, fontFamily: T.mono, opacity: offset >= totalPages - 1 ? 0.4 : 1 }}>›</button>
            </div>
          )}
        </div>

        {/* Batch info line */}
        {countData && (
          <div style={{ fontSize: 10, color: T.txtDim, fontFamily: T.mono, marginTop: 6 }}>
            Processing photos {(offset * limit + 1).toLocaleString()}–{Math.min((offset + 1) * limit, countData.total).toLocaleString()} of {countData.total.toLocaleString()}
          </div>
        )}
      </div>

      {/* Recursive */}
      <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: T.txtMuted, cursor: "pointer", marginBottom: 20 }}>
        <input type="checkbox" checked={recursive} onChange={e => setRecursive(e.target.checked)} style={{ accentColor: T.accent }} />
        Scan subfolders recursively
      </label>

      {/* Run button */}
      <button onClick={runScan} disabled={scanning} style={{
        width: "100%", padding: "12px", fontFamily: T.mono, fontSize: 12, letterSpacing: "0.1em",
        borderRadius: 9, border: "none", cursor: scanning ? "not-allowed" : "pointer",
        background: scanning ? T.accentDim : T.accent, color: "#fff", fontWeight: 600,
      }}>
        {scanning ? `${phaseLabel}` : "▶  RUN SCAN"}
      </button>

      {/* Progress */}
      {scanning && (
        <div style={{ marginTop: 10 }}>
          <div style={{ height: 4, background: T.border, borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${progress}%`, background: T.accent, borderRadius: 2, transition: "width 0.3s" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, fontSize: 10, color: T.txtMuted, fontFamily: T.mono }}>
            <span>{jobId ? `Job: ${jobId.slice(0, 16)}…` : ""}</span>
            <span>{progress}%</span>
          </div>
        </div>
      )}

      <ErrorBox msg={error} T={T} />
    </div>
  );
}

// ─── RESULTS PANEL ────────────────────────────────────────────────────────────
function ResultsPanel({ report, jobId, T }) {
  const [filter, setFilter]           = useState("all");
  const [markedDelete, setMarkedDelete] = useState({});   // { fileId: true }
  const [deletingId, setDeletingId]   = useState(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [toast, setToast]             = useState(null);

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  if (!report) return (
    <div style={{ textAlign: "center", padding: "4rem 1rem", color: T.txtDim, fontFamily: T.mono, fontSize: 13 }}>
      <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.3 }}>◈</div>
      Run a scan first to see duplicate groups.
    </div>
  );

  const { summary, exactGroups = [], similarGroups = [] } = report;
  const allGroups = [
    ...exactGroups.map(g => ({ ...g, type: "exact" })),
    ...similarGroups.map(g => ({ ...g, type: "similar" })),
  ];

  const visible = filter === "all" ? allGroups
    : allGroups.filter(g => g.type === filter);

  // Flatten all non-primary files across visible groups
  const allDeletableFiles = visible.flatMap(g =>
    g.files.slice(1).map(f => ({ ...f, groupType: g.type }))
  );
  const markedCount = Object.values(markedDelete).filter(Boolean).length;

  const toggleMark = (fileId) => {
    setMarkedDelete(prev => ({ ...prev, [fileId]: !prev[fileId] }));
  };

  const markAllVisible = () => {
    const upd = { ...markedDelete };
    allDeletableFiles.forEach(f => { upd[f.id] = true; });
    setMarkedDelete(upd);
  };

  const clearMarks = () => setMarkedDelete({});

  const deleteFile = async (fileId) => {
    setDeletingId(fileId);
    try {
      await apiFetch("POST", `/jobs/${jobId}/mark-delete`, { file_ids: [fileId] });
      await apiFetch("POST", `/jobs/${jobId}/delete`, { file_ids: [fileId] });
      setMarkedDelete(prev => ({ ...prev, [fileId]: "done" }));
      showToast(`Moved to ToBeDeleted/`);
    } catch (e) { showToast(e.message, false); }
    finally { setDeletingId(null); }
  };

  const deleteMarked = async () => {
    const ids = Object.entries(markedDelete).filter(([, v]) => v === true).map(([k]) => k);
    if (!ids.length) return;
    setBulkLoading(true);
    try {
      await apiFetch("POST", `/jobs/${jobId}/mark-delete`, { file_ids: ids });
      await apiFetch("POST", `/jobs/${jobId}/delete`, { file_ids: ids });
      const upd = { ...markedDelete };
      ids.forEach(id => { upd[id] = "done"; });
      setMarkedDelete(upd);
      showToast(`Moved ${ids.length} file(s) to ToBeDeleted/`);
    } catch (e) { showToast(e.message, false); }
    finally { setBulkLoading(false); }
  };

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 999,
          padding: "10px 16px", borderRadius: 8,
          background: toast.ok ? "#1a3a25" : "#2a1515",
          border: `1px solid ${toast.ok ? T.success : T.danger}`,
          color: toast.ok ? T.success : T.danger,
          fontSize: 12, fontFamily: T.mono,
        }}>{toast.ok ? "✓" : "✗"} {toast.msg}</div>
      )}

      {/* Summary stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 18 }}>
        <Stat label="Exact groups"    value={summary.exactGroups}         color={T.success} T={T} />
        <Stat label="Similar groups"  value={summary.similarGroups}       color={T.warn}    T={T} />
        <Stat label="Can reclaim"     value={summary.reclaimableHuman}    color={T.accent}  T={T} />
        <Stat label="Total flagged"   value={summary.exactFiles + summary.similarFiles} T={T} />
      </div>

      {/* Controls */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        {/* Filter pills */}
        <div style={{ display: "flex", gap: 6 }}>
          {["all", "exact", "similar"].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              fontSize: 10, padding: "4px 12px", borderRadius: 20, cursor: "pointer",
              fontFamily: T.mono, letterSpacing: "0.05em",
              border: `1px solid ${filter === f ? T.accent : T.border}`,
              background: filter === f ? T.selectedBg : "transparent",
              color: filter === f ? T.accent : T.txtMuted,
            }}>{f} {f === "all" ? `(${allGroups.length})` : f === "exact" ? `(${exactGroups.length})` : `(${similarGroups.length})`}</button>
          ))}
        </div>

        {/* Bulk actions */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {markedCount > 0 && (
            <span style={{ fontSize: 11, color: T.txtMuted, fontFamily: T.mono }}>{markedCount} marked</span>
          )}
          <button onClick={markAllVisible} style={{
            padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontFamily: T.mono, fontSize: 10,
            border: `1px solid ${T.border}`, background: T.bgCard, color: T.txtMuted,
          }}>Mark all dupes</button>
          {markedCount > 0 && <>
            <button onClick={clearMarks} style={{
              padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontFamily: T.mono, fontSize: 10,
              border: `1px solid ${T.border}`, background: T.bgCard, color: T.txtMuted,
            }}>Clear</button>
            <button onClick={deleteMarked} disabled={bulkLoading} style={{
              padding: "5px 14px", borderRadius: 6, cursor: "pointer", fontFamily: T.mono, fontSize: 10,
              border: `1px solid ${T.danger}`, background: "#2a1515", color: T.danger,
              fontWeight: 600,
            }}>{bulkLoading ? "Moving…" : `Move ${markedCount} to Trash`}</button>
          </>}
        </div>
      </div>

      {/* Table */}
      {visible.length === 0 ? (
        <div style={{ textAlign: "center", padding: "3rem", color: T.txtDim, fontFamily: T.mono, fontSize: 13 }}>
          No groups match this filter.
        </div>
      ) : (
        <div style={{ border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden" }}>
          {/* Table header */}
          <div style={{
            display: "grid", gridTemplateColumns: "80px 1fr 2fr 70px 90px 90px",
            padding: "9px 14px", background: T.bgCard,
            borderBottom: `1px solid ${T.border}`,
            fontSize: 10, color: T.txtDim, letterSpacing: "0.07em", textTransform: "uppercase",
            fontFamily: T.mono,
          }}>
            <span>Type</span>
            <span>File</span>
            <span>Path</span>
            <span>Size</span>
            <span>Date</span>
            <span style={{ textAlign: "right" }}>Action</span>
          </div>

          {/* Group rows */}
          {visible.map((group, gi) => (
            <GroupTableRows
              key={gi} group={group} gi={gi}
              markedDelete={markedDelete} deletingId={deletingId}
              toggleMark={toggleMark} deleteFile={deleteFile}
              T={T}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function GroupTableRows({ group, gi, markedDelete, deletingId, toggleMark, deleteFile, T }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <>
      {/* Group separator row */}
      <div onClick={() => setExpanded(e => !e)} style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "7px 14px",
        background: gi % 2 === 0 ? T.tableBg : T.tableAlt,
        borderTop: gi > 0 ? `1px solid ${T.border}` : "none",
        cursor: "pointer",
        borderBottom: `1px solid ${T.border}`,
      }}>
        <span style={{ fontSize: 10, color: T.txtDim, fontFamily: T.mono, transform: expanded ? "" : "rotate(-90deg)", transition: "0.15s" }}>▾</span>
        <Badge type={group.type} T={T} />
        <span style={{ fontSize: 11, color: T.txt, fontFamily: T.mono }}>{group.files[0]?.name}</span>
        <span style={{ fontSize: 10, color: T.txtDim, marginLeft: 4 }}>{group.files.length} files</span>
        {group.hash_sha256 && (
          <span style={{ fontSize: 9, color: T.txtDim, fontFamily: T.mono, marginLeft: 8 }}>
            {group.hash_sha256.slice(0, 18)}…
          </span>
        )}
      </div>

      {/* File rows */}
      {expanded && group.files.map((file, fi) => {
        const isKeep    = fi === 0;
        const isDone    = markedDelete[file.id] === "done";
        const isMarked  = markedDelete[file.id] === true;
        const isDeleting= deletingId === file.id;

        return (
          <div key={file.id || fi} style={{
            display: "grid", gridTemplateColumns: "80px 1fr 2fr 70px 90px 90px",
            padding: "8px 14px", alignItems: "center",
            background: isDone ? "#1a2a1a" : isMarked ? "#2a1e1e" : (gi % 2 === 0 ? T.tableBg : T.tableAlt),
            borderBottom: `1px solid ${T.border}`,
            opacity: isDone ? 0.5 : 1,
            transition: "background 0.2s",
          }}>
            {/* Type */}
            <span style={{ fontSize: 10, color: isKeep ? T.accent : T.txtDim, fontFamily: T.mono }}>
              {isKeep ? "● keep" : "○ dupe"}
            </span>

            {/* File name */}
            <span style={{
              fontSize: 11, color: isDone ? T.txtDim : T.txt, fontFamily: T.mono,
              textDecoration: isDone ? "line-through" : "none",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>{file.name}</span>

            {/* Path */}
            <span style={{
              fontSize: 10, color: T.txtDim, fontFamily: T.mono,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }} title={file.path}>{file.path}</span>

            {/* Size */}
            <span style={{ fontSize: 11, color: T.txtMuted, fontFamily: T.mono }}>{file.size}</span>

            {/* Date */}
            <span style={{ fontSize: 11, color: T.txtMuted, fontFamily: T.mono }}>{file.date}</span>

            {/* Action */}
            <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", alignItems: "center" }}>
              {isKeep ? (
                <span style={{ fontSize: 10, color: T.accent, fontFamily: T.mono }}>keep</span>
              ) : isDone ? (
                <span style={{ fontSize: 10, color: T.success, fontFamily: T.mono }}>✓ moved</span>
              ) : (
                <>
                  {/* Checkbox */}
                  <input type="checkbox" checked={isMarked} onChange={() => toggleMark(file.id)}
                    style={{ accentColor: T.danger, cursor: "pointer" }} />
                  {/* Delete button */}
                  <button
                    onClick={() => deleteFile(file.id)}
                    disabled={isDeleting}
                    style={{
                      fontSize: 10, padding: "3px 8px", borderRadius: 4, cursor: "pointer",
                      fontFamily: T.mono, border: `1px solid ${T.danger}`,
                      background: "transparent", color: T.danger,
                      opacity: isDeleting ? 0.5 : 1,
                    }}>
                    {isDeleting ? "…" : "trash"}
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}

// ─── AI CHAT PANEL ────────────────────────────────────────────────────────────
function ChatPanel({ T }) {
  const [messages, setMessages] = useState([{
    role: "assistant",
    content: "Hi! I'm **Iris**, your photography & photo library assistant.\n\nAsk me anything — folder organisation, duplicate culling strategy, RAW vs JPEG, backup workflows, or camera technique.",
  }]);
  const [input, setInput]   = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState(null);
  const bottomRef = useRef(null);

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

  const renderMd = (text) => text
    .replace(/\*\*(.*?)\*\*/g, `<strong style="color:${T.txt};font-weight:600">$1</strong>`)
    .replace(/^- (.+)/gm, `<div style="display:flex;gap:8px;margin:2px 0"><span style="color:${T.accent}">▸</span><span>$1</span></div>`)
    .replace(/\n/g, "<br/>");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: 520 }}>
      <div style={{ flex: 1, overflowY: "auto", paddingBottom: 12, display: "flex", flexDirection: "column", gap: 12 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: "flex", gap: 10, flexDirection: m.role === "user" ? "row-reverse" : "row" }}>
            <div style={{
              width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
              background: m.role === "assistant" ? T.accentDim : T.bgCard,
              border: `1px solid ${m.role === "assistant" ? T.accent : T.border}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontFamily: T.mono, color: m.role === "assistant" ? T.accent : T.txtMuted,
            }}>{m.role === "assistant" ? "◈" : "U"}</div>
            <div style={{
              maxWidth: "82%", padding: "10px 14px",
              borderRadius: m.role === "user" ? "12px 4px 12px 12px" : "4px 12px 12px 12px",
              background: m.role === "user" ? T.selectedBg : T.bgCard,
              border: `1px solid ${m.role === "user" ? T.accentDim : T.border}`,
              fontSize: 13, color: T.txtMuted, lineHeight: 1.65, fontFamily: T.sans,
            }} dangerouslySetInnerHTML={{ __html: renderMd(m.content) }} />
          </div>
        ))}
        {loading && (
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: T.accentDim, border: `1px solid ${T.accent}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: T.accent }}>◈</div>
            <div style={{ padding: "12px 16px", background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: "4px 12px 12px 12px", display: "flex", gap: 5, alignItems: "center" }}>
              {[0, 1, 2].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: T.accent, animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }} />)}
            </div>
          </div>
        )}
        {error && <div style={{ fontSize: 11, color: T.danger, textAlign: "center", fontFamily: T.mono }}>{error}</div>}
        <div ref={bottomRef} />
      </div>

      {messages.length === 1 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
          {SUGGESTIONS.map((s, i) => (
            <button key={i} onClick={() => send(s)} style={{
              fontSize: 11, padding: "5px 10px", borderRadius: 6, cursor: "pointer",
              border: `1px solid ${T.border}`, background: T.bgCard,
              color: T.txtMuted, fontFamily: T.sans, lineHeight: 1.3, textAlign: "left",
            }}>{s}</button>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
          placeholder="Ask Iris about photography or photo organisation…"
          disabled={loading}
          style={{
            flex: 1, fontFamily: T.sans, fontSize: 13, padding: "11px 14px",
            background: T.bgInput, border: `1px solid ${T.border}`,
            borderRadius: 9, color: T.txt, outline: "none",
          }} />
        <button onClick={() => send()} disabled={loading || !input.trim()} style={{
          padding: "11px 18px", borderRadius: 9, border: "none", cursor: "pointer",
          background: (loading || !input.trim()) ? T.accentDim : T.accent,
          color: "#fff", fontFamily: T.mono, fontSize: 12, fontWeight: 600,
        }}>Send</button>
      </div>
    </div>
  );
}

// ─── SCRIPT PANEL (unchanged) ─────────────────────────────────────────────────
const PYTHON_SCRIPT = `# dupescope.py — see your project folder`;

function ScriptPanel({ T }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <div style={{ fontSize: 12, color: T.txtMuted, lineHeight: 1.7, marginBottom: 16 }}>
        Runs 100% offline. No data leaves your machine. Requires Python 3.8+.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {[["Install", "pip install Pillow imagehash rawpy flask flask-cors"], ["Run server", "python server.py"]].map(([l, c]) => (
          <div key={l} style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8, padding: "10px 14px" }}>
            <div style={{ fontSize: 10, color: T.txtDim, letterSpacing: "0.07em", marginBottom: 4 }}>{l}</div>
            <div style={{ fontSize: 11, color: T.accent, fontFamily: T.mono }}>{c}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [theme, setTheme]     = useState("dark");
  const T                     = THEMES[theme];
  const [tab, setTab]         = useState("scanner");
  const [report, setReport]   = useState(null);
  const [jobId, setJobId]     = useState(null);

  const handleJobDone = (reportData, jid) => {
    setReport(reportData);
    setJobId(jid);
    setTab("results");
  };

  const TABS = [
    { id: "scanner", label: "◈ SCANNER" },
    { id: "results", label: `▣ RESULTS${report ? ` (${(report.exactGroups?.length || 0) + (report.similarGroups?.length || 0)} groups)` : ""}` },
    { id: "iris",    label: "✦ IRIS — AI" },
    { id: "script",  label: "{ } SETUP" },
  ];

  return (
    <div style={{ background: T.bg, color: T.txt, fontFamily: T.sans, minHeight: "100vh", padding: "22px 28px" }}>
      <style>{`
        @keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-5px)} }
        input[type=range]{ accent-color:${T.accent} }
        ::-webkit-scrollbar{ width:5px } ::-webkit-scrollbar-thumb{ background:${T.border};border-radius:3px }
        *{ box-sizing:border-box }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 26 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 9,
            background: `linear-gradient(135deg, ${T.accentDim}, #1a1a38)`,
            border: `1px solid ${T.accent}`, display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: 18, color: T.accent,
          }}>◈</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.025em", color: T.txt }}>DupeScope</div>
            <div style={{ fontSize: 10, color: T.txtDim, letterSpacing: "0.08em", textTransform: "uppercase" }}>Privacy-First · Fully Offline</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {[["NO NETWORK", T.success], ["LOCAL ONLY", T.accent]].map(([lbl, col]) => (
            <span key={lbl} style={{ fontSize: 9, padding: "3px 9px", borderRadius: 4, fontFamily: T.mono, border: `1px solid ${col}44`, color: col, letterSpacing: "0.08em" }}>{lbl}</span>
          ))}
          <button onClick={() => setTheme(t => t === "dark" ? "light" : "dark")} style={{
            padding: "5px 12px", borderRadius: 6, border: `1px solid ${T.border}`,
            background: T.bgCard, color: T.txt, fontFamily: T.mono, fontSize: 11, cursor: "pointer",
          }}>{theme === "dark" ? "☀ Light" : "🌙 Dark"}</button>
        </div>
      </div>

      <TabBar tabs={TABS} active={tab} onChange={setTab} T={T} />

      {tab === "scanner" && <ScannerPanel T={T} onJobDone={handleJobDone} />}
      {tab === "results" && <ResultsPanel T={T} report={report} jobId={jobId} />}
      {tab === "iris"    && <ChatPanel T={T} />}
      {tab === "script"  && <ScriptPanel T={T} />}
    </div>
  );
}