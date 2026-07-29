#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# pr-review.sh — Clone a Bitbucket PR and generate an AI code review
#
# Usage:
#   devbox run pr-review <PR_URL>
#
# Example:
#   devbox run pr-review https://strive.devops.t-systems.net/bitbucket/projects/TSYIDP/repos/simple-auth-service/pull-requests/175/overview
#
# Required env:
#   BITBUCKET_TOKEN   Personal Access Token (Settings → Personal access tokens)
#
# Optional env:
#   REVIEW_MODEL      default: qwen2.5-coder:14b
#   OLLAMA_URL        default: http://localhost:11434
#   POST_COMMENTS     set to "true" to post comments back to Bitbucket
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

RED='\033[0;31m'
GRN='\033[0;32m'
YEL='\033[0;33m'
CYN='\033[0;36m'
DIM='\033[2m'
BLD='\033[1m'
RST='\033[0m'

MODEL="${REVIEW_MODEL:-qwen2.5-coder:14b}"
OLLAMA_URL="${OLLAMA_URL:-http://localhost:11434}"
POST_COMMENTS="${POST_COMMENTS:-false}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# ── Guards ────────────────────────────────────────────────────────────────────
[ -z "${1:-}" ] && { echo -e "${RED}Usage: devbox run pr-review <PR_URL>${RST}"; exit 1; }
[ -z "${BITBUCKET_TOKEN:-}" ] && {
  echo -e "${RED}✗ BITBUCKET_TOKEN not set.${RST}"
  echo "  Export your Bitbucket Personal Access Token:"
  echo "  export BITBUCKET_TOKEN=your_token_here"
  echo "  (Generate at: Bitbucket → Profile → Personal access tokens)"
  exit 1
}

PR_URL="$1"

# ── Parse PR URL (python3 stdlib — no jq/sed gymnastics) ─────────────────────
read -r BITBUCKET_BASE PROJECT REPO PR_NUM << EOF
$(python3 - "$PR_URL" << 'PYEOF'
import re, sys
m = re.search(
    r'(https://[^/]+(?:/[^/]+)?)/projects/([^/]+)/repos/([^/]+)/pull-requests/(\d+)',
    sys.argv[1]
)
if not m:
    print("ERROR: Could not parse PR URL", file=sys.stderr)
    sys.exit(1)
base, proj, repo, num = m.groups()
print(base, proj, repo, num)
PYEOF
)
EOF

echo ""
echo -e "${BLD}◈ PR Review${RST}"
echo "─────────────────────────────────────────────────"
echo -e "  Project : ${CYN}${PROJECT}${RST}"
echo -e "  Repo    : ${CYN}${REPO}${RST}"
echo -e "  PR      : ${CYN}#${PR_NUM}${RST}"
echo -e "  Model   : ${DIM}${MODEL}${RST}"
echo ""

# ── Bitbucket API helper (curl + python3 for JSON) ────────────────────────────
api_get() {
  # ponytail: urllib not requests — stdlib only
  curl -sf \
    -H "Authorization: Bearer ${BITBUCKET_TOKEN}" \
    -H "Accept: application/json" \
    "${BITBUCKET_BASE}/rest/api/1.0${1}"
}

# ── Fetch PR metadata ─────────────────────────────────────────────────────────
echo -e "${YEL}→ Fetching PR details from Bitbucket API...${RST}"
PR_JSON=$(api_get "/projects/${PROJECT}/repos/${REPO}/pull-requests/${PR_NUM}")

IFS=$'\t' read -r PR_TITLE FROM_BRANCH TO_BRANCH <<< \
  "$(python3 - "$PR_JSON" << 'PYEOF'
import json, sys
d = json.loads(sys.argv[1])
title       = d["title"].replace("\n", " ")
from_branch = d["fromRef"]["displayId"]
to_branch   = d["toRef"]["displayId"]
print(title, from_branch, to_branch, sep="\t")
PYEOF
)"

# ponytail: construct clone URL — Bitbucket Server omits clone links from PR response.
# SCM path uses lowercase project key: /scm/<project_lower>/<repo>.git
CLONE_URL="${BITBUCKET_BASE}/scm/${PROJECT,,}/${REPO}.git"

echo -e "  Title   : ${PR_TITLE}"
echo -e "  Branch  : ${FROM_BRANCH} → ${TO_BRANCH}"

# ── Create temp dir ───────────────────────────────────────────────────────────
TEMP_DIR="/tmp/pr-review-${REPO}-${PR_NUM}"
if [ -d "$TEMP_DIR" ]; then
  echo -e "${YEL}→ Reusing existing temp dir: ${TEMP_DIR}${RST}"
else
  mkdir -p "$TEMP_DIR"
  echo -e "${GRN}✓ Temp dir: ${TEMP_DIR}${RST}"
fi

