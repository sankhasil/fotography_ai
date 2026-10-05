---
type: howto
title: Darktable GUI in Docker via VNC — Preset Authoring Plan
status: draft
date: 2026-10-04
---

# Darktable GUI in Docker via VNC

Run darktable's GUI in a Docker container, display it on macOS via the built-in
Screen Sharing app (VNC). No brew cask, no Gatekeeper, no XQuartz. Author preset
XMP sidecars, then copy them to `nef-editor/presets/`.

## Why this approach

- Homebrew's darktable cask is disabled (Gatekeeper failure)
- Installing from .dmg requires quarantine flag removal
- Docker is already installed and working
- macOS has a built-in VNC client (Screen Sharing)
- darktable is already pinned at 5.6.1 in `nef-editor-darktable:1`

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  macOS host                                              │
│                                                          │
│  ┌─────────────┐        ┌──────────────────────────┐    │
│  │ Screen       │ VNC    │ Docker container          │    │
│  │ Sharing app  │◄──────►│ (fedora:44)               │    │
│  │ (built-in)   │ :5901  │                           │    │
│  └─────────────┘        │  ┌──────────────────┐     │    │
│                          │  │ darktable GUI     │     │    │
│                          │  │ (VNC framebuffer) │     │    │
│                          │  └────────┬─────────┘     │    │
│                          │           │                │    │
│                          │  ┌────────▼─────────┐     │    │
│                          │  │ /photos (ro)     │◄────┼────┼─── ~/Pictures/...
│                          │  │ /presets (rw)    │◄────┼────┼─── nef-editor/presets/
│                          │  └──────────────────┘     │    │
│                          └──────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

## Step-by-step

### Step 1 — Create the GUI Dockerfile

New file: `nef-editor/docker/Dockerfile.gui`

```dockerfile
# ponytail: extends the CLI darktable image with X11 + VNC for GUI authoring.
# Not used for rendering — only for one-time preset sidecar authoring.
FROM fedora:44

RUN dnf -y --setopt=install_weak_deps=False install \
        darktable \
        tigervnc-server \
        fluxbox \
        xterm \
        mesa-dri-drivers \
        xorg-x11-server-Xvfb \
    && dnf clean all \
    && rm -rf /var/cache/dnf

ENV DISPLAY=:1 \
    RESOLUTION=1920x1080 \
    VNC_DEPTH=24

COPY start-gui.sh /start-gui.sh
RUN chmod +x /start-gui.sh

EXPOSE 5901

CMD ["/start-gui.sh"]
```

### Step 2 — Create the start script

New file: `nef-editor/docker/start-gui.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

# Set VNC password (simple, one-time use)
mkdir -p ~/.vnc
echo "nef123" | vncpasswd -f > ~/.vnc/passwd
chmod 600 ~/.vnc/passwd

# Start VNC server
vncserver :1 -geometry "${RESOLUTION}" -depth "${VNC_DEPTH}" -localhost no

# Start window manager
export DISPLAY=:1
fluxbox &

# Start darktable in the foreground so the container stays alive
# Open the photos directory if mounted
if [ -d /photos ]; then
    darktable /photos
else
    darktable
fi

# Clean up
vncserver -kill :1
```

### Step 3 — Create docker-compose for GUI

New file: `nef-editor/docker/docker-compose-gui.yml`

```yaml
# darktable GUI via VNC for preset sidecar authoring.
#
# Usage:
#   PHOTOS_DIR="/path/to/folder" docker compose -f docker-compose-gui.yml up
#
# Then connect via Screen Sharing (Cmd+Space, "Screen Sharing", vnc://localhost:5901)
# Password: nef123

services:
  darktable-gui:
    build:
      context: .
      dockerfile: Dockerfile.gui
    ports:
      - "5901:5901"
    volumes:
      - "${PHOTOS_DIR:?set PHOTOS_DIR to your .nef folder}:/photos:rw"
      - "${PRESETS_DIR:-../presets}:/presets:rw"
    environment:
      - DISPLAY=:1
      - RESOLUTION=1920x1080
```

