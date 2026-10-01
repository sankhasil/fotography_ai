#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

TEST_REPO="$TMP_ROOT/repo"
mkdir -p "$TEST_REPO/scripts" "$TEST_REPO/open-code/node_modules/.bin" "$TEST_REPO/open-code"

cp "$ROOT/scripts/opencode.sh" "$TEST_REPO/scripts/opencode.sh"
chmod +x "$TEST_REPO/scripts/opencode.sh"

cat <<'EOF' > "$TEST_REPO/open-code/node_modules/.bin/opencode"
#!/usr/bin/env bash
set -euo pipefail
if [ -n "${PRINT_GITHUB_PAT:-}" ]; then
  printf '%s\n' "${GITHUB_PERSONAL_ACCESS_TOKEN:-}"
fi
exit 0
EOF
chmod +x "$TEST_REPO/open-code/node_modules/.bin/opencode"

cat <<'EOF' > "$TEST_REPO/open-code/AGENTS.md"
# test fixture
EOF

mkdir -p "$TMP_ROOT/bin"

cat <<'EOF' > "$TMP_ROOT/bin/npm"
#!/usr/bin/env bash
set -euo pipefail
exit 0
EOF
chmod +x "$TMP_ROOT/bin/npm"

cat <<'EOF' > "$TMP_ROOT/bin/curl"
#!/usr/bin/env bash
set -euo pipefail

if [ "${1:-}" = "-s" ] && [ "${2:-}" = "-o" ] && [ "${4:-}" = "-w" ]; then
  case "${8:-}" in
    http://localhost:11434/api/tags|http://localhost:4198/)
      printf '200'
      exit 0
      ;;
  esac
fi

case "${@: -1}" in
  https://llm-server.llmhub.t-systems.net/v2/models)
    if [ "${FAIL_MODELS:-}" = "1" ]; then
      exit 22
    fi
    cat "${MODEL_FIXTURE:?}"
    ;;
  https://uptime.llmhub.t-systems.net/api/status-page/health)
    if [ -n "${HEALTH_CALL_LOG:-}" ]; then
      printf '%s\n' "$*" >> "$HEALTH_CALL_LOG"
    fi
    if [ "${FAIL_HEALTH:-}" = "1" ]; then
      exit 22
    fi
    if [ "${MALFORMED_HEALTH:-}" = "1" ]; then
      printf '{}\n'
      exit 0
    fi
    cat "${STATUS_FIXTURE:?}"
    ;;
  https://uptime.llmhub.t-systems.net/api/status-page/heartbeat/health)
    if [ -n "${HEALTH_CALL_LOG:-}" ]; then
      printf '%s\n' "$*" >> "$HEALTH_CALL_LOG"
    fi
    if [ "${FAIL_HEALTH:-}" = "1" ]; then
      exit 22
    fi
    cat "${HEALTH_FIXTURE:?}"
    ;;
  *)
    echo "unexpected curl args: $*" >&2
    exit 1
    ;;
esac
EOF
chmod +x "$TMP_ROOT/bin/curl"

cat <<'EOF' > "$TMP_ROOT/models-one.json"
{
  "data": [
    {
      "id": "gpt-5.4",
      "meta_data": {
        "display_name": "GPT 5.4",
        "max_sequence_length": 400000,
        "max_output_length": 128000
      }
    },
    {
      "id": "gpt-oss-120b",
      "meta_data": {
        "display_name": "GPT OSS 120B",
        "max_sequence_length": 128000,
        "max_output_length": 32768
      }
    }
  ]
}
EOF

cat <<'EOF' > "$TMP_ROOT/models-two.json"
{
  "data": [
    {
      "id": "gpt-5.4",
      "meta_data": {
        "display_name": "GPT 5.4",
        "max_sequence_length": 400000,
        "max_output_length": 128000
      }
    },
    {
      "id": "gemini-3.1-pro",
      "meta_data": {
        "display_name": "Gemini 3.1 Pro",
        "max_sequence_length": 200000,
        "max_output_length": 65536
      }
    }
  ]
}
EOF

cat <<'EOF' > "$TMP_ROOT/status-page.json"
{
  "publicGroupList": [
    {
      "monitorList": [
        { "id": 113, "name": "GPT-5.4" },
        { "id": 106, "name": "gpt-oss-120b" },
        { "id": 120, "name": "Gemini 3.1 Pro" },
        { "id": 117, "name": "GPT 5.4" }
      ]
    }
  ]
}
EOF

