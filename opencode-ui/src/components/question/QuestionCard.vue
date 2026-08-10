<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import UiButton from '@/components/ui/UiButton.vue'
import UiSpinner from '@/components/ui/UiSpinner.vue'
import { buildAnswers, type QuestionFormValue } from '@/composables/usePendingQuestion'
import type { QuestionRequest } from '@/services/question'

const props = defineProps<{
  request: QuestionRequest
  submitting?: boolean
  error?: string | null
}>()

const emit = defineEmits<{
  (e: 'submit', answers: string[][]): void
  (e: 'dismiss'): void
}>()

// One form value per question, in request order. `labels` holds the picked
// option labels (0/1 for single-select, 0+ for multi-select).
const form = ref<QuestionFormValue[]>([])

watch(
  () => props.request.id,
  () => {
    form.value = props.request.questions.map(() => ({ selected: [], custom: '' }))
  },
  { immediate: true },
)

function toggleOption(index: number, label: string): void {
  const entry = form.value[index]
  const question = props.request.questions[index]
  if (!entry || !question) return
  if (question.multiple) {
    const position = entry.selected.indexOf(label)
    if (position === -1) entry.selected.push(label)
    else entry.selected.splice(position, 1)
  } else {
    entry.selected = entry.selected[0] === label ? [] : [label]
  }
}

function isPicked(index: number, label: string): boolean {
  return form.value[index]?.selected.includes(label) ?? false
}

const hasAnyAnswer = computed(() =>
  form.value.some((entry) => entry.selected.length > 0 || entry.custom.trim().length > 0),
)

function submit(): void {
  emit('submit', buildAnswers(props.request.questions, form.value))
}
</script>

<template>
  <article class="panel-bg app-border app-fg animate-in flex w-full max-w-lg flex-col gap-4 rounded-xl border p-5 shadow-lg">
    <header class="flex items-center gap-2">
      <UiSpinner v-if="submitting" size="sm" />
      <h3 class="text-sm font-semibold">Question from the agent</h3>
    </header>

    <div v-if="submitting" class="muted text-sm">
      Answer sent — waiting for the agent to continue…
    </div>

    <template v-else>
      <div v-for="(question, index) in request.questions" :key="index" class="flex flex-col gap-2">
        <div class="flex items-center gap-2">
          <span class="accent-bg accent-fg rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase">
            {{ question.header }}
          </span>
          <span v-if="question.multiple" class="muted text-[10px]">select all that apply</span>
        </div>
        <p class="text-sm leading-relaxed">{{ question.question }}</p>
        <div class="flex flex-col gap-1.5">
          <button
            v-for="option in question.options"
            :key="option.label"
            type="button"
            class="app-border app-fg flex cursor-pointer items-start gap-2 rounded border px-3 py-2 text-left text-sm transition-colors hover:border-[var(--accent)]"
            :class="isPicked(index, option.label) ? 'border-[var(--accent)] bg-[var(--bg-elevated)]' : ''"
            @click="toggleOption(index, option.label)"
          >
            <span
              class="accent mt-0.5 inline-block h-3.5 w-3.5 shrink-0 rounded-sm border border-current"
            >
              <span v-if="isPicked(index, option.label)" class="block text-[10px] leading-[12px]">✓</span>
            </span>
            <span class="min-w-0">
              <span class="block font-medium">{{ option.label }}</span>
              <span v-if="option.description" class="muted block text-xs">{{ option.description }}</span>
            </span>
          </button>
        </div>
        <label
          v-if="question.custom !== false"
          class="muted flex flex-col gap-1 text-xs"
        >
          Type your own answer
          <input
            v-model="form[index].custom"
            class="app-border panel-bg app-fg rounded border px-2 py-1.5 text-sm"
            type="text"
            :placeholder="question.multiple ? 'Add a custom choice…' : 'Type your own answer…'"
          />
        </label>
      </div>

      <p v-if="error" class="text-xs text-[var(--error)]">{{ error }}</p>

      <footer class="flex items-center justify-between gap-2">
        <UiButton variant="ghost" size="sm" :disabled="submitting" @click="emit('dismiss')">
          Dismiss
        </UiButton>
        <UiButton size="sm" :disabled="submitting || !hasAnyAnswer" @click="submit">
          Send answer
        </UiButton>
      </footer>
    </template>
  </article>
</template>
