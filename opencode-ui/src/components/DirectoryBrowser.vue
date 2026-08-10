<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import UiButton from '@/components/ui/UiButton.vue'
import UiSpinner from '@/components/ui/UiSpinner.vue'
import { useDirectoryTree } from '@/composables/useDirectoryTree'

const props = defineProps<{
  client: import('@opencode-ai/sdk/client').OpencodeClient | null
  visible: boolean
  initialPath: string | null
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'select', path: string): void
}>()

const tree = useDirectoryTree()

const dialogRef = ref<HTMLElement | null>(null)
const listRef = ref<HTMLUListElement | null>(null)
const scrollTop = ref(0)

// --- virtual list: only render the rows currently in view --------------------
const ROW_HEIGHT = 34
const OVERSCAN = 8
const VIEWPORT = 360

const startIndex = computed(() => Math.max(0, Math.floor(scrollTop.value / ROW_HEIGHT) - OVERSCAN))
const endIndex = computed(() =>
  Math.min(tree.entries.value.length, Math.ceil((scrollTop.value + VIEWPORT) / ROW_HEIGHT) + OVERSCAN),
)
const visibleEntries = computed(() => tree.entries.value.slice(startIndex.value, endIndex.value))

function onScroll(event: Event): void {
  scrollTop.value = (event.target as HTMLUListElement).scrollTop
}

function close(): void {
  emit('update:visible', false)
}

function confirm(): void {
  emit('select', tree.currentPath.value)
  close()
}

async function open(): Promise<void> {
  scrollTop.value = 0
  const serverDir = await serverDirectory()
  await tree.load(props.client, props.initialPath ?? serverDir ?? '/')
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

async function enterDir(path: string): Promise<void> {
  scrollTop.value = 0
  await tree.enter(props.client, path)
}

async function jumpCrumb(path: string): Promise<void> {
  scrollTop.value = 0
  await tree.jumpTo(props.client, path)
}

function parentPath(): string {
  const parts = tree.currentPath.value.replace(/\/+$/, '').split('/').filter(Boolean)
  parts.pop()
  return parts.length ? `/${parts.join('/')}` : '/'
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
          class="app-border panel-bg app-fg flex max-h-[80vh] w-full max-w-xl flex-col rounded-lg border shadow-lg focus:outline-none"
          @keydown.esc="close"
        >
          <div class="app-border flex items-center justify-between border-b px-4 py-2">
            <h3 class="text-sm font-semibold">Choose working directory</h3>
            <div class="flex items-center gap-2">
              <button
                class="muted cursor-pointer rounded px-1.5 py-0.5 text-sm hover:bg-[var(--bg-elevated)]"
                type="button"
                title="Refresh"
                @click="tree.reload(client)"
              >
                ↻
              </button>
              <button class="muted cursor-pointer text-lg leading-none" type="button" @click="close">
                ×
              </button>
            </div>
          </div>

          <div class="app-border flex flex-wrap items-center gap-1 border-b px-4 py-2 text-xs">
            <template v-for="(crumb, i) in tree.crumbs.value" :key="crumb.path">
              <button
                class="rounded px-1.5 py-0.5"
                :class="
                  i === tree.crumbs.value.length - 1
                    ? 'accent font-semibold'
                    : crumb.enabled
                        ? 'muted cursor-pointer hover:bg-[var(--bg-elevated)]'
                        : 'muted cursor-default opacity-40'
                "
                type="button"
                :title="crumb.path"
                :disabled="!crumb.enabled"
                :data-testid="`breadcrumb-${crumb.path}`"
                @click="crumb.enabled && jumpCrumb(crumb.path)"
              >
                {{ crumb.label }}
              </button>
              <span v-if="i < tree.crumbs.value.length - 1" class="muted">/</span>
            </template>
          </div>

          <div
            v-if="tree.isLarge.value && !tree.loading.value"
            class="border-b px-4 py-2 text-xs font-medium text-[var(--warning,#e6c04c)]"
          >
            ⚠ This folder has {{ tree.totalCount.value }} items — only the visible rows are rendered for speed.
          </div>

          <div class="flex-1 overflow-hidden px-2">
            <div v-if="tree.loading.value" class="my-8 flex justify-center">
              <UiSpinner />
            </div>
            <p v-else-if="tree.error.value" class="muted px-2 py-3 text-sm">{{ tree.error.value }}</p>
            <template v-else>
              <button
                v-if="!tree.atCeiling.value"
                class="muted flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-[var(--bg-elevated)]"
                type="button"
                @click="enterDir(parentPath())"
              >
                <span class="text-base leading-none" aria-hidden="true">↑</span>
                <span class="truncate">Parent folder</span>
              </button>
              <div
                v-if="tree.entries.value.length === 0"
                class="flex items-center px-2 py-3 text-sm"
              >
                <span class="muted">This folder is empty.</span>
              </div>
              <div v-else class="dir-list h-[320px] overflow-y-auto" @scroll="onScroll">
                <ul
                  ref="listRef"
                  class="relative w-full"
                  :style="{ height: tree.entries.value.length * ROW_HEIGHT + 'px' }"
                >
                  <li
                    v-for="(entry, i) in visibleEntries"
                    :key="entry.absolute"
                    class="absolute left-0 right-0 flex items-center px-2"
                    :style="{ top: (startIndex + i) * ROW_HEIGHT + 'px', height: ROW_HEIGHT + 'px' }"
                  >
                    <button
                      class="flex w-full items-center gap-2 rounded py-1.5 text-left text-sm hover:bg-[var(--bg-elevated)]"
                      :class="entry.type === 'directory' ? 'app-fg' : 'muted'"
                      type="button"
                      :title="entry.absolute"
                      :disabled="entry.type !== 'directory'"
                      @click="entry.type === 'directory' && enterDir(entry.absolute)"
                    >
                      <span class="text-base leading-none" aria-hidden="true">
                        {{ entry.type === 'directory' ? '📁' : '📄' }}
                      </span>
                      <span class="truncate">{{ entry.name }}</span>
                      <span
                        v-if="entry.type !== 'directory'"
                        class="muted ml-auto shrink-0 text-[10px]"
                      >file</span>
                    </button>
                  </li>
                </ul>
              </div>
            </template>
          </div>

          <div
            class="app-border flex flex-col gap-2 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <span class="muted truncate text-xs" :title="tree.currentPath.value">
              Selected: <span class="app-fg">{{ tree.currentPath.value }}</span>
            </span>
            <div class="flex justify-end gap-2">
              <UiButton variant="secondary" size="sm" @click="close">Cancel</UiButton>
              <UiButton size="sm" @click="confirm">Use this folder</UiButton>
            </div>
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
fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
