#!/usr/bin/env bash
set -euo pipefail

# VNC password — simple, localhost-only
mkdir -p ~/.vnc
echo "nef123" | vncpasswd -f > ~/.vnc/passwd
chmod 600 ~/.vnc/passwd

# Start VNC server on display :1
vncserver :1 \
    -geometry "${RESOLUTION}" \
    -depth "${VNC_DEPTH}" \
    -localhost no

# Start window manager
export DISPLAY=:1
fluxbox &

# Give fluxbox a moment to start
sleep 1

# Start darktable — foreground so container stays alive
if [ -d /photos ] && [ "$(ls -A /photos 2>/dev/null)" ]; then
    echo "Starting darktable with /photos"
    darktable /photos
else
    echo "Starting darktable (no photos mounted)"
    darktable
fi

# Clean up on exit
vncserver -kill :1 2>/dev/null || true
