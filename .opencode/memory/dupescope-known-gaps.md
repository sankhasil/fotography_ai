---
name: dupescope-known-gaps
description: Two accepted-known defects in dupescope-backend and the one design decision the user chose deliberately
metadata:
  type: project
---

As of 2026-10-01, dupescope-backend has two known defects the user has reviewed and accepted as-is (explicitly declined a fix):

1. `encode_image` intermittently returns `""` on the first NEF read in a process (rawpy fails, then the `sips` fallback misses). Now visible as `[WARN] Could not encode image: <name>` and scored on local metrics only, rather than silently given a fabricated neutral 5.0.
2. LLaVA on `ollama-local` is **not** deterministic despite `temperature=0, seed=42`. Measured 2/5 verdicts on the same image after raising `num_predict` to 512 (was 1/4 at 200). Do not trust a claim that local verdicts are reproducible.

Deliberate decision, user-confirmed: **provider and model are configured only in `dupescope.toml` `[llm]`, never via CLI flag or request field.** `--provider`/`--model` and `ScanRequest.provider`/`.model` were deliberately deleted to satisfy a spec requirement. Do not "helpfully" re-add them.

**Why:** Req 4 of the review spec said base-URL config must have exactly one home. The user chose to treat it literally after I flagged that I had transcribed that requirement myself rather than it being stated.

**How to apply:** Treat these as accepted, not as regressions to chase. If a future task touches `encode_image` or claims AI determinism, raise it rather than assuming it is fixed or still broken.
