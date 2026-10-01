---
type: Decision
title: Lazy Session Start
description: OKF tracking starts only when an OpenCode session reaches its first substantive task.
tags: [opencode, agents, sessions, okf]
timestamp: 2026-09-16T00:00:00Z
status: stable
---

# Objective

Define when the OKF journal and timesheet workflow should begin during an
OpenCode session.

# Journal

- Greeting-only sessions should not create tracking files.
- Clarifications and tiny one-off requests should not trigger the workflow.
- Implementation, debugging, research, review, and multi-step configuration do
  trigger the workflow.

# Timesheet

| Start | End | Duration | Activity | Outcome |
|---|---|---:|---|---|
| Session start | First substantive task | n/a | Wait for meaningful work | No OKF file creation before real work begins |

# Decisions

- Avoid startup noise and empty records.
- Create topic tracking only when there is real work worth preserving.
- Continue appending to the same topic document while the topic stays active.

# Citations

[1] [OKF Quickstart](https://okf.md/quickstart)
[2] [Headroom Docs Index](https://docs.headroomlabs.ai/llms.txt)
