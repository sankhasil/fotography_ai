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
TSYSTEMS_STATUS_BASE="https://uptime.llmhub.t-systems.net"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AGENTS_SRC="$REPO_ROOT/open-code/AGENTS.md"
AGENTS_MARKER_BEGIN="<!-- BEGIN OPENCODE SHARED AGENTS -->"
AGENTS_MARKER_END="<!-- END OPENCODE SHARED AGENTS -->"
CONFIG_SRC="$REPO_ROOT/opencode.json"
# ponytail: Colibri/DeepSeek-V4-Flash is NOT usable until 32 GB RAM; this box has 16 GB.
# The provider block is deliberately NOT generated into opencode.json, so the
# model can only be re-enabled here once running on a 32 GB+ machine.

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

fetch_tsystems_health() {
  local status_json heartbeat_json

  if ! status_json="$(curl -fsS --max-time 10 "$TSYSTEMS_STATUS_BASE/api/status-page/health")"; then
    return 1
  fi
  if ! heartbeat_json="$(curl -fsS --max-time 10 "$TSYSTEMS_STATUS_BASE/api/status-page/heartbeat/health")"; then
    return 1
  fi
  if ! jq -e '
      (.publicGroupList | type) == "array"
      and all(.publicGroupList[]?;
        (.monitorList | type) == "array"
        and all(.monitorList[]?;
          (.id | type) == "number"
          and (.name | type) == "string"
        )
      )
    ' <<< "$status_json" >/dev/null; then
    return 1
  fi
  if ! jq -e '
      (.heartbeatList | type) == "object"
      and (.uptimeList | type) == "object"
      and all(.heartbeatList | to_entries[]; (.value | type) == "array")
    ' <<< "$heartbeat_json" >/dev/null; then
    return 1
  fi

  jq -cn --argjson status "$status_json" --argjson heartbeats "$heartbeat_json" '
    def normalize: ascii_downcase | gsub("[^a-z0-9]"; "");
    ($heartbeats.uptimeList // {}) as $uptime
    | def record($monitor):
        ($monitor.id | tostring) as $id
        | (($heartbeats.heartbeatList[$id] // [])[-1] // {}) as $heartbeat
        | {
            status: ($heartbeat.status // null),
            uptime24: ($uptime["\($id)_24"] // null)
          };
    {
      exact: (
        reduce ($status.publicGroupList[]?.monitorList[]?) as $monitor (
          {};
          .[($monitor.name | ascii_downcase)] = record($monitor)
        )
      ),
      normalized: (
        reduce ($status.publicGroupList[]?.monitorList[]?) as $monitor (
          {};
          .[($monitor.name | normalize)] = ((.[($monitor.name | normalize)] // []) + [record($monitor)])
        )
      )
    }
  '
}

summarize_tsystems_health() {
  local models_json="$1"
  local health_json="$2"

  jq -nr --argjson models "$models_json" --argjson health "$health_json" '
    def normalize: ascii_downcase | gsub("[^a-z0-9]"; "");
    def health_record($id):
      ($health.exact[($id | ascii_downcase)] // null) as $exact
      | if $exact != null then
          $exact
        else
          ($health.normalized[($id | normalize)] // []) as $matches
          | if ($matches | length) == 1 then $matches[0] else null end
        end;
    reduce ($models | keys[]) as $id (
      {up: 0, down: 0, other: 0};
      (health_record($id)) as $record
      | if $record.status == 1 then .up += 1
        elif $record.status == 0 then .down += 1
        else .other += 1
        end
    )
    | "\(.up) up / \(.down) down / \(.other) other"
  '
}

build_tsystems_models_json() {
  local source_json="$1"
  local health_json='{}'
  [ "$#" -ge 2 ] && health_json="$2"
  jq -cn --argjson models "$source_json" --argjson health "$health_json" '
    def normalize: ascii_downcase | gsub("[^a-z0-9]"; "");
    def health_record($id):
      ($health.exact[($id | ascii_downcase)] // null) as $exact
      | if $exact != null then
          $exact
        else
          ($health.normalized[($id | normalize)] // []) as $matches
          | if ($matches | length) == 1 then $matches[0] else null end
        end;
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
    def health_text($id):
      (health_record($id)) as $record
      | (
          if $record == null then "UNKNOWN"
          elif $record.status == 1 then "UP"
          elif $record.status == 0 then "DOWN"
          elif $record.status == 2 then "PENDING"
          elif $record.status == 3 then "MAINTENANCE"
          else "UNKNOWN"
          end
        ) as $label
      | $label + (
          if $record != null and ($record.uptime24 | type) == "number" then
            ", 24h \((($record.uptime24 * 100) | round))%"
          else
            ""
          end
        );
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
    def display_name($model; $price):
      priced_name($model; $price) + (
        if ($health | length) > 0 then
          " [health: \(health_text($model.id))]"
        else
          ""
        end
      );
    reduce $models[] as $model (
      {};
      .[$model.id] = (
        (pricing($model.id)) as $price
        | {
            name: display_name($model; $price),
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

build_embedded_tsystems_models_json() {
  local source_json="$1"
  local health_json="$2"
  local models_json

  models_json="$(jq -c 'to_entries | map({id: .key, base_name: .value.name, context: .value.limit.context, output: .value.limit.output})' <<< "$source_json")"
  build_tsystems_models_json "$models_json" "$health_json"
}

merge_configs() {
  local base_config="$1"
  local target_config="$2"
  local merged_config="$3"

  jq -s '
    def merge_values($base; $overlay):
      if ($base | type) == "object" and ($overlay | type) == "object" then
        reduce (($base + $overlay) | keys_unsorted[]) as $key (
          {};
          .[$key] =
            if ($base | has($key)) and ($overlay | has($key)) then
              merge_values($base[$key]; $overlay[$key])
            elif $overlay | has($key) then
              $overlay[$key]
            else
              $base[$key]
            end
        )
      elif ($base | type) == "array" and ($overlay | type) == "array" then
        reduce ($base + $overlay)[] as $item (
          [];
          if any(.[]; . == $item) then . else . + [$item] end
        )
      else
        $overlay
      end;

    .[0] as $generated
    | .[1] as $target
    | merge_values($generated; $target) as $merged
    | reduce (($generated.provider.tsystems.models // {}) | keys[]) as $model (
        $merged;
        .provider.tsystems.models[$model].name = $generated.provider.tsystems.models[$model].name
      )
  ' "$base_config" "$target_config" > "$merged_config"
}

build_merged_agents() {
  local src="$1" dst="$2" out="$3"

  # ponytail: Three idempotent cases — (1) markers present: replace the shared
  # block, preserve local content before/after it; (2) no markers, dst==src:
  # wrap src with markers; (3) no markers, dst starts with src (old plain-cp
  # first run + hand-edited local content): wrap the shared prefix, keep the
  # suffix as local content after END. Trailing blanks around the block are
  # trimmed so repeated runs produce byte-identical output (cmp -s fires the
  # "no merge needed" branch instead of accumulating blank lines each run).
  if grep -Fq "$AGENTS_MARKER_BEGIN" "$dst"; then
    local tmp_before tmp_after
    tmp_before="$(mktemp)"; tmp_after="$(mktemp)"
    awk -v begin="$AGENTS_MARKER_BEGIN" -v end="$AGENTS_MARKER_END" \
        -v bf="$tmp_before" -v af="$tmp_after" '
      $0 == begin { state=1; next }
      state==1 && $0 == end { state=2; next }
      state==0 { print > bf }
      state==2 { print > af }
    ' "$dst"
    awk '{ lines[++n]=$0 } END { while (n>0 && lines[n]=="") n--; for (i=1;i<=n;i++) print lines[i] }' "$tmp_before" > "${tmp_before}.c"
    awk 'NF{p=1} p{lines[++n]=$0} END{while(n>0 && lines[n]=="")n--; for(i=1;i<=n;i++) print lines[i]}' "$tmp_after" > "${tmp_after}.c"
    : > "$out"
    if [ -s "${tmp_before}.c" ]; then cat "${tmp_before}.c" >> "$out"; printf '\n' >> "$out"; fi
    printf '%s\n\n' "$AGENTS_MARKER_BEGIN" >> "$out"
    cat "$src" >> "$out"
    printf '\n%s\n' "$AGENTS_MARKER_END" >> "$out"
    if [ -s "${tmp_after}.c" ]; then printf '\n' >> "$out"; cat "${tmp_after}.c" >> "$out"; fi
    rm -f "$tmp_before" "$tmp_after" "${tmp_before}.c" "${tmp_after}.c"
  elif cmp -s "$src" "$dst"; then
    printf '%s\n\n' "$AGENTS_MARKER_BEGIN" > "$out"
    cat "$src" >> "$out"
    printf '\n%s\n' "$AGENTS_MARKER_END" >> "$out"
  else
    local src_bytes suffix_tmp
    src_bytes="$(wc -c < "$src")"
    if cmp -s "$src" <(head -c "$src_bytes" "$dst"); then
      suffix_tmp="$(mktemp)"
      tail -c +"$((src_bytes + 1))" "$dst" \
        | awk 'NF{p=1} p{lines[++n]=$0} END{while(n>0 && lines[n]=="")n--; for(i=1;i<=n;i++) print lines[i]}' \
        > "$suffix_tmp"
      printf '%s\n\n' "$AGENTS_MARKER_BEGIN" > "$out"
      cat "$src" >> "$out"
      printf '\n%s\n' "$AGENTS_MARKER_END" >> "$out"
      if [ -s "$suffix_tmp" ]; then printf '\n' >> "$out"; cat "$suffix_tmp" >> "$out"; fi
      rm -f "$suffix_tmp"
    else
      cat "$dst" > "$out"
      printf '\n%s\n\n' "$AGENTS_MARKER_BEGIN" >> "$out"
      cat "$src" >> "$out"
      printf '\n%s\n' "$AGENTS_MARKER_END" >> "$out"
    fi
  fi
}

agents_merge_action() {
  local dst="$1"
  if grep -Fq "$AGENTS_MARKER_BEGIN" "$dst"; then
    printf 'Update shared AGENTS.md block in %s' "$dst"
  else
    printf 'Add shared AGENTS.md block into %s' "$dst"
  fi
}

confirm_agents_merge() {
  local prompt="$1" reply
  printf '%s' "$prompt"
  IFS= read -r reply || reply=""
  case "$reply" in
    y|Y|yes|YES)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

load_env_file() {
  local env_file="$1"
  if [ -f "$env_file" ]; then
    set -a
    # shellcheck source=/dev/null
    source "$env_file"
    set +a
  fi
}

# Load launcher defaults first so project-local .env can override them.
# devbox.json init_hook also does this for `devbox shell`; this covers `devbox run` and direct `bash scripts/opencode.sh`.
load_env_file "$REPO_ROOT/.env"

LOCAL_BIN="$REPO_ROOT/open-code/node_modules/.bin/opencode"
OPENCODE_BIN="$(command -v opencode 2>/dev/null || true)"
[ -x "$LOCAL_BIN" ] && OPENCODE_BIN="$LOCAL_BIN"

if [ -z "$OPENCODE_BIN" ]; then
  echo -e "${RED}✗ opencode not found.${RST}"
  echo "  Install locally: cd open-code && npm install opencode-ai"
  exit 1
fi

# ── 1. Parse args + resolve target folder ─────────────────────────────────
# First positional is the TARGET folder; any remaining args (flags or
# positionals) are forwarded verbatim to the opencode CLI as a subcommand.
# `--ollama` is a launcher-only flag (opencode has no such flag); pre-folder
# `--help`/`-h` shows launcher help, post-folder `--help` is forwarded so
# `opencode mcp auth --help` still works.
START_OLLAMA=0
TARGET=""
FORWARDED=()
while [ $# -gt 0 ]; do
  arg="$1"; shift
  case "$arg" in
    --ollama)
      START_OLLAMA=1
      ;;
    --help|-h)
      if [ -z "$TARGET" ]; then
        echo "Usage: opencode.sh [--ollama] TARGET [SUBCOMMAND...]"
        echo "  --ollama    Start Ollama + tool-call proxy if not running (TUI mode only)"
        echo "  TARGET      Working folder (required when passing a subcommand; use . for repo root)"
        echo "  SUBCOMMAND  Forwarded verbatim to opencode (e.g. 'mcp auth Telecontext', 'mcp list')"
        echo ""
        echo "Examples:"
        echo "  opencode.sh .                              launch TUI in repo root (full setup)"
        echo "  opencode.sh --ollama subdir                launch TUI in subdir, auto-start Ollama"
        echo "  opencode.sh . mcp auth Telecontext          authenticate against a configured MCP server"
        echo "  opencode.sh . mcp list                     list configured MCP servers"
        echo "  opencode.sh . mcp add Foo --url https://...  add a remote MCP server"
        exit 0
      fi
      FORWARDED+=("$arg")
      ;;
    *)
      if [ -z "$TARGET" ]; then
        TARGET="$arg"
      else
        FORWARDED+=("$arg")
      fi
      ;;
  esac
done
: "${TARGET:=$REPO_ROOT}"
if [[ "$TARGET" != /* ]]; then
  TARGET="$REPO_ROOT/$TARGET"
fi
TARGET="$(cd "$TARGET" && pwd)"

if [ ! -d "$TARGET" ]; then
  echo -e "${RED}✗ Folder not found: $TARGET${RST}"
  exit 1
fi

load_env_file "$TARGET/.env"

echo -e "${BLD}◈ OpenCode${RST}  →  ${CYN}${TARGET}${RST}"

# ── 1b. Subcommand mode: forward to opencode CLI as-is ───────────────────
# ponytail: When args follow the folder, forward them verbatim to the opencode
# CLI and exit before config-gen/AGENTS-merge. This lets `mcp auth <server>`
# read the target's existing opencode.json (which declares the server URL/type)
# instead of being clobbered by the launcher's template. `--ollama` is a
# launcher concern only; subcommands like `mcp auth` don't need the model
# server, so it's warned-and-ignored here. For `run` with an Ollama model,
# launch the TUI once to seed config + start Ollama. Revisit if a subcommand
# ever needs the launcher's generated providers block to exist first.
if [ ${#FORWARDED[@]} -gt 0 ]; then
  if [ "$START_OLLAMA" -eq 1 ]; then
    echo -e "${YEL}  --ollama ignored in subcommand mode${RST}"
  fi
  echo -e "${YEL}  Args  : ${FORWARDED[*]}${RST}"
  echo ""
  cd "$TARGET" && exec "$LOCAL_BIN" "${FORWARDED[@]}"
fi

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

TSYSTEMS_HEALTH='{}'
TSYSTEMS_HEALTH_AVAILABLE=0
if [ -n "${TSYSTEMS_OPENCODE_API_KEY:-}" ]; then
  if TSYSTEMS_HEALTH_FETCHED="$(fetch_tsystems_health 2>/dev/null)"; then
    TSYSTEMS_HEALTH="$TSYSTEMS_HEALTH_FETCHED"
    TSYSTEMS_HEALTH_AVAILABLE=1
  else
    echo -e "${YEL}  ! T-Systems health unavailable - continuing without model health${RST}"
  fi
fi

if TSYSTEMS_FETCHED="$(fetch_tsystems_models 2>/dev/null)"; then
  TSYSTEMS_MODELS="$(build_tsystems_models_json "$TSYSTEMS_FETCHED" "$TSYSTEMS_HEALTH")"
  echo -e "${GRN}✓ Synced T-Systems models from /models${RST}"
else
  if [ "$TSYSTEMS_HEALTH_AVAILABLE" -eq 1 ]; then
    TSYSTEMS_MODELS="$(build_embedded_tsystems_models_json "$TSYSTEMS_MODELS" "$TSYSTEMS_HEALTH")"
  fi
  echo -e "${YEL}  Using embedded T-Systems model catalog${RST}"
fi
if [ "$TSYSTEMS_HEALTH_AVAILABLE" -eq 1 ]; then
  TSYSTEMS_HEALTH_SUMMARY="$(summarize_tsystems_health "$TSYSTEMS_MODELS" "$TSYSTEMS_HEALTH")"
  echo -e "${GRN}✓ T-Systems health: $TSYSTEMS_HEALTH_SUMMARY${RST}"
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
  if [ -f "$CONFIG_DST" ]; then
    TMP_MERGED_CONFIG="$(mktemp)"
    merge_configs "$CONFIG_SRC" "$CONFIG_DST" "$TMP_MERGED_CONFIG"
    mv "$TMP_MERGED_CONFIG" "$CONFIG_DST"
    echo -e "${GRN}✓ Config merged into CWD${RST}  ($CONFIG_DST)"
  else
    cp "$CONFIG_SRC" "$CONFIG_DST"
    echo -e "${GRN}✓ Config copied to CWD${RST}  ($CONFIG_DST)"
  fi
fi

# ── 3. Propagate AGENTS.md to target (idempotent) ─────────────────────────
AGENTS_DST="$TARGET/AGENTS.md"
if [ ! -f "$AGENTS_DST" ]; then
  {
    printf '%s\n\n' "$AGENTS_MARKER_BEGIN"
    cat "$AGENTS_SRC"
    printf '\n%s\n' "$AGENTS_MARKER_END"
  } > "$AGENTS_DST"
  echo -e "${GRN}✓ AGENTS.md copied${RST}  → ${AGENTS_DST}"
else
  TMP_MERGED_AGENTS="$(mktemp)"
  build_merged_agents "$AGENTS_SRC" "$AGENTS_DST" "$TMP_MERGED_AGENTS"

  if cmp -s "$AGENTS_DST" "$TMP_MERGED_AGENTS"; then
    rm -f "$TMP_MERGED_AGENTS"
    echo -e "${GRN}✓ AGENTS.md unchanged${RST}  (no merge needed)"
  else
    AGENTS_ACTION="$(agents_merge_action "$AGENTS_DST")"
    echo -e "${YEL}  AGENTS.md merge preview:${RST}"
    diff -u "$AGENTS_DST" "$TMP_MERGED_AGENTS" || true
    echo ""

    if confirm_agents_merge "$AGENTS_ACTION? [y/N] "; then
      mv "$TMP_MERGED_AGENTS" "$AGENTS_DST"
      echo -e "${GRN}✓ AGENTS.md merged${RST}  (preserved local content, updated shared block)"
    else
      rm -f "$TMP_MERGED_AGENTS"
      echo -e "${YEL}  AGENTS.md merge skipped${RST}"
    fi
  fi
fi

# ── 4. Ensure Ollama + tool-call proxy are running (opt-in via --ollama) ────
# Both are managed by `npm run ollama:serve` (concurrently: ollama-serve.sh +
# ollama-tool-call-proxy.mjs). Started once, left running across sessions —
# killing/restarting on every launch would reload the model from disk every
# single time, which is its own multi-second-to-minute tax.
#
# ponytail: Ollama is optional because the operator may run a cloud-only model
# (T-Systems, Claude, Gemini). Default skips the probe/start entirely; pass
# --ollama to auto-start. On failure, warn and continue so opencode still
# launches with whatever model opencode.json declares.
#
# port_up: returns success if *anything* answers, even a 4xx. The proxy 404s
# on GET/non-chat-completions requests, so `curl -f` would wrongly read that
# as "down" — only a connection failure (curl's synthetic 000) counts as down.
port_up() {
  local url="$1" code
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 "$url" || echo 000)"
  [ "$code" != "000" ]
}

if [ "$START_OLLAMA" -ne 1 ]; then
  echo -e "${YEL}  Ollama: skipped (pass --ollama to auto-start)${RST}"
else
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
      echo -e "${YEL}  ! Ollama/proxy didn't come up within 30s — continuing anyway${RST}"
      echo -e "    Check: tail -f $REPO_ROOT/.ollama-serve.log"
    else
      echo -e "${GRN}✓ Ollama reachable${RST}"
      echo -e "${GRN}✓ Tool-call proxy reachable${RST}"
    fi
  else
    echo -e "${GRN}✓ Ollama reachable${RST}"
    echo -e "${GRN}✓ Tool-call proxy reachable${RST}"
  fi
fi

# ── 5. (Colibri intentionally omitted — not usable until 32 GB RAM) ───────

# ── 6. Launch ────────────────────────────────────────────────────────────
ACTUAL_MODEL="$(command -v jq >/dev/null 2>&1 && jq -r '.model // "unknown"' "$CONFIG_SRC" 2>/dev/null || echo "unknown")"
echo -e "${YEL}  Model : $ACTUAL_MODEL${RST}"
echo -e "${YEL}  Folder: $TARGET${RST}"
echo ""
cd "$TARGET" && exec "$LOCAL_BIN"
