<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import DiffViewer from '@/components/DiffViewer.vue'
import MatrixRain from '@/components/MatrixRain.vue'
import MessageCard from '@/components/MessageCard.vue'
import PlasmaOrb from '@/components/PlasmaOrb.vue'
import UiProgress from '@/components/ui/UiProgress.vue'
import UiSpinner from '@/components/ui/UiSpinner.vue'
import { useAppStore } from '@/composables/useAppStore'
import { hasAssistantOutput, type MessageRecord } from '@/composables/useConversation'
import { useTheme } from '@/composables/useTheme'

const { activeSession, messagesFor, diffsFor, sending, sessionStatus } = useAppStore()
const { theme } = useTheme()

// In-flight prompt: while the HTTP send is pending or the session reports
// itself busy. Drives the busy indicator in the output pane.
const busy = computed(() => sending.value || sessionStatus.value === 'busy')

const isMatrix = computed(() => theme.value === 'matrix')
const isJarvis = computed(() => theme.value === 'jarvis')
// Themes that swap the whole panel for a busy animation instead of a thin bar.
const hasBusyVisual = computed(() => isMatrix.value || isJarvis.value)

const containerRef = ref<HTMLDivElement | null>(null)
// Auto-scroll follows the stream only while the user is at the bottom.
// Scrolling up pauses it; returning to the bottom resumes it.
const followScroll = ref(true)

const records = computed(() =>
  activeSession.value ? messagesFor(activeSession.value.id) : [],
)

const diffs = computed(() => (activeSession.value ? diffsFor(activeSession.value.id) : []))

function recordKey(record: MessageRecord): string {
  return record.info?.id ?? record.parts[0]?.messageID
}

// Freeze which messages already exist the moment a run starts, so the busy
// visual keys off output produced by the *current* prompt. Every send shows
// it again — older turns on screen do not count as fresh output.
const runStartIds = ref(new Set<string>())
watch(
  busy,
  (isBusy) => {
    if (isBusy) runStartIds.value = new Set(records.value.map(recordKey))
  },
  { flush: 'sync' },
)

// Matrix/jarvis progress: while busy the panel hides behind the rain or the
// plasma orb until the model's streamed output starts rendering, so the
// visual never obscures new messages.
const showBusyVisual = computed(() => {
  if (!hasBusyVisual.value || !busy.value) return false
  const fresh = records.value.filter((record) => !runStartIds.value.has(recordKey(record)))
  return !hasAssistantOutput(fresh)
})

function onScroll(): void {
  const el = containerRef.value
  if (!el) return
  const distance = el.scrollHeight - el.scrollTop - el.clientHeight
  followScroll.value = distance < 40
}

watch(
  [records, diffs],
  () => {
    if (!followScroll.value) return
    const el = containerRef.value
    if (el) el.scrollTop = el.scrollHeight
  },
  { flush: 'post' },
)
</script>

<template>
  <section class="panel-bg relative flex min-h-0 flex-col">
    <div class="app-border flex items-center justify-between border-b px-4 py-2">
      <h2 class="app-fg text-sm font-semibold">Output</h2>
      <span v-if="activeSession" class="muted text-xs">session {{ activeSession.id }}</span>
    </div>
    <div v-if="busy && !hasBusyVisual" class="app-border border-b px-4 py-2">
      <UiProgress />
    </div>
    <Transition name="busy-crossfade" mode="out-in">
      <MatrixRain v-if="isMatrix && showBusyVisual" key="rain" mode="panel" />
      <PlasmaOrb v-else-if="isJarvis && showBusyVisual" key="orb" />
      <div v-else key="conversation" class="flex min-h-0 flex-1 flex-col">
        <div
          v-if="records.length"
          ref="containerRef"
          class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4"
          @scroll.passive="onScroll"
        >
          <MessageCard
            v-for="record in records"
            :key="record.info?.id ?? record.parts[0]?.messageID"
            :record="record"
          />
          <section v-if="diffs.length" class="app-fg flex flex-col gap-2">
            <h3 class="muted text-xs font-semibold">Changes</h3>
            <DiffViewer v-for="diff in diffs" :key="diff.file" :diff="diff" />
          </section>
        </div>
        <div v-else class="muted flex flex-1 items-center justify-center gap-2 p-4 text-sm">
          <template v-if="busy">
            <UiSpinner size="sm" />
            <span class="accent">Working…</span>
          </template>
          <template v-else>Messages will appear here.</template>
        </div>
      </div>
    </Transition>
  </section>
</template>
