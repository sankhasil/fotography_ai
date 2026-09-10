<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

import DiffViewer from '@/components/DiffViewer.vue'
import DolphinBuilder from '@/components/DolphinBuilder.vue'
import MatrixRain from '@/components/MatrixRain.vue'
import MessageCard from '@/components/MessageCard.vue'
import OctopusBuilder from '@/components/OctopusBuilder.vue'
import PenguinBuilder from '@/components/PenguinBuilder.vue'
import PickleRickBuilder from '@/components/PickleRickBuilder.vue'
import PlasmaOrb from '@/components/PlasmaOrb.vue'
import QuestionCard from '@/components/question/QuestionCard.vue'
import StickFigureBuilder from '@/components/StickFigureBuilder.vue'
import TaskProgress from '@/components/TaskProgress.vue'
import { useAppStore } from '@/composables/useAppStore'
import { useBusyCharacter } from '@/composables/useBusyCharacter'
import { startTaskPct, stopTaskPct } from '@/composables/useTaskPct'
import { useTheme } from '@/composables/useTheme'

const {
  activeSession,
  messagesFor,
  diffsFor,
  sending,
  sessionStatus,
  pendingQuestion,
  answering,
  questionError,
  answerQuestion,
  dismissQuestion,
} = useAppStore()
const { theme } = useTheme()

// In-flight prompt: while the HTTP send is pending or the session reports
// itself busy. Drives the busy indicator in the output pane.
const busy = computed(() => sending.value || sessionStatus.value === 'busy')

const isMatrix = computed(() => theme.value === 'matrix')
const isJarvis = computed(() => theme.value === 'jarvis')
const isCartoony = computed(() => theme.value === 'cartoony')

// The cartoony busy figure follows the session's model: each model family has
// its own mascot, unknown ones fall back to the stick figure.
const busyCharacter = useBusyCharacter()

const containerRef = ref<HTMLDivElement | null>(null)
// Auto-scroll follows the stream only while the user is at the bottom.
// Scrolling up pauses it; returning to the bottom resumes it.
const followScroll = ref(true)

const records = computed(() =>
  activeSession.value ? messagesFor(activeSession.value.id) : [],
)

const diffs = computed(() => (activeSession.value ? diffsFor(activeSession.value.id) : []))

// The loading screen is the default view each run; the user can opt into
// seeing the raw console (the conversation) while a run is in flight. Reset
// per run so every new prompt starts at the loading screen.
const showConsole = ref(false)
// The busy clock follows the run lifecycle, not the widget's visibility, so
// toggling "Show console" never resets the phases mid-run.
watch(
  busy,
  (isBusy) => {
    if (isBusy) {
      showConsole.value = false
      startTaskPct(activeSession.value?.id ?? null)
    } else {
      stopTaskPct()
    }
  },
  { flush: 'sync' },
)

// Scroll helper: the conversation is unmounted while the busy visual is up
// (records stream against a null ref), so it would mount mid-history at the
// top. Any transition INTO the conversation lands on the newest message.
function scrollToBottom(): void {
  const el = containerRef.value
  if (el) el.scrollTop = el.scrollHeight
}

watch(
  busy,
  (isBusy) => {
    if (isBusy) return
    followScroll.value = true
    void nextTick(scrollToBottom)
  },
  { flush: 'post' },
)

watch(showConsole, (visible) => {
  if (!visible) return
  followScroll.value = true
  void nextTick(scrollToBottom)
})

// The agent is blocked on a question tool. The question card replaces the
// busy visual so the fake progress never hides a question that needs an
// answer.
const showQuestion = computed(() => {
  const request = pendingQuestion.value
  return Boolean(request && activeSession.value && request.sessionID === activeSession.value.id)
})

// While busy and no question is pending, the whole panel swaps to the busy
// visual (theme backdrop + task-progress pies). It stays up through every
// phase — reasoning, tools, diffs, final text — so the real phases are
// visible; the conversation only appears when the run ends (or via the
// "Show console" toggle).
const showBusyVisual = computed(() => busy.value && !showQuestion.value)

// The question card centers when it fits and scrolls when the question list is
// too tall. Each new request scrolls back to the top so the first question is
// reachable again.
const questionRef = ref<HTMLDivElement | null>(null)
watch(
  () => pendingQuestion.value?.id ?? null,
  () => {
    void nextTick(() => {
      if (questionRef.value) questionRef.value.scrollTop = 0
    })
  },
)

// Switching sessions always lands on the newest message: re-enable follow so
// the records watcher snaps to the bottom of the freshly loaded conversation
// even if the previous session was left scrolled up.
watch(
  () => activeSession.value?.id ?? null,
  () => {
    followScroll.value = true
    void nextTick(scrollToBottom)
  },
)

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
      <div class="flex items-center gap-3">
        <button
          v-if="busy && !showQuestion"
          type="button"
          class="muted cursor-pointer text-xs underline-offset-2 hover:text-[var(--app-fg)]"
          @click="showConsole = !showConsole"
        >
          {{ showConsole ? 'Show loading screen' : 'Show console' }}
        </button>
        <span v-if="activeSession" class="muted text-xs">session {{ activeSession.id }}</span>
      </div>
    </div>
    <Transition name="busy-crossfade" mode="out-in">
      <div
        v-if="showQuestion"
        key="question"
        ref="questionRef"
        class="relative flex min-h-0 flex-1 flex-col items-center overflow-y-auto p-4"
      >
        <QuestionCard
          :request="pendingQuestion!"
          :submitting="answering"
          :error="questionError"
          @submit="answerQuestion"
          @dismiss="dismissQuestion"
        />
      </div>
      <div
        v-else-if="showBusyVisual && !showConsole"
        key="busy"
        class="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden"
      >
        <MatrixRain v-if="isMatrix" class="absolute inset-0" mode="panel" />
        <PlasmaOrb v-else-if="isJarvis" class="absolute inset-0 m-auto h-40 w-40" />
        <PickleRickBuilder
          v-else-if="isCartoony && busyCharacter === 'pickle-rick'"
          class="absolute inset-0"
        />
        <OctopusBuilder
          v-else-if="isCartoony && busyCharacter === 'octopus'"
          class="absolute inset-0"
        />
        <PenguinBuilder
          v-else-if="isCartoony && busyCharacter === 'penguin'"
          class="absolute inset-0"
        />
        <DolphinBuilder
          v-else-if="isCartoony && busyCharacter === 'dolphin'"
          class="absolute inset-0"
        />
        <StickFigureBuilder v-else-if="isCartoony" class="absolute inset-0" />
        <TaskProgress
          class="relative z-10"
          :class="isCartoony ? 'mb-auto mt-8' : ''"
        />
      </div>
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
          <section v-if="diffs.length" class="app-fg flex shrink-0 flex-col gap-2">
            <h3 class="muted text-xs font-semibold">Changes</h3>
            <DiffViewer v-for="diff in diffs" :key="diff.file" :diff="diff" />
          </section>
        </div>
        <div v-else class="muted flex flex-1 items-center justify-center p-4 text-sm">
          Messages will appear here.
        </div>
      </div>
    </Transition>
  </section>
</template>
