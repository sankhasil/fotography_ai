---
type: Playbook
title: Interactive Session Profile
description: Source-backed template for capturing the user's role, communication preferences, git preferences, and approval gates in AGENTS.md.
tags: [agents, profile, git, communication, opencode]
timestamp: 2026-09-16T00:00:00Z
status: stable
---

# Objective

Add a small `AGENTS.md` section that captures interactive-session preferences
without duplicating repository-wide engineering policy.

# TL;DR

Keep user preferences explicit, short, editable, and separate from repository
engineering rules.

# Journal

- Reviewed the existing `AGENTS.md` to place the new profile section near the
  OpenCode-specific guidance.
- Researched instruction-layering and profile patterns from Claude Code, Codex,
  GitHub Copilot, and VS Code Copilot documentation.
- Chose a four-part section shape: user profile, communication preferences, git
  preferences, and approval gates.
- Kept the section as defaults plus editable placeholders instead of pretending
  all user preferences are already known.
- Added a merge-safe propagation rule so copied `AGENTS.md` content supplements
  local instructions instead of overwriting them.

# Timesheet

| Start | End | Duration | Activity | Outcome |
|---|---|---:|---|---|
| 10:05 UTC | 10:18 UTC | 13m | Research profile templates | Collected source-backed patterns for layered instructions and git preference capture |
| 10:18 UTC | 10:30 UTC | 12m | Update AGENTS.md | Added a default profile section with editable placeholders |

# Decisions

- Keep personal preferences separate from repository policy.
- Document git preferences explicitly, but do not treat them as enforcement.
- Use placeholders where the user's preference is not yet fully known.
- Keep the section short so it stays maintainable and likely to be updated.
- Require merge-not-overwrite behavior when shared `AGENTS.md` content is copied
  into a working folder.

# Citations

[1] [Claude Code Memory](https://docs.anthropic.com/en/docs/claude-code/memory)
[2] [Codex AGENTS.md Configuration](https://learn.chatgpt.com/codex/agent-configuration/agents-md)
[3] [Codex Personalize](https://learn.chatgpt.com/codex/personalize)
[4] [VS Code Copilot Custom Instructions](https://code.visualstudio.com/docs/copilot/customization/custom-instructions)
[5] [GitHub Copilot Repository Custom Instructions](https://docs.github.com/en/copilot/customizing-copilot/adding-repository-custom-instructions-for-github-copilot)
