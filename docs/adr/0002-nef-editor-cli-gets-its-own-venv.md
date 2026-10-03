---
type: decision
title: The NEF editor CLI gets its own venv, not dupescope-backend's
status: accepted
date: 2026-10-02
---

# The NEF editor CLI gets its own venv, not dupescope-backend's

## Context

The repository already contains a Python environment: `dupescope-backend/.venv`, with `rawpy`,
`opencv-python`, `numpy`, `pillow`, and `insightface` installed and working. The NEF editor needs
`rawpy` and `opencv-python` too.

Reusing that environment would mean no second install and no second lockfile. That is the outcome
`AGENTS.md` argues for by default — prefer reuse over addition, and the repo already solves this.

Against that, the two tools have little in common. DupeScope is a FastAPI service with a React
frontend that scores and de-duplicates photographs; it depends on `torch`, `torchvision`,
`open-clip-torch`, `insightface`, and `onnxruntime` — a deep-learning stack. The NEF editor is a
command-line tool that shells out to `darktable-cli` and needs two small libraries. The venv is
roughly 2 GB, almost entirely of dependencies the editor will never import.

They also fail differently. DupeScope's `.venv` is rebuilt by its own setup; an editor build that
depends on it inherits every breakage in a stack it does not use.

The operator was asked and chose a separate venv with its own requirements, against the recommendation
to share. This ADR records that choice and its reasoning, because it contradicts the repo's default
posture and a future maintainer will otherwise "fix" it.

## Decision

**The NEF editor lives in a new top-level module with its own virtual environment and its own
`requirements.txt`.**

It does not import from `dupescope-backend`, and `dupescope-backend` does not import from it. The two
tools share no code.

The module's dependencies are deliberately minimal: `rawpy`, `opencv-python`, and the standard
library. In particular it does **not** depend on `torch` or `insightface`.

## Consequences

**Positive**

- Installing the editor pulls a few tens of megabytes, not 2 GB.
- The editor's dependency set is obvious from one short `requirements.txt`.
- A breakage in DupeScope's deep-learning stack cannot break the editor, and vice versa.
- The editor can be moved to its own repository without disentangling it.

**Negative**

- Two environments, two sets of installed binaries, two things to keep current.
- Shared packages are installed twice. `rawpy` and `opencv-python` appear in both.
- A new top-level directory in a repository that already has several.

### Deliberate divergence: face detection

DupeScope already has a working `FaceDetector` backed by `insightface`'s `buffalo_l` model, in
`dupescope/scoring/faces.py`. Reusing it would have meant depending on `torch`.

This module uses **OpenCV's YuNet** instead. For a single signal — "is there a face" — YuNet needs
one small model file, while insightface needs a 2 GB deep-learning stack. In an environment that does
not otherwise have `torch`, YuNet is the cheaper dependency.

The consequence is that the repository contains two face detectors. This is accepted: they serve
different tools, live in different environments, and have radically different costs. They must not be
"consolidated" — doing so would force `torch` into the editor or `insightface` out of DupeScope.

**If this module ever gains the deep-learning stack for its own reasons**, revisit this and prefer
DupeScope's detector over a second one.

### Upgrade path

If the two tools ever need to share real code — not a copied helper, but a genuine shared
abstraction — extract that into a third top-level module and let both depend on it. Do not reach
across the boundary by importing `dupescope-backend` from the editor.

## References

- [Implementation plan](../architecture/nef-editor-cli/plan.md)
- `dupescope-backend/requirements.txt`
- `dupescope/scoring/faces.py`
- [ADR-0001](./0001-darktable-cli-as-render-engine.md)
- `AGENTS.md` — Ponytail Principle, dependency section