export const API   = "http://localhost:5000";
export const WS_URL = "ws://localhost:5000/ws";

export async function apiFetch(method, path, body = null) {
  const res = await fetch(API + path, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  // ponytail: FastAPI errors carry `detail`, not `error` (404, 400, 503).
  // Surface the server's message so a missing folder reads "Folder not found".
  if (!res.ok) throw new Error(data.error || data.detail || `HTTP ${res.status}`);
  return data;
}

export const PIPELINE_STEPS = ["queued","scanning","processing","ai_culling","processed","archiving","archived"];

export const PHASE_LABELS = {
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
