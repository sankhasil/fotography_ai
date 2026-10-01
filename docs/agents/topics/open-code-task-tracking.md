---
type: Playbook
title: OpenCode Task Tracking
description: Preferred OKF document shape for substantive OpenCode work, combining an operational journal with a lightweight timesheet.
tags: [opencode, agents, okf, journal, timesheet]
timestamp: 2026-09-16T00:00:00Z
status: stable
---

# Objective

Track substantive OpenCode work in one topic document so the current objective,
progress, time spent, and decisions stay easy to review.

# TL;DR

Use one topic file per substantive task, put the summary first, and keep the
rest easy to scan.

# Journal

- Create or reuse a topic file when the first substantive task starts.
- Add brief progress entries after meaningful work blocks.
- Reuse the same file while the task remains the same topic.
- When blocked, record the blocker and the next required input.
- Keep entries ADHD-friendly: short bullets, one idea per bullet, and explicit
  next steps instead of long narrative paragraphs.

Example journal entry style:

- `2026-09-16 09:10 UTC` - Started topic. Confirmed scope: documentation-only OpenCode workflow.
- `2026-09-16 09:28 UTC` - Read OKF spec and Headroom docs. Decided not to auto-edit `opencode.json`.
- `2026-09-16 09:44 UTC` - Added OKF bundle and documented lazy session-start behavior.

# Timesheet

Use concise rows for meaningful work blocks.

| Start | End | Duration | Activity | Outcome |
|---|---|---:|---|---|
| 09:10 UTC | 09:28 UTC | 18m | Gather requirements and external references | Confirmed OKF bundle path and Headroom source docs |
| 09:28 UTC | 09:44 UTC | 16m | Update agent guidance | Added OpenCode OKF and Headroom documentation rules |

# Decisions

- OKF tracking starts lazily on the first substantive task, not at session boot.
- Topic files combine journal and timesheet instead of splitting them into
  separate documents.
- Topic files should start with a `TL;DR` for fast scanning.
- Headroom remains documentation-only until the user explicitly asks for setup.
- Official Headroom docs are the source of truth for plugin download and
  `opencode.json` guidance.

# Citations

[1] [OKF Spec](https://okf.md/spec)
[2] [Headroom GitHub Repository](https://github.com/headroomlabs-ai/headroom)
[3] [Headroom Quickstart](https://docs.headroomlabs.ai/docs/quickstart)
[4] [Headroom OpenCode Integration](https://docs.headroomlabs.ai/docs/opencode)
[5] [Headroom Configuration](https://docs.headroomlabs.ai/docs/configuration)
