#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# DupeScope Devbox — AI Agent Prerequisite Checker
# ─────────────────────────────────────────────────────────────────────────────
# Run manually via `devbox run checkai` (optionally with `--ollama`).
# All checks are idempotent — already-installed tools are skipped.
#
# Order:
#   1. OpenCode installed?      -> skip if present, else prompt to install
#   2. Ponytail installed?      -> skip if present, else prompt to install
#   3. (only with --ollama) Ollama installed?     -> error + install link, exit
#   4. (only with --ollama) Ollama server running? -> prompt to start, wait
#   5. (only with --ollama) Qwen model available? -> error + exit if missing
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

CHECK_OLLAMA=0
for arg in "$@"; do
  case "$arg" in
    --ollama) CHECK_OLLAMA=1 ;;
    --help|-h)
      echo "Usage: check_prereqs.sh [--ollama]"
      echo "  --ollama  Also check Ollama install, server, and Qwen model"
      exit 0
      ;;
    *)
      echo -e "${RED}✗ Unexpected argument: $arg${RST}"
      exit 1
      ;;
  esac
done

echo ""
echo -e "${BLD}🔎 Checking AI agent prerequisites...${RST}"
if [ "$CHECK_OLLAMA" -eq 1 ]; then
  echo "  (including Ollama checks — pass no flag to skip them)"
else
  echo "  (Ollama checks skipped — pass --ollama to enable)"
fi
echo "─────────────────────────────────────────────"

# ── 1. OpenCode installed? ──────────────────────────────────────────────────
if command -v opencode >/dev/null 2>&1; then
  OC_VER="$(opencode --version 2>/dev/null)"
  echo -e "${GRN}✓ OpenCode already installed${RST}  ${OC_VER}"
else
  echo -e "${YEL}⚠ OpenCode is not installed.${RST}"
  read -rp "  Install OpenCode now? [y/N] " _oc_install
  if [[ "$_oc_install" =~ ^[Yy]$ ]]; then
    npm install opencode-ai
    echo -e "${GRN}✓ OpenCode installed${RST}"
  else
    echo -e "${YEL}⚠ Skipping OpenCode install. CLI features won't be available.${RST}"
  fi
fi

# ── 2. Ponytail installed? ──────────────────────────────────────────────────
if npm ls -g --depth=0 2>/dev/null | grep -q "opencode-ponytail"; then
  echo -e "${GRN}✓ Ponytail already installed${RST}"
else
  echo -e "${YEL}⚠ Ponytail is not installed.${RST}"
  read -rp "  Install Ponytail now? [y/N] " _pt_install
  if [[ "$_pt_install" =~ ^[Yy]$ ]]; then
    npm install -g opencode-ponytail
    echo -e "${GRN}✓ Ponytail installed${RST}"
  else
    echo -e "${YEL}⚠ Skipping Ponytail install. Agent skills won't be available.${RST}"
  fi
fi

# ── 3-5. Ollama checks (only when --ollama is passed) ───────────────────────
if [ "$CHECK_OLLAMA" -eq 1 ]; then
  # ── 3. Ollama installed? ──────────────────────────────────────────────────
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

  # ── 4. Ollama server running? ─────────────────────────────────────────────
  if curl -sf --max-time 2 "http://localhost:${OLLAMA_PORT}/api/tags" >/dev/null 2>&1; then
    echo -e "${GRN}✓ Ollama server already running${RST}  (:${OLLAMA_PORT})"
  else
    echo -e "${YEL}… Ollama server not running.${RST}"
    read -rp "  Start Ollama server now? [y/N] " _ollama_start
    if [[ "$_ollama_start" =~ ^[Yy]$ ]]; then
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
    else
      echo -e "${YEL}⚠ Skipping Ollama server start. Some features may not work.${RST}"
    fi
  fi

  # ── 5. Qwen model available? ───────────────────────────────────────────────
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
fi

echo "─────────────────────────────────────────────"
echo -e "${GRN}${BLD}✓ All requested prerequisites satisfied${RST}"
echo ""