# ─────────────────────────────────────────────────────────────
# DupeScope Docker Image
# ─────────────────────────────────────────────────────────────
# Base: slim Python 3.12 (smaller image)
FROM python:3.12-slim

# ── Labels ────────────────────────────────────────────────────
LABEL maintainer="DupeScope"
LABEL description="Privacy-first duplicate photo detector + archiver"

# ── System dependencies ───────────────────────────────────────
# libraw-dev  → rawpy (RAW image support)
# libjpeg-dev → Pillow JPEG support
# libpng-dev  → Pillow PNG support
RUN apt-get update && apt-get install -y --no-install-recommends \
    libraw-dev \
    libjpeg-dev \
    libpng-dev \
    libwebp-dev \
    libtiff-dev \
    && rm -rf /var/lib/apt/lists/*

# ── Python dependencies ───────────────────────────────────────
COPY ../dupescope-backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# ── App files ─────────────────────────────────────────────────
WORKDIR /app
COPY ../dupescope-backend/dupescope.py      /app/dupescope.py
COPY ../dupescope-backend/process_dupescope_report.py        /app/archive.py
COPY entrypoint.sh     /app/entrypoint.sh

RUN chmod +x /app/entrypoint.sh

# ── Environment variables with defaults ───────────────────────
# OLLAMA_URL: where Ollama is running
#   Mac/Windows → http://host.docker.internal:11434
#   Linux       → http://172.17.0.1:11434  (docker bridge IP)
#                 or http://<your-host-ip>:11434
ENV OLLAMA_URL=http://host.docker.internal:11434

# /data is where you bind-mount your photos folder from the host
ENV PHOTOS_DIR=/data

# ── Entrypoint ────────────────────────────────────────────────
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["--help"]