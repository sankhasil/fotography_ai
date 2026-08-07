# Open WebUI Stack — DupeScope AI

Self-hosted AI chat stack. Open WebUI frontend, Ollama as the LLM backend,
with optional Pipelines (Ponytail enforcement), SearXNG (web search),
Stable Diffusion (images), n8n (automation) and Portainer (monitoring).

All services are declared in `compose.yml` and gated behind Docker Compose
**profiles** — start only what you need.

---

## Profiles

| Profile          | Service            | Port  | Purpose                                   |
| ---------------- | ------------------ | ----- | ----------------------------------------- |
| `local`          | `open-webui-local` | 3000  | WebUI → native Ollama on your Mac         |
| `docker`         | `ollama` + `open-webui-docker` | 3000 | WebUI + Dockerised Ollama       |
| `pipelines`      | `pipelines`        | 9099  | OpenAI-compatible proxy (Ponytail hooks)  |
| `search`         | `searxng`          | 8081  | Private web search for RAG                |
| `image_generator`| `stable-diffusion` | 7860  | Image generation                          |
| `automation`     | `n8n`              | 5678  | Workflow automation                       |
| `monitoring`     | `portainer`        | 9000  | Docker management UI                      |

`pipelines`, `search` and `docker` are also pulled in by the `docker` profile.

---

## Quick start

```bash
# Most common: local Ollama + web search + Ponytail pipeline
docker compose --profile local --profile search --profile pipelines up -d

# WebUI at http://localhost:3000
```

Full stack:

```bash
docker compose --profile docker --profile search --profile pipelines \
               --profile automation --profile monitoring up -d
```

Stop everything:

```bash
docker compose down
```

---

## How it works

### 1. Request flow (base)

```
Browser ──HTTP──> Open WebUI (:3000) ──/api/chat──> Ollama (:11434) ──> response
```

Open WebUI renders the chat UI, sends prompts to Ollama, and streams
responses back. No API key needed for a single user (`WEBUI_AUTH=false`).

### 2. Request flow (with Pipelines)

```
Browser ──> Open WebUI (:3000) ──OpenAI API──> Pipelines (:9099) ──> Ollama (:11434)
                                               │
                                               └─ inlet(): inject Ponytail rules
                                               └─ outlet(): post-process (unused)
```

Pipelines is an OpenAI-compatible proxy. Every request passes through its
Python hooks before reaching Ollama. `inlet()` unconditionally prepends the
Ponytail rules to the system message:

```python
# pipelines/ponytail_pipeline.py — simplified
async def inlet(self, body, user=None):
    if not self.valves.enabled:
        return body
    rules = self.RULES[self.valves.mode]              # "lite" | "full" | "ultra"
    messages = body.get("messages", [])
    if messages and messages[0].get("role") == "system":
        messages[0]["content"] = f"{rules}\n\n---\n\n{messages[0]['content']}"
    else:
        messages.insert(0, {"role": "system", "content": rules})
    body["messages"] = messages
    return body
```

Wire it up once in **Admin Panel → Connections → OpenAI**:

```text
API Base URL: http://pipelines:9099
API Key:      pipelines-local-key   (matches PIPELINES_API_KEY in compose.yml)
```

### 3. Chat with web search (RAG)

```
Browser ──> Open WebUI ──query──> SearXNG (:8081/search?q=<query>&format=json)
                │
                └── results injected into context ──> Ollama
```

Open WebUI sends the search query to SearXNG's JSON API. Results are added
to the prompt as context before the LLM answers.

```bash
# Test SearXNG directly
curl 'http://localhost:8081/search?q=ponytail&format=json'
```

### 4. Model traffic matrix

| Source             | Talks to                  | Config key              |
| ------------------ | ------------------------- | ----------------------- |
| `open-webui-local` | `host.docker.internal:11434` | `OLLAMA_BASE_URL`    |
| `open-webui-docker`| `ollama:11434`            | `OLLAMA_BASE_URL`       |
| `open-webui-*`     | `pipelines:9099`          | `OPENAI_API_BASE_URL` (commented out) |
| `open-webui-*`     | `searxng:8080`            | `SEARXNG_QUERY_URL`     |
| `n8n`              | `host.docker.internal:11434` | `OLLAMA_HOST`        |

---

## Where things live

| File                        | Purpose                                   |
| --------------------------- | ----------------------------------------- |
| `compose.yml`               | All services, profiles, env               |
| `pipelines/ponytail_pipeline.py` | API-level Ponytail enforcement     |
| `ponytail/system_prompt.txt`| Default system prompt (source of truth)   |
| `searxng/settings.yml`      | SearXNG engines + JSON output             |

The default system prompt is baked into `compose.yml` as
`DEFAULT_SYSTEM_PROMPT`. To change it, edit `ponytail/system_prompt.txt`
and copy the text into the env var, then restart the WebUI container.

---

## Changing the default system prompt

```bash
# 1. Edit the source of truth
#    open-webui/ponytail/system_prompt.txt

# 2. Rebuild/restart the WebUI container so the env var takes effect
docker compose --profile local up -d --force-recreate open-webui-local
```

> The `DEFAULT_SYSTEM_PROMPT` env var is user-overridable per chat;
> the Pipelines hook is not — use it when the rules must be mandatory.

---

## Notes

- `searxng/settings.yml:18` still uses the placeholder `secret_key` — set a
  random string before exposing anything publicly.
- Open WebUI data persists in the `open-webui_data` volume.
- Ollama's model cache is shared with your native install
  (`~/.ollama`), so nothing re-downloads.
