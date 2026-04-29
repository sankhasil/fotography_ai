import { useState, useRef, useEffect } from "react";

// ─── Theme tokens ────────────────────────────────────────────────────────────
const THEMES = {
  dark: {
    bg: "#0d0d0f",
    bgPanel: "#131316",
    bgCard: "#1a1a1f",
    bgInput: "#1f1f26",
    border: "#2a2a35",
    borderHov: "#3d3d50",
    accent: "#7c6af7",
    accentDim: "#3d3568",
    success: "#3ecf8e",
    warn: "#f5a623",
    danger: "#e05252",
    txt: "#e8e8f0",
    txtMuted: "#7a7a95",
    txtDim: "#4a4a60",
    mono: "'JetBrains Mono', monospace",
    sans: "'DM Sans', system-ui, sans-serif",
    selectedBg: "#1e1a38"
  },

  light: {
    bg: "#f7f7fb",
    bgPanel: "#ffffff",
    bgCard: "#ffffff",
    bgInput: "#f1f1f6",
    border: "#dcdce6",
    borderHov: "#c5c5d6",
    accent: "#6b5cff",
    accentDim: "#dcd8ff",
    success: "#2fbf71",
    warn: "#e09a1a",
    danger: "#d64545",
    txt: "#1a1a1f",
    txtMuted: "#5a5a70",
    txtDim: "#8a8aa0",
    mono: "'JetBrains Mono', monospace",
    sans: "'DM Sans', system-ui, sans-serif",
     selectedBg: "#e8e6ff"
  }
};

// ─── Tiny style helpers ──────────────────────────────────────────────────────
const css = (obj) => Object.entries(obj).map(([k,v])=>`${k.replace(/([A-Z])/g,m=>'-'+m.toLowerCase())}:${v}`).join(';');


// ─── Suggested prompts for the AI bot ───────────────────────────────────────
const SUGGESTIONS = [
  "How should I organize 10,000+ photos on my hard drive?",
  "What's the best folder structure for travel photography?",
  "Help me cull duplicate photos — what to keep?",
  "Explain RAW vs JPEG for photo archiving",
  "Tips for naming photos so they sort well by date",
  "What metadata should I always preserve?",
  "Best backup strategy for a large photo library?",
  "How do I find the sharpest shot in a burst series?",
];

// ─── AI Chat using Anthropic API ─────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a professional photography assistant and photo library expert named "Iris".
You specialise in:
- Photography technique (composition, exposure, lighting, focus)
- Photo library organisation (folder structures, naming conventions, metadata, tagging)
- Duplicate detection strategy (what to keep, culling bursts, RAW+JPEG pairs)
- Backup workflows (3-2-1 rule, cloud vs local, NAS, archival)
- File formats and colour spaces (RAW, JPEG, HEIC, PNG, TIFF, sRGB, AdobeRGB)
- Photo editing workflows (Lightroom, Darktable, RawTherapee, digiKam)
- Privacy-first approaches (local-only tools, offline workflows)

