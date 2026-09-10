#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GRN='\033[0;32m'
YEL='\033[0;33m'
CYN='\033[0;36m'
BLD='\033[1m'
RST='\033[0m'

MODEL="hhao/qwen2.5-coder-tools:7b"
TOOLS_BASE="http://localhost:4198/v1"
TSYSTEMS_BASE="https://llm-server.llmhub.t-systems.net/v2"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AGENTS_SRC="$REPO_ROOT/open-code/AGENTS.md"
CONFIG_SRC="$REPO_ROOT/opencode.json"

fetch_tsystems_models() {
  local response_url="$TSYSTEMS_BASE/models"
  if ! command -v jq >/dev/null 2>&1; then
    echo -e "${YEL}  jq not found — keeping existing T-Systems models block${RST}"
    return 1
  fi

  if [ -z "${TSYSTEMS_OPENCODE_API_KEY:-}" ]; then
    echo -e "${YEL}  TSYSTEMS_OPENCODE_API_KEY not set — keeping existing T-Systems models block${RST}"
    return 1
  fi

  if ! curl -fsS -H "Authorization: Bearer ${TSYSTEMS_OPENCODE_API_KEY}" "$response_url" | jq -c '
    [(.data // .models // [])[]
      | {
          id: .id,
          base_name: (.meta_data.display_name // .name // .id),
          context: (.meta_data.max_sequence_length // .context_window // .contextWindow // .limit.context // 0),
          output: (.meta_data.max_output_length // .max_output_tokens // .maxOutputTokens // .limit.output // 0)
        }
    ]
  ' ; then
    echo -e "${YEL}  Failed to fetch T-Systems /models — keeping existing models block${RST}"
    return 1
  fi
}

build_tsystems_models_json() {
  local source_json="$1"
  jq -cn --argjson models "$source_json" '
    def pricing($id):
      {
        "claude-sonnet-4.6": {severity: "High cost", label: "Claude 4.6 Sonnet", input: "2.97", output: "14.85", context: 200000},
        "claude-opus-4.8": {severity: "Very high cost", label: "Claude Opus 4.8", input: "4.95", output: "24.75", context: 200000},
        "gemini-3.1-pro": {severity: "High cost", label: "Gemini 3.1 Pro", input: "3.60", output: "16.20", context: 200000},
        "gemini-3.5-flash": {severity: "Moderate cost", label: "Gemini 3.5 Flash", input: "1.49", output: "8.91", context: 1000000},
        "gpt-5.4": {severity: "High cost", label: "GPT 5.4", input: "2.42", output: "14.49", context: 400000},
        "GLM-5.2": {severity: "Premium", label: "GLM 5.2", input: "1.50", output: "3.50", context: 1000000},
        "glm-5.2": {severity: "Premium", label: "GLM 5.2", input: "1.50", output: "3.50", context: 1000000},
        "gpt-oss-120b": {severity: "Budget", label: "GPT OSS 120B", input: "0.20", output: "0.65", context: 128000},
        "jina-embeddings-v2-base-de": {severity: "Budget", label: "Jina Embeddings v2 Base DE", input: "0.05", output: "0.05", context: 8000},
        "jina-embeddings-v2-base-code": {severity: "Budget", label: "Jina Embeddings v2 Base Code", input: "0.05", output: "0.05", context: 8000},
        "mistral-small-4": {severity: "Moderate cost", label: "Mistral Small 4", input: "0.60", output: "1.20", context: 256000},
        "NVIDIA-Nemotron-3-Super-120B-A12B-FP8": {severity: "Moderate cost", label: "NVIDIA Nemotron 3 Super 120B FP8", input: "0.60", output: "1.20", context: 1000000},
        "nvidia-nemotron-3-super-120b-fp8": {severity: "Moderate cost", label: "NVIDIA Nemotron 3 Super 120B FP8", input: "0.60", output: "1.20", context: 1000000},
        "Qwen3.6-35B-A3B-FP8": {severity: "Moderate cost", label: "Qwen 3.6 35B FP8", input: "0.60", output: "1.20", context: 256000},
        "qwen-3.6-35b-fp8": {severity: "Moderate cost", label: "Qwen 3.6 35B FP8", input: "0.60", output: "1.20", context: 256000},
        "BGE-M3": {severity: "Budget", label: "BGE-M3", input: "0.05", output: "0.05", context: 8000},
        "bge-m3": {severity: "Budget", label: "BGE-M3", input: "0.05", output: "0.05", context: 8000}
      }[$id];
    def priced_name($model; $price):
      if $price then
        if ($price.severity == "Budget") then
          "\($price.label) (Euro\($price.input)/Euro\($price.output))"
        else
          "\($price.label) (\($price.severity), Euro\($price.input)/Euro\($price.output))"
        end
      else
        $model.base_name
      end;
    reduce $models[] as $model (
      {};
      .[$model.id] = (
        (pricing($model.id)) as $price
        | {
            name: priced_name($model; $price),
            limit: {
              context: (
                if (($price // {}) | has("context")) and (($model.context | tonumber?) // 0) <= 0 then
                  $price.context
                else
                  (($model.context | tonumber?) // (($price // {}).context // 128000))
                end
              ),
              output: ($model.output | tonumber? // 4096)
            }
          }
      )
    )
  '
}

# Load .env so {env:*} placeholders in opencode.json resolve from current shell.
# devbox.json init_hook also does this for `devbox shell`; this covers `devbox run` and direct `bash scripts/opencode.sh`.
if [ -f "$REPO_ROOT/.env" ]; then
  set -a
  # shellcheck source=/dev/null
  source "$REPO_ROOT/.env"
  set +a
fi

LOCAL_BIN="$REPO_ROOT/open-code/node_modules/.bin/opencode"
OPENCODE_BIN="$(command -v opencode 2>/dev/null || true)"
[ -x "$LOCAL_BIN" ] && OPENCODE_BIN="$LOCAL_BIN"

if [ -z "$OPENCODE_BIN" ]; then
  echo -e "${RED}✗ opencode not found.${RST}"
  echo "  Install locally: cd open-code && npm install opencode-ai"
  exit 1
fi

# ── 1. Resolve target folder ──────────────────────────────────────────────
TARGET="${1:-$REPO_ROOT}"
if [[ "$TARGET" != /* ]]; then
  TARGET="$REPO_ROOT/$TARGET"
fi
TARGET="$(cd "$TARGET" && pwd)"

if [ ! -d "$TARGET" ]; then
  echo -e "${RED}✗ Folder not found: $TARGET${RST}"
  exit 1
fi

echo -e "${BLD}◈ OpenCode${RST}  →  ${CYN}${TARGET}${RST}"

# ── 2. Write project config (sync T-Systems models only when the catalog changes) ──
mkdir -p "$(dirname "$CONFIG_SRC")"
TSYSTEMS_MODELS='{
  "claude-sonnet-4.6": {
    "name": "Claude 4.6 Sonnet (High cost, Euro2.97/Euro14.85)",
    "limit": { "context": 200000, "output": 64000 }
  },
  "claude-opus-4.8": {
    "name": "Claude Opus 4.8 (Very high cost, Euro4.95/Euro24.75)",
    "limit": { "context": 200000, "output": 128000 }
  },
  "gpt-5.4": {
    "name": "GPT 5.4 (High cost, Euro2.42/Euro14.49)",
    "limit": { "context": 400000, "output": 128000 }
  },
  "gemini-3.1-pro": {
    "name": "Gemini 3.1 Pro (High cost, Euro3.60/Euro16.20)",
    "limit": { "context": 200000, "output": 65536 }
  },
  "Qwen3.6-35B-A3B-FP8": {
    "name": "Qwen 3.6 35B FP8 (Moderate cost, Euro0.60/Euro1.20)",
    "limit": { "context": 256000, "output": 262144 }
  },
  "NVIDIA-Nemotron-3-Super-120B-A12B-FP8": {
    "name": "NVIDIA Nemotron 3 Super 120B FP8 (Moderate cost, Euro0.60/Euro1.20)",
    "limit": { "context": 1000000, "output": 256000 }
  },
  "gpt-oss-120b": {
    "name": "GPT OSS 120B (Euro0.20/Euro0.65)",
    "limit": { "context": 128000, "output": 32768 }
  }
}'

if TSYSTEMS_FETCHED="$(fetch_tsystems_models 2>/dev/null)"; then
  TSYSTEMS_MODELS="$(build_tsystems_models_json "$TSYSTEMS_FETCHED")"
  echo -e "${GRN}✓ Synced T-Systems models from /models${RST}"
else
  echo -e "${YEL}  Using embedded T-Systems model catalog${RST}"
fi

TMP_CONFIG="$(mktemp)"
cat > "$TMP_CONFIG" << EOF
{
  "\$schema": "https://opencode.ai/config.json",
  "model": "ollama/$MODEL",
  "small_model": "ollama/$MODEL",
  "share": "disabled",
  "provider": {
    "ollama": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Ollama (tool-call proxy)",
      "options": {
        "baseURL": "$TOOLS_BASE",
        "apiKey": "ollama"
      },
      "models": {
        "$MODEL": {
          "name": "Qwen2.5 Coder Tools 7B"
        }
      }
    },
    "tsystems": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "T-Systems LLM Hub",
      "options": {
        "baseURL": "$TSYSTEMS_BASE",
        "apiKey": "{env:TSYSTEMS_OPENCODE_API_KEY}"
      },
      "models": $TSYSTEMS_MODELS
    }
  },
  "mcp": {
    "jira": {
      "type": "local",
      "command": ["uvx", "mcp-atlassian"],
      "enabled": true,
      "environment": {
        "JIRA_URL": "{env:JIRA_URL}",
        "JIRA_USERNAME": "{env:JIRA_USER_EMAIL}",
        "JIRA_API_TOKEN": "{env:JIRA_API_TOKEN}",
        "JIRA_PROJECTS_FILTER": "{env:JIRA_PROJECT}"
      }
    }
  },
  "plugin" : ["opencode-skillful","superpowers@git+https://github.com/obra/superpowers.git"],
  "skills": {
    "paths": [
      "$REPO_ROOT/open-code/.agents/skills",
      "$REPO_ROOT/.agents/skills"
    ]
  }
}
EOF
if [ -f "$CONFIG_SRC" ] && cmp -s "$TMP_CONFIG" "$CONFIG_SRC"; then
  rm -f "$TMP_CONFIG"
  echo -e "${GRN}✓ OpenCode config unchanged${RST}  ($CONFIG_SRC)"
else
  mv "$TMP_CONFIG" "$CONFIG_SRC"
  echo -e "${GRN}✓ OpenCode config written${RST}  ($CONFIG_SRC)"
fi

# Copy config to TARGET so opencode finds it in CWD
CONFIG_DST="$TARGET/opencode.json"
if [ "$CONFIG_SRC" != "$CONFIG_DST" ] && [ -f "$CONFIG_SRC" ]; then
  cp "$CONFIG_SRC" "$CONFIG_DST"
  echo -e "${GRN}✓ Config copied to CWD${RST}  ($CONFIG_DST)"
fi

# ── 3. Propagate AGENTS.md to target (idempotent) ─────────────────────────
AGENTS_DST="$TARGET/AGENTS.md"
if [ ! -f "$AGENTS_DST" ]; then
  cp "$AGENTS_SRC" "$AGENTS_DST"
  echo -e "${GRN}✓ AGENTS.md copied${RST}  → ${AGENTS_DST}"
else
  echo -e "${GRN}✓ AGENTS.md exists${RST}  (skip)"
fi

# ── 4. Ensure Ollama + tool-call proxy are running ─────────────────────────
# Both are managed by `npm run ollama:serve` (concurrently: ollama-serve.sh +
# ollama-tool-call-proxy.mjs). Started once, left running across sessions —
# killing/restarting on every launch would reload the model from disk every
# single time, which is its own multi-second-to-minute tax.
#
# port_up: returns success if *anything* answers, even a 4xx. The proxy 404s
# on GET/non-chat-completions requests, so `curl -f` would wrongly read that
# as "down" — only a connection failure (curl's synthetic 000) counts as down.
port_up() {
  local url="$1" code
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 "$url" || echo 000)"
  [ "$code" != "000" ]
}

if ! port_up "http://localhost:11434/api/tags" || ! port_up "http://localhost:4198/"; then
  echo -e "${YEL}  Ollama and/or tool-call proxy not running — starting...${RST}"
  ( cd "$REPO_ROOT/open-code" && nohup npm run ollama:serve > "$REPO_ROOT/.ollama-serve.log" 2>&1 & )

  echo -n "  Waiting for services"
  READY=0
  for i in $(seq 1 30); do
    if port_up "http://localhost:11434/api/tags" && port_up "http://localhost:4198/"; then
      READY=1
      break
    fi
    echo -n "."
    sleep 1
  done
  echo ""

  if [ "$READY" -ne 1 ]; then
    echo -e "${RED}✗ Ollama/proxy didn't come up within 30s.${RST}"
    echo -e "  Check: tail -f $REPO_ROOT/.ollama-serve.log"
    exit 1
  fi
fi

echo -e "${GRN}✓ Ollama reachable${RST}"
echo -e "${GRN}✓ Tool-call proxy reachable${RST}"

# ── 5. Launch ────────────────────────────────────────────────────────────
ACTUAL_MODEL="$(command -v jq >/dev/null 2>&1 && jq -r '.model // "unknown"' "$CONFIG_SRC" 2>/dev/null || echo "unknown")"
echo -e "${YEL}  Model : $ACTUAL_MODEL${RST}"
echo -e "${YEL}  Folder: $TARGET${RST}"
echo ""
cd "$TARGET" && exec "$LOCAL_BIN"
