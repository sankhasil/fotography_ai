<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { Session } from '@opencode-ai/sdk/client'

import DirectoryBrowser from '@/components/DirectoryBrowser.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiSpinner from '@/components/ui/UiSpinner.vue'
import { useAppStore } from '@/composables/useAppStore'
import { sessionAlias } from '@/composables/useSessionAlias'

const {
  client,
  cwd,
  setWorkingDirectory,
  activeSession,
  sessions,
  sessionStatus,
  sessionError,
  sending,
  createSession,
  listSessions,
  selectSession,
  abort,
} = useAppStore()

const emit = defineEmits<{
  (e: 'submit', prompt: string): void
}>()

const browserVisible = ref(false)
const initialPath = ref<string | null>(null)
const creating = ref(false)
const prompt = ref('')
const textareaRef = ref<HTMLTextAreaElement | null>(null)

// A session is auto-created on first send, so only the connection, in-flight
// prompt and text matter here.
const canSend = computed(
  () => Boolean(client.value) && !sending.value && prompt.value.trim().length > 0,
)

const isGenerating = computed(() => sending.value || sessionStatus.value === 'busy')

async function cancel(): Promise<void> {
  if (!client.value) return
  await abort(client.value)
}

const statusTone = computed<'neutral' | 'accent' | 'success' | 'error'>(() => {
  switch (sessionStatus.value) {
    case 'busy':
      return 'accent'
    case 'idle':
      return 'success'
    case 'retry':
      return 'error'
    default:
      return 'neutral'
  }
})

async function browse(): Promise<void> {
  if (!client.value) return
  let start = cwd.value
  if (!start) {
    try {
      const result = await client.value.path.get()
      start = result.data?.directory ?? null
    } catch {
      start = null
    }
  }
  initialPath.value = start
  browserVisible.value = true
}

function onSelect(path: string): void {
  setWorkingDirectory(path)
}

// Reload history whenever the connection or working directory changes.
watch([client, cwd], ([currentClient]) => {
  if (currentClient) void listSessions(currentClient, cwd.value)
})

onMounted(() => {
  if (client.value) void listSessions(client.value, cwd.value)
})

async function openSession(session: Session): Promise<void> {
  if (!client.value) return
  await selectSession(client.value, session)
}

function updatedTime(session: Session): string {
  return new Date(session.time.updated).toLocaleString()
}

async function newSession(): Promise<void> {
  if (!client.value || creating.value) return
  creating.value = true
  try {
    await createSession(client.value, cwd.value)
  } finally {
    creating.value = false
  }
}

function submit(): void {
  const text = prompt.value.trim()
  if (!canSend.value || !text || isGenerating.value) return
  prompt.value = ''
  emit('submit', text)
  textareaRef.value?.focus()
}

function onKeydown(event: KeyboardEvent): void {
  if (event.ctrlKey && event.key === 'Enter') {
    event.preventDefault()
    submit()
  }
}
</script>

<template>
  <section class="app-border panel-bg flex min-h-0 flex-col gap-3 overflow-y-auto border-r p-4">
    <h2 class="app-fg text-sm font-semibold">Input</h2>

    <label for="cwd" class="muted text-xs font-medium">Working directory</label>
    <div class="flex items-center gap-2">
      <input
        id="cwd"
        class="app-border panel-bg app-fg min-w-0 flex-1 rounded border px-2 py-1 text-sm"
        :value="cwd ?? ''"
        :placeholder="client ? 'Server default directory' : 'Not connected'"
        readonly
        @click="browse"
      />
      <UiButton variant="secondary" size="sm" :disabled="!client" @click="browse">Browse…</UiButton>
      <UiButton
        v-if="cwd"
        variant="ghost"
        size="sm"
        :disabled="!client"
        @click="setWorkingDirectory(null)"
      >
        Clear
      </UiButton>
    </div>

    <div class="flex items-center justify-between">
      <label class="muted text-xs font-medium">Session</label>
      <UiButton variant="secondary" size="sm" :disabled="!client || creating" @click="newSession">
        {{ activeSession ? 'New' : 'Create' }}
      </UiButton>
    </div>
    <div
      v-if="activeSession"
      class="app-border panel-bg app-fg flex flex-col gap-1 rounded border px-2 py-1.5 text-xs"
    >
      <span class="truncate" :data-session-id="activeSession.id" :title="activeSession.id">
        {{ sessionAlias(activeSession.id) }}
      </span>
      <span class="muted truncate" :title="activeSession.directory"
        >dir: {{ activeSession.directory }}</span
      >
      <span class="inline-flex items-center gap-1.5">
        state:
        <UiBadge :tone="statusTone">{{ sessionStatus ?? 'unknown' }}</UiBadge>
      </span>
    </div>
    <p v-else class="muted text-xs">No active session.</p>
    <p v-if="sessionError" class="text-xs text-[var(--error)]">{{ sessionError }}</p>

    <div class="flex items-center justify-between">
      <label class="muted text-xs font-medium">History</label>
      <UiButton
        variant="ghost"
        size="sm"
        :disabled="!client"
        @click="client && listSessions(client, cwd)"
      >
        Refresh
      </UiButton>
    </div>
    <ul v-if="sessions.length" class="flex max-h-40 flex-col gap-0.5 overflow-y-auto">
      <li v-for="session in sessions" :key="session.id">
        <button
          type="button"
          class="app-border w-full cursor-pointer rounded border px-2 py-1 text-left text-xs hover:bg-[var(--bg-elevated)]"
          :class="activeSession?.id === session.id ? 'border-[var(--accent)]' : 'app-border'"
          :data-session-id="session.id"
          :title="session.id"
          @click="openSession(session)"
        >
          <span class="app-fg block truncate">{{ sessionAlias(session.id) }}</span>
          <span class="muted flex items-center justify-between gap-2 text-[10px]">
            <span class="truncate">{{ updatedTime(session) }}</span>
            <span v-if="session.summary" class="shrink-0 font-mono">
              <span class="text-[var(--success)]">+{{ session.summary.additions }}</span>
              <span class="text-[var(--error)]">-{{ session.summary.deletions }}</span>
            </span>
          </span>
        </button>
      </li>
    </ul>
    <p v-else class="muted text-xs">No previous sessions.</p>

    <textarea
      ref="textareaRef"
      v-model="prompt"
      aria-label="Prompt"
      class="app-border panel-bg app-fg min-h-40 flex-1 resize-none rounded border p-2 text-sm"
      placeholder="Type a prompt and press Ctrl+Enter…"
      @keydown="onKeydown"
    ></textarea>

    <UiButton v-if="isGenerating" variant="danger" @click="cancel">Cancel</UiButton>
    <UiButton v-else :disabled="!canSend" @click="submit">
      <UiSpinner v-if="sending" size="sm" />
      <span v-else>Send</span>
    </UiButton>

    <DirectoryBrowser
      :client="client"
      :visible="browserVisible"
      :initial-path="initialPath"
      @update:visible="browserVisible = $event"
      @select="onSelect"
    />
  </section>
</template>