Keep answers concise, practical, and structured. Use bullet points where helpful.
When asked about duplicate photo decisions, always give a clear recommendation.
Respond in a warm but expert tone. Never recommend paid software without also mentioning a free alternative.`;

async function askIris(messages) {
  const res = await fetch("http://localhost:11434/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llava",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...messages
      ],
      stream: false
    }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const data = await res.json();
  return data.content.find(b => b.type === "text")?.text || "No response.";
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function TabBar({ tabs, active, onChange, T }) {
  return (
    <div style={{ display:"flex", borderBottom:`1px solid ${T.border}`, marginBottom:20 }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)} style={{
          background:"none", border:"none", cursor:"pointer",
          padding:"10px 18px", fontFamily:T.mono, fontSize:12,
          letterSpacing:"0.06em", color: active===t.id ? T.accent : T.txtMuted,
          borderBottom: active===t.id ? `2px solid ${T.accent}` : "2px solid transparent",
          marginBottom:-1, transition:"color 0.15s",
        }}>{t.label}</button>
      ))}
    </div>
  );
}

function Stat({ label, value, color, T }) {
  return (
    <div style={{ background:T.bgCard, borderRadius:8, padding:"14px 16px", border:`1px solid ${T.border}` }}>
      <div style={{ fontSize:22, fontWeight:600, color: color||T.txt, fontFamily:T.mono, letterSpacing:"-0.02em" }}>{value}</div>
      <div style={{ fontSize:10, color:T.txtMuted, marginTop:3, letterSpacing:"0.06em", textTransform:"uppercase" }}>{label}</div>
    </div>
  );
}

function Badge({ type, similarity, T }) {
  if (type === "exact") return (
    <span style={{ fontSize:9, padding:"2px 7px", borderRadius:3, background:"#1a3a25", color:T.success, letterSpacing:"0.08em", fontWeight:600, fontFamily:T.mono }}>EXACT</span>
  );
  return (
    <span style={{ fontSize:9, padding:"2px 7px", borderRadius:3, background:"#3a2a10", color:T.warn, letterSpacing:"0.08em", fontWeight:600, fontFamily:T.mono }}>
      SIMILAR {similarity ? `${similarity}%` : ""}
    </span>
  );
}

function DupGroup({ group, T }) {
  const [open, setOpen] = useState(true);
  const [deleted, setDeleted] = useState({});

  return (
    <div style={{ border:`1px solid ${T.border}`, borderRadius:10, marginBottom:10, overflow:"hidden" }}>
      {/* Group header */}
      <div onClick={() => setOpen(o=>!o)} style={{
        display:"flex", justifyContent:"space-between", alignItems:"center",
        padding:"10px 14px", background:T.bgCard, cursor:"pointer",
        borderBottom: open ? `1px solid ${T.border}` : "none",
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <Badge type={group.type} similarity={group.similarity} T={T} />
          <span style={{ fontSize:12, color:T.txt, fontFamily:T.mono }}>{group.files[0].name}</span>
          <span style={{ fontSize:11, color:T.txtDim }}>{group.files.length} files</span>
        </div>
        <span style={{ color:T.txtDim, fontSize:12, transform: open?"":"rotate(-90deg)", transition:"0.2s" }}>▾</span>
      </div>

      {/* File rows */}
      {open && (
        <div style={{ padding:"10px 14px", display:"flex", flexDirection:"column", gap:6 }}>
          {group.files.map((f, i) => (
            <div key={f.path} style={{
              display:"flex", justifyContent:"space-between", alignItems:"center",
              padding:"8px 12px", borderRadius:7,
              border:`1px solid ${i===0 ? T.accentDim : T.border}`,
              opacity: deleted[f.path] ? 0.35 : 1,
              transition:"opacity 0.2s",
            }}>
              <div>
                <div style={{ fontSize:12, color:T.txt, fontFamily:T.mono, textDecoration: deleted[f.path]?"line-through":"none" }}>{f.name}</div>
                <div style={{ fontSize:10, color:T.txtMuted, marginTop:2 }}>{f.path} · {f.size} · {f.date}</div>
              </div>
              <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                {i===0 && <span style={{ fontSize:10, color:T.accent, fontFamily:T.mono }}>keep</span>}
                {i>0 && !deleted[f.path] && (
                  <button onClick={() => setDeleted(d=>({...d,[f.path]:true}))} style={{
                    fontSize:10, padding:"3px 9px", borderRadius:4, cursor:"pointer", fontFamily:T.mono,
                    border:`1px solid ${T.danger}`, background:"transparent", color:T.danger,
                  }}>delete</button>
                )}
                {deleted[f.path] && <span style={{ fontSize:10, color:T.txtDim, fontFamily:T.mono }}>marked</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Scanner Panel ────────────────────────────────────────────────────────────
function ScannerPanel({ onScanDone, T }) {
  const [folder, setFolder] = useState("/Users/A200173944/Pictures");
  const [mode, setMode] = useState("both");
  const [threshold, setThreshold] = useState(10);
  const [recursive, setRecursive] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState("");
  const [error, setError] = useState(null);

const runScan = async () => {
  setScanning(true);
  setProgress(0);
  setPhase("Starting scan...");
  setError(null);

  try {
    // 1. start job
    const startRes = await fetch("http://localhost:5000/scan/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder, mode, threshold, recursive }),
    });

    const { job_id } = await startRes.json();

    // 2. poll progress
    const interval = setInterval(async () => {
      const res = await fetch(`http://localhost:5000/scan/status/${job_id}`);
      const data = await res.json();

      if (data.progress !== undefined) {
        setProgress(data.progress);
      }

      if (data.status === "done") {
        clearInterval(interval);
        setScanning(false);

        const resultRes = await fetch(`http://localhost:5000/scan/result/${job_id}`);
        const result = await resultRes.json();

        onScanDone(result.groups);
      }

      if (data.status === "error") {
        clearInterval(interval);
        setScanning(false);
        setError(data.error);
      }
    }, 500);

  } catch (e) {
    setScanning(false);
    setError(e.message);
  }
};

  const modes = [
    { id:"exact",      label:"Exact",      desc:"SHA-256 · byte-identical only" },
    { id:"perceptual", label:"Perceptual", desc:"pHash · visually similar" },
    { id:"both",       label:"Both",       desc:"Most thorough scan" },
  ];

  return (
    <div>
      {/* Folder */}
      <div style={{ marginBottom:18 }}>
        <label style={{ fontSize:11, color:T.txtMuted, letterSpacing:"0.07em", textTransform:"uppercase", display:"block", marginBottom:6 }}>Folder Path</label>
        <input value={folder} onChange={e=>setFolder(e.target.value)} style={{
          width:"100%", fontFamily:T.mono, fontSize:13, padding:"10px 14px",
          background:T.bgInput, border:`1px solid ${T.border}`, borderRadius:8,
          color:T.txt, outline:"none",
        }} placeholder="/home/user/Pictures" />
      </div>

      {/* Mode */}
      <div style={{ marginBottom:18 }}>
        <label style={{ fontSize:11, color:T.txtMuted, letterSpacing:"0.07em", textTransform:"uppercase", display:"block", marginBottom:6 }}>Detection Mode</label>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
          {modes.map(m => (
            <div key={m.id} onClick={()=>setMode(m.id)} style={{
              padding:"11px 12px", borderRadius:8, cursor:"pointer",
              border:`1px solid ${mode===m.id ? T.accent : T.border}`,
              background: mode===m.id ? T.selectedBg : T.bgCard,
              transition:"all 0.15s",
            }}>
              <div style={{ fontSize:12, fontWeight:600, color:T.txt, marginBottom:3 }}>{m.label}</div>
              <div style={{ fontSize:10, color:T.txtMuted, lineHeight:1.4 }}>{m.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Threshold */}
      {mode !== "exact" && (
        <div style={{ marginBottom:18 }}>
          <label style={{ fontSize:11, color:T.txtMuted, letterSpacing:"0.07em", textTransform:"uppercase", display:"block", marginBottom:6 }}>
            Similarity Threshold — <span style={{ color:T.accent }}>{threshold}</span>
          </label>
          <input type="range" min={0} max={64} step={1} value={threshold}
            onChange={e=>setThreshold(+e.target.value)}
            style={{ width:"100%", accentColor:T.accent }} />
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:T.txtDim, marginTop:4 }}>
            <span>0 — identical</span><span>10 — near-dup</span><span>30+ — loose</span>
          </div>
        </div>
      )}

      {/* Options */}
      <div style={{ marginBottom:24 }}>
        <label style={{ fontSize:11, color:T.txtMuted, letterSpacing:"0.07em", textTransform:"uppercase", display:"block", marginBottom:8 }}>Options</label>
        {[["recursive", recursive, setRecursive, "Scan subfolders recursively"],
          ].map(([key, val, setter, lbl]) => (
          <label key={key} style={{ display:"flex", alignItems:"center", gap:10, fontSize:12, color:T.txtMuted, cursor:"pointer", marginBottom:8 }}>
            <input type="checkbox" checked={val} onChange={e=>setter(e.target.checked)} style={{ accentColor:T.accent }} />
            {lbl}
          </label>
        ))}
      </div>

      {/* Run button */}
      <button onClick={runScan} disabled={scanning} style={{
        width:"100%", padding:"12px", fontFamily:T.mono, fontSize:12, letterSpacing:"0.1em",
        borderRadius:9, border:"none", cursor: scanning?"not-allowed":"pointer",
        background: scanning ? T.accentDim : T.accent,
        color:"#fff", fontWeight:600, transition:"background 0.2s",
      }}>
        {scanning ? `${phase}  ${progress}%` : "▶  RUN SCAN"}
      </button>
      {error && (
  <div style={{
    marginTop: 12,
    padding: "10px 12px",
    borderRadius: 8,
    border: `1px solid ${T.danger}`,
    background: "#2a1515",
    color: T.danger,
    fontSize: 11,
    fontFamily: T.mono,
    whiteSpace: "pre-wrap"
  }}>
    ⚠ {error}
  </div>
)}
      {/* Progress bar */}
      {scanning && (
        <div style={{ height:3, background:T.border, borderRadius:2, marginTop:12, overflow:"hidden" }}>
          <div style={{ height:"100%", width:`${progress}%`, background:T.accent, borderRadius:2, transition:"width 0.15s" }} />
        </div>
      )}
    </div>
  );
}