cat <<'EOF' > "$TMP_ROOT/health.json"
{
  "heartbeatList": {
    "113": [{ "status": 0, "time": "2026-09-24 09:59:00.000", "ping": 90 }, { "status": 1, "time": "2026-09-24 10:00:00.000", "ping": 100 }],
    "106": [{ "status": 0, "time": "2026-09-24 10:00:00.000", "ping": null }],
    "120": [{ "status": 2, "time": "2026-09-24 10:00:00.000", "ping": 200 }],
    "117": [{ "status": 0, "time": "2026-09-24 10:00:00.000", "ping": 300 }]
  },
  "uptimeList": {
    "113_24": 0.965,
    "106_24": 0.5,
    "120_24": 0.9,
    "117_24": 0.4
  }
}
EOF

run_sync() {
  local fixture="$1"
  MODEL_FIXTURE="$fixture" STATUS_FIXTURE="$TMP_ROOT/status-page.json" HEALTH_FIXTURE="$TMP_ROOT/health.json" TSYSTEMS_OPENCODE_API_KEY="test-token" PATH="$TMP_ROOT/bin:$PATH" bash "$TEST_REPO/scripts/opencode.sh" "$TEST_REPO" >/dev/null
}

run_sync_capture() {
  local fixture="$1"
  MODEL_FIXTURE="$fixture" STATUS_FIXTURE="$TMP_ROOT/status-page.json" HEALTH_FIXTURE="$TMP_ROOT/health.json" TSYSTEMS_OPENCODE_API_KEY="test-token" PATH="$TMP_ROOT/bin:$PATH" bash "$TEST_REPO/scripts/opencode.sh" "$TEST_REPO"
}

run_sync_target() {
  local fixture="$1"
  local target="$2"
  MODEL_FIXTURE="$fixture" STATUS_FIXTURE="$TMP_ROOT/status-page.json" HEALTH_FIXTURE="$TMP_ROOT/health.json" TSYSTEMS_OPENCODE_API_KEY="test-token" PATH="$TMP_ROOT/bin:$PATH" bash "$TEST_REPO/scripts/opencode.sh" "$target" >/dev/null
}

run_sync_target_capture() {
  local fixture="$1"
  local target="$2"
  MODEL_FIXTURE="$fixture" STATUS_FIXTURE="$TMP_ROOT/status-page.json" HEALTH_FIXTURE="$TMP_ROOT/health.json" TSYSTEMS_OPENCODE_API_KEY="test-token" PATH="$TMP_ROOT/bin:$PATH" bash "$TEST_REPO/scripts/opencode.sh" "$target"
}

run_sync_target_capture_with_input() {
  local fixture="$1"
  local target="$2"
  local input="$3"
  printf '%s' "$input" | MODEL_FIXTURE="$fixture" STATUS_FIXTURE="$TMP_ROOT/status-page.json" HEALTH_FIXTURE="$TMP_ROOT/health.json" TSYSTEMS_OPENCODE_API_KEY="test-token" PATH="$TMP_ROOT/bin:$PATH" bash "$TEST_REPO/scripts/opencode.sh" "$target"
}

assert_eq() {
  local expected="$1"
  local actual="$2"
  local message="$3"
  if [ "$expected" != "$actual" ]; then
    echo "assertion failed: $message" >&2
    echo "expected: $expected" >&2
    echo "actual:   $actual" >&2
    exit 1
  fi
}

assert_contains() {
  local output="$1"
  local expected="$2"
  local message="$3"
  if ! printf '%s\n' "$output" | grep -Fq "$expected"; then
    echo "assertion failed: $message" >&2
    echo "expected substring: $expected" >&2
    exit 1
  fi
}

assert_not_contains() {
  local output="$1"
  local unexpected="$2"
  local message="$3"
  if printf '%s\n' "$output" | grep -Fq "$unexpected"; then
    echo "assertion failed: $message" >&2
    echo "unexpected substring: $unexpected" >&2
    exit 1
  fi
}

run_sync "$TMP_ROOT/models-one.json"

CONFIG="$TEST_REPO/opencode.json"

