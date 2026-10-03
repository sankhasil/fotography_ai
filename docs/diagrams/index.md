---
type: reference
title: Architecture Diagrams
---

# Architecture Diagrams

Diagrams are code (https://structurizr.com). C4 model only.

- `.dsl` files live in this folder
- one workspace per file, multiple views per workspace
- reference diagrams from docs by relative path: `![alt](diagrams/foo.png)`
- DSL is the source of truth; render via Structurizr CLI or Playground

## Diagrams

| File | Model | Purpose |
|---|---|---|
| [`nef-editor-cli.dsl`](./nef-editor-cli.dsl) | C4 | The NEF editor CLI, its external engines (darktable, exiftool, LibRaw), and the external-binary boundary |
