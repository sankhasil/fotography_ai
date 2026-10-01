"""Thin wrapper over dupescope.providers for the pipeline's reason stage.

New code should call dupescope.providers.chat directly.
"""

import base64
from pathlib import Path

from dupescope.providers import DEFAULT_MODEL, DEFAULT_PROVIDER, chat, resolve


def explain_photo(image_path: Path, keep: bool, timeout: int = 30,
                  provider: str | None = None,
                  model: str | None = None) -> str:
    """Ask the local model for a short one-sentence keep/delete reason. Never raises."""
    action = "KEEP" if keep else "DELETE"
    fallback = f"recommended {action}"

    try:
        image_b64 = base64.b64encode(Path(image_path).read_bytes()).decode("utf-8")
    except Exception:
        return fallback
    if not image_b64:
        return fallback

    prompt = (
        "You are a photo culling assistant reviewing a single photo.\n"
        f"The scoring model recommends: {action} this photo.\n"
        "Reply with exactly one short sentence (under 20 words) explaining why."
    )

    return chat(resolve(provider), model or DEFAULT_MODEL, prompt,
                image_b64=image_b64, timeout=timeout, fallback=fallback)
