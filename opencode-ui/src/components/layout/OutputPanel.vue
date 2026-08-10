<script setup lang="ts">
import { computed, ref, watch } from 'vue'

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
import { hasAssistantOutput, type MessageRecord } from '@/composables/useConversation'
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

// The agent is blocked on a question tool. The question card replaces the
// busy visual so the fake progress never hides a question that needs an
// answer.
const showQuestion = computed(() => {
  const request = pendingQuestion.value
  return Boolean(request && activeSession.value && request.sessionID === activeSession.value.id)
})

// While busy and no output from the current run has rendered yet, the whole
// panel swaps to the busy visual (theme backdrop + task-progress pies). Every
// theme shows it — matrix/jarvis add their backdrop behind the pies.
const showBusyVisual = computed(() => {
  if (!busy.value || showQuestion.value) return false
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
    <Transition name="busy-crossfade" mode="out-in">
      <div
        v-if="showQuestion"
        key="question"
        class="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden p-4"
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
        v-else-if="showBusyVisual"
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
          :active="busy"
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
          <section v-if="diffs.length" class="app-fg flex flex-col gap-2">
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
