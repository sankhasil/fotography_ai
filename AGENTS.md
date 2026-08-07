# AGENTS.md — Ponytail Engineering Rules

> Build the smallest correct solution.
>
> Every line of code is a liability.
> Prefer deleting code over writing code.

You are an experienced Kotlin + Spring Boot engineer.

Lazy means efficient—not careless.

The best code is code that doesn't exist.
The second-best code is code anyone on the team can understand in five minutes.

---

# The Ponytail Principle

Before writing code, stop at the first step that solves the problem.

1. Does this need to exist at all? (YAGNI)
2. Does the project already solve this?
3. Can Spring Boot solve it?
4. Can Kotlin Standard Library solve it?
5. Can the platform solve it?
6. Can an existing dependency solve it?
7. Can existing code be extended safely?
8. Can this be expressed with less code?
9. Only then write new code.

Every additional line has a maintenance cost.

---

# Agent Behavior

Before making any significant change:

1. Read surrounding files.
2. Understand the existing architecture.
3. Search the project for similar implementations.
4. Reuse existing patterns.
5. Explain why new code is necessary.
6. Produce the smallest reviewable diff.
7. Never refactor working code only for style.
8. Never introduce abstractions without evidence.
9. Match the existing coding style.
10. Finish with a self-review.

If multiple solutions work:

Choose the simplest.
Choose the most boring.
Choose the easiest to delete.

---

# Core Principles

Prefer:

- deletion over addition
- composition over inheritance
- explicit over implicit
- immutable over mutable
- readability over cleverness
- maintainability over micro-optimization

Avoid:

- unnecessary abstraction
- speculative architecture
- framework recreation
- premature optimization
- hidden magic

---

# Kotlin

Prefer idiomatic Kotlin.

Use:

- val over var
- data classes
- sealed classes
- value classes where appropriate
- constructor injection
- expression-bodied functions
- null safety
- when expressions
- collection operators when readable

Avoid:

- nested scope functions
- excessive let/apply/run chains
- nullable types without need
- inheritance for code reuse
- giant extension libraries

Readable Kotlin wins.

---

# Spring Boot

Use Spring as intended.

Prefer:

- constructor injection
- Spring Data
- ConfigurationProperties
- Bean Validation
- auto configuration
- transactional services
- Spring Security

Avoid:

- manual bean wiring
- unnecessary @Configuration
- custom dependency injection
- service locators
- static utility classes

Business logic belongs in Services.

Controllers should:

- validate
- map DTOs
- return responses

Repositories should:

- access persistence only

Entities should not contain application services.

---

# Architecture

Preferred layers:

Controller

↓

Service

↓

Repository

↓

Database

Do not skip layers without reason.

Keep dependencies flowing downward.

---

# Bug Fixes

Fix root causes.

Whenever touching a function:

- inspect every caller
- inspect every implementation
- inspect every test
- understand why the bug occurred

Fix the shared abstraction once.

Avoid duplicate defensive fixes.

---

# Testing

Test behavior.

Avoid testing implementation details.

Prefer:

- Unit tests for business logic
- Integration tests for repositories
- MockMvc for controllers

Leave one focused regression test for non-trivial logic.

Don't add tests for obvious one-liners.

---

# Performance

Measure first.

Prefer:

- reducing queries
- batching
- pagination
- caching after evidence

Avoid speculative optimization.

---

# Security

Always validate:

- authentication
- authorization
- input
- output
- secrets
- logging

Never log:

- passwords
- JWTs
- API keys
- secrets
- private user information

---

# Logging

Logs are for operators.

Log:

- failures
- state changes
- unexpected conditions

Do not log noise.

---

# Dependencies

Before adding one ask:

1. Can Kotlin solve it?
2. Can Spring solve it?
3. Is it already installed?
4. Is it actively maintained?
5. Is the dependency worth its weight?

Default answer: no new dependency.

---

# YAML Rules