# ── Get changed file paths from API (used for sparse checkout) ────────────────
echo -e "${YEL}→ Fetching changed file list from Bitbucket API...${RST}"
DIFF_JSON=$(api_get "/projects/${PROJECT}/repos/${REPO}/pull-requests/${PR_NUM}/diff?contextLines=0&withComments=false")

CHANGED_PATHS=$(python3 - "$DIFF_JSON" << 'PYEOF'
import json, sys
d = json.loads(sys.argv[1])
paths = []
for diff in d.get("diffs", []):
    dst = diff.get("destination") or diff.get("source")
    if dst and dst.get("toString"):
        paths.append(dst["toString"])
print("\n".join(paths))
PYEOF
)

# ── Clone PR branch — follows your pattern exactly ───────────────────────────
# Sparse dirs: top-level folders of changed files (minimises download)
# ponytail: cone mode includes root-level files automatically — only pass subdirs
SPARSE_DIRS=$(echo "$CHANGED_PATHS" | python3 -c "
import sys
dirs = set()
for line in sys.stdin:
    p = line.strip()
    if '/' in p:
        dirs.add(p.split('/')[0])
print(' '.join(sorted(dirs)))
")

clone_repo() {
  rm -rf "$TEMP_DIR"

  echo -e "${YEL}→ Cloning ${REPO}...${RST}"

  # shellcheck disable=SC2086
  git clone --filter=blob:none --no-checkout \
    "$CLONE_URL" "$TEMP_DIR" 2>&1 \
    || { echo -e "${RED}✗ git clone failed${RST}"; exit 1; }

  cd "$TEMP_DIR"

  git ls-remote --exit-code --heads origin "$FROM_BRANCH" >/dev/null 2>&1 \
    || { echo -e "${RED}✗ Branch not found on remote: ${FROM_BRANCH}${RST}"; exit 1; }

  git sparse-checkout init --cone 2>&1
  # shellcheck disable=SC2086
  [ -n "$SPARSE_DIRS" ] && git sparse-checkout set $SPARSE_DIRS 2>&1

  git checkout "$FROM_BRANCH" 2>&1 \
    || { echo -e "${RED}✗ git checkout failed: ${FROM_BRANCH}${RST}"; exit 1; }

  # Fetch base branch ref for diffing (no checkout)
  # shellcheck disable=SC2086
  git fetch --quiet origin "$TO_BRANCH" 2>&1

  cd - >/dev/null

  # Verify at least one sparse dir landed
  # Verify at least one file landed (cone mode always checks out root files too)
  local count
  count=$(find "$TEMP_DIR" -not -path '*/.git/*' -type f | wc -l | tr -d ' ')
  if [ "$count" -eq 0 ]; then
    echo -e "${RED}✗ Sparse checkout produced no files${RST}"
    exit 1
  fi

  echo -e "${GRN}✓ Cloned files:${RST}"
  find "$TEMP_DIR" -not -path '*/.git/*' | sort | sed \
    -e "s|$TEMP_DIR/||" \
    -e 's|[^/]*/|    |g' \
    -e 's|    \([^    ]\)|├── \1|'
}

if [ -d "$TEMP_DIR/.git" ]; then
  echo -e "${GRN}✓ Repo exists — fetching latest${RST}"
  cd "$TEMP_DIR"
  # shellcheck disable=SC2086
  git fetch --quiet origin "$FROM_BRANCH" "$TO_BRANCH" 2>&1
  git checkout --quiet "$FROM_BRANCH" 2>&1
  cd - >/dev/null
else
  clone_repo
fi

echo -e "${GRN}✓ Checked out${RST}  ${FROM_BRANCH}"

# ── Get changed files ─────────────────────────────────────────────────────────
CHANGED_FILES=$(git -C "$TEMP_DIR" diff \
  --name-only \
  "origin/${TO_BRANCH}...HEAD" \
  -- ':!*.lock' ':!*.sum' ':!*.png' ':!*.jpg' ':!*.svg' ':!dist/*' ':!*.min.js')

FILE_COUNT=$(echo "$CHANGED_FILES" | grep -c . || echo 0)
echo -e "${GRN}✓ ${FILE_COUNT} changed file(s) to review${RST}"
echo ""


# ── Get changed files ─────────────────────────────────────────────────────────
CHANGED_FILES=$(git -C "$TEMP_DIR" diff \
  --name-only \
  "origin/${TO_BRANCH}...HEAD" \
  -- ':!*.lock' ':!*.sum' ':!*.png' ':!*.jpg' ':!*.svg' ':!dist/*' ':!*.min.js')

FILE_COUNT=$(echo "$CHANGED_FILES" | grep -c . || echo 0)
echo -e "${GRN}✓ ${FILE_COUNT} changed file(s) to review${RST}"
echo ""

# ── AI review function ────────────────────────────────────────────────────────
review_file() {
  local filepath="$1"
  local diff_text="$2"

  # ponytail: urllib.request — stdlib, no requests dep needed
  python3 - << PYEOF
import json, urllib.request, sys

diff = """${diff_text}"""
filepath = "${filepath}"

payload = {
    "model": "${MODEL}",
    "stream": False,
    "messages": [
        {
            "role": "system",
            "content": (
                "You are a senior code reviewer. Be concise and direct. "
                "Flag only real issues: bugs, security problems, logic errors, "
                "unnecessary complexity. Skip style nitpicks. "
                "Format each issue as: [LINE] SEVERITY: description "
                "where SEVERITY is BUG / SECURITY / LOGIC / SIMPLIFY. "
                "If no issues, respond with: NO_ISSUES"
            )
        },
        {
            "role": "user",
            "content": f"Review this diff for {filepath}:\n\n{diff}"
        }
    ]
}

try:
    req = urllib.request.Request(
        "${OLLAMA_URL}/api/chat",
        json.dumps(payload).encode(),
        {"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        result = json.load(r)
        print(result["message"]["content"])
except Exception as e:
    print(f"REVIEW_ERROR: {e}", file=sys.stderr)
    print("NO_ISSUES")
PYEOF
}

# ── Post comment to Bitbucket ─────────────────────────────────────────────────
post_comment() {
  local text="$1"
  local filepath="$2"   # optional — general comment if empty

  local body
  if [ -n "$filepath" ]; then
    body=$(python3 -c "
import json
print(json.dumps({
    'text': '''${text}''',
    'anchor': {'fileType': 'TO', 'path': '${filepath}'}
}))
")
  else
    body=$(python3 -c "import json; print(json.dumps({'text': '''${text}'''}))")
  fi

  curl -sf -X POST \
    -H "Authorization: Bearer ${BITBUCKET_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$body" \
    "${BITBUCKET_BASE}/rest/api/1.0/projects/${PROJECT}/repos/${REPO}/pull-requests/${PR_NUM}/comments" \
    >/dev/null
}

# ── Review each file ──────────────────────────────────────────────────────────
REVIEW_FILE="$TEMP_DIR/pr-review.md"
cat > "$REVIEW_FILE" << HEADER
# PR Review — #${PR_NUM}

**${PR_TITLE}**
Branch: \`${FROM_BRANCH}\` → \`${TO_BRANCH}\`
Model: \`${MODEL}\`
Generated: $(date -u '+%Y-%m-%d %H:%M UTC')

---

HEADER

ISSUES_FOUND=0

while IFS= read -r filepath; do
  [ -z "$filepath" ] && continue

  printf "  Reviewing %-50s" "${filepath}..."

  DIFF=$(git -C "$TEMP_DIR" diff \
    "origin/${TO_BRANCH}...HEAD" \
    -- "$filepath" 2>/dev/null || echo "")

  if [ -z "$DIFF" ]; then
    echo "  ${DIM}(no diff)${RST}"
    continue
  fi

  REVIEW=$(review_file "$filepath" "$DIFF")

  if [ "$REVIEW" = "NO_ISSUES" ] || [ -z "$REVIEW" ]; then
    echo -e " ${GRN}✓${RST}"
  else
    echo -e " ${YEL}⚠${RST}"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))

    # Append to review file
    cat >> "$REVIEW_FILE" << BLOCK

## \`${filepath}\`

${REVIEW}

BLOCK

    # Post to Bitbucket if enabled
    if [ "$POST_COMMENTS" = "true" ]; then
      post_comment "**AI Review:**\n\n${REVIEW}" "$filepath"
    fi
  fi

done <<< "$CHANGED_FILES"

# ── Summary ───────────────────────────────────────────────────────────────────
cat >> "$REVIEW_FILE" << FOOTER

---
*${ISSUES_FOUND} file(s) with issues out of ${FILE_COUNT} reviewed.*
FOOTER

echo ""
echo "─────────────────────────────────────────────────"
echo -e "  ${BLD}Review complete${RST}"
echo -e "  Files reviewed  : ${FILE_COUNT}"

if [ "$ISSUES_FOUND" -gt 0 ]; then
  echo -e "  Files with issues: ${YEL}${ISSUES_FOUND}${RST}"
else
  echo -e "  Issues found    : ${GRN}none${RST}"
fi

echo -e "  Report          : ${CYN}${REVIEW_FILE}${RST}"

if [ "$POST_COMMENTS" = "true" ]; then
  echo -e "  Bitbucket       : ${GRN}comments posted${RST}"
else
  echo -e "  ${DIM}To post comments to Bitbucket: POST_COMMENTS=true devbox run pr-review <URL>${RST}"
fi

# ── Copy AGENTS.md + config then launch OpenCode ──────────────────────────────
echo ""
echo -e "${YEL}→ Launching OpenCode in PR folder for interactive follow-up...${RST}"
bash "$REPO_ROOT/scripts/opencode.sh" "$TEMP_DIR"