// ─── Results Panel ────────────────────────────────────────────────────────────
function ResultsPanel({ groups, T }) {
  const [filter, setFilter] = useState("all");
  if (!groups) return (
    <div style={{ textAlign:"center", padding:"4rem 1rem", color:T.txtDim, fontFamily:T.mono, fontSize:13 }}>
      <div style={{ fontSize:36, marginBottom:12, opacity:0.3 }}>◈</div>
      Run a scan first to see duplicate groups.
    </div>
  );

  const exact = groups.filter(g=>g.type==="exact");
  const similar = groups.filter(g=>g.type==="similar");
  const allFiles = groups.reduce((a,g)=>a+g.files.length,0);
  const reclaimMB = exact.reduce((a,g)=>a+(g.files.length-1)*3.1,0).toFixed(1);

  const visible = filter==="all" ? groups : groups.filter(g=>g.type===(filter==="exact"?"exact":"similar"));

  return (
    <div>
      {/* Stats */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8, marginBottom:20 }}>
        <Stat label="Images flagged" value={allFiles} T={T} />
        <Stat label="Exact groups"   value={exact.length}   color={T.success} T={T} />
        <Stat label="Similar groups" value={similar.length} color={T.warn} T={T} />
        <Stat label="Est. savings"   value={`${reclaimMB} MB`} color={T.accent} T={T} />
      </div>

      {/* Filter */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
        <span style={{ fontSize:12, color:T.txtMuted }}>{visible.length} group{visible.length!==1?"s":""}</span>
        <div style={{ display:"flex", gap:6 }}>
          {["all","exact","similar"].map(f => (
            <button key={f} onClick={()=>setFilter(f)} style={{
              fontSize:10, padding:"4px 10px", borderRadius:4, cursor:"pointer",
              fontFamily:T.mono, letterSpacing:"0.05em",
              border:`1px solid ${filter===f ? T.accent : T.border}`,
              background: filter===f ? "#1e1a38" : "transparent",
              color: filter===f ? T.accent : T.txtMuted,
            }}>{f}</button>
          ))}
        </div>
      </div>

      {/* Groups */}
      {visible.map(g => <DupGroup key={g.id} group={g} T={T} />)}
    </div>
  );
}

