#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# DupeScope Entrypoint
# ─────────────────────────────────────────────────────────────────────────────
# Commands:
#   scan              — detect duplicates + AI culling, write report JSON
#   archive           — process an existing report JSON, move files to _ARCHIVED/
#   scan-and-archive  — scan then immediately archive (no manual step)
#   help / --help     — show this message
#
# Environment variables:
#   PHOTOS_DIR    path inside container where host folder is mounted (default /data)
#   OLLAMA_URL    Ollama server URL for AI culling (default http://host.docker.internal:11434)
#   MODE          exact | perceptual | both  (default both)
#   THRESHOLD     pHash distance 0-64        (default 10)
#   DRY_RUN       true | false               (default false, archive step only)
#   NO_RECURSIVE  true | false               (default false)
#   AI_CULL       true | false               (default false)
#   OUTPUT        report output filename      (default dupescope_report.json)
# ─────────────────────────────────────────────────────────────────────────────
set -e

COMMAND="${1:-help}"

# ── Defaults from environment (all overridable at runtime) ────
PHOTOS_DIR="${PHOTOS_DIR:-/data}"
MODE="${MODE:-both}"
THRESHOLD="${THRESHOLD:-10}"
DRY_RUN="${DRY_RUN:-false}"
AI_CULL="${AI_CULL:-false}"
OUTPUT="${OUTPUT:-dupescope_report.json}"
NO_RECURSIVE="${NO_RECURSIVE:-false}"

# ── Print header ──────────────────────────────────────────────
echo ""
echo "  ◈ DupeScope"
echo "  ─────────────────────────────────────────"
echo "  Photos dir : $PHOTOS_DIR"
echo "  Ollama URL : $OLLAMA_URL"
echo "  Mode       : $MODE"
echo "  Threshold  : $THRESHOLD"
echo "  AI culling : $AI_CULL"
echo "  Dry run    : $DRY_RUN"
echo "  ─────────────────────────────────────────"
echo ""

# ── Validate photos dir ───────────────────────────────────────
if [[ "$COMMAND" != "help" && "$COMMAND" != "--help" ]]; then
    if [[ ! -d "$PHOTOS_DIR" ]]; then
        echo "  [ERROR] Photos directory not found: $PHOTOS_DIR"
        echo "  Mount your photos folder with: -v /your/photos:/data"
        exit 1
    fi
fi

# ── Build python args ─────────────────────────────────────────
SCAN_ARGS=("$PHOTOS_DIR" "--mode" "$MODE" "--threshold" "$THRESHOLD" "--output" "/data/$OUTPUT")

if [[ "$NO_RECURSIVE" == "true" ]]; then
    SCAN_ARGS+=("--no-recursive")
fi

# ─────────────────────────────────────────────────────────────
# COMMANDS
# ─────────────────────────────────────────────────────────────

case "$COMMAND" in

# ── scan ──────────────────────────────────────────────────────
  scan)
    echo "  [1/1] Running duplicate scan…"
    echo ""
    python /app/dupescope.py "${SCAN_ARGS[@]}"
    echo ""
    echo "  ✓ Report written to $PHOTOS_DIR/$OUTPUT"
    ;;

# ── archive ───────────────────────────────────────────────────
  archive)
    REPORT_PATH="/data/$OUTPUT"
    if [[ ! -f "$REPORT_PATH" ]]; then
        echo "  [ERROR] Report not found: $REPORT_PATH"
        echo "  Run 'scan' first, or set OUTPUT to match your report filename."
        exit 1
    fi

    DRY_FLAG=""
    if [[ "$DRY_RUN" == "true" ]]; then
        DRY_FLAG="--dry-run"
        echo "  [DRY RUN] No files will be moved."
    fi

    echo "  [1/1] Archiving files from report: $REPORT_PATH"
    echo ""
    python /app/archive.py "$PHOTOS_DIR" $DRY_FLAG
    echo ""
    echo "  ✓ Archive complete. Files moved to _ARCHIVED/ next to originals."
    ;;

# ── scan-and-archive ──────────────────────────────────────────
  scan-and-archive)
    echo "  [1/2] Running duplicate scan…"
    echo ""
    python /app/dupescope.py "${SCAN_ARGS[@]}"
    echo ""
    echo "  ✓ Scan done. Report at $PHOTOS_DIR/$OUTPUT"
    echo ""

    DRY_FLAG=""
    if [[ "$DRY_RUN" == "true" ]]; then
        DRY_FLAG="--dry-run"
        echo "  [DRY RUN] No files will be moved."
    fi

    echo "  [2/2] Archiving AI-delete files…"
    echo ""
    python /app/archive.py "$PHOTOS_DIR" $DRY_FLAG
    echo ""
    echo "  ✓ All done. Check _ARCHIVED/ folders next to your images."
    ;;

# ── help ──────────────────────────────────────────────────────
  help|--help|-h)
    cat <<'EOF'
  USAGE
    docker run --rm \
      -v /your/photos:/data \
      -e OLLAMA_URL=http://host.docker.internal:11434 \
      dupescope <command>

  COMMANDS
    scan              Detect duplicates + AI cull. Writes report JSON to /data/
    archive           Process an existing report JSON. Move files to _ARCHIVED/
    scan-and-archive  scan then archive in one go

  ENVIRONMENT VARIABLES
    PHOTOS_DIR     Mount point inside container  (default: /data)
    OLLAMA_URL     Ollama server URL             (default: http://host.docker.internal:11434)
    MODE           exact | perceptual | both     (default: both)
    THRESHOLD      pHash distance 0-64           (default: 10)
    AI_CULL        true | false                  (default: false)
    DRY_RUN        true | false                  (default: false)
    NO_RECURSIVE   true | false                  (default: false)
    OUTPUT         Report filename               (default: dupescope_report.json)

  EXAMPLES
    # Basic scan
    docker run --rm -v ~/Pictures:/data dupescope scan

    # Scan with AI culling
    docker run --rm \
      -v ~/Pictures:/data \
      -e AI_CULL=true \
      -e OLLAMA_URL=http://host.docker.internal:11434 \
      dupescope scan

    # Archive only (report already exists)
    docker run --rm -v ~/Pictures:/data dupescope archive

    # Full pipeline: scan + archive in one command
    docker run --rm \
      -v ~/Pictures:/data \
      -e MODE=both \
      -e AI_CULL=true \
      dupescope scan-and-archive

    # Dry run (see what would be archived without moving)
    docker run --rm \
      -v ~/Pictures:/data \
      -e DRY_RUN=true \
      dupescope scan-and-archive

    # Linux: Ollama runs on host — use bridge IP
    docker run --rm \
      -v ~/Pictures:/data \
      -e OLLAMA_URL=http://172.17.0.1:11434 \
      -e AI_CULL=true \
      dupescope scan

EOF
    ;;

  *)
    echo "  [ERROR] Unknown command: $COMMAND"
    echo "  Run with 'help' to see available commands."
    exit 1
    ;;
esac