Note: `/photos` is mounted **rw** so darktable can write sidecars next to NEFs.
The operator copies the finished sidecars to `/presets` from inside the GUI.

### Step 4 — Build and run

```sh
cd nef-editor/docker

# Build the GUI image
docker compose -f docker-compose-gui.yml build

# Run with your photos folder
PHOTOS_DIR="/Users/A200173944/Pictures/Nikon Transfer 2/Travemunde Strand Dracen" \
  docker compose -f docker-compose-gui.yml up
```

### Step 5 — Connect from macOS

1. Open **Screen Sharing** (Cmd+Space, type "Screen Sharing")
2. Connect to: `vnc://localhost:5901`
3. Password: `nef123`
4. darktable opens with your photos

### Step 6 — Author a preset inside darktable

1. In darktable's lighttable view, click on a NEF to open it
2. Go to the darkroom (press `D`)
3. Apply the modules for the preset:
   - Lens correction (auto from EXIF)
   - Highlight reconstruction
   - White balance (as shot)
   - Exposure
   - Color balance RGB (vibrance +12)
   - Any category-specific modules
4. Save the sidecar:
   - In lighttable view, select the image
   - Right-click → "Write sidecar files"
   - The `.xmp` file appears next to the NEF in `/photos`
5. Rename it to `nef-<category>-<sub-style>.xmp` and copy to `/presets`:
   - Open `xterm` (in the VNC session)
   - `cp /photos/DSC_5327.xmp /presets/nef-landscape-neutral.xmp`

### Step 7 — Stop and extract

```sh
# Stop the container (Ctrl+C in the terminal)
# The presets are in nef-editor/presets/ on the host
ls nef-editor/presets/
```

### Step 8 — Verify the sidecar works

```sh
# Test the sidecar with darktable-cli in the existing CLI image
docker run --rm \
  -v "/Users/A200173944/Pictures/Nikon Transfer 2/Travemunde Strand Dracen/DSC_5327.NEF:/in.nef:ro" \
  -v "nef-editor/presets/nef-landscape-neutral.xmp:/preset.xmp:ro" \
  -v "/tmp:/out" \
  --entrypoint darktable-cli nef-editor-darktable:1 \
  /in.nef /preset.xmp /out/test.jpeg --out-ext jpeg

# Check the output
ls -la /tmp/test.jpeg
```

## Uninstall

When you're done authoring presets, remove the GUI image:

```sh
docker rmi nef-editor-docker-darktable-gui:latest
rm nef-editor/docker/Dockerfile.gui
rm nef-editor/docker/start-gui.sh
rm nef-editor/docker/docker-compose-gui.yml
```

The CLI darktable image (`nef-editor-darktable:1`) stays — it's separate.

## Risks

| Risk | Mitigation |
|---|---|
| VNC is slow for photo editing | Acceptable for one-time preset authoring. Resolution can be lowered |
| darktable GUI needs OpenGL | `mesa-dri-drivers` provides software rendering. No GPU acceleration |
| VNC password is simple | `nef123` is fine — only listens on localhost |
| Container is large (~1.5 GB) | GUI dependencies add ~700 MB to the CLI image. Delete after authoring |
| Photos mounted rw | Darktable writes sidecars, not NEF edits. NEFs stay byte-identical |

## What this gives you

After authoring 16 presets (4 categories × 4 sub-styles):

```
nef-editor/presets/
  nef-landscape-neutral.xmp
  nef-landscape-vivid.xmp
  nef-landscape-grey.xmp
  nef-landscape-monochrome.xmp
  nef-portrait-neutral.xmp
  ...
  nef-night-monochrome.xmp
```

Then `nef-editor ~/Pictures/MyPhotos --recursive` copies the right sidecar
next to each NEF. Open in darktable → preset is applied. No Docker needed
for the batch run — only for one-time authoring.
