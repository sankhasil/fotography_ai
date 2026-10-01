"""LLM providers for AI culling. Local models only.

Two wire shapes cover what people actually run on their own machine:

  ollama  — Ollama's native /api/chat, images as bare base64 strings
  openai  — the OpenAI-compatible /chat/completions shape served by
            LM Studio, llama.cpp, vLLM, and Ollama's own /v1

So a new local model server is a base URL, not a code change.

Never raises: a failed call returns fallback so one bad request never
stalls a culling run.
"""

from dataclasses import dataclass
from typing import Literal
from urllib.parse import urlparse

import requests

DEFAULT_PROVIDER = "ollama-local"
DEFAULT_MODEL = "llava"

Style = Literal["ollama", "openai"]


@dataclass(frozen=True)
class Provider:
    name: str
    base_url: str
    style: Style


_LOOPBACK_HOSTS = frozenset({
    "localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0", "host.docker.internal",
})

PROVIDERS: dict[str, Provider] = {
    "ollama-local": Provider(
        name="ollama-local",
        base_url="http://localhost:11434",
        style="ollama",
    ),
}


def resolve(name: str | None = None) -> Provider:
    """Look up a named provider, or treat `name` as a local OpenAI-compatible base URL."""
    key = name or DEFAULT_PROVIDER
    if key in PROVIDERS:
        return PROVIDERS[key]
    if key.startswith(("http://", "https://")):
        _require_local(key)
        return Provider(name=key, base_url=key.rstrip("/"), style="openai")
    raise ValueError(
        f"Unknown provider '{key}'. Use a known name ({', '.join(PROVIDERS)}) "
        f"or pass a base URL for an OpenAI-compatible server."
    )


def _require_local(url: str) -> None:
    """Reject non-loopback hosts — this tool must never ship a photo off-box.

    ponytail: hostname check, not resolved-IP check, so it is not DNS-rebinding
    safe. Adequate for a local CLI tool with no auth; revisit if this is ever
    exposed over the network.
    """
    host = urlparse(url).hostname or ""
    if host not in _LOOPBACK_HOSTS:
        raise ValueError(
            f"Refusing non-local provider '{url}'. dupescope only talks to "
            f"models on this machine ({', '.join(sorted(_LOOPBACK_HOSTS))}). "
            f"Point it at a local LM Studio / llama.cpp / vLLM / Ollama server."
        )


# ponytail: Vision is detected per wire style, not from a curated allowlist.
# Ollama reports a "clip" family in model metadata. OpenAI-compatible local
# servers report no metadata at all, so those ids are matched by substring —
# the list covers the vision-capable open-weight families. It is not
# exhaustive; a local model missing from it is hidden from --list-models but
# can still be set directly in dupescope.toml. Widening it is a one-line edit.

_OLLAMA_VISION_FAMILIES = {"clip", "mllama"}
_OPENAI_VISION_MARKERS = (
    "llava", "bakllava", "minicpm-v", "moondream", "gemma3",
    "qwen2-vl", "qwen2.5-vl", "internvl", "vision", "-vl", "vl-",
)


def _vision(provider: Provider, model_id: str, metadata: dict | None) -> bool:
    if provider.style == "ollama":
        return bool(_OLLAMA_VISION_FAMILIES & set((metadata or {}).get("families", [])))
    lowered = model_id.lower()
    return any(marker in lowered for marker in _OPENAI_VISION_MARKERS)


# ── Chat ──────────────────────────────────────────────────────────────────────

def _payload(provider: Provider, model: str, prompt: str, image_b64: str | None,
             system: str | None, options: dict) -> dict:
    if provider.style == "ollama":
        message: dict = {"role": "user", "content": prompt}
        if image_b64:
            message["images"] = [image_b64]
        messages = ([{"role": "system", "content": system}] if system else []) + [message]
        return {"model": model, "messages": messages, "stream": False,
                "options": options}

    parts: list[dict] = [{"type": "text", "text": prompt}]
    if image_b64:
        parts.append({"type": "image_url",
                      "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"}})
    messages = ([{"role": "system", "content": system}] if system else []) + [
        {"role": "user", "content": parts}]
    payload = {"model": model, "messages": messages, "stream": False}
    for ollama_key, openai_key in (("temperature", "temperature"),
                                   ("seed", "seed"),
                                   ("num_predict", "max_tokens")):
        if ollama_key in options:
            payload[openai_key] = options[ollama_key]
    return payload


def _url(provider: Provider) -> str:
    if provider.style == "ollama":
        return f"{provider.base_url}/api/chat"
    return f"{provider.base_url}/chat/completions"


def _extract(provider: Provider, data: dict) -> str:
    if provider.style == "ollama":
        return (data.get("message") or {}).get("content") or ""
    choices = data.get("choices") or [{}]
    return choices[0].get("message", {}).get("content") or ""


def chat(provider: Provider, model: str, prompt: str, *,
         image_b64: str | None = None, system: str | None = None,
         timeout: int = 120, fallback: str = "", **options) -> str:
    """Single chat turn. Returns fallback on any failure — never raises."""
    try:
        payload = _payload(provider, model, prompt, image_b64, system, options)
        res = requests.post(_url(provider), json=payload, timeout=timeout)
        res.raise_for_status()
        return _extract(provider, res.json()).strip() or fallback
    except Exception as e:
        print(f"\n[WARN] LLM call failed ({provider.name}/{model}): {e}")
        return fallback


# ── Model listing ─────────────────────────────────────────────────────────────

def list_models(provider: Provider, timeout: int = 15) -> list[str]:
    """Vision-capable model ids only. Empty list if the server is unreachable."""
    try:
        if provider.style == "ollama":
            tags = requests.get(f"{provider.base_url}/api/tags", timeout=timeout).json()
            entries = [(t["name"], t.get("details")) for t in tags.get("models", [])]
        else:
            data = requests.get(f"{provider.base_url}/models", timeout=timeout).json()
            entries = [(m["id"], None) for m in data.get("data", [])]
    except Exception as e:
        print(f"[WARN] Could not list models for {provider.name}: {e}")
        return []

    return [mid for mid, meta in entries if _vision(provider, mid, meta)]
