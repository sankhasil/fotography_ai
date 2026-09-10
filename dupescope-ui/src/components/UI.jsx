import { PIPELINE_STEPS } from "../api";

export function Stat({ label, value, color, T }) {
  return (
    <div style={{ background: T.bgCard, padding: "12px 16px", border: `1px solid ${T.border}` }}>
      <div style={{ fontSize: 20, fontWeight: 600, color: color || T.txt, fontFamily: T.mono, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>{value ?? "-"}</div>
      <div style={{ fontSize: 10, color: T.txtMuted, marginTop: 3, letterSpacing: "0.06em" }}>{label}</div>
    </div>
  );
}

export function TabBar({ tabs, active, onChange, T }) {
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

export function ErrorBox({ msg, T }) {
  if (!msg) return null;
  return (
    <div style={{
      marginTop: 10, padding: "10px 14px",
      border: `1px solid ${T.danger}`, background: T.bgDanger,
      color: T.danger, fontSize: 11, fontFamily: T.mono, lineHeight: 1.5,
    }}>⚠ {msg}</div>
  );
}

export function ToastBanner({ toast, T = { bgSuccess: "#1a3a25", success: "#3ecf8e", bgDanger: "#2a1515", danger: "#e05252", zToast: 999 } }) {
  if (!toast) return null;
  const col = toast.ok ? T.success : T.danger;
  return (
    <div style={{
      position: "fixed", top: 20, right: 20, zIndex: T.zToast,
      padding: "10px 16px",
      background: toast.ok ? T.bgSuccess : T.bgDanger,
      border: `1px solid ${col}`,
      color: col,
      fontSize: 12, fontFamily: T.mono || "'JetBrains Mono', monospace",
      boxShadow: `0 4px 24px ${col}33`,
    }}>{toast.ok ? "✓" : "✗"} {toast.msg}</div>
  );
}

export function PipelineBar({ status, T, progress }) {
  const currentIdx = PIPELINE_STEPS.indexOf(status);
  const pct = progress && progress.total > 0 ? Math.round(progress.done / progress.total * 100) : 0;
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
      {progress && progress.total > 0 && (
        <div style={{ fontSize: 11, fontFamily: T.mono, color: T.txtMuted, marginTop: 6 }}>
          {progress.done.toLocaleString()} / {progress.total.toLocaleString()} · ({pct}%)
        </div>
      )}
    </div>
  );
}
