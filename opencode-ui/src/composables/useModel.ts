import { computed, ref } from 'vue'
import type { OpencodeClient } from '@opencode-ai/sdk/client'

export interface ModelSelection {
  providerID: string
  modelID: string
}

export interface ModelOption extends ModelSelection {
  modelName: string
  providerName?: string
  contextLimit: number
  outputLimit: number
}

// ponytail: Local opencode.json config for defining and augmenting model metadata.
interface ModelConfig {
  name: string
  limit?: { context: number; output: number }
}

interface ProviderConfig {
  name: string
  models: Record<string, ModelConfig>
}

interface OpencodeConfig {
  provider: Record<string, ProviderConfig>
}

// ponytail: Cache opencode.json locally to persist across refreshes without re-fetching.
// Static import ensures opencode.json is bundled and always available (fetch would 404
// because Vite only serves /public, not the project root). Dynamic import keeps
// the bundle valid even if the file is missing in some environments.
let opencodeConfig: OpencodeConfig | null = null

export function __resetModelConfig(): void {
  opencodeConfig = null
}

async function loadOpencodeConfig(): Promise<OpencodeConfig | null> {
  if (opencodeConfig) return opencodeConfig
  try {
    // ponytail: Prefer static bundled copy; fetch fallback for live edits in dev.
    const mod = await import('../../opencode.json')
    opencodeConfig = (mod.default ?? mod) as OpencodeConfig
    return opencodeConfig
  } catch {
    // ponytail: Fallback to fetch for environments where static import is not available.
    try {
      const res = await fetch('/opencode.json')
      if (res.ok) opencodeConfig = await res.json()
    } catch {
      // ponytail: opencode.json might not be served in test environments; ignore.
    }
  }
  return opencodeConfig
}

const MODEL_KEY = 'opencode-ui:model'

// ponytail: the picker is scoped to free OpenCode Zen models plus the local
// ollama providers. The opencode provider only exposes free models, so provider-
// scoping alone yields the right set. ollama serves gemma4 directly; ollama-qwen
// serves qwen2.5-coder through the tool-call proxy (tools/ollama-tool-call-proxy.mjs),
// which rewrites the model's bare-JSON tool calls into real tool_calls. Revisit
// if paid models become first-class options.
const FREE_PROVIDER_IDS = new Set(['opencode', 'ollama', 'ollama-qwen'])

// Module-level state, same pattern as the other composables. The list is flat
// because only one provider is shown; selection is persisted and restored on
// connect.
const options = ref<ModelOption[]>([])
const selected = ref<ModelSelection | null>(null)

const selectedIndex = computed<string>(() => {
  if (!selected.value) return ''
  const index = options.value.findIndex(
    (o) => o.providerID === selected.value?.providerID && o.modelID === selected.value?.modelID,
  )
  return index === -1 ? '' : String(index)
})

const selectedLabel = computed<string>(() => {
  if (!selected.value) return ''
  return `${selected.value.providerID}/${selected.value.modelID}`
})

function readStored(): ModelSelection | null {
  try {
    const raw = window.localStorage.getItem(MODEL_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ModelSelection
    return parsed.providerID && parsed.modelID ? parsed : null
  } catch {
    return null
  }
}

function persist(): void {
  try {
    if (selected.value) {
      window.localStorage.setItem(MODEL_KEY, JSON.stringify(selected.value))
    } else {
      window.localStorage.removeItem(MODEL_KEY)
    }
  } catch {
    // localStorage unavailable; the selection survives for this session only.
  }
}

async function refresh(client: OpencodeClient): Promise<void> {
  const config = await loadOpencodeConfig()
  
  // ponytail: Start with API models only from free providers.
  const apiModels: ModelOption[] = []
  try {
    const result = await client.provider.list()
    const providers = result.data?.all ?? []
    apiModels.push(
      ...providers
        .filter((provider) => FREE_PROVIDER_IDS.has(provider.id))
        .flatMap((provider) =>
          Object.values(provider.models ?? {}).map((model) => ({
            providerID: provider.id,
            providerName: provider.name,
            modelID: model.id,
            modelName: model.name,
            contextLimit: model.limit?.context ?? 128000,
            outputLimit: model.limit?.output ?? 4096,
          })),
        ),
    )
  } catch {
    // ponytail: network errors are handled gracefully below.
  }

  // ponytail: Merge opencode.json config to supplement or override limits/names.
  if (config) {
    Object.entries(config.provider).forEach(([providerID, provider]) => {
      Object.entries(provider.models).forEach(([modelID, model]) => {
        const existing = apiModels.find(
          (o) => o.providerID === providerID && o.modelID === modelID,
        )
        if (existing) {
          if (model.name) existing.modelName = model.name
          if (model.limit) {
            existing.contextLimit = model.limit.context
            existing.outputLimit = model.limit.output
          }
        } else {
          apiModels.push({
            providerID,
            providerName: provider.name,
            modelID,
            modelName: model.name,
            contextLimit: model.limit?.context ?? 128000,
            outputLimit: model.limit?.output ?? 4096,
          })
        }
      })
    })
  }

  options.value = apiModels
  
  const stored = readStored()
  const matches = stored
    ? apiModels.some(
        (o) => o.providerID === stored.providerID && o.modelID === stored.modelID,
      )
    : false
  // ponytail: default to the first model so a fresh UI never falls
  // back to a broken console default (e.g. a local ollama that 500s when the
  // daemon is down). The stored selection wins when it still exists.
  const fallback = apiModels[0]
  selected.value = matches
    ? stored
    : fallback
      ? { providerID: fallback.providerID, modelID: fallback.modelID }
      : null
  persist()
}

function select(index: number | null): void {
  if (index === null) {
    selected.value = null
  } else {
    const option = options.value[index]
    selected.value = option ? { providerID: option.providerID, modelID: option.modelID } : null
  }
  persist()
}

function getSelectedModelLimit(): { context: number; output: number } | null {
  if (!selected.value) return null
  const option = options.value.find(
    (o) => o.providerID === selected.value?.providerID && o.modelID === selected.value?.modelID,
  )
  if (!option) return null
  return { context: option.contextLimit, output: option.outputLimit }
}

function findLargerContextModels(currentLimit: number): ModelOption[] {
  return options.value.filter((o) => o.contextLimit > currentLimit)
}

export function useModel() {
  return {
    options,
    selected,
    selectedIndex,
    selectedLabel,
    refresh,
    select,
    getSelectedModelLimit,
    findLargerContextModels,
    __resetModelConfig,
  }
}
