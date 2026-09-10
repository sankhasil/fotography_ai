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
  configuredFolders,
  activeFolder,
  selectFolder,
  activeSession,
  sessionsFor,
  sessionStatus,
  sessionError,
  sending,
  runningSessions,
  pendingLimit,
  resolveLimit,
  dismissLimit,
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

// The active folder's session pool drives history, deletion and the limit.
const folderSessions = computed(() => sessionsFor(activeFolder.value))

function closeDeleteDialogs(): void {
  deleteTarget.value = null
  deleteAllTarget.value = null
}

const hasDeletableSessions = computed(() =>
  folderSessions.value.some(
    (session) => isUISession(session.id) && !runningSessions.value.has(session.id),
  ),
)

function openDeleteAll(): void {
  const deletable = folderSessions.value.filter(
    (session) => isUISession(session.id) && !runningSessions.value.has(session.id),
  )
  const kept = folderSessions.value.filter(
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
    await deleteSession(currentClient, activeFolder.value, target.id)
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
    await deleteUISessions(currentClient, activeFolder.value)
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
  let start = activeFolder.value
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

// Pick a path in the browser: make it the active folder for the current session
// and load its session pool. It is not persisted as a tab — reloads restore the
// env-configured folders only.
function onSelect(path: string): void {
  void selectFolder(path)
}

function openFolder(folder: string): void {
  if (!client.value) return
  void selectFolder(folder)
}

// Reload the active folder's history whenever the connection becomes ready.
watch(client, (currentClient) => {
  if (currentClient) void selectFolder(activeFolder.value)
})

onMounted(() => {
  if (client.value) void selectFolder(activeFolder.value)
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
    const outcome = await createSession(client.value, activeFolder.value)
    // A full pool: the limit dialog lets the user free one session first.
    if (outcome.kind === 'limit') {
      pendingLimit.value = { folder: outcome.folder, sessions: outcome.sessions }
    }
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

    <label class="muted text-xs font-medium">Folders</label>
    <div class="flex flex-wrap items-center gap-1.5">
      <button
        v-for="folder in configuredFolders"
        :key="folder.path"
        type="button"
        class="app-border flex max-w-[14rem] items-center gap-1.5 rounded border px-1.5 py-0.5 text-xs"
        :class="
          activeFolder === folder.path
            ? 'border-[var(--accent)] text-[var(--accent)]'
            : 'muted hover:text-[var(--app-fg)]'
        "
        :title="folder.path"
        @click="openFolder(folder.path)"
      >
        <span class="truncate">{{ folder.label }}</span>
        <span
          class="shrink-0 rounded border border-[var(--accent)] px-1 text-[9px] font-semibold text-[var(--accent)]"
          title="Configured in the .env file"
          >default</span
        >
      </button>
      <UiButton variant="secondary" size="sm" :disabled="!client" @click="browse">
        Browse…
      </UiButton>
    </div>
    <p v-if="configuredFolders.length === 0" class="muted text-xs">
      No folders configured — set VITE_FOLDERS in your .env file. Sessions are grouped per folder.
    </p>

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
          @click="client && listSessions(client, activeFolder)"
        >
          Refresh
        </UiButton>
      </div>
    </div>
    <ul v-if="folderSessions.length" class="flex max-h-40 flex-col gap-0.5 overflow-y-auto">
      <li v-for="session in folderSessions" :key="session.id">
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
    <p v-else class="muted text-xs">No sessions for this folder yet.</p>

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
          v-if="deleteTarget || deleteAllTarget || pendingLimit"
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          @click.self="pendingLimit ? dismissLimit() : closeDeleteDialogs()"
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
          <template v-else-if="pendingLimit">
            <div class="panel-bg app-border app-fg w-full max-w-md rounded-lg border p-4 shadow-xl">
              <h3 class="text-sm font-semibold">Session limit reached</h3>
              <p class="muted mt-2 text-xs">
                Each folder can have up to 5 sessions. Delete one to create a new session here
                (running sessions cannot be deleted).
              </p>
              <ul class="mt-3 flex flex-col gap-1">
                <li v-for="item in pendingLimit.sessions" :key="item.id">
                  <button
                    type="button"
                    class="app-border flex w-full items-center justify-between gap-2 rounded border px-2 py-1.5 text-left text-xs hover:bg-[var(--bg-elevated)] disabled:cursor-not-allowed disabled:opacity-50"
                    :disabled="runningSessions.has(item.id)"
                    :title="
                      runningSessions.has(item.id)
                        ? 'This session is running and cannot be deleted'
                        : `Delete ${sessionAlias(item.id)} and create a new session`
                    "
                    @click="resolveLimit(item.id)"
                  >
                    <span class="truncate">{{ sessionAlias(item.id) }}</span>
                    <span class="muted shrink-0 font-mono text-[10px]">
                      {{ runningSessions.has(item.id) ? 'running' : 'delete' }}
                    </span>
                  </button>
                </li>
              </ul>
              <p class="muted mt-1 text-xs">
                {{ pendingLimit.queuedText ? 'Your prompt will be sent after a session is freed.' : 'Creation will continue after a session is freed.' }}
              </p>
              <div class="mt-4 flex justify-end gap-2">
                <UiButton variant="secondary" size="sm" @click="dismissLimit">Cancel</UiButton>
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
