"""Local LLM helpers for AI culling — Ollama (LLaVA / Qwen-VL).

Best-effort by design: a failed LLM call degrades to a rule-based label so the
pipeline never stalls a culling run because the model or server hiccupped.
"""

import base64
import os
from pathlib import Path

import requests

OLLAMA_URL = os.environ.get("DUPESCOPE_OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.environ.get("DUPESCOPE_OLLAMA_MODEL", "llava")


def explain_photo(image_path: Path, keep: bool, timeout: int = 30) -> str:
    """Ask Ollama for a short one-sentence keep/delete reason. Never raises."""
    action = "KEEP" if keep else "DELETE"

    try:
        image_b64 = base64.b64encode(image_path.read_bytes()).decode("utf-8")
    except Exception:
        return f"recommended {action}"
    if not image_b64:
        return f"recommended {action}"

    prompt = (
        "You are a photo culling assistant reviewing a single photo.\n"
        f"The scoring model recommends: {action} this photo.\n"
        "Reply with exactly one short sentence (under 20 words) explaining why."
    )

    try:
        resp = requests.post(
            f"{OLLAMA_URL}/api/chat",
            json={
                "model": OLLAMA_MODEL,
                "stream": False,
                "messages": [{"role": "user", "content": prompt, "images": [image_b64]}],
            },
            timeout=timeout,
        )
        resp.raise_for_status()
        content = (resp.json().get("message") or {}).get("content") or ""
        return content.strip() or f"recommended {action}"
    except Exception:
        return f"recommended {action}"