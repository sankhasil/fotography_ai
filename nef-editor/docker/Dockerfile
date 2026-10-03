# ponytail: fedora:44 is pinned because it carries darktable 5.6.1 — the current
# release (2026-08-27). Debian trixie only has 5.0.1 and cannot decode the camera's
# output. Revisit the pin when darktable 5.8 lands; do not float this tag.
FROM fedora:44

RUN dnf -y --setopt=install_weak_deps=False install \
        darktable \
        python3 \
    && dnf clean all \
    && rm -rf /var/cache/dnf

# ponytail: no exiftool. Verification proved ISO/shutter/aperture/focal all live in the
# standard EXIF IFD, readable in pure Python. exiftool is only needed if Picture Control
# detection is revived — do not add it speculatively.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app
ENTRYPOINT ["darktable-cli"]
CMD ["--version"]