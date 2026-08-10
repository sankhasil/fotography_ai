<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { Session } from '@opencode-ai/sdk/client'

import CartoonySweeper from '@/components/CartoonySweeper.vue'
import DeleteSweeper from '@/components/DeleteSweeper.vue'
import DirectoryBrowser from '@/components/DirectoryBrowser.vue'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiSpinner from '@/components/ui/UiSpinner.vue'
import { useAppStore } from '@/composables/useAppStore'
import { useBusyCharacter } from '@/composables/useBusyCharacter'
import { sessionAlias } from '@/composables/useSessionAlias'
import { isUISession } from '@/composables/useSessionProvenance'
import { useTheme } from '@/composables/useTheme'

const {
  client,
  cwd,
  setWorkingDirectory,
  activeSession,
  sessions,
  sessionStatus,
  sessionError,
  sending,
  runningSessions,
  createSession,
  listSessions,
  selectSession,
  deleteSession,
  deleteUISessions,
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

// Session pending deletion confirmation, and whether the delete sweeper is
// currently playing over the whole app.
const deleteTarget = ref<Session | null>(null)
const sweeping = ref(false)

// In the cartoony theme the sweeper shows the session model's mascot sweeping
// documents into the trash; other themes keep the matrix-rain wipe.
const { theme } = useTheme()
const busyCharacter = useBusyCharacter()
const isCartoony = computed(() => theme.value === 'cartoony')

// Bulk-delete dialog: how many UI sessions will be deleted and how many
// running UI sessions are kept, captured when the trash is opened.
const deleteAllTarget = ref<{ count: number; kept: number } | null>(null)

function closeDeleteDialogs(): void {
  deleteTarget.value = null
  deleteAllTarget.value = null
}

const hasDeletableSessions = computed(() =>
  sessions.value.some((session) => isUISession(session.id) && !runningSessions.value.has(session.id)),
)

function openDeleteAll(): void {
  const deletable = sessions.value.filter(
    (session) => isUISession(session.id) && !runningSessions.value.has(session.id),
  )
  const kept = sessions.value.filter(
    (session) => isUISession(session.id) && runningSessions.value.has(session.id),
  )
  deleteAllTarget.value = { count: deletable.length, kept: kept.length }
}

// A session that is not UI-created and is currently running is the live CLI
// console conversation — never deletable from here.
const isCliDeleteTarget = computed(() => {
  const target = deleteTarget.value
  return target ? !isUISession(target.id) : false
})

async function confirmDelete(): Promise<void> {
  const target = deleteTarget.value
  const currentClient = client.value
  deleteTarget.value = null
  if (!target || !currentClient) return
  // Delete first (fast), then play the wipe animation; the sweeper hides itself
  // when its animation completes.
  sweeping.value = true
  try {
    await deleteSession(currentClient, target.id)
  } catch {
    sweeping.value = false
  }
}

async function confirmDeleteAll(): Promise<void> {
  const currentClient = client.value
  deleteAllTarget.value = null
  if (!currentClient) return
  sweeping.value = true
  try {
    await deleteUISessions(currentClient)
  } catch {
    sweeping.value = false
  }
}

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
      <div class="flex items-center gap-1">
        <button
          type="button"
          class="muted shrink-0 cursor-pointer px-1.5 text-sm leading-none hover:text-[var(--error)] disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Delete all UI sessions"
          title="Delete all UI sessions"
          :disabled="!client || !hasDeletableSessions"
          @click="openDeleteAll"
        >
          🗑
        </button>
        <UiButton
          variant="ghost"
          size="sm"
          :disabled="!client"
          @click="client && listSessions(client, cwd)"
        >
          Refresh
        </UiButton>
      </div>
    </div>
    <ul v-if="sessions.length" class="flex max-h-40 flex-col gap-0.5 overflow-y-auto">
      <li v-for="session in sessions" :key="session.id">
        <div
          class="app-border flex items-center gap-1 rounded border px-2 py-1 text-left text-xs hover:bg-[var(--bg-elevated)]"
          :class="activeSession?.id === session.id ? 'border-[var(--accent)]' : 'app-border'"
        >
          <span
            v-if="!isUISession(session.id)"
            class="muted shrink-0 font-mono text-[10px] font-bold"
            title="Created in the CLI console"
            >>_</span
          >
          <span
            v-else
            class="shrink-0 rounded border border-[var(--accent)] px-1 text-[10px] font-semibold text-[var(--accent)]"
            title="Created in the OpenCode UI"
            >UI</span
          >
          <button
            type="button"
            class="min-w-0 flex-1 cursor-pointer py-1"
            :data-session-id="session.id"
            :title="`${isUISession(session.id) ? 'OpenCode UI session' : 'CLI console session'} · ${session.id}`"
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
          <button
            v-if="isUISession(session.id) || !runningSessions.has(session.id)"
            class="muted shrink-0 cursor-pointer px-1.5 text-sm leading-none hover:text-[var(--error)]"
            type="button"
            :data-session-id="session.id"
            :title="
              isUISession(session.id)
                ? `Delete ${sessionAlias(session.id)}`
                : `Delete ${sessionAlias(session.id)} · CLI console session`
            "
            @click="deleteTarget = session"
          >
            🗑
          </button>
        </div>
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

    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="deleteTarget || deleteAllTarget"
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          @click.self="closeDeleteDialogs"
        >
          <template v-if="deleteAllTarget">
            <div class="panel-bg app-border app-fg w-full max-w-sm rounded-lg border p-4 shadow-xl">
              <h3 class="text-sm font-semibold">Delete all UI sessions</h3>
              <p class="muted mt-2 text-xs">
                This will permanently delete
                <span class="app-fg font-medium">{{ deleteAllTarget.count }}</span>
                {{ deleteAllTarget.count === 1 ? 'session' : 'sessions' }} created in this UI. It
                cannot be undone.
              </p>
              <p v-if="deleteAllTarget.kept" class="mt-2 text-xs text-[var(--muted)]">
                {{ deleteAllTarget.kept }} running
                {{ deleteAllTarget.kept === 1 ? 'session is' : 'sessions are' }} kept. CLI console
                sessions are never deleted.
              </p>
              <p class="muted mt-1 text-xs">Do you really want to continue?</p>
              <div class="mt-4 flex justify-end gap-2">
                <UiButton variant="secondary" size="sm" @click="closeDeleteDialogs">Cancel</UiButton>
                <UiButton variant="danger" size="sm" @click="confirmDeleteAll">Yes, delete all</UiButton>
              </div>
            </div>
          </template>
          <template v-else>
            <div class="panel-bg app-border app-fg w-full max-w-sm rounded-lg border p-4 shadow-xl">
              <h3 class="text-sm font-semibold">Delete session</h3>
              <p class="muted mt-2 text-xs">
                This will clean all the context of
                <span class="app-fg font-medium">{{ deleteTarget && sessionAlias(deleteTarget.id) }}</span
                >. It cannot be undone.
              </p>
              <p v-if="isCliDeleteTarget" class="mt-2 text-xs text-[var(--error)]">
                This session was created in the CLI console, not in this UI. Deleting it also
                removes it from the console.
              </p>
              <p class="muted mt-1 text-xs">Do you really want to continue?</p>
              <div class="mt-4 flex justify-end gap-2">
                <UiButton variant="secondary" size="sm" @click="closeDeleteDialogs">Cancel</UiButton>
                <UiButton variant="danger" size="sm" @click="confirmDelete">Yes, delete</UiButton>
              </div>
            </div>
          </template>
        </div>
      </Transition>
    </Teleport>

    <CartoonySweeper
      v-if="isCartoony"
      :visible="sweeping"
      :character="busyCharacter"
      @done="sweeping = false"
    />
    <DeleteSweeper v-else :visible="sweeping" @done="sweeping = false" />
  </section>
</template>
