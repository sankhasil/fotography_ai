import { useState, useRef, useEffect, useCallback } from "react";
import { apiFetch, PHASE_LABELS } from "../api";
import { ErrorBox, PipelineBar } from "./UI";
import useJobSocket from "../useJobSocket";

export default function ScannerPanel({ onJobReady, onJobArchived, T }) {
  const [folder, setFolder]       = useState("/Users/A200173944/Pictures");
  const [mode, setMode]           = useState("both");
  const [threshold, setThreshold] = useState(10);
  const [recursive, setRecursive] = useState(true);
  const [runAi, setRunAi]         = useState(true);
  const [autoArchive, setAutoArchive] = useState(false);

  const [countData, setCountData] = useState(null);
  const [counting, setCounting]   = useState(false);
  const [jobId, setJobId]         = useState(null);
  const [jobStatus, setJobStatus] = useState(null);
  const [progress, setProgress]   = useState(null);
  const [scanning, setScanning]   = useState(false);
  const [error, setError]         = useState(null);

  const pollRef       = useRef(null);
  const wsConnectedRef = useRef(false);
  const [done, setDone] = useState(false);

  const countPhotos = useCallback(async () => {
    if (!folder.trim()) return;
    setCounting(true); setError(null);
    try {
      const data = await apiFetch("GET",
        `/photos/count?folder=${encodeURIComponent(folder)}&recursive=${recursive}`);
      setCountData(data);
    } catch (e) { setError(e.message); }
    finally { setCounting(false); }
  }, [folder, recursive]);

  useEffect(() => {
    const t = setTimeout(() => { if (folder.trim()) countPhotos(); }, 600);
    return () => clearTimeout(t);
  }, [folder, recursive]);

  // ponytail: Socket-first for live status/progress; a full job GET happens once
  // at terminal state (reportData is stripped of per-file rows since B7).
  const handleWsEvent = useCallback((msg) => {
    wsConnectedRef.current = true;
    if (msg.status === "photo_done") {
      if (msg.extra) setProgress({ done: msg.extra.done || 0, total: msg.extra.total || 0 });
      return;
    }
    setJobStatus(prev => ({ ...(prev || {}), status: msg.status }));
    if (done) return;
    if (msg.status === "processed" || msg.status === "archived") {
      setDone(true);
      clearInterval(pollRef.current);
      setScanning(false);
      apiFetch("GET", `/jobs/${jobId}`)
        .then(job => {
          if (job.status === "processed") onJobReady(job, jobId);
          else if (job.status === "archived") onJobArchived(job, jobId);
        })
        .catch(e => { setError(e.message); });
    } else if (msg.status === "error") {
      setDone(true);
      clearInterval(pollRef.current);
      setScanning(false);
      setError(msg.extra?.error || "Scan failed");
    }
  }, [jobId, done, onJobReady, onJobArchived]);

  useJobSocket(jobId, handleWsEvent, () => { wsConnectedRef.current = false; }, !!jobId && !done);

  const runScan = async () => {
    if (!folder.trim()) return;
    setScanning(true); setError(null); setJobId(null); setJobStatus(null);
    setProgress(null); setDone(false); wsConnectedRef.current = false;
    try {
      const data = await apiFetch("POST", "/scan/start", {
        folder, mode, threshold, recursive,
        ai_cull: runAi,
        auto_archive: autoArchive,
      });
      setJobId(data.job_id);
      startPolling(data.job_id);
    } catch (e) {
      const msg = e.message && e.message.includes("503")
        ? "Queue full — ≥100 photos scheduled. Try again later."
        : e.message;
      setError(msg); setScanning(false);
    }
  };

  const startPolling = (jid) => {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      if (wsConnectedRef.current) return;
      try {
        const job = await apiFetch("GET", `/jobs/${jid}`);
        setJobStatus(job);

        if (job.status === "processed") {
          setDone(true);
          clearInterval(pollRef.current);
          setScanning(false);
          onJobReady(job, jid);
        }

        if (job.status === "archived") {
          setDone(true);
          clearInterval(pollRef.current);
          setScanning(false);
          onJobArchived(job, jid);
        }

        if (job.status === "error") {
          setDone(true);
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
        <label htmlFor="folder-path" style={{ fontSize: 11, color: T.txtMuted, letterSpacing: "0.04em", display: "block", marginBottom: 6 }}>Folder path</label>
        <input id="folder-path" value={folder} onChange={e => setFolder(e.target.value)} style={{
          width: "100%", fontFamily: T.mono, fontSize: 13, padding: "10px 14px",
          background: T.bgInput, border: `1px solid ${T.border}`,
          color: T.txt,
        }} placeholder="/home/user/Pictures" />
      </div>

      {/* Count strip */}
      {countData && (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 16,
          padding: "12px 14px", background: T.bgCard, border: `1px solid ${T.border}`,
        }}>
          {[["Total", countData.total, T.txt],
            ["Processed", countData.processed, T.success],
            ["Remaining", countData.unprocessed, T.accent]].map(([l, v, c]) => (
            <div key={l} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: c, fontFamily: T.mono }}>{(v||0).toLocaleString()}</div>
              <div style={{ fontSize: 10, color: T.txtMuted, letterSpacing: "0.04em" }}>{l}</div>
            </div>
          ))}
        </div>
      )}
      {counting && <div style={{ fontSize: 11, color: T.txtMuted, fontFamily: T.mono, marginBottom: 12 }}>Counting…</div>}

      {/* Mode */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 11, color: T.txtMuted, letterSpacing: "0.04em", display: "block", marginBottom: 6 }}>Detection mode</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {MODES.map(m => (
            <div key={m.id} onClick={() => setMode(m.id)} className="mode-card" style={{
              padding: "10px 12px", cursor: "pointer",
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
          <label style={{ fontSize: 11, color: T.txtMuted, letterSpacing: "0.04em", display: "block", marginBottom: 6 }}>
            Similarity threshold · <span style={{ color: T.accent }}>{threshold}</span>
          </label>
          <input type="range" min={0} max={64} step={1} value={threshold}
            onChange={e => setThreshold(+e.target.value)} style={{ width: "100%", accentColor: T.accent }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: T.txtDim, marginTop: 4 }}>
            <span>0 identical</span><span>10 near-dup</span><span>30+ loose</span>
          </div>
        </div>
      )}

      {/* Options */}
      <div style={{ display: "flex", gap: 20, marginBottom: 20, flexWrap: "wrap" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: T.txtMuted, cursor: "pointer" }}>
          <input type="checkbox" checked={recursive} onChange={e => setRecursive(e.target.checked)} style={{ accentColor: T.accent }} />
          Scan subfolders
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: T.txtMuted, cursor: "pointer" }}>
          <input type="checkbox" checked={runAi} onChange={e => setRunAi(e.target.checked)} style={{ accentColor: T.accent }} />
          AI culling (Hybrid + LLM reasons)
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: T.warn, cursor: "pointer" }}>
          <input type="checkbox" checked={autoArchive} onChange={e => setAutoArchive(e.target.checked)} style={{ accentColor: T.warn }} />
          Auto-archive (skip review)
        </label>
      </div>

      {/* Run button */}
      <button onClick={runScan} disabled={scanning} style={{
        width: "100%", padding: "12px", fontFamily: T.mono, fontSize: 12, letterSpacing: "0.1em",
        border: "none", cursor: scanning ? "not-allowed" : "pointer",
        background: scanning ? T.accentDim : T.accent, color: T.onAccent, fontWeight: 600,
      }}>
        {scanning ? (PHASE_LABELS[currentStatus] || "Starting…") : "▶  RUN SCAN"}
      </button>

      {jobStatus && <PipelineBar status={currentStatus} T={T} progress={progress} />}

      {jobId && (
        <div style={{ marginTop: 4, fontSize: 9, color: T.txtDim, fontFamily: T.mono }}>
          job: {jobId}
        </div>
      )}

      <ErrorBox msg={error} T={T} />
    </div>
  );
}
