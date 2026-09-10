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
    cat "${MODEL_FIXTURE:?}"
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

run_sync() {
  local fixture="$1"
  MODEL_FIXTURE="$fixture" TSYSTEMS_OPENCODE_API_KEY="test-token" PATH="$TMP_ROOT/bin:$PATH" bash "$TEST_REPO/scripts/opencode.sh" "$TEST_REPO" >/dev/null
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

run_sync "$TMP_ROOT/models-one.json"

CONFIG="$TEST_REPO/opencode.json"

assert_eq 'GPT 5.4 (High cost, Euro2.42/Euro14.49)' "$(jq -r '.provider.tsystems.models["gpt-5.4"].name' "$CONFIG")" 'gpt-5.4 should include pricing warning'
assert_eq '400000' "$(jq -r '.provider.tsystems.models["gpt-5.4"].limit.context' "$CONFIG")" 'gpt-5.4 context should come from /models'
assert_eq 'GPT OSS 120B (Euro0.20/Euro0.65)' "$(jq -r '.provider.tsystems.models["gpt-oss-120b"].name' "$CONFIG")" 'gpt-oss-120b should include pricing metadata'

before_checksum="$(shasum -a 256 "$CONFIG" | cut -d ' ' -f 1)"
run_sync "$TMP_ROOT/models-one.json"
after_checksum="$(shasum -a 256 "$CONFIG" | cut -d ' ' -f 1)"
assert_eq "$before_checksum" "$after_checksum" 'config should be unchanged when /models result is unchanged'

run_sync "$TMP_ROOT/models-two.json"
assert_eq 'null' "$(jq -r '.provider.tsystems.models["gpt-oss-120b"] // "null"' "$CONFIG")" 'removed models should disappear after delta update'
assert_eq 'Gemini 3.1 Pro (High cost, Euro3.60/Euro16.20)' "$(jq -r '.provider.tsystems.models["gemini-3.1-pro"].name' "$CONFIG")" 'new models should be added with pricing metadata'
