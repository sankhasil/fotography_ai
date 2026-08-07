import { computed, ref } from 'vue'
import type { OpencodeClient } from '@opencode-ai/sdk/client'

export interface ModelSelection {
  providerID: string
  modelID: string
}

export interface ModelOption extends ModelSelection {
  modelName: string
}

const MODEL_KEY = 'opencode-ui:model'

// ponytail: the picker is scoped to free OpenCode Zen models, mirroring the
// CLI's curated /model list. The opencode provider only exposes free models, so
// provider-scoping alone yields the right set. Revisit if paid models become
// first-class options.
const FREE_PROVIDER_IDS = new Set(['opencode'])

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
  try {
    const result = await client.provider.list()
    const providers = result.data?.all ?? []
    options.value = providers
      .filter((provider) => FREE_PROVIDER_IDS.has(provider.id))
      .flatMap((provider) =>
        Object.values(provider.models ?? {}).map((model) => ({
          providerID: provider.id,
          providerName: provider.name,
          modelID: model.id,
          modelName: model.name,
        })),
      )
    const stored = readStored()
    const matches = stored
      ? options.value.some(
          (o) => o.providerID === stored.providerID && o.modelID === stored.modelID,
        )
      : false
    // ponytail: default to the first free Zen model so a fresh UI never falls
    // back to a broken console default (e.g. a local ollama that 500s when the
    // daemon is down). The stored selection wins when it still exists.
    const fallback = options.value[0]
    selected.value = matches
      ? stored
      : fallback
        ? { providerID: fallback.providerID, modelID: fallback.modelID }
        : null
    persist()
  } catch {
    options.value = []
  }
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

export function useModel() {
  return {
    options,
    selected,
    selectedIndex,
    selectedLabel,
    refresh,
    select,
  }
}
