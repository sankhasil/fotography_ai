<script setup lang="ts">
import { ref, watch } from 'vue'
import type { OpencodeClient } from '@opencode-ai/sdk/client'

import UiButton from '@/components/ui/UiButton.vue'
import UiSpinner from '@/components/ui/UiSpinner.vue'

const props = defineProps<{
  client: OpencodeClient | null
  visible: boolean
  initialPath: string | null
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'select', path: string): void
}>()

const currentPath = ref('/')
const entries = ref<string[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const dialogRef = ref<HTMLElement | null>(null)

function parentPath(path: string): string {
  const trimmed = path.replace(/\/+$/, '')
  const index = trimmed.lastIndexOf('/')
  return index <= 0 ? '/' : trimmed.slice(0, index)
}

function basename(path: string): string {
  const trimmed = path.replace(/\/+$/, '')
  const index = trimmed.lastIndexOf('/')
  return index <= 0 ? trimmed : trimmed.slice(index + 1)
}

async function load(path: string): Promise<void> {
  if (!props.client) return
  loading.value = true
  error.value = null
  try {
    const result = await props.client.file.list({ query: { path } })
    const nodes = result.data ?? []
    currentPath.value = path
    entries.value = nodes.filter((node) => node.type === 'directory').map((node) => node.absolute)
  } catch (err) {
    error.value = String(err)
  } finally {
    loading.value = false
  }
}

async function serverDirectory(): Promise<string | null> {
  if (!props.client) return null
  try {
    const result = await props.client.path.get()
    return result.data?.directory ?? null
  } catch {
    return null
  }
}

async function open(): Promise<void> {
  const start = props.initialPath ?? (await serverDirectory()) ?? '/'
  await load(start)
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      void open()
      dialogRef.value?.focus()
    }
  },
)

function close(): void {
  emit('update:visible', false)
}

function confirm(): void {
  emit('select', currentPath.value)
  close()
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="visible"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
        @click.self="close"
      >
        <div
          ref="dialogRef"
          role="dialog"
          aria-modal="true"
          aria-label="Choose working directory"
          tabindex="-1"
          class="app-border panel-bg app-fg flex max-h-[70vh] w-full max-w-lg flex-col rounded-lg border shadow-lg focus:outline-none"
          @keydown.esc="close"
        >
          <div class="app-border flex items-center justify-between border-b px-4 py-2">
            <h3 class="text-sm font-semibold">Choose working directory</h3>
            <button class="muted cursor-pointer text-lg leading-none" type="button" @click="close">
              ×
            </button>
          </div>
          <div class="muted truncate px-4 py-2 text-xs" :title="currentPath">{{ currentPath }}</div>
          <div class="min-h-40 flex-1 overflow-y-auto px-4 pb-4">
            <div v-if="loading" class="my-8 flex justify-center">
              <UiSpinner />
            </div>
            <p v-else-if="error" class="muted text-sm">{{ error }}</p>
            <ul v-else class="flex flex-col gap-0.5">
              <li v-if="currentPath !== '/'">
                <button
                  class="muted w-full cursor-pointer rounded px-2 py-1 text-left text-sm hover:bg-[var(--bg-elevated)]"
                  type="button"
                  @click="load(parentPath(currentPath))"
                >
                  ↑ {{ parentPath(currentPath) }}
                </button>
              </li>
              <li v-for="dir in entries" :key="dir">
                <button
                  class="app-fg w-full cursor-pointer rounded px-2 py-1 text-left text-sm hover:bg-[var(--bg-elevated)]"
                  type="button"
                  :title="dir"
                  @click="load(dir)"
                >
                  {{ basename(dir) }}/
                </button>
              </li>
              <li v-if="entries.length === 0" class="muted text-sm">No subdirectories</li>
            </ul>
          </div>
          <div class="app-border flex justify-end gap-2 border-t px-4 py-3">
            <UiButton variant="secondary" size="sm" @click="close">Cancel</UiButton>
            <UiButton size="sm" @click="confirm">Use this folder</UiButton>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
