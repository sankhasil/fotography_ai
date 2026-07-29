#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# opencode.sh — Launch OpenCode pointed at a folder
#
# Usage (from repo root via devbox):
#   devbox run opencode                    # whole repo
#   devbox run opencode dupescope-backend  # just the backend
#   devbox run opencode dupescope-ui       # just the frontend
#   devbox run opencode /absolute/path     # any absolute path
#
# Folder cannot be changed mid-session — quit and rerun with new folder.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

RED='\033[0;31m'
GRN='\033[0;32m'
YEL='\033[0;33m'
CYN='\033[0;36m'
BLD='\033[1m'
RST='\033[0m'

MODEL="qwen2.5-coder:14b"
OLLAMA_BASE="http://localhost:11434/v1"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AGENTS_SRC="$REPO_ROOT/open-code/AGENTS.md"
CONFIG_SRC="$REPO_ROOT/open-code/config.json"

# Local install takes priority over global PATH
LOCAL_BIN="$REPO_ROOT/open-code/node_modules/.bin/opencode"
OPENCODE_BIN="$(command -v opencode 2>/dev/null || true)"
[ -x "$LOCAL_BIN" ] && OPENCODE_BIN="$LOCAL_BIN"

if [ -z "$OPENCODE_BIN" ]; then
  echo -e "${RED}✗ opencode not found.${RST}"
  echo "  Install locally: cd open-code && npm install opencode-ai"
  exit 1
fi

# ── 1. Resolve target folder (normalise ../../ style paths too) ───────────────
TARGET="${1:-$REPO_ROOT}"
if [[ "$TARGET" != /* ]]; then
  TARGET="$REPO_ROOT/$TARGET"
fi
TARGET="$(cd "$TARGET" && pwd)"   # normalise — resolves ../ segments

if [ ! -d "$TARGET" ]; then
  echo -e "${RED}✗ Folder not found: $TARGET${RST}"
  exit 1
fi

echo -e "${BLD}◈ OpenCode${RST}  →  ${CYN}${TARGET}${RST}"

# ── 2. Write global config once (idempotent) ──────────────────────────────────
# Global config means every project gets the same model without a local file.
if [ ! -f "$CONFIG_SRC" ]; then
  mkdir -p "$(dirname "$CONFIG_SRC")"
  cat > "$CONFIG_SRC" << EOF
{
  "\$schema": "https://opencode.ai/config.json",
  "model": "ollama/$MODEL",
  "provider": {
    "ollama": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Ollama (local)",
      "options": {
        "baseURL": "$OLLAMA_BASE",
        "apiKey": "ollama"
      }
    }
  }
}
EOF
  echo -e "${GRN}✓ OpenCode config written${RST}  ($CONFIG_SRC)"
else
  echo -e "${GRN}✓ OpenCode config exists${RST}  (skip)"
fi

# ── 3. Propagate AGENTS.md to target (idempotent) ─────────────────────────────
# OpenCode reads AGENTS.md from the directory it's launched in.
# ponytail: cp not symlink — simpler, works across filesystems, no dangling refs
AGENTS_DST="$TARGET/AGENTS.md"
if [ ! -f "$AGENTS_DST" ]; then
  cp "$AGENTS_SRC" "$AGENTS_DST"
  echo -e "${GRN}✓ AGENTS.md copied${RST}  → ${AGENTS_DST}"
else
  echo -e "${GRN}✓ AGENTS.md exists${RST}  (skip)"
fi

# ── 4. Verify Ollama is reachable ─────────────────────────────────────────────
if ! curl -sf --max-time 2 "http://localhost:11434/api/tags" >/dev/null 2>&1; then
  echo -e "${RED}✗ Ollama not reachable. Run: devbox run checkai${RST}"
  exit 1
fi

# ── 5. Launch ─────────────────────────────────────────────────────────────────
echo -e "${YEL}  Model : $MODEL${RST}"
echo -e "${YEL}  Folder: $TARGET${RST}"
echo ""
cd "$TARGET" && exec $LOCAL_BIN