assert_eq 'GPT 5.4 (High cost, Euro2.42/Euro14.49) [health: UP, 24h 97%]' "$(jq -r '.provider.tsystems.models["gpt-5.4"].name' "$CONFIG")" 'gpt-5.4 should include pricing and health'
assert_eq '400000' "$(jq -r '.provider.tsystems.models["gpt-5.4"].limit.context' "$CONFIG")" 'gpt-5.4 context should come from /models'
assert_eq 'GPT OSS 120B (Euro0.20/Euro0.65) [health: DOWN, 24h 50%]' "$(jq -r '.provider.tsystems.models["gpt-oss-120b"].name' "$CONFIG")" 'gpt-oss-120b should include pricing and health'
HEALTH_OUTPUT="$(run_sync_capture "$TMP_ROOT/models-one.json")"
assert_contains "$HEALTH_OUTPUT" 'T-Systems health: 1 up / 1 down / 0 other' 'launcher should summarize configured T-Systems models'

before_checksum="$(shasum -a 256 "$CONFIG" | cut -d ' ' -f 1)"
run_sync "$TMP_ROOT/models-one.json"
after_checksum="$(shasum -a 256 "$CONFIG" | cut -d ' ' -f 1)"
assert_eq "$before_checksum" "$after_checksum" 'config should be unchanged when /models result is unchanged'

run_sync "$TMP_ROOT/models-two.json"
assert_eq 'null' "$(jq -r '.provider.tsystems.models["gpt-oss-120b"] // "null"' "$CONFIG")" 'removed models should disappear after delta update'
assert_eq 'Gemini 3.1 Pro (High cost, Euro3.60/Euro16.20) [health: PENDING, 24h 90%]' "$(jq -r '.provider.tsystems.models["gemini-3.1-pro"].name' "$CONFIG")" 'new models should include pricing and health'

NO_TOKEN_TARGET="$TMP_ROOT/no-token-target"
NO_TOKEN_HEALTH_CALL_LOG="$TMP_ROOT/no-token-health-calls.log"
mkdir -p "$NO_TOKEN_TARGET"
NO_TOKEN_OUTPUT="$(env -u TSYSTEMS_OPENCODE_API_KEY HEALTH_CALL_LOG="$NO_TOKEN_HEALTH_CALL_LOG" MODEL_FIXTURE="$TMP_ROOT/models-one.json" PATH="$TMP_ROOT/bin:$PATH" bash "$TEST_REPO/scripts/opencode.sh" "$NO_TOKEN_TARGET")"
if [ -s "$NO_TOKEN_HEALTH_CALL_LOG" ]; then
  echo "assertion failed: health endpoints should not be called without a T-Systems token" >&2
  exit 1
fi
assert_not_contains "$NO_TOKEN_OUTPUT" 'T-Systems health' 'health summary should be hidden without a T-Systems token'
assert_not_contains "$(jq -r '.provider.tsystems.models[].name' "$NO_TOKEN_TARGET/opencode.json")" '[health:' 'model health labels should be hidden without a T-Systems token'

FAILED_HEALTH_TARGET="$TMP_ROOT/failed-health-target"
mkdir -p "$FAILED_HEALTH_TARGET"
FAILED_HEALTH_OUTPUT="$(MODEL_FIXTURE="$TMP_ROOT/models-one.json" STATUS_FIXTURE="$TMP_ROOT/status-page.json" HEALTH_FIXTURE="$TMP_ROOT/health.json" FAIL_HEALTH=1 TSYSTEMS_OPENCODE_API_KEY="test-token" PATH="$TMP_ROOT/bin:$PATH" bash "$TEST_REPO/scripts/opencode.sh" "$FAILED_HEALTH_TARGET")"
assert_contains "$FAILED_HEALTH_OUTPUT" 'T-Systems health unavailable' 'health failure should warn'
assert_contains "$FAILED_HEALTH_OUTPUT" 'Synced T-Systems models from /models' 'health failure should not block model sync'
assert_eq 'GPT 5.4 (High cost, Euro2.42/Euro14.49)' "$(jq -r '.provider.tsystems.models["gpt-5.4"].name' "$FAILED_HEALTH_TARGET/opencode.json")" 'health failure should preserve model names without labels'

