---
type: Reference
title: Scan-Friendly Working Notes
description: Preferred note shape for working discoveries captured during an OpenCode task, written for fast scanning and low cognitive load.
tags: [notes, opencode, adhd-friendly, tldr]
timestamp: 2026-09-16T00:00:00Z
status: stable
---

# TL;DR

Put the conclusion first, keep the rest scannable, and store only the parts of
working notes that are likely to matter later.

# Context

Use a note file when the agent discovers something worth preserving during work
but not yet ready to be folded into the main topic document.

# Notes

- Keep notes ADHD-friendly and low cognitive load.
- Prefer one idea per bullet.
- Prefer short lists over long prose.
- Surface blockers and next actions explicitly.
- If a command output matters, summarize the finding instead of dumping raw text.

Example note style:

- Dependency check: existing target `AGENTS.md` propagation happens in `scripts/opencode.sh`.
- Risk: naive copy would overwrite local instructions in working folders.
- Fix direction: show the diff first, ask for confirmation, then merge one
  managed shared block into the target file.

# Follow-ups

- Move durable findings into the relevant topic file.
- Delete or ignore note files that never become useful project knowledge.

# Citations

[1] [Interactive Session Profile](../topics/interactive-session-profile.md)
