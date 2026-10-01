---
type: decision
title: Decisions Log
---

# Decisions Log

Append-only. One line per entry: `YYYY-MM-DD: decided X because Y`.

Promote non-trivial decisions to full ADRs under `docs/adr/` when they affect architecture.

## Log

- 2026-09-24: decided to gate T-Systems health requests on a non-empty `TSYSTEMS_OPENCODE_API_KEY` because health should not be queried or shown without a shared provider credential.
