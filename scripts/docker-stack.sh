#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# docker-stack.sh — DupeScope AI Stack Manager
# Called by devbox.json scripts. Use via: devbox run stack <command>
#
# USAGE:
#   devbox run stack start local        # WebUI + local Ollama + search + pipelines
#   devbox run stack start docker       # WebUI + dockerised Ollama + search + pipelines
#   devbox run stack start full         # Everything (local Ollama)
#   devbox run stack start images       # Add Stable Diffusion to current stack
#   devbox run stack start automation   # Add n8n to current stack
#   devbox run stack start monitoring   # Add Portainer to current stack
#   devbox run stack stop               # Stop all containers
#   devbox run stack restart            # Stop then start local (default)
#   devbox run stack status             # Show running containers + URLs
#   devbox run stack logs [service]     # Tail logs (all or specific service)
#   devbox run stack pull               # Pull latest images for all services
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

RED='\033[0;31m'
GRN='\033[0;32m'
YEL='\033[0;33m'
CYN='\033[0;36m'
BLD='\033[1m'
DIM='\033[2m'
RST='\033[0m'

COMMAND="${1:-help}"
ARG="${2:-}"

# ── Service URLs ──────────────────────────────────────────────────────────────
declare -A URLS=(
  [open-webui]="http://localhost:3000"
  [searxng]="http://localhost:8081"
  [pipelines]="http://localhost:9099"
  [stable-diffusion]="http://localhost:7860"
  [n8n]="http://localhost:5678"
  [portainer]="http://localhost:9000"
  [ollama]="http://localhost:11434"
)

# ── Profile groups ────────────────────────────────────────────────────────────
# Each preset is a space-separated list of --profile flags
PRESET_LOCAL="--profile local --profile search --profile pipelines"
PRESET_DOCKER="--profile docker --profile search --profile pipelines"
PRESET_FULL="--profile local --profile search --profile pipelines --profile automation --profile monitoring"
PRESET_IMAGES="--profile local --profile image_generator"
PRESET_ALL="--profile local --profile search --profile pipelines --profile automation --profile monitoring --profile image_generator"

STOP_ALL="--profile local --profile docker --profile search --profile pipelines --profile automation --profile monitoring --profile image_generator"

# ─────────────────────────────────────────────────────────────────────────────
print_header() {
  echo ""
  echo -e "${BLD}  ◈ DupeScope AI Stack${RST}"
  echo "  ─────────────────────────────────────────────"
}

print_urls() {
  echo ""
  echo -e "${BLD}  Services:${RST}"
  for name in open-webui searxng pipelines n8n portainer stable-diffusion; do
    url="${URLS[$name]}"
    # Check if container is running
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${name}$"; then
      echo -e "  ${GRN}●${RST} ${name/<padding>/} ${DIM}${url}${RST}"
    else
      echo -e "  ${DIM}○ ${name} (not running)${RST}"
    fi
  done
  echo ""
}

wait_for_webui() {
  echo -n "  Waiting for Open WebUI "
  local waited=0
  until curl -sf --max-time 2 "http://localhost:3000" >/dev/null 2>&1; do
    echo -n "."
    sleep 2
    waited=$((waited + 2))
    if [ "$waited" -ge 60 ]; then
      echo ""
      echo -e "${YEL}  WebUI taking longer than expected — check: docker logs open-webui${RST}"
      return
    fi
  done
  echo -e " ${GRN}ready ✓${RST}"
}

# ─────────────────────────────────────────────────────────────────────────────
# COMMANDS
# ─────────────────────────────────────────────────────────────────────────────

cmd_start() {
  local preset="${1:-local}"
  local profiles=""
  local label=""

  case "$preset" in
    local)
      profiles="$PRESET_LOCAL"
      label="local Ollama + WebUI + Search + Pipelines"
      ;;
    docker)
      profiles="$PRESET_DOCKER"
      label="Docker Ollama + WebUI + Search + Pipelines"
      ;;
    full)
      profiles="$PRESET_FULL"
      label="Full stack (local Ollama + all services)"
      ;;
    images|image_generator)
      profiles="$PRESET_IMAGES"
      label="Local Ollama + Stable Diffusion"
      ;;
    automation)
      profiles="$PRESET_LOCAL --profile automation"
      label="Local stack + n8n automation"
      ;;
    monitoring)
      profiles="$PRESET_LOCAL --profile monitoring"
      label="Local stack + Portainer"
      ;;
    all)
      profiles="$PRESET_ALL"
      label="Everything"
      ;;
    *)
      echo -e "${RED}  Unknown preset: $preset${RST}"
      echo "  Valid: local · docker · full · images · automation · monitoring · all"
      exit 1
      ;;
  esac

  print_header
  echo -e "  Starting: ${CYN}${label}${RST}"
  echo ""

  # shellcheck disable=SC2086
  docker compose $profiles up -d --remove-orphans

  wait_for_webui
  print_urls

  echo -e "  ${GRN}${BLD}✓ Stack is up.${RST}"
  echo -e "  ${DIM}Open WebUI → http://localhost:3000${RST}"
  echo ""
}

