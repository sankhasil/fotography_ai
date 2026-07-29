"""
Ponytail Pipeline — Open WebUI Pipelines
=========================================
Enforces Ponytail rules at the API level.
Unlike DEFAULT_SYSTEM_PROMPT (which users can override),
this pipeline injects the rules into every request unconditionally.

Drop this file in ./pipelines/ — it hot-reloads automatically.
Configure in Open WebUI: Admin Panel → Connections → Pipelines
"""

from typing import List, Optional
from pydantic import BaseModel


class Pipeline:
    class Valves(BaseModel):
        # Toggle Ponytail enforcement on/off from Open WebUI Admin UI
        enabled: bool = True
        # Intensity: "lite" | "full" | "ultra"
        mode: str = "full"
        # Only apply to models matching this prefix (empty = all models)
        model_prefix_filter: str = ""

    def __init__(self):
        self.name = "Ponytail — Minimum Correct Solution"
        self.valves = self.Valves()

    RULES = {
        "lite": (
            "Prefer the simplest correct solution. "
            "Use built-ins over dependencies. "
            "Avoid premature abstraction."
        ),
        "full": (
            "You follow the Ponytail philosophy: write the minimum correct solution.\n"
            "Rules:\n"
            "- YAGNI: never add code for future requirements\n"
            "- Use built-ins before dependencies\n"
            "- Delete > refactor > abstract\n"
            "- No base classes until 3+ implementations\n"
            "- Lead with code, max 3 sentences of prose\n"
            "- Commit to one answer"
        ),
        "ultra": (
            "PONYTAIL ULTRA: Every line of code added is a liability. "
            "Write the fewest lines that pass the tests. "
            "If a built-in exists, use it — no exceptions. "
            "If the answer is 'delete this code', say so. "
            "You are allergic to boilerplate. "
            "Lead with code. One sentence max."
        ),
    }

    async def on_startup(self):
        print(f"[ponytail] Pipeline loaded — mode={self.valves.mode}")

    async def on_shutdown(self):
        print("[ponytail] Pipeline shutdown")

    async def inlet(self, body: dict, user: Optional[dict] = None) -> dict:
        """
        inlet() runs BEFORE the request reaches Ollama.
        We inject the Ponytail rules into the system message here.
        """
        if not self.valves.enabled:
            return body

        model = body.get("model", "")
        if self.valves.model_prefix_filter and \
           not model.startswith(self.valves.model_prefix_filter):
            return body

        rules = self.RULES.get(self.valves.mode, self.RULES["full"])
        ponytail_message = {"role": "system", "content": rules}

        messages: List[dict] = body.get("messages", [])

        # If there's already a system message, prepend Ponytail rules to it
        # rather than replacing it — preserves user-set system prompts
        if messages and messages[0].get("role") == "system":
            existing = messages[0]["content"]
            messages[0]["content"] = f"{rules}\n\n---\n\n{existing}"
        else:
            messages.insert(0, ponytail_message)

        body["messages"] = messages
        return body

    async def outlet(self, body: dict, user: Optional[dict] = None) -> dict:
        """
        outlet() runs AFTER Ollama responds.
        Could add post-processing here (e.g., flag long responses).
        Currently passes through unchanged.
        """
        return body