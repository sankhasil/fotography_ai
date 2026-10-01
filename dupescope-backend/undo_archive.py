"""Restore files archived by archive_rejects.py."""

import json
import shutil
import sys
from pathlib import Path

MANIFEST = Path("archive_manifest.json")

if not MANIFEST.exists():
    sys.exit(f"No manifest at {MANIFEST}")

if "--apply" not in sys.argv:
    for e in json.load(open(MANIFEST)):
        print(f"  {e['to']}  ->  {e['from']}")
    print("\nDry run. Re-run with --apply to restore.")
    sys.exit(0)

restored = 0
for e in json.load(open(MANIFEST)):
    src, dst = Path(e["to"]), Path(e["from"])
    if not src.exists():
        print(f"  SKIP (not in _ARCHIVED) {src.name}")
        continue
    if dst.exists():
        print(f"  SKIP (already restored) {dst.name}")
        continue
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(src), str(dst))
    restored += 1
    print(f"  restored {dst.name}")

print(f"\nRestored {restored} file(s).")
