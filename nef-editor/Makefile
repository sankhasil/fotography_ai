.PHONY: verify unit integration full-run clean

# Default: unit tests only (no Docker needed)
verify: unit

# Unit tests — no external binaries required
unit:
	.venv/bin/python -m pytest tests/ -q --ignore=tests/test_integration.py

# Integration tests — requires Docker and the nef-editor-darktable:1 image
integration:
	.venv/bin/python -m pytest tests/test_integration.py -q

# Full run on the operator's photo folder
# Usage: make full-run PHOTOS=/path/to/folder OUT=/path/to/exported
full-run:
	.venv/bin/python -m nef_editor.cli $(PHOTOS) --out $(OUT) --recursive

# Clean test artifacts
clean:
	rm -rf .pytest_cache __pycache__ tests/__pycache__ nef_editor/__pycache__
