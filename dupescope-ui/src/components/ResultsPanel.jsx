import { useState, useEffect } from "react";
import { FixedSizeList } from "react-window";
import { apiFetch, PHASE_LABELS } from "../api";
import { Stat, ToastBanner } from "./UI";

const PAGE_SIZE = 200;

export default function ResultsPanel({ job, jobId, onApprove, onUndo, T }) {
  const [filter, setFilter]           = useState("all");
  const [search, setSearch]           = useState("");
  const [rows, setRows]               = useState([]);
  const [rowsTotal, setRowsTotal]     = useState(0);
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

  // ponytail: Rows are fetched page-by-page from B7 (/jobs/{id}/files) since the
  // job payload no longer ships per-file rows. One page per filter/search change.
  useEffect(() => {
    if (!jobId) return;
    let alive = true;
    const q = new URLSearchParams({ page: 1, limit: PAGE_SIZE });
    if (filter === "keep") q.set("keep", "true");
    if (filter === "delete") q.set("keep", "false");
    if (search.trim()) q.set("search", search.trim());
    apiFetch("GET", `/jobs/${jobId}/files?${q}`)
      .then(d => {
        if (!alive) return;
        setRows(d.rows); setRowsTotal(d.total);
      })
      .catch(e => { if (alive) showToast(e.message, false); });
    return () => { alive = false; };
  }, [jobId, filter, search]);

  const loadMore = async () => {
    const q = new URLSearchParams({ page: Math.floor(rows.length / PAGE_SIZE) + 1, limit: PAGE_SIZE });
    if (filter === "keep") q.set("keep", "true");
    if (filter === "delete") q.set("keep", "false");
    if (search.trim()) q.set("search", search.trim());
    try {
      const d = await apiFetch("GET", `/jobs/${jobId}/files?${q}`);
      setRows(prev => [...prev, ...d.rows]);
    } catch (e) { showToast(e.message, false); }
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

  const exactCount   = typeof report.exactGroups   === "number" ? report.exactGroups   : 0;
  const similarCount = typeof report.similarGroups === "number" ? report.similarGroups : 0;
  const aiKeep       = Array.isArray(report.aiKeep)   ? report.aiKeep   : [];
  const aiDelete     = Array.isArray(report.aiDelete) ? report.aiDelete : [];

  const markedCount = Object.values(markedDelete).filter(v => v === true).length;

  const toggleMark   = path => setMarkedDelete(p => ({ ...p, [path]: !p[path] }));
  const clearMarks   = () => setMarkedDelete({});
  const markAllAiDelete = () => {
    const upd = {};
    aiDelete.forEach(path => { upd[path] = true; });
    setMarkedDelete(upd);
  };

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

  const handleApprove = async () => {
    setApproving(true);
    try {
      await apiFetch("POST", `/jobs/${jobId}/approve`);
      showToast("Approved — archiving started…");
      onApprove(jobId);
    } catch (e) { showToast(e.message, false); }
    finally { setApproving(false); }
  };

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

  const filtered = rows;

  const Row = ({ index, style, data }) => {
    const file         = data.filtered[index];
    const isAiDelete   = !file.keep;
    const isDone       = data.markedDelete[file.path] === "done";
    const isMarked     = data.markedDelete[file.path] === true;
    const isArchiving  = data.deletingId === file.path;
    const fname        = (file.path || "").split("/").pop();

    return (
      <div key={file.path || index} style={{
        ...style,
        display: "grid", gridTemplateColumns: "60px 1fr 64px 64px 64px 50px 110px",
        padding: "8px 14px", alignItems: "center",
        background: isDone ? T.bgSuccess : isMarked ? T.bgDanger : index%2===0 ? T.tableBg : T.tableAlt,
        borderBottom: index < data.filtered.length-1 ? `1px solid ${T.border}` : "none",
        opacity: isDone ? 0.5 : 1, transition: "background 0.2s",
      }}>
        <span style={{ fontSize: 9, padding: "2px 6px", fontWeight: 600, fontFamily: T.mono,
          background: isAiDelete ? T.bgDanger : T.bgSuccess,
          color: isAiDelete ? T.danger : T.success }}>
          {isAiDelete ? "DELETE" : "KEEP"}
        </span>

        <div>
          <div style={{ fontSize: 11, color: T.txt, fontFamily: T.mono, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: isDone ? "line-through" : "none" }}>{fname}</div>
          {file.reason && <div style={{ fontSize: 9, color: T.txtDim, marginTop: 1 }}>{file.reason}</div>}
        </div>

        {[file.overall, file.qualityScore].map((v, ci) => (
          <span key={ci} style={{
            fontSize: 11, textAlign: "right", fontFamily: T.mono,
            color: v >= 8 ? T.success : v >= 5 ? T.warn : T.danger,
          }}>{v != null ? v : "-"}</span>
        ))}
        <span style={{ fontSize: 11, textAlign: "right", fontFamily: T.mono,
          color: file.aestheticScore >= 8 ? T.success : file.aestheticScore >= 5 ? T.warn : T.danger }}>
          {file.aestheticScore != null ? file.aestheticScore : "-"}
        </span>
        <span style={{ fontSize: 11, textAlign: "right", fontFamily: T.mono, color: T.txtMuted }}>
          {file.faceCount != null ? file.faceCount : "-"}
        </span>

        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
          {isDone ? (
            <span style={{ fontSize: 10, color: T.success, fontFamily: T.mono }}>✓ archived</span>
          ) : (
            <>
              <input type="checkbox" checked={isMarked} onChange={() => toggleMark(file.path)}
                style={{ accentColor: T.danger, cursor: "pointer" }} />
              <button onClick={() => archiveFile(file.path)} disabled={isArchiving} style={{
                fontSize: 10, padding: "3px 8px", cursor: "pointer",
                fontFamily: T.mono, border: `1px solid ${T.danger}`,
                background: "transparent", color: T.danger, opacity: isArchiving ? 0.5 : 1,
              }}>{isArchiving ? "…" : "archive"}</button>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div>
      <ToastBanner toast={toast} T={T} />

      {/* Status banner with Approve / Undo buttons */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 16px", marginBottom: 16,
        border: `1px solid ${isArchived ? T.success : jobStatus === "processed" ? T.warn : T.border}`,
        background: isArchived ? T.bgSuccess : jobStatus === "processed" ? T.bgWarn : T.bgCard,
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
          {jobStatus === "archiving" && (
            <span style={{ fontSize: 10, color: T.accent, fontFamily: T.mono, animation: "pulse 1s infinite" }}>⟳ archiving…</span>
          )}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          {jobStatus === "processed" && !actions.approved && (
            <button onClick={handleApprove} disabled={approving} style={{
              padding: "6px 16px", border: `1px solid ${T.success}`,
              background: T.bgSuccess, color: T.success, fontFamily: T.mono, fontSize: 11,
              cursor: approving ? "not-allowed" : "pointer", fontWeight: 600,
            }}>
              {approving ? "Approving…" : "✓ Approve & Archive"}
            </button>
          )}

          {isArchived && !isReverted && (
            <button onClick={handleUndo} disabled={undoing} style={{
              padding: "6px 14px", border: `1px solid ${T.warn}`,
              background: T.bgWarn, color: T.warn, fontFamily: T.mono, fontSize: 11,
              cursor: undoing ? "not-allowed" : "pointer",
            }}>
              {undoing ? "Restoring…" : "↩ Undo Archive"}
            </button>
          )}
        </div>
      </div>

      {/* Summary stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 18 }}>
        <Stat label="Exact dupes"    value={exactCount}      color={T.success} T={T} />
        <Stat label="Similar groups" value={similarCount}    color={T.warn}    T={T} />
        <Stat label="AI keep"        value={aiKeep.length}   color={T.accent}  T={T} />
        <Stat label="AI delete"      value={aiDelete.length} color={T.danger}  T={T} />
      </div>

      {/* AI culling table */}
      {rowsTotal > 0 ? (
        <>
          {/* Filter + search + bulk actions */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {[["all", aiKeep.length + aiDelete.length], ["keep", aiKeep.length], ["delete", aiDelete.length]].map(([f, n]) => (
                <button key={f} onClick={() => setFilter(f)} style={{
                  fontSize: 10, padding: "4px 12px", cursor: "pointer",
                  fontFamily: T.mono, letterSpacing: "0.05em",
                  border: `1px solid ${filter === f ? T.accent : T.border}`,
                  background: filter === f ? T.selectedBg : "transparent",
                  color: filter === f ? T.accent : T.txtMuted,
                }}>{f} ({n})</button>
              ))}
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="search file…"
                style={{ width: 130, fontSize: 10, fontFamily: T.mono, padding: "4px 10px",
                  background: T.bgInput, border: `1px solid ${T.border}`, color: T.txt }} />
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {markedCount > 0 && <span style={{ fontSize: 11, color: T.txtMuted, fontFamily: T.mono }}>{markedCount} marked</span>}
              <button onClick={markAllAiDelete} style={{ padding: "5px 12px", cursor: "pointer", fontFamily: T.mono, fontSize: 10, border: `1px solid ${T.border}`, background: T.bgCard, color: T.txtMuted }}>
                Mark AI-delete
              </button>
              {markedCount > 0 && <>
                <button onClick={clearMarks} style={{ padding: "5px 12px", cursor: "pointer", fontFamily: T.mono, fontSize: 10, border: `1px solid ${T.border}`, background: T.bgCard, color: T.txtMuted }}>Clear</button>
                <button onClick={archiveMarked} disabled={bulkLoading} style={{ padding: "5px 14px", cursor: "pointer", fontFamily: T.mono, fontSize: 10, border: `1px solid ${T.danger}`, background: T.bgDanger, color: T.danger, fontWeight: 600 }}>
                  {bulkLoading ? "Archiving…" : `Archive ${markedCount}`}
                </button>
              </>}
            </div>
          </div>

          {/* Table */}
          <div style={{ border: `1px solid ${T.border}`, overflow: "hidden" }}>
            <div style={{
              display: "grid", gridTemplateColumns: "60px 1fr 64px 64px 64px 50px 110px",
              padding: "9px 14px", background: T.bgCard, borderBottom: `1px solid ${T.border}`,
              fontSize: 10, color: T.txtDim, letterSpacing: "0.07em", textTransform: "uppercase", fontFamily: T.mono,
            }}>
              <span>AI</span><span>File</span>
              <span style={{ textAlign: "right" }}>Overall</span>
              <span style={{ textAlign: "right" }}>Quality</span>
              <span style={{ textAlign: "right" }}>Aesth</span>
              <span style={{ textAlign: "right" }}>Faces</span>
              <span style={{ textAlign: "right" }}>Action</span>
            </div>

            <FixedSizeList
              height={Math.min(filtered.length * 37, 600)}
              itemCount={filtered.length}
              itemSize={37}
              width="100%"
              itemData={{ filtered, markedDelete, deletingId }}
            >
              {Row}
            </FixedSizeList>
          </div>
          {rows.length < rowsTotal && (
            <button onClick={loadMore} style={{
              marginTop: 10, width: "100%", padding: "8px", cursor: "pointer",
              fontFamily: T.mono, fontSize: 11, border: `1px solid ${T.border}`, background: T.bgCard, color: T.txtMuted,
            }}>
              Load more — {rows.length.toLocaleString()} / {rowsTotal.toLocaleString()} files
            </button>
          )}
        </>
      ) : (
        // No AI culling — show plain summary + archive log
        <div style={{ padding: "24px", background: T.bgCard, border: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 13, color: T.txtMuted, marginBottom: 8, textAlign: "center" }}>
            Scan complete — AI culling was not enabled.
          </div>
          <div style={{ fontSize: 11, color: T.txtDim, textAlign: "center", marginBottom: 16 }}>
            Found {exactCount} exact duplicate group(s) and {similarCount} similar group(s).
          </div>
          {job.archive_log?.length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: T.txtMuted, fontFamily: T.mono, marginBottom: 8 }}>
                Archive log ({job.archive_log.length} files moved to _ARCHIVED/):
              </div>
              {job.archive_log.map((e, i) => (
                <div key={i} style={{ fontSize: 10, color: T.txtDim, fontFamily: T.mono, padding: "4px 8px", background: T.bgInput, marginBottom: 3 }}>
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
