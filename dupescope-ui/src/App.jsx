import { useState, useRef, useEffect } from "react";
import { THEMES } from "./theme";
import { apiFetch } from "./api";
import { TabBar } from "./components/UI";
import ScannerPanel from "./components/ScannerPanel";
import ResultsPanel from "./components/ResultsPanel";
import QueuePanel from "./components/QueuePanel";

export default function App() {
  const [theme, setTheme]       = useState("dark");
  const T                       = THEMES[theme];
  const [tab, setTab]           = useState("scanner");

  const [currentJob, setCurrentJob]     = useState(null);
  const [currentJobId, setCurrentJobId] = useState(null);

  const pollRef = useRef(null);

  const handleJobReady = (job, jid) => {
    setCurrentJob(job);
    setCurrentJobId(jid);
    setTab("results");
  };

  const handleJobArchived = (job) => {
    setCurrentJob(job);
  };

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

  const handleUndo = async (jid) => {
    try {
      const job = await apiFetch("GET", `/jobs/${jid}`);
      setCurrentJob(job);
    } catch (_) {}
  };

  const handleOpenJob = async (jid) => {
    try {
      const job = await apiFetch("GET", `/jobs/${jid}`);
      setCurrentJob(job); setCurrentJobId(jid); setTab("results");
    } catch (e) { console.error(e); }
  };

  useEffect(() => () => clearInterval(pollRef.current), []);

  const groupCount = currentJob?.reportData
    ? (currentJob.reportData.exactGroups || 0) + (currentJob.reportData.similarGroups || 0)
    : 0;

  const TABS = [
    { id: "scanner", label: "◈ SCANNER" },
    { id: "results", label: `▣ RESULTS${currentJob ? ` (${groupCount})` : ""}` },
    { id: "jobs",    label: "☰ JOBS" },
  ];

  return (
    <div style={{ background: T.bg, color: T.txt, fontFamily: T.sans, minHeight: "100dvh", padding: "22px 28px" }}>
      <style>{`
        :root{
          --accent:${T.accent};
          --border:${T.border};
          --danger:${T.danger};
          --success:${T.success};
          --bg-success:${T.bgSuccess};
          --bg-danger:${T.bgDanger};
          --bg-warn:${T.bgWarn};
        }
        @keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-5px)} }
        @keyframes pulse  { 0%,100%{opacity:1} 50%{opacity:0.4} }
        input[type=range]{ accent-color:${T.accent} }
        ::-webkit-scrollbar{ width:5px }
        ::-webkit-scrollbar-thumb{ background:${T.border};border-radius:3px }
        *{ box-sizing:border-box }
      `}</style>

      {/* Header */}
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 26 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 38, height: 38, background: T.accent, border: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: T.onAccent }}>◈</div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 1, color: T.txt }}>DupeScope</div>
            <div style={{ fontSize: 10, color: T.txtDim, letterSpacing: "0.14em", textTransform: "uppercase", marginTop: 3 }}>Privacy-first · fully offline</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {[["NO NETWORK", T.success], ["LOCAL ONLY", T.accent]].map(([lbl, col]) => (
            <span key={lbl} style={{ fontSize: 9, padding: "3px 9px", fontFamily: T.mono, border: `1px solid ${col}44`, color: col, letterSpacing: "0.08em" }}>{lbl}</span>
          ))}
          <button onClick={() => setTheme(t => t === "dark" ? "light" : "dark")} style={{ padding: "5px 12px", border: `1px solid ${T.border}`, background: T.bgCard, color: T.txt, fontFamily: T.mono, fontSize: 11, cursor: "pointer" }}>
            {theme === "dark" ? "☀ Light" : "🌙 Dark"}
          </button>
        </div>
      </header>

      <nav><TabBar tabs={TABS} active={tab} onChange={setTab} T={T} /></nav>

      <main>{tab === "scanner" && (
        <ScannerPanel T={T} onJobReady={handleJobReady} onJobArchived={handleJobArchived} />
      )}
      {tab === "results" && (
        <ResultsPanel T={T} job={currentJob} jobId={currentJobId}
          onApprove={handleApprove} onUndo={handleUndo} />
      )}
      {tab === "jobs" && (
        <QueuePanel T={T} onOpenJob={handleOpenJob} />
      )}</main>
    </div>
  );
}