MALFORMED_HEALTH_TARGET="$TMP_ROOT/malformed-health-target"
mkdir -p "$MALFORMED_HEALTH_TARGET"
MALFORMED_HEALTH_OUTPUT="$(MODEL_FIXTURE="$TMP_ROOT/models-one.json" STATUS_FIXTURE="$TMP_ROOT/status-page.json" HEALTH_FIXTURE="$TMP_ROOT/health.json" MALFORMED_HEALTH=1 TSYSTEMS_OPENCODE_API_KEY="test-token" PATH="$TMP_ROOT/bin:$PATH" bash "$TEST_REPO/scripts/opencode.sh" "$MALFORMED_HEALTH_TARGET")"
assert_contains "$MALFORMED_HEALTH_OUTPUT" 'T-Systems health unavailable' 'malformed health data should warn'
assert_eq 'GPT 5.4 (High cost, Euro2.42/Euro14.49)' "$(jq -r '.provider.tsystems.models["gpt-5.4"].name' "$MALFORMED_HEALTH_TARGET/opencode.json")" 'malformed health data should preserve model names without labels'

FALLBACK_MODELS_TARGET="$TMP_ROOT/fallback-models-target"
mkdir -p "$FALLBACK_MODELS_TARGET"
FALLBACK_MODELS_OUTPUT="$(MODEL_FIXTURE="$TMP_ROOT/models-one.json" STATUS_FIXTURE="$TMP_ROOT/status-page.json" HEALTH_FIXTURE="$TMP_ROOT/health.json" FAIL_MODELS=1 TSYSTEMS_OPENCODE_API_KEY="test-token" PATH="$TMP_ROOT/bin:$PATH" bash "$TEST_REPO/scripts/opencode.sh" "$FALLBACK_MODELS_TARGET")"
assert_contains "$FALLBACK_MODELS_OUTPUT" 'T-Systems health:' 'valid health should annotate the embedded model catalog'
assert_eq 'GPT OSS 120B (Euro0.20/Euro0.65) [health: DOWN, 24h 50%]' "$(jq -r '.provider.tsystems.models["gpt-oss-120b"].name' "$FALLBACK_MODELS_TARGET/opencode.json")" 'embedded models should include health when catalog sync fails'

PROJECT_DIR="$TEST_REPO/project"
mkdir -p "$PROJECT_DIR"

cat <<'EOF' > "$PROJECT_DIR/opencode.json"
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "github": {
      "type": "remote",
      "url": "https://example.com/github-mcp",
      "enabled": true
    }
  },
  "provider": {
    "tsystems": {
      "models": {
        "gpt-5.4": {
          "name": "Custom GPT 5.4"
        }
      }
    }
  },
  "skills": {
    "paths": [
      "/custom/skills"
    ]
  },
  "plugin": [
    "custom-plugin"
  ]
}
EOF

run_sync_target "$TMP_ROOT/models-one.json" "$PROJECT_DIR"

PROJECT_CONFIG="$PROJECT_DIR/opencode.json"
assert_eq 'https://example.com/github-mcp' "$(jq -r '.mcp.github.url' "$PROJECT_CONFIG")" 'existing target github MCP should be preserved'
assert_eq 'true' "$(jq -r '.mcp.jira.enabled' "$PROJECT_CONFIG")" 'launcher jira MCP should be merged into existing target config'
assert_eq '/custom/skills' "$(jq -r '.skills.paths[]' "$PROJECT_CONFIG" | grep '^/custom/skills$')" 'existing target skill paths should be preserved'
assert_eq 'custom-plugin' "$(jq -r '.plugin[]' "$PROJECT_CONFIG" | grep '^custom-plugin$')" 'existing target plugins should be preserved'
assert_eq 'GPT 5.4 (High cost, Euro2.42/Euro14.49) [health: UP, 24h 97%]' "$(jq -r '.provider.tsystems.models["gpt-5.4"].name' "$PROJECT_CONFIG")" 'managed T-Systems model names should refresh in target configs'

cat <<'EOF' > "$PROJECT_DIR/.env"
GITHUB_PERSONAL_ACCESS_TOKEN=target-folder-token
EOF

cat <<'EOF' > "$PROJECT_DIR/opencode.json"
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "github": {
      "type": "remote",
      "url": "https://api.githubcopilot.com/mcp/",
      "enabled": true,
      "headers": {
        "Authorization": "Bearer {env:GITHUB_PERSONAL_ACCESS_TOKEN}"
      }
    }
  }
}
EOF

