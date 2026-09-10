import { useEffect, useRef } from "react";
import { WS_URL } from "./api";

export default function useJobSocket(jobId, onEvent, onClosed, enabled = true) {
  const onEventRef  = useRef(null);
  const onClosedRef = useRef(null);

  useEffect(() => {
    onEventRef.current  = onEvent;
    onClosedRef.current = onClosed;
  }, [onEvent, onClosed]);

  useEffect(() => {
    if (!jobId || !enabled) return;
    const ws = new WebSocket(WS_URL);
    ws.onopen = () => ws.send(JSON.stringify({ type: "subscribe", job_id: jobId }));
    ws.onmessage = (ev) => {
      try { onEventRef.current?.(JSON.parse(ev.data)); }
      catch { /* ponytail: non-JSON frame is ignored; socket still usable. */ }
    };
    ws.onerror = () => ws.close();
    ws.onclose = () => onClosedRef.current?.();
    return () => ws.close();
  }, [jobId, enabled]);

  return null;
}