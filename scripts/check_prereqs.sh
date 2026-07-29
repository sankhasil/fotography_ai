#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# DupeScope Devbox — AI Agent Prerequisite Checker
# ─────────────────────────────────────────────────────────────────────────────
# Runs on every `devbox shell` entry (called from init_hook).
# All checks are idempotent — already-installed tools are skipped.
#
# Order:
#   1. Ollama installed?        -> error + install link, exit (closes devbox)
#   2. Ollama server running?   -> auto-start it, wait for health
#   3. Qwen model available?    -> error + exit if missing (closes devbox)
#   4. OpenCode installed?      -> skip if present, else npm install
#   5. Ponytail installed?      -> skip if present, else npm install
#
# Override via env vars:
#   OLLAMA_PORT=11434
#   QWEN_MODEL_PATTERN=qwen           (matches any qwen* model)
#   OLLAMA_HEALTH_TIMEOUT=30          (seconds to wait for ollama serve)
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

RED='\033[0;31m'
GRN='\033[0;32m'
YEL='\033[0;33m'
CYN='\033[0;36m'
BLD='\033[1m'
RST='\033[0m'

OLLAMA_PORT="${OLLAMA_PORT:-11434}"
QWEN_PATTERN="${QWEN_MODEL_PATTERN:-qwen}"
OLLAMA_HEALTH_TIMEOUT="${OLLAMA_HEALTH_TIMEOUT:-30}"

echo ""
echo -e "${BLD}🔎 Checking AI agent prerequisites...${RST}"
echo "─────────────────────────────────────────────"

# ── 1. Ollama installed? ────────────────────────────────────────────────────
if ! command -v ollama >/dev/null 2>&1; then
  echo -e "${RED}✗ Ollama is not installed.${RST}"
  echo ""
  echo "  Install it from the official site:"
  echo -e "  ${CYN}https://ollama.com/download${RST}"
  echo ""
  exit 1
fi
OLLAMA_VER="$(ollama --version 2>/dev/null | head -1)"
echo -e "${GRN}✓ Ollama installed${RST}  ${OLLAMA_VER}"

# ── 2. Ollama server running? ───────────────────────────────────────────────
if curl -sf --max-time 2 "http://localhost:${OLLAMA_PORT}/api/tags" >/dev/null 2>&1; then
  echo -e "${GRN}✓ Ollama server already running${RST}  (:${OLLAMA_PORT})"
else
  echo -e "${YEL}… Ollama server not running — starting it${RST}"
  nohup ollama serve >/tmp/ollama-devbox.log 2>&1 &
  disown

  echo -n "  Waiting for Ollama to become healthy "
  waited=0
  until curl -sf --max-time 2 "http://localhost:${OLLAMA_PORT}/api/tags" >/dev/null 2>&1; do
    echo -n "."
    sleep 1
    waited=$((waited + 1))
    if [ "$waited" -ge "$OLLAMA_HEALTH_TIMEOUT" ]; then
      echo ""
      echo -e "${RED}✗ Ollama did not start within ${OLLAMA_HEALTH_TIMEOUT}s.${RST}"
      echo "  Check the log: /tmp/ollama-devbox.log"
      exit 1
    fi
  done
  echo -e " ${GRN}ready ✓${RST}"
fi

# ── 3. Qwen model available? ────────────────────────────────────────────────
QWEN_FOUND="$(curl -sf "http://localhost:${OLLAMA_PORT}/api/tags" \
  | grep -io "\"name\":\"[^\"]*${QWEN_PATTERN}[^\"]*\"" | head -1)"

if [ -z "$QWEN_FOUND" ]; then
  echo -e "${RED}✗ No Qwen model found in Ollama.${RST}"
  echo ""
  echo "  Pull one first, e.g.:"
  echo -e "  ${CYN}ollama pull qwen2.5-coder:latest${RST}"
  echo ""
  exit 1
fi
echo -e "${GRN}✓ Qwen model available${RST}  ${QWEN_FOUND}"

# ── 4. OpenCode installed? ──────────────────────────────────────────────────
if command -v opencode >/dev/null 2>&1; then
  OC_VER="$(opencode --version 2>/dev/null)"
  echo -e "${GRN}✓ OpenCode already installed${RST}  ${OC_VER}"
else
  echo -e "${YEL}… Installing OpenCode${RST}"
  npm install  opencode-ai
  echo -e "${GRN}✓ OpenCode installed${RST}"
fi

# ── 5. Ponytail installed? ──────────────────────────────────────────────────
if npm ls -g --depth=0 2>/dev/null | grep -q "opencode-ponytail"; then
  echo -e "${GRN}✓ Ponytail already installed${RST}"
else
  echo -e "${YEL}… Installing Ponytail${RST}"
  npm install -g opencode-ponytail
  echo -e "${GRN}✓ Ponytail installed${RST}"
fi

echo "─────────────────────────────────────────────"
echo -e "${GRN}${BLD}✓ All AI agent prerequisites satisfied${RST}"
echo ""