OUTPUT="$(PRINT_GITHUB_PAT=1 run_sync_target_capture "$TMP_ROOT/models-one.json" "$PROJECT_DIR")"
assert_eq 'target-folder-token' "$(printf '%s\n' "$OUTPUT" | tail -n 1)" 'target folder .env should be loaded so github token placeholder can resolve from current folder'

AGENTS_PROJECT_DIR="$TEST_REPO/project-agents"
mkdir -p "$AGENTS_PROJECT_DIR"

cat <<'EOF' > "$AGENTS_PROJECT_DIR/AGENTS.md"
# local instructions

Keep this local note.
EOF

OUTPUT_AGENTS_SKIP="$(run_sync_target_capture_with_input "$TMP_ROOT/models-one.json" "$AGENTS_PROJECT_DIR" 'n
')"

assert_eq 'Keep this local note.' "$(grep '^Keep this local note\.$' "$AGENTS_PROJECT_DIR/AGENTS.md")" 'declining AGENTS.md merge should keep existing file unchanged'
assert_eq '0' "$(grep -c '^<!-- BEGIN OPENCODE SHARED AGENTS -->$' "$AGENTS_PROJECT_DIR/AGENTS.md" || true)" 'declining AGENTS.md merge should not add shared block'
assert_eq '1' "$(printf '%s\n' "$OUTPUT_AGENTS_SKIP" | grep -c '^--- ' )" 'AGENTS.md merge should show a diff before confirmation'
assert_eq '1' "$(printf '%s\n' "$OUTPUT_AGENTS_SKIP" | grep -c "Add shared AGENTS.md block into $AGENTS_PROJECT_DIR/AGENTS.md")" 'AGENTS.md prompt should mention target path and add action'

run_sync_target_capture_with_input "$TMP_ROOT/models-one.json" "$AGENTS_PROJECT_DIR" 'y
' >/dev/null

MERGED_AGENTS="$AGENTS_PROJECT_DIR/AGENTS.md"

assert_eq 'Keep this local note.' "$(grep '^Keep this local note\.$' "$MERGED_AGENTS")" 'existing AGENTS.md content should be preserved during merge'
assert_eq '<!-- BEGIN OPENCODE SHARED AGENTS -->' "$(grep '^<!-- BEGIN OPENCODE SHARED AGENTS -->$' "$MERGED_AGENTS")" 'merged AGENTS.md should include begin marker'
assert_eq '<!-- END OPENCODE SHARED AGENTS -->' "$(grep '^<!-- END OPENCODE SHARED AGENTS -->$' "$MERGED_AGENTS")" 'merged AGENTS.md should include end marker'

shared_count_before="$(grep -c '^<!-- BEGIN OPENCODE SHARED AGENTS -->$' "$MERGED_AGENTS")"
run_sync_target_capture_with_input "$TMP_ROOT/models-one.json" "$AGENTS_PROJECT_DIR" 'y
' >/dev/null
shared_count_after="$(grep -c '^<!-- BEGIN OPENCODE SHARED AGENTS -->$' "$MERGED_AGENTS")"
assert_eq "$shared_count_before" "$shared_count_after" 'AGENTS.md merge should be idempotent and not append duplicate shared blocks'

cat <<'EOF' > "$TEST_REPO/open-code/AGENTS.md"
# updated fixture
EOF

OUTPUT_AGENTS_UPDATE="$(run_sync_target_capture_with_input "$TMP_ROOT/models-one.json" "$AGENTS_PROJECT_DIR" 'y
')"

assert_eq '# updated fixture' "$(grep '^# updated fixture$' "$MERGED_AGENTS")" 'AGENTS.md merge should refresh the managed shared block when the source changes'
assert_eq '0' "$(grep -c '^# test fixture$' "$MERGED_AGENTS" || true)" 'AGENTS.md merge should replace the old shared block content when the source changes'
assert_eq '1' "$(printf '%s\n' "$OUTPUT_AGENTS_UPDATE" | grep -c "Update shared AGENTS.md block in $AGENTS_PROJECT_DIR/AGENTS.md")" 'AGENTS.md prompt should mention target path and update action'