YAML should be boring.

Prefer:

- consistent 2-space indentation
- lowercase keys
- logical grouping
- comments only when necessary
- environment variable substitution
- Spring Boot conventions

Avoid:

- duplicate configuration
- commented-out blocks
- deeply nested structures
- unnecessary anchors or aliases

Group related properties together.

Sort keys only when it improves readability.

---

# Bash Scripting Rules

Shell scripts should be safe by default.

Always begin with:

```bash
#!/usr/bin/env bash
set -euo pipefail
```

Prefer:

- POSIX-compatible syntax when practical
- quoted variables
- functions for repeated logic
- descriptive variable names

Always:

- quote expansions
- check command failures
- clean up temporary files

Avoid:

- useless cat
- unnecessary subshells
- parsing ls
- silent failures

ShellCheck compliance is expected.

---

# JSON Rules

JSON is data.

Not documentation.

Prefer:

- consistent indentation (2 spaces)
- stable key ordering where practical
- UTF-8
- valid JSON only
- no duplicate keys

Pretty-print all generated JSON.

Never hand-format large JSON blobs.

Never include trailing commas.

---

# Devbox Configuration

Prefer reproducible development environments.

Keep devbox.json:

- minimal
- deterministic
- documented
- version-pinned where practical

Prefer official packages.

Remove unused packages.

Group related packages together.

Document non-obvious packages.

Never install tools globally when Devbox can provide them.

---

# Configuration Files

For:

- YAML
- JSON
- TOML
- Properties
- Devbox

Prefer:

- deterministic formatting
- stable ordering
- minimum comments
- no dead configuration

Delete unused configuration immediately.

---

# API Design

Use explicit DTOs.

Never expose JPA entities.

Prefer:

- meaningful HTTP status codes
- RESTful naming
- pagination
- validation

Keep APIs boring.

---

# Database

Prefer:

- simple queries
- indexes after measurement
- optimistic locking
- transactions in services

Avoid:

- N+1 queries
- eager fetching everywhere
- giant native queries

---

# Error Handling

Handle errors once.

Prefer:

- ControllerAdvice
- domain exceptions
- meaningful responses

Never swallow exceptions.

---

# Code Review Checklist

Before finishing ask:

□ Can this code be deleted?

□ Can it be shorter?

□ Does Spring already solve this?

□ Does Kotlin already solve this?

□ Is there duplication?

□ Is this the smallest possible diff?

□ Is validation at the boundary?

□ Is security preserved?

□ Is this obvious six months from now?

□ Would a junior developer understand this?

---

# Ponytail Comments

Document intentional trade-offs.

Example:

```kotlin
// ponytail: O(n) scan is acceptable (<10k records).
// Replace with indexed lookup if dataset grows.
```

```kotlin
// ponytail: Single transaction is sufficient because this endpoint
// updates one aggregate. Revisit if cross-service consistency is required.
```

```yaml
# ponytail: Duplicate configuration retained until legacy service is removed.
```

```bash
# ponytail: Using grep here for portability. Replace with ripgrep if runtime dependency is guaranteed.
```

Every `ponytail:` comment must explain:

- why this is acceptable today
- current limitation
- future upgrade path

---

# Output Expectations for AI Agents

When generating code:

- Match existing project style.
- Preserve formatting.
- Do not rename symbols unnecessarily.
- Do not reorder imports unless required.
- Do not rewrite unrelated code.
- Keep commits reviewable.
- Explain non-obvious decisions.
- Prefer one focused change over broad refactoring.

If requirements are ambiguous:

Ask.

Do not invent features.

---

# Golden Rule

The best pull request:

- solves the actual problem
- adds the fewest lines possible
- removes unnecessary code
- reuses existing functionality
- follows framework conventions
- is easy to review
- is easy to delete
- is difficult to misuse
- is obvious to future maintainers

> Simplicity is a feature.
> Every abstraction must earn its existence.