// ─── AI Chat Panel ────────────────────────────────────────────────────────────
function ChatPanel({T}) {
  const [messages, setMessages] = useState([
    { role:"assistant", content:"Hi! I'm **Iris**, your photography & photo library assistant.\n\nAsk me anything — folder organisation, duplicate culling strategy, RAW vs JPEG, backup workflows, or camera technique. All suggestions are tailored for offline, privacy-first setups." }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const bottomRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:"smooth" }); }, [messages, loading]);

  const send = async (text) => {
    const q = (text || input).trim();
    if (!q || loading) return;
    setInput("");
    setError(null);
    const newMessages = [...messages, { role:"user", content:q }];
    setMessages(newMessages);
    setLoading(true);
    try {
      const apiMessages = newMessages.map(m => ({ role:m.role, content:m.content }));
      const reply = await askIris(apiMessages);
      setMessages(prev => [...prev, { role:"assistant", content:reply }]);
    } catch(e) {
      setError("Could not reach the AI. Check your connection.");
    } finally {
      setLoading(false);
    }
  };

  const renderContent = (text) => {
    // Basic markdown: **bold**, bullet points, line breaks
    return text
      .replace(/\*\*(.*?)\*\*/g, `<strong style="color:${T.txt};font-weight:600">$1</strong>`)
      .replace(/^- (.+)/gm, `<div style="display:flex;gap:8px;margin:3px 0"><span style="color:${T.accent};flex-shrink:0">▸</span><span>$1</span></div>`)
      .replace(/\n/g, "<br/>");
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", height:520 }}>
      {/* Messages */}
      <div style={{ flex:1, overflowY:"auto", paddingBottom:12, display:"flex", flexDirection:"column", gap:14 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display:"flex", gap:10, flexDirection: m.role==="user" ? "row-reverse" : "row" }}>
            {/* Avatar */}
            <div style={{
              width:30, height:30, borderRadius:"50%", flexShrink:0,
              background: m.role==="assistant" ? T.accentDim : T.bgCard,
              border:`1px solid ${m.role==="assistant" ? T.accent : T.border}`,
              display:"flex", alignItems:"center", justifyContent:"center",
              fontSize:11, fontFamily:T.mono, color: m.role==="assistant" ? T.accent : T.txtMuted,
            }}>
              {m.role==="assistant" ? "◈" : "U"}
            </div>
            {/* Bubble */}
            <div style={{
              maxWidth:"82%", padding:"10px 14px", borderRadius: m.role==="user" ? "12px 4px 12px 12px" : "4px 12px 12px 12px",
              background: m.role==="user" ? "#1e1a38" : T.bgCard,
              border:`1px solid ${m.role==="user" ? T.accentDim : T.border}`,
              fontSize:13, color:T.txtMuted, lineHeight:1.65, fontFamily:T.sans,
            }}
              dangerouslySetInnerHTML={{ __html: renderContent(m.content) }}
            />
          </div>
        ))}

        {/* Typing indicator */}
        {loading && (
          <div style={{ display:"flex", gap:10 }}>
            <div style={{ width:30, height:30, borderRadius:"50%", background:T.accentDim, border:`1px solid ${T.accent}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontFamily:T.mono, color:T.accent, flexShrink:0 }}>◈</div>
            <div style={{ padding:"12px 16px", background:T.bgCard, border:`1px solid ${T.border}`, borderRadius:"4px 12px 12px 12px" }}>
              <div style={{ display:"flex", gap:5 }}>
                {[0,1,2].map(i=>(
                  <div key={i} style={{
                    width:6, height:6, borderRadius:"50%", background:T.accent,
                    animation:`bounce 1.2s ease-in-out ${i*0.2}s infinite`,
                  }}/>
                ))}
              </div>
            </div>
          </div>
        )}
        {error && <div style={{ fontSize:12, color:T.danger, textAlign:"center", fontFamily:T.mono }}>{error}</div>}
        <div ref={bottomRef}/>
      </div>

      {/* Suggestions (show when only 1 message) */}
      {messages.length === 1 && (
        <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:12 }}>
          {SUGGESTIONS.slice(0,4).map((s,i) => (
            <button key={i} onClick={()=>send(s)} style={{
              fontSize:11, padding:"5px 10px", borderRadius:6, cursor:"pointer",
              border:`1px solid ${T.border}`, background:T.bgCard,
              color:T.txtMuted, fontFamily:T.sans, lineHeight:1.3, textAlign:"left",
            }}>{s}</button>
          ))}
        </div>
      )}

      {/* Input row */}
      <div style={{ display:"flex", gap:8 }}>
        <input
          value={input}
          onChange={e=>setInput(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&send()}
          placeholder="Ask Iris about photography or photo organisation…"
          disabled={loading}
          style={{
            flex:1, fontFamily:T.sans, fontSize:13, padding:"11px 14px",
            background:T.bgInput, border:`1px solid ${T.border}`,
            borderRadius:9, color:T.txt, outline:"none",
          }}
        />
        <button onClick={()=>send()} disabled={loading||!input.trim()} style={{
          padding:"11px 18px", borderRadius:9, border:"none", cursor:"pointer",
          background: (loading||!input.trim()) ? T.accentDim : T.accent,
          color:"#fff", fontFamily:T.mono, fontSize:12, fontWeight:600,
          letterSpacing:"0.06em",
        }}>Send</button>
      </div>
    </div>
  );
}

// ─── Script Panel ─────────────────────────────────────────────────────────────
const PYTHON_SCRIPT = `#!/usr/bin/env python3
"""
DupeScope — Privacy-First Duplicate Photo Detector
Requires: pip install Pillow imagehash

Usage:
  python dupescope.py ~/Pictures
  python dupescope.py ~/Pictures --mode perceptual --threshold 15
"""
import os, hashlib, json, argparse, sys
from pathlib import Path
from collections import defaultdict

try:
    from PIL import Image
    import imagehash
    PERCEPTUAL = True
except ImportError:
    PERCEPTUAL = False
    print("[!] pip install Pillow imagehash")

EXTS = {'.jpg','.jpeg','.png','.gif','.bmp','.webp','.tiff','.heic','.avif'}

def sha256(path):
    h = hashlib.sha256()
    with open(path,'rb') as f:
        for chunk in iter(lambda: f.read(65536), b''):
            h.update(chunk)
    return h.hexdigest()

def scan_images(folder, recursive=True):
    images = []
    walk = os.walk(folder) if recursive else [(folder,[],os.listdir(folder))]
    for root,_,files in walk:
        for f in files:
            if Path(f).suffix.lower() in EXTS:
                images.append(Path(root)/f)
    return sorted(images)

def find_exact(images):
    hmap = defaultdict(list)
    for i,p in enumerate(images):
        sys.stdout.write(f"\\r  [exact] {i+1}/{len(images)} {p.name[:40]}")
        try: hmap[sha256(p)].append(p)
        except: pass
    print()
    return {h:ps for h,ps in hmap.items() if len(ps)>1}

def find_perceptual(images, threshold=10):
    if not PERCEPTUAL: return []
    ph = []
    for i,p in enumerate(images):
        sys.stdout.write(f"\\r  [phash] {i+1}/{len(images)} {p.name[:40]}")
        try: ph.append((p, imagehash.phash(Image.open(p).convert('RGB'))))
        except: pass
    print()
    groups, seen = [], set()
    for i,(pa,ha) in enumerate(ph):
        if i in seen: continue
        grp = [pa]
        for j,(pb,hb) in enumerate(ph):
            if i!=j and j not in seen and ha-hb<=threshold:
                grp.append(pb); seen.add(j)
        if len(grp)>1: seen.add(i); groups.append(grp)
    return groups

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('folder')
    ap.add_argument('--mode', choices=['exact','perceptual','both'], default='both')
    ap.add_argument('--threshold', type=int, default=10)
    ap.add_argument('--output', default='dupescope_report.json')
    args = ap.parse_args()

    folder = Path(args.folder)
    images = scan_images(folder)
    print(f"Found {len(images)} images\\n")

    exact, perceptual = {}, []
    if args.mode in ('exact','both'):
        print("[1] Exact (SHA-256)...")
        exact = find_exact(images)
    if args.mode in ('perceptual','both'):
        print("[2] Perceptual (pHash)...")
        perceptual = find_perceptual(images, args.threshold)

    report = {
        "folder": str(folder),
        "total": len(images),
        "exact_groups": [{"hash":h,"files":[str(p) for p in ps]} for h,ps in exact.items()],
        "similar_groups": [[str(p) for p in g] for g in perceptual],
    }
    with open(args.output,'w') as f: json.dump(report, f, indent=2)
    print(f"\\nExact groups:   {len(exact)}")
    print(f"Similar groups: {len(perceptual)}")
    print(f"Report → {args.output}")

if __name__ == '__main__': main()`;

function ScriptPanel({T}) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(PYTHON_SCRIPT).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 1800);
    });
  };
  return (
    <div>
      <div style={{ fontSize:12, color:T.txtMuted, lineHeight:1.7, marginBottom:16 }}>
        Runs 100% offline. No data leaves your machine. Requires Python 3.8+.
      </div>

      {/* Install & usage strip */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:16 }}>
        {[
          ["Install", "pip install Pillow imagehash"],
          ["Run", "python dupescope.py ~/Pictures --mode both"],
        ].map(([lbl, cmd]) => (
          <div key={lbl} style={{ background:T.bgCard, border:`1px solid ${T.border}`, borderRadius:8, padding:"10px 14px" }}>
            <div style={{ fontSize:10, color:T.txtDim, letterSpacing:"0.07em", marginBottom:4 }}>{lbl}</div>
            <div style={{ fontSize:11, color:T.accent, fontFamily:T.mono }}>{cmd}</div>
          </div>
        ))}
      </div>

      {/* Code block */}
      <div style={{ background:T.bgCard, border:`1px solid ${T.border}`, borderRadius:10, overflow:"hidden" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 14px", borderBottom:`1px solid ${T.border}` }}>
          <span style={{ fontSize:11, color:T.txtMuted, fontFamily:T.mono }}>dupescope.py</span>
          <button onClick={copy} style={{
            fontSize:10, padding:"4px 10px", borderRadius:5, cursor:"pointer",
            border:`1px solid ${copied ? T.success : T.border}`,
            background:"transparent", color: copied ? T.success : T.txtMuted,
            fontFamily:T.mono, transition:"all 0.2s",
          }}>{copied ? "Copied!" : "Copy"}</button>
        </div>
        <pre style={{
          padding:"16px", overflowX:"auto", overflowY:"auto", maxHeight:440,
          fontSize:11, lineHeight:1.75, color:T.txtMuted, fontFamily:T.mono, margin:0,
        }}>{PYTHON_SCRIPT}</pre>
      </div>
    </div>
  );
}

// ─── Main App ────────────────────────────────────────────────────────────────
export default function App() {
  const [theme, setTheme] = useState("dark");
  const T = THEMES[theme];
 
  const [tab, setTab] = useState("scanner");
  const [scanResults, setScanResults] = useState(null);
  
  const handleScanDone = (groups) => {
    setScanResults(groups);
    setTab("results");
  };

  const TABS = [
    { id:"scanner", label:"◈ SCANNER" },
    { id:"results", label:`▣ RESULTS${scanResults ? ` (${scanResults.length})` : ""}` },
    { id:"iris",    label:"✦ IRIS — AI ASSISTANT" },
    { id:"script",  label:"{ } PYTHON SCRIPT" },
  ];

  return (
    <div style={{
      background:T.bg, color:T.txt, fontFamily:T.sans,
      minHeight:"100vh", padding:"24px 28px",
    }}>
      {/* Bounce keyframes */}
      <style>{`
        @keyframes bounce {
          0%,80%,100%{transform:translateY(0)}
          40%{transform:translateY(-6px)}
        }
        input[type=range]{accent-color:${T.accent}}
        ::-webkit-scrollbar{width:6px;height:6px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:${T.border};border-radius:3px}
        *{box-sizing:border-box}
      `}</style>

      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:28 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{
            width:38, height:38, borderRadius:9,
            background:`linear-gradient(135deg, ${T.accentDim}, #1a1a38)`,
            border:`1px solid ${T.accent}`, display:"flex", alignItems:"center",
            justifyContent:"center", fontSize:18, color:T.accent,
          }}>◈</div>
          <div>
            <div style={{ fontSize:18, fontWeight:600, letterSpacing:"-0.025em", color:T.txt }}>DupeScope</div>
            <div style={{ fontSize:10, color:T.txtDim, letterSpacing:"0.08em", textTransform:"uppercase" }}>Privacy-First · Fully Offline</div>
          </div>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          {[["NO NETWORK", T.success], ["LOCAL ONLY", T.accent]].map(([lbl,col]) => (
            <span key={lbl} style={{
              fontSize:9, padding:"3px 9px", borderRadius:4, fontFamily:T.mono,
              border:`1px solid ${col}33`, color:col, letterSpacing:"0.08em",
            }}>{lbl}</span>
          ))}
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:1 }}>
          <button
  onClick={() => setTheme(t => t === "dark" ? "light" : "dark")}
  style={{
    padding: "6px 12px",
    borderRadius: 6,
    border: `1px solid ${T.border}`,
    background: T.bgCard,
    color: T.txt,
    fontFamily: T.mono,
    cursor: "pointer"
  }}
>
  {theme === "dark" ? "☀ Light" : "🌙 Dark"}
</button>
        </div>
      </div>

      {/* Tabs */}
      <TabBar tabs={TABS} active={tab} onChange={setTab} T={T} />

      {/* Panels */}
      {tab === "scanner" && <ScannerPanel T={T} onScanDone={handleScanDone} />}
      {tab === "results" && <ResultsPanel T={T} groups={scanResults} />}
      {tab === "iris"    && <ChatPanel T={T} />}
      {tab === "script"  && <ScriptPanel T={T} />}
    </div>
  );
}