cmd_stop() {
  print_header
  echo -e "  ${YEL}Stopping all DupeScope services...${RST}"
  echo ""

  # shellcheck disable=SC2086
  docker compose $STOP_ALL down --remove-orphans

  echo ""
  echo -e "  ${GRN}✓ All services stopped.${RST}"
  echo ""
}

cmd_restart() {
  local preset="${1:-local}"
  cmd_stop
  sleep 1
  cmd_start "$preset"
}

cmd_status() {
  print_header
  echo ""

  # Running containers
  local running
  running=$(docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' \
    --filter "name=open-webui" \
    --filter "name=ollama" \
    --filter "name=searxng" \
    --filter "name=pipelines" \
    --filter "name=stable-diffusion" \
    --filter "name=n8n" \
    --filter "name=portainer" \
    2>/dev/null)

  if echo "$running" | grep -q "NAMES"; then
    echo "$running"
  else
    echo -e "  ${YEL}No DupeScope containers are running.${RST}"
    echo "  Start with: devbox run stack start local"
  fi

  print_urls
}

cmd_logs() {
  local service="${1:-}"
  if [ -n "$service" ]; then
    docker logs -f "$service" 2>&1
  else
    # All running dupeScope containers
    docker compose \
      --profile local --profile docker \
      --profile search --profile pipelines \
      logs -f --tail=50 2>&1
  fi
}

cmd_pull() {
  print_header
  echo -e "  ${YEL}Pulling latest images...${RST}"
  echo ""

  # shellcheck disable=SC2086
  docker compose $STOP_ALL pull

  echo ""
  echo -e "  ${GRN}✓ All images updated.${RST}"
  echo ""
}

cmd_help() {
  print_header
  cat << 'EOF'

  USAGE
    devbox run stack <command> [preset]

  START COMMANDS
    start local        WebUI + local Ollama + Search + Pipelines   (default)
    start docker       WebUI + Docker Ollama + Search + Pipelines
    start full         Everything with local Ollama
    start images       Local Ollama + Stable Diffusion
    start automation   Local stack + n8n
    start monitoring   Local stack + Portainer
    start all          Every single service

  OTHER COMMANDS
    stop               Stop all containers
    restart [preset]   Stop then start (default: local)
    status             Show running containers and URLs
    logs [service]     Tail logs — all or specific container name
    pull               Pull latest Docker images

  SERVICES & PORTS
    open-webui         http://localhost:3000   ← Main AI chat UI
    searxng            http://localhost:8081   ← Private web search
    pipelines          http://localhost:9099   ← API proxy (Ponytail)
    stable-diffusion   http://localhost:7860   ← Image generation
    n8n                http://localhost:5678   ← Workflow automation
    portainer          http://localhost:9000   ← Docker management
    ollama (docker)    http://localhost:11434  ← LLM server

  EXAMPLES
    devbox run stack start local
    devbox run stack start full
    devbox run stack logs open-webui
    devbox run stack restart docker

EOF
}

# ─────────────────────────────────────────────────────────────────────────────
# ROUTER
# ─────────────────────────────────────────────────────────────────────────────
case "$COMMAND" in
  start)      cmd_start "$ARG" ;;
  stop)       cmd_stop ;;
  restart)    cmd_restart "$ARG" ;;
  status)     cmd_status ;;
  logs)       cmd_logs "$ARG" ;;
  pull)       cmd_pull ;;
  help|--help|-h) cmd_help ;;
  *)
    echo -e "${RED}  Unknown command: $COMMAND${RST}"
    cmd_help
    exit 1
    